import { pool } from '../config/database.js';
import { budgetRepository } from '../repositories/budget.repository.js';
import { recurringPaymentService } from './recurring-payment.service.js';
import { NotFoundError, BadRequestError } from '../errors/app-error.js';

export interface ForecastResult {
  month: string;
  currency: string;
  asOf: string;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  strategy: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  currentIncome: number;
  currentExpenses: number;
  knownFutureCommitments: number;
  projectedExpenses: number;
  projectedIncome: number;
  projectedSavings: number;
  projectedBudgetUtilization: number | null;
  assumptions: string[];
  historicalMonths: number;
}

export interface ForecastStrategy {
  name: string;
  calculate(context: ForecastContext): ForecastResult;
}

export interface ForecastContext {
  month: string;
  currency: string;
  asOf: Date;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  currentIncome: number;
  currentExpenses: number;
  historicalAverageMonthlyIncome: number;
  historicalAverageMonthlyExpense: number;
  historicalMonths: number;
  upcomingRecurringCommitments: number;
  overallBudget: number | null;
  categoryBudgets: Record<string, number>;
}

export class BaselineForecastStrategy implements ForecastStrategy {
  name = 'baseline';

  calculate(context: ForecastContext): ForecastResult {
    const projectedDailyVariableRate = context.daysElapsed > 0
      ? context.currentExpenses / context.daysElapsed
      : context.historicalAverageMonthlyExpense / Math.max(1, context.daysInMonth);

    const remainingVariableSpending = projectedDailyVariableRate * context.daysRemaining;
    const projectedExpenses = context.currentExpenses + remainingVariableSpending + context.upcomingRecurringCommitments;
    const projectedIncome = context.currentIncome > 0 ? context.currentIncome : context.historicalAverageMonthlyIncome;
    const projectedSavings = projectedIncome - projectedExpenses;

    const confidence: ForecastResult['confidence'] =
      context.historicalMonths >= 6 && context.daysElapsed >= 7
        ? 'HIGH'
        : context.historicalMonths >= 2 || context.daysElapsed >= 7
          ? 'MEDIUM'
          : 'LOW';

    const assumptions = [
      'Variable spending continues near the current pace',
      'Known recurring/upcoming commitments are included',
      context.currentIncome > 0
        ? 'Income is based on transactions recorded so far this month'
        : 'Income is approximated from historical average because no income has been recorded this month',
      context.historicalMonths > 0
        ? `Confidence uses ${context.historicalMonths} historical month(s)`
        : 'Low confidence because no prior spending history is available',
    ];

    const projectedBudgetUtilization = context.overallBudget && context.overallBudget > 0
      ? Number(((projectedExpenses / context.overallBudget) * 100).toFixed(2))
      : null;

    return {
      month: context.month,
      currency: context.currency,
      asOf: context.asOf.toISOString().slice(0, 10),
      daysInMonth: context.daysInMonth,
      daysElapsed: context.daysElapsed,
      daysRemaining: context.daysRemaining,
      strategy: this.name,
      confidence,
      currentIncome: Number(context.currentIncome.toFixed(2)),
      currentExpenses: Number(context.currentExpenses.toFixed(2)),
      knownFutureCommitments: Number(context.upcomingRecurringCommitments.toFixed(2)),
      projectedExpenses: Number(projectedExpenses.toFixed(2)),
      projectedIncome: Number(projectedIncome.toFixed(2)),
      projectedSavings: Number(projectedSavings.toFixed(2)),
      projectedBudgetUtilization,
      assumptions,
      historicalMonths: context.historicalMonths,
    };
  }
}

export class ForecastService {
  private strategy: ForecastStrategy = new BaselineForecastStrategy();

  setStrategy(strategy: ForecastStrategy): void {
    this.strategy = strategy;
  }

