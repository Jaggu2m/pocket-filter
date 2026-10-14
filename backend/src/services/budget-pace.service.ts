import { pool } from '../config/database.js';
import { budgetRepository } from '../repositories/budget.repository.js';
import { financialCalculationService } from './financial-calculation.service.js';
import { NotFoundError, BadRequestError } from '../errors/app-error.js';

export class BudgetPaceService {
  private async getSpendingByCategory(userId: string, start: Date, end: Date): Promise<Record<string, number>> {
    const result = await pool.query<{ category: string; total: string }>(
      `SELECT category, COALESCE(SUM(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND date >= $2 AND date <= $3
       GROUP BY category`,
      [userId, start, end],
    );
    const map: Record<string, number> = {};
    for (const row of result.rows) map[row.category] = parseFloat(row.total) || 0;
    return map;
  }

  private async getTotalSpending(userId: string, start: Date, end: Date): Promise<number> {
    const result = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND date >= $2 AND date <= $3`,
      [userId, start, end],
    );
    return parseFloat(result.rows[0]?.total || '0') || 0;
  }

  async getPace(userId: string, month?: string, currency = 'INR') {
    const resolvedMonth = month || new Date().toISOString().slice(0, 7);
    const calcDays = financialCalculationService.daysInMonth(resolvedMonth);
    // validate month
    financialCalculationService.daysInMonth(resolvedMonth);

    const budget = await budgetRepository.findByUserMonth(userId, resolvedMonth, currency);
    if (!budget) throw new NotFoundError('Budget not found for the requested month');

    const bounds = financialCalculationService.monthBounds(resolvedMonth);
    const { daysElapsed, asOf } = financialCalculationService.daysElapsedForMonth(resolvedMonth);
    const effectiveDaysElapsed = daysElapsed > 0 ? daysElapsed : 1;

    const actualSpent = await this.getTotalSpending(userId, bounds.start, asOf > bounds.end ? bounds.end : asOf < bounds.start ? bounds.start : asOf);
    const spendingByCategory = await this.getSpendingByCategory(userId, bounds.start, asOf > bounds.end ? bounds.end : asOf < bounds.start ? bounds.start : asOf);

    const overall = financialCalculationService.calculateOverallPace({
      month: resolvedMonth,
      budget: budget.overallLimit,
      actualSpent,
      daysElapsed: effectiveDaysElapsed,
    });

    const categoryPaces = budget.categoryLimits.map((limit) => {
      const actual = spendingByCategory[limit.categoryName] || 0;
      return financialCalculationService.calculateCategoryPace({
        month: resolvedMonth,
        category: limit.categoryName,
        budget: limit.limitAmount,
        actualSpent: actual,
        daysElapsed: effectiveDaysElapsed,
      });
    });

    const budgetedCategories = new Set(budget.categoryLimits.map((l) => l.categoryName));
    for (const [category, spent] of Object.entries(spendingByCategory)) {
      if (!budgetedCategories.has(category)) {
        categoryPaces.push({
          category,
          ...financialCalculationService.calculateOverallPace({
            month: resolvedMonth,
            budget: 0,
            actualSpent: spent,
            daysElapsed: effectiveDaysElapsed,
          }),
          status: 'UNBUDGETED',
        } as any);
      }
    }

    return {
      month: resolvedMonth,
      currency: budget.currency,
      asOf: (asOf > bounds.end ? bounds.end : asOf < bounds.start ? bounds.start : asOf).toISOString().slice(0, 10),
      overall,
      categories: categoryPaces,
      unallocatedBudget: budget.overallLimit - budget.categoryLimits.reduce((s, l) => s + l.limitAmount, 0),
    };
  }
}

export const budgetPaceService = new BudgetPaceService();