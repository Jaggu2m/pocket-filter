import { forecastService } from './forecast.service.js';

export interface GoalHealthResult {
  goalId: string;
  progressPercent: number;
  remainingAmount: number;
  monthsRemaining: number;
  expectedProgressPercent: number;
  requiredMonthlySaving: number;
  availableMonthlyCapacity: number;
  capacityRatio: number;
  status: 'GREEN' | 'YELLOW' | 'RED' | 'COMPLETED';
  isOverdue: boolean;
}

function monthsBetween(start: Date, end: Date): number {
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  // Adjust for day-of-month to make the saving period count deterministic enough.
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return months;
}

export class GoalHealthService {
  calculate(params: {
    goalId: string;
    targetAmount: number;
    savedAmount: number;
    createdAt: Date;
    targetDate: Date;
    availableMonthlyCapacity: number;
    asOf?: Date;
  }): GoalHealthResult {
    const asOf = params.asOf || new Date();
    const targetAmount = Math.max(0, params.targetAmount || 0);
    const savedAmount = Math.max(0, params.savedAmount || 0);
    const remainingAmount = Math.max(0, targetAmount - savedAmount);
    const progressPercent = targetAmount > 0 ? Number(((savedAmount / targetAmount) * 100).toFixed(2)) : 0;

    const totalMonths = Math.max(1, monthsBetween(params.createdAt, params.targetDate));
    const elapsedMonths = Math.max(0, monthsBetween(params.createdAt, asOf));
    const expectedProgressRatio = Math.min(1, elapsedMonths / totalMonths);
    const expectedProgressPercent = Number((expectedProgressRatio * 100).toFixed(2));
    const actualProgressRatio = targetAmount > 0 ? savedAmount / targetAmount : 0;

    let remainingMonths = monthsBetween(asOf, params.targetDate);
    if (remainingMonths < 0) remainingMonths = 0;
    // If target falls within current month, treat as one remaining saving period.
    if (remainingMonths === 0 && remainingAmount > 0) remainingMonths = 1;

    let requiredMonthlySaving = 0;
    if (remainingAmount > 0) {
      requiredMonthlySaving = remainingAmount / remainingMonths;
    }

    const capacity = Math.max(0, params.availableMonthlyCapacity || 0);
    const capacityRatio = requiredMonthlySaving > 0 ? capacity / requiredMonthlySaving : Number.POSITIVE_INFINITY;

    const isOverdue = remainingAmount > 0 && params.targetDate.getTime() < asOf.getTime();

    let status: GoalHealthResult['status'] = 'GREEN';
    if (remainingAmount <= 0) {
      status = 'COMPLETED';
    } else if (isOverdue) {
      status = 'RED';
    } else if (capacityRatio >= 1) {
      if (actualProgressRatio + 0.15 < expectedProgressRatio && remainingMonths > 1) {
        status = 'YELLOW';
      } else {
        status = 'GREEN';
      }
    } else if (capacityRatio >= 0.75) {
      status = 'YELLOW';
    } else {
      status = 'RED';
    }

    return {
      goalId: params.goalId,
      progressPercent,
      remainingAmount: Number(remainingAmount.toFixed(2)),
      monthsRemaining: remainingMonths,
      expectedProgressPercent,
      requiredMonthlySaving: Number(requiredMonthlySaving.toFixed(2)),
      availableMonthlyCapacity: Number(capacity.toFixed(2)),
      capacityRatio: Number((capacityRatio === Number.POSITIVE_INFINITY ? 9999.99 : capacityRatio).toFixed(4)),
      status,
      isOverdue,
    };
  }

  async calculateAvailableMonthlyCapacity(userId: string, month?: string): Promise<number> {
    const resolvedMonth = month || new Date().toISOString().slice(0, 7);
    try {
      const forecast = await forecastService.getForecast(userId, resolvedMonth);
      if (typeof forecast.projectedSavings === 'number' && Number.isFinite(forecast.projectedSavings)) {
        return forecast.projectedSavings;
      }
    } catch (_error) {
      // Fall back to transaction-derived monthly surplus below.
    }

    const match = /^(\d{4})-(\d{2})$/.exec(resolvedMonth);
    if (!match) return 0;
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
    const { pool } = await import('../config/database.js');
    const result = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) -
              COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) AS surplus
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [userId, start, end],
    );
    return parseFloat(result.rows[0]?.surplus || '0') || 0;
  }
}

export const goalHealthService = new GoalHealthService();