export interface SavingPlan {
  goalId: string;
  targetAmount: number;
  savedAmount: number;
  remainingAmount: number;
  progressPercent: number;
  daysRemaining: number;
  monthsRemaining: number;
  requiredPerDay: number;
  requiredPerWeek: number;
  requiredPerMonth: number;
  status: 'completed' | 'overdue' | 'in_progress' | 'no_deadline';
  isOverdue: boolean;
  asOfDate: string;
}

export class GoalCalculationService {
  round(value: number): number {
    return Number((value || 0).toFixed(2));
  }

  calculate(goalId: string, targetAmount: number, savedAmount: number, targetDate: Date, asOf: Date = new Date()): SavingPlan {
    const safeSaved = Math.max(0, savedAmount || 0);
    const remaining = Math.max(0, (targetAmount || 0) - safeSaved);
    const progressPercent = targetAmount > 0 ? this.round((safeSaved / targetAmount) * 100) : 0;

    const asOfDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
    const target = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const msPerDay = 86400000;
    const daysRemaining = Math.ceil((target.getTime() - asOfDate.getTime()) / msPerDay);

    const completed = remaining <= 0;
    const overdue = !completed && daysRemaining < 0;

    let monthsRemaining = 0;
    if (!completed && daysRemaining > 0) {
      monthsRemaining = daysRemaining / 30;
    }

    let requiredPerDay = 0;
    let requiredPerWeek = 0;
    let requiredPerMonth = 0;

    if (!completed && daysRemaining > 0) {
      requiredPerDay = this.round(remaining / daysRemaining);
      requiredPerWeek = this.round(requiredPerDay * 7);
      if (monthsRemaining > 0) {
        requiredPerMonth = this.round(remaining / monthsRemaining);
      } else {
        requiredPerMonth = this.round(requiredPerDay * 30);
      }
    }

    let status: SavingPlan['status'] = 'in_progress';
    if (completed) status = 'completed';
    else if (overdue) status = 'overdue';

    return {
      goalId,
      targetAmount: this.round(targetAmount),
      savedAmount: this.round(safeSaved),
      remainingAmount: this.round(remaining),
      progressPercent,
      daysRemaining,
      monthsRemaining: this.round(monthsRemaining),
      requiredPerDay,
      requiredPerWeek,
      requiredPerMonth,
      status,
      isOverdue: overdue,
      asOfDate: asOfDate.toISOString().slice(0, 10),
    };
  }
}

export const goalCalculationService = new GoalCalculationService();