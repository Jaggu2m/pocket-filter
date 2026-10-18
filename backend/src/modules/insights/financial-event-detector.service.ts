import { budgetPaceService } from '../../services/budget-pace.service.js';
import { goalService } from '../../services/goal.service.js';
import { goalHealthService } from '../../services/goal-health.service.js';
import { recurringPaymentService } from '../../services/recurring-payment.service.js';
import { anomalyService } from '../../services/anomaly-detection.service.js';
import { accountService } from '../../services/account.service.js';
import { notificationService } from '../notifications/notification.service.js';
import {
  NotificationType,
  FinancialEvent,
  NotificationSeverity,
} from '../notifications/types/notification.types.js';

export class FinancialEventDetectorService {
  /**
   * Evaluates the user's financial state across all subsystems and dispatches
   * actionable, deduplicated notifications.
   */
  async evaluateAndDispatchAll(userId: string, targetMonth?: string): Promise<{ dispatchedCount: number; events: FinancialEvent[] }> {
    const month = targetMonth || new Date().toISOString().slice(0, 7);
    const events: FinancialEvent[] = [];

    // Run all detectors in parallel
    const [budgetEvents, goalEvents, billEvents, anomalyEvents, milestoneEvents] = await Promise.all([
      this.detectBudgetEvents(userId, month),
      this.detectGoalEvents(userId, month),
      this.detectBillReminders(userId),
      this.detectSpendingAnomalies(userId, month),
      this.detectMilestones(userId),
    ]);

    events.push(...budgetEvents, ...goalEvents, ...billEvents, ...anomalyEvents, ...milestoneEvents);

    let dispatchedCount = 0;
    for (const event of events) {
      const dispatched = await notificationService.dispatch(event);
      if (dispatched) dispatchedCount++;
    }

    return { dispatchedCount, events };
  }

  // 1. Budget Pace & Overspending Detector
  private async detectBudgetEvents(userId: string, month: string): Promise<FinancialEvent[]> {
    const events: FinancialEvent[] = [];
    try {
      const pace = await budgetPaceService.getPace(userId, month);
      const overall = pace.overall;
      if (!overall) return events;

      const spent = overall.actualSpent || 0;
      const budget = overall.budget || 0;
      const projected = overall.projectedMonthlySpend || 0;
      const daysRemaining = Math.max(0, (overall.daysInMonth || 30) - (overall.daysElapsed || 0));

      if (budget > 0) {
        if (spent >= budget) {
          events.push({
            userId,
            type: NotificationType.BUDGET_EXCEEDED,
            title: 'Budget Limit Exceeded',
            message: `You've spent ₹${spent.toLocaleString('en-IN')}, exceeding your ₹${budget.toLocaleString('en-IN')} budget for ${month}.`,
            severity: 'CRITICAL',
            entityType: 'budget',
            entityId: `${month}:overall`,
            period: month,
            cooldownHours: 48,
            metadata: { budget, spent, projected, daysRemaining },
          });
        } else if (overall.status === 'OVER_PACE' || (overall.actualVelocity && overall.actualVelocity > 1.15)) {
          events.push({
            userId,
            type: NotificationType.BUDGET_PACE_BREACH,
            title: 'Budget Running Ahead of Pace',
            message: `You've spent ₹${spent.toLocaleString('en-IN')} of your ₹${budget.toLocaleString('en-IN')} budget with ${daysRemaining} days left. At this pace, spending is projected to reach ₹${projected.toLocaleString('en-IN')}.`,
            severity: 'WARNING',
            entityType: 'budget',
            entityId: `${month}:overall:pace`,
            period: month,
            cooldownHours: 72,
            metadata: { budget, spent, projected, daysRemaining, velocity: overall.actualVelocity },
          });
        }
      }
    } catch {
      // Non-blocking if budget doesn't exist
    }
    return events;
  }

