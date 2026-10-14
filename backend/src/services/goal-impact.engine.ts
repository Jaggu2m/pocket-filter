import { waterfallAllocationStrategy } from './goal-waterfall.service.js';

export interface GoalFundingInput {
  goalId: string;
  goalName: string;
  priority: number;
  targetDate: Date;
  savedAmount: number;
  targetAmount: number;
  remainingAmount: number;
}

export interface FinancialStateForGoals {
  surplus: number;
}

export interface GoalScenarioResult {
  goalId: string;
  goalName: string;
  targetDate: Date;
  remainingAmount: number;
  monthlyContribution: number;
  monthsToComplete: number;
  projectedCompletionDate: Date | null;
  allocatedAmount: number;
}

export class GoalImpactEngine {
  calculateMonthlyRequirements(goals: GoalFundingInput[], asOfDate: Date) {
    return goals
      .filter((goal) => goal.remainingAmount > 0 && goal.targetDate > asOfDate)
      .map((goal) => {
        const monthsRemaining = Math.max(1, this.monthsBetween(asOfDate, goal.targetDate));
        const requiredMonthly = goal.remainingAmount / monthsRemaining;
        return {
          goalId: goal.goalId,
          goalName: goal.goalName,
          priority: goal.priority,
          requiredAmount: requiredMonthly,
        };
      });
  }

  allocateFunding(goals: GoalFundingInput[], surplus: number, asOfDate: Date) {
    const requirements = this.calculateMonthlyRequirements(goals, asOfDate);
    const allocations = waterfallAllocationStrategy.allocate(Math.max(0, surplus), requirements);
    const allocationMap = new Map(allocations.map((item) => [item.goalId, item.allocatedAmount]));
    return allocationMap;
  }

  buildScenario(goals: GoalFundingInput[], surplus: number, asOfDate: Date): GoalScenarioResult[] {
    const allocationMap = this.allocateFunding(goals, surplus, asOfDate);
    return goals
      .filter((goal) => goal.remainingAmount > 0)
      .map((goal) => {
        const allocated = allocationMap.get(goal.goalId) || 0;
        const monthlyContribution = allocated;
        const monthsToComplete = monthlyContribution > 0 ? Math.ceil(goal.remainingAmount / monthlyContribution) : Number.POSITIVE_INFINITY;
        const projectedCompletionDate = Number.isFinite(monthsToComplete)
          ? this.addMonths(asOfDate, monthsToComplete)
          : null;
        return {
          goalId: goal.goalId,
          goalName: goal.goalName,
          targetDate: goal.targetDate,
          remainingAmount: goal.remainingAmount,
          monthlyContribution: Number(monthlyContribution.toFixed(2)),
          monthsToComplete: Number.isFinite(monthsToComplete) ? monthsToComplete : -1,
          projectedCompletionDate,
          allocatedAmount: Number(allocated.toFixed(2)),
        };
      });
  }

  calculateImpacts(params: {
    goals: GoalFundingInput[];
    beforeSurplus: number;
    afterSurplus: number;
    asOfDate: Date;
  }) {
    const before = this.buildScenario(params.goals, params.beforeSurplus, params.asOfDate);
    const after = this.buildScenario(params.goals, params.afterSurplus, params.asOfDate);
    const afterMap = new Map(after.map((item) => [item.goalId, item]));

    return before.map((beforeItem) => {
      const afterItem = afterMap.get(beforeItem.goalId)!;
      const beforeMonths = beforeItem.monthsToComplete;
      const afterMonths = afterItem.monthsToComplete;
      const monthsDelayed =
        beforeMonths > 0 && afterMonths > 0
          ? afterMonths - beforeMonths
          : beforeMonths <= 0
            ? 0
            : Number.POSITIVE_INFINITY;

      const monthlyContributionGap = Number((beforeItem.monthlyContribution - afterItem.monthlyContribution).toFixed(2));
      const additionalSavingsRequired = monthlyContributionGap > 0 ? monthlyContributionGap : 0;

      let impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';
      if (!Number.isFinite(afterMonths) && beforeItem.remainingAmount > 0) impactLevel = 'HIGH';
      else if (monthsDelayed >= 3) impactLevel = 'HIGH';
      else if (monthsDelayed >= 1) impactLevel = 'MEDIUM';
      else if (monthlyContributionGap > 0) impactLevel = 'LOW';

      return {
        goalId: beforeItem.goalId,
        goalName: beforeItem.goalName,
        targetDate: beforeItem.targetDate.toISOString().slice(0, 10),
        remainingAmount: Number(beforeItem.remainingAmount.toFixed(2)),
        beforeMonthlyContribution: beforeItem.monthlyContribution,
        afterMonthlyContribution: afterItem.monthlyContribution,
        monthlyContributionGap: additionalSavingsRequired,
        beforeCompletionDate: beforeItem.projectedCompletionDate?.toISOString().slice(0, 10) || null,
        afterCompletionDate: afterItem.projectedCompletionDate?.toISOString().slice(0, 10) || null,
        monthsDelayed: Number.isFinite(monthsDelayed) ? monthsDelayed : null,
        impactLevel,
        isGoalDelayed: monthsDelayed > 0,
      };
    });
  }

  private monthsBetween(start: Date, end: Date): number {
    let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
    if (end.getUTCDate() < start.getUTCDate()) months -= 1;
    return Math.max(1, months);
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    const wholeMonths = Math.floor(months);
    result.setUTCMonth(result.getUTCMonth() + wholeMonths);
    const fraction = months - wholeMonths;
    if (fraction > 0) {
      result.setUTCDate(result.getUTCDate() + Math.round(fraction * 30));
    }
    return result;
  }
}

export const goalImpactEngine = new GoalImpactEngine();