  private monthBounds(month: string): { start: Date; end: Date } {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestError('month must be in YYYY-MM format');
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    return {
      start: new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0)),
      end: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
    };
  }

  private daysInMonth(month: string): number {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestError('month must be in YYYY-MM format');
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    return new Date(Date.UTC(year, mon, 0)).getUTCDate();
  }

  async getForecast(userId: string, month?: string, currency = 'INR') {
    const resolvedMonth = month || new Date().toISOString().slice(0, 7);
    const bounds = this.monthBounds(resolvedMonth);
    const daysInMonth = this.daysInMonth(resolvedMonth);
    const now = new Date();
    const asOf = now < bounds.start ? bounds.start : now > bounds.end ? bounds.end : now;
    const daysElapsed = now < bounds.start ? 0 : now > bounds.end ? daysInMonth : Math.max(1, asOf.getUTCDate() - bounds.start.getUTCDate() + 1);
    const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

    const currentTotals = await pool.query<{ type: string; total: string }>(
      `SELECT type, COALESCE(SUM(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND type IN ('income', 'expense') AND date >= $2 AND date <= $3
       GROUP BY type`,
      [userId, bounds.start, asOf],
    );
    let currentIncome = 0;
    let currentExpenses = 0;
    for (const row of currentTotals.rows) {
      if (row.type === 'income') currentIncome = parseFloat(row.total) || 0;
      if (row.type === 'expense') currentExpenses = parseFloat(row.total) || 0;
    }

    // Historical averages from prior months
    const historyStart = new Date(bounds.start);
    historyStart.setUTCMonth(historyStart.getUTCMonth() - 6);
    const historyRows = await pool.query<{ month: string; income: string; expense: string }>(
      `SELECT to_char(date, 'YYYY-MM') AS month,
              COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0)::text AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0)::text AS expense
       FROM transactions
       WHERE user_id = $1 AND type IN ('income','expense') AND date >= $2 AND date < $3
       GROUP BY to_char(date, 'YYYY-MM')`,
      [userId, historyStart, bounds.start],
    );
    let historicalIncomeSeries: number[] = [];
    let historicalExpenseSeries: number[] = [];
    for (const row of historyRows.rows) {
      historicalIncomeSeries.push(parseFloat(row.income) || 0);
      historicalExpenseSeries.push(parseFloat(row.expense) || 0);
    }
    const historicalMonths = historicalExpenseSeries.length;
    const historicalAverageMonthlyIncome = historicalIncomeSeries.length
      ? historicalIncomeSeries.reduce((a, b) => a + b, 0) / historicalIncomeSeries.length
      : 0;
    const historicalAverageMonthlyExpense = historicalExpenseSeries.length
      ? historicalExpenseSeries.reduce((a, b) => a + b, 0) / historicalExpenseSeries.length
      : 0;

    // Upcoming recurring commitments inside remaining month
    const recurring = await recurringPaymentService.list(userId);
    const recurringInWindow = recurring.filter((p: any) => {
      if (!p.nextExpectedDate) return false;
      const d = new Date(p.nextExpectedDate);
      return d > asOf && d <= bounds.end;
    });
    const recurringTotal = recurringInWindow.reduce((sum: number, p: any) => sum + (p.averageAmount || 0), 0);

    const budget = await budgetRepository.findByUserMonth(userId, resolvedMonth, currency);
    const overallBudget = budget ? budget.overallLimit : null;
    const categoryBudgets: Record<string, number> = {};
    if (budget) for (const l of budget.categoryLimits) categoryBudgets[l.categoryName] = l.limitAmount;

    const context: ForecastContext = {
      month: resolvedMonth,
      currency,
      asOf,
      daysInMonth,
      daysElapsed: daysElapsed > 0 ? daysElapsed : 0,
      daysRemaining,
      currentIncome,
      currentExpenses,
      historicalAverageMonthlyIncome,
      historicalAverageMonthlyExpense,
      historicalMonths,
      upcomingRecurringCommitments: recurringTotal,
      overallBudget,
      categoryBudgets,
    };

    const result = this.strategy.calculate(context);
    return result;
  }
}

export const forecastService = new ForecastService();