  // 2. Goal Health & Milestone Detector
  private async detectGoalEvents(userId: string, month: string): Promise<FinancialEvent[]> {
    const events: FinancialEvent[] = [];
    try {
      const goals = await goalService.listGoals(userId);
      for (const g of goals) {
        const target = Number(g.targetAmount || 0);
        const saved = Number(g.savedAmount || 0);
        const targetDate = g.targetDate ? new Date(g.targetDate) : new Date();

        const health = goalHealthService.calculate({
          goalId: g.id,
          targetAmount: target,
          savedAmount: saved,
          createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
          targetDate,
          availableMonthlyCapacity: 10000,
        });

        const pct = target > 0 ? Math.round((saved / target) * 100) : 0;

        // Milestone Celebrations
        if (pct >= 100) {
          events.push({
            userId,
            type: NotificationType.GOAL_MILESTONE,
            title: `Goal Achieved: ${g.name}! 🎉`,
            message: `Congratulations! You've reached your ₹${target.toLocaleString('en-IN')} target for ${g.name}.`,
            severity: 'SUCCESS',
            entityType: 'goal',
            entityId: `${g.id}:100`,
            cooldownHours: 720, // 30 days
            metadata: { goalId: g.id, target, saved, percentage: pct },
          });
        } else if (pct >= 50 && pct < 60) {
          events.push({
            userId,
            type: NotificationType.GOAL_MILESTONE,
            title: `Halfway There: ${g.name} 🚀`,
            message: `You've reached 50% of your ${g.name} goal (₹${saved.toLocaleString('en-IN')} of ₹${target.toLocaleString('en-IN')}).`,
            severity: 'SUCCESS',
            entityType: 'goal',
            entityId: `${g.id}:50`,
            cooldownHours: 720,
            metadata: { goalId: g.id, target, saved, percentage: pct },
          });
        }

        // Health Risks
        if (health.status === 'RED') {
          events.push({
            userId,
            type: NotificationType.GOAL_HEALTH_DOWNGRADE,
            title: `Goal At Risk: ${g.name}`,
            message: `Your ${g.name} goal is critically behind schedule. Remaining target is ₹${Math.max(0, target - saved).toLocaleString('en-IN')}.`,
            severity: 'CRITICAL',
            entityType: 'goal',
            entityId: `${g.id}:health:red`,
            period: month,
            cooldownHours: 96,
            metadata: { goalId: g.id, target, saved, status: health.status },
          });
        } else if (health.status === 'YELLOW') {
          events.push({
            userId,
            type: NotificationType.GOAL_HEALTH_DOWNGRADE,
            title: `Goal Attention Needed: ${g.name}`,
            message: `Your ${g.name} goal progress is lagging behind your planned timeline.`,
            severity: 'WARNING',
            entityType: 'goal',
            entityId: `${g.id}:health:yellow`,
            period: month,
            cooldownHours: 96,
            metadata: { goalId: g.id, target, saved, status: health.status },
          });
        }
      }
    } catch {
      // Non-blocking
    }
    return events;
  }

  // 3. Upcoming Bill & Subscription Reminders
  private async detectBillReminders(userId: string): Promise<FinancialEvent[]> {
    const events: FinancialEvent[] = [];
    try {
      const recurrings = await recurringPaymentService.list(userId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const item of recurrings) {
        if (!item.nextExpectedDate) continue;
        const dueDate = new Date(item.nextExpectedDate);
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
        const amount = Number(item.averageAmount || 0);

        // Windows: Due in 7 days, 3 days, 1 day, or Today
        if (diffDays >= 0 && diffDays <= 7) {
          const isToday = diffDays === 0;
          const isTomorrow = diffDays === 1;
          const timeText = isToday ? 'today' : isTomorrow ? 'tomorrow' : `in ${diffDays} days`;
          const isEmi = /emi|loan/i.test(item.category || '') || /emi|loan/i.test(item.merchantName || '');
          const type = isEmi ? NotificationType.BILL_UPCOMING : NotificationType.SUBSCRIPTION_UPCOMING;
          const severity: NotificationSeverity = (isToday || isTomorrow) ? 'WARNING' : 'INFO';

          events.push({
            userId,
            type,
            title: `Upcoming Payment: ${item.merchantName}`,
            message: `Your ₹${amount.toLocaleString('en-IN')} payment to ${item.merchantName} is due ${timeText}.`,
            severity,
            entityType: 'recurring_payment',
            entityId: `${item.id}:${item.nextExpectedDate}:window${diffDays}`,
            cooldownHours: 24,
            metadata: { recurringId: item.id, merchant: item.merchantName, amount, dueDate: item.nextExpectedDate, daysUntilDue: diffDays },
          });
        }
      }
    } catch {
      // Non-blocking
    }
    return events;
  }

