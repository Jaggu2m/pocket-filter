export class FinancialCalculationService {
  round(value: number): number {
    return Number((value || 0).toFixed(2));
  }

  daysInMonth(month: string): number {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new Error('month must be in YYYY-MM format');
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    return new Date(Date.UTC(year, mon, 0)).getUTCDate();
  }

  monthBounds(month: string): { start: Date; end: Date } {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new Error('month must be in YYYY-MM format');
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
    return { start, end };
  }

  daysElapsedForMonth(month: string): { daysElapsed: number; asOf: Date } {
    const { start, end } = this.monthBounds(month);
    const now = new Date();
    if (now < start) return { daysElapsed: 0, asOf: start };
    if (now > end) return { daysElapsed: this.daysInMonth(month), asOf: end };
    const daysElapsed = now.getUTCDate() - start.getUTCDate() + 1;
    return { daysElapsed: Math.max(1, daysElapsed), asOf: now };
  }

  calculateOverallPace(params: {
    month: string;
    budget: number;
    actualSpent: number;
    daysElapsed?: number;
  }) {
    const daysInMonth = this.daysInMonth(params.month);
    const derived = this.daysElapsedForMonth(params.month);
    const daysElapsed = params.daysElapsed ?? (derived.daysElapsed || 1);
    const safeDaysElapsed = Math.max(1, daysElapsed);
    const idealVelocity = daysInMonth > 0 ? params.budget / daysInMonth : 0;
    const actualVelocity = params.actualSpent / safeDaysElapsed;
    const velocityDelta = actualVelocity - idealVelocity;
    const idealSpentToDate = idealVelocity * safeDaysElapsed;
    const paceRatio = idealSpentToDate > 0 ? params.actualSpent / idealSpentToDate : 0;
    const projectedMonthlySpend = this.round(actualVelocity * daysInMonth);

    let status = 'ON_TRACK';
    if (paceRatio <= 0.9) status = 'BELOW_PACE';
    else if (paceRatio <= 1.1) status = 'ON_TRACK';
    else if (paceRatio <= 1.25) status = 'SLIGHTLY_AHEAD';
    else status = 'AHEAD_OF_PACE';

    return {
      month: params.month,
      daysInMonth,
      daysElapsed: safeDaysElapsed,
      budget: this.round(params.budget),
      actualSpent: this.round(params.actualSpent),
      idealVelocity: this.round(idealVelocity),
      actualVelocity: this.round(actualVelocity),
      velocityDelta: this.round(velocityDelta),
      idealSpentToDate: this.round(idealSpentToDate),
      paceRatio: this.round(paceRatio),
      status,
      projectedMonthlySpend,
      projectedOverBudget: projectedMonthlySpend > params.budget,
    };
  }

  calculateCategoryPace(params: {
    month: string;
    category: string;
    budget: number;
    actualSpent: number;
    daysElapsed?: number;
  }) {
    const result = this.calculateOverallPace({
      month: params.month,
      budget: params.budget,
      actualSpent: params.actualSpent,
      daysElapsed: params.daysElapsed,
    });
    return { category: params.category, ...result };
  }
}

export const financialCalculationService = new FinancialCalculationService();