  private async detectSpendingAnomalies(userId: string, month: string): Promise<FinancialEvent[]> {
    const events: FinancialEvent[] = [];
    try {
      const result = await anomalyService.detect(userId, month);
      for (const a of (result.anomalies || [])) {
        if (a.severity === 'HIGH' || a.severity === 'MEDIUM') {
          events.push({
            userId,
            type: NotificationType.SPENDING_ANOMALY,
            title: a.title || 'Unusual Spending Detected',
            message: `${a.description} A ₹${a.currentValue.toLocaleString('en-IN')} transaction is significantly higher than your typical spending.`,
            severity: a.severity === 'HIGH' ? 'WARNING' : 'INFO',
            entityType: 'transaction',
            entityId: a.id,
            cooldownHours: 48,
            metadata: { anomalyId: a.id, amount: a.currentValue, expected: a.expectedValue, category: a.metadata?.category, merchant: a.metadata?.merchant },
          });
        }
      }
    } catch {
      // Non-blocking
    }
    return events;
  }

  // 5. Milestone & Celebration Detector
  private async detectMilestones(userId: string): Promise<FinancialEvent[]> {
    const events: FinancialEvent[] = [];
    try {
      const summary = await accountService.getAccountSummary(userId);
      const liquid = summary.totalLiquidBalance || 0;

      // Milestone milestones: ₹50,000, ₹1,00,000, ₹5,00,000
      if (liquid >= 100000) {
        events.push({
          userId,
          type: NotificationType.SAVINGS_MILESTONE,
          title: 'Milestone: ₹1 Lakh Liquidity! 🌟',
          message: `Your total liquid balance has reached ₹${liquid.toLocaleString('en-IN')}. Outstanding milestone!`,
          severity: 'SUCCESS',
          entityType: 'account',
          entityId: 'liquid:100k',
          cooldownHours: 720,
          metadata: { totalLiquidBalance: liquid },
        });
      } else if (liquid >= 50000) {
        events.push({
          userId,
          type: NotificationType.SAVINGS_MILESTONE,
          title: 'Milestone: ₹50,000 Saved! ✨',
          message: `Your liquid balance is now ₹${liquid.toLocaleString('en-IN')}. Great momentum!`,
          severity: 'SUCCESS',
          entityType: 'account',
          entityId: 'liquid:50k',
          cooldownHours: 720,
          metadata: { totalLiquidBalance: liquid },
        });
      }

      // Debt-free celebration
      if (summary.totalCreditDebt === 0 && summary.totalAccountLiquidBalance > 10000) {
        events.push({
          userId,
          type: NotificationType.DEBT_MILESTONE,
          title: 'Zero Credit Debt Milestone! 🛡️',
          message: 'You have zero outstanding credit card debt. Strong financial resilience!',
          severity: 'SUCCESS',
          entityType: 'account',
          entityId: 'debt:zero',
          cooldownHours: 720,
          metadata: { netWorth: summary.netWorth },
        });
      }
    } catch {
      // Non-blocking
    }
    return events;
  }
}

export const financialEventDetectorService = new FinancialEventDetectorService();
