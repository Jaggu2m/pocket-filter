import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { budgetRepository } from '../repositories/budget.repository.js';
import {
  budgetCalculationService,
  type CalculatedBudgetSummary,
} from './budget-calculation.service.js';
import { NotFoundError, ConflictError, BadRequestError } from '../errors/app-error.js';

export interface CreateBudgetInput {
  userId: string;
  month: string;
  overallLimit: number;
  currency?: string;
  categoryLimits?: Array<{ categoryId?: string; category?: string; limitAmount: number }>;
}

export interface UpdateBudgetInput {
  overallLimit?: number;
  currency?: string;
}

export function getMonthBounds(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new BadRequestError('month must be in YYYY-MM format');
  const year = parseInt(match[1], 10);
  const mon = parseInt(match[2], 10);
  const start = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
  return { start, end };
}

export class BudgetService {
  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private handleUniqueViolation(error: unknown): never {
    const pgError = error as { code?: string; constraint?: string };
    if (pgError?.code === '23505') {
      throw new ConflictError('A budget for this month and currency already exists');
    }
    throw error as Error;
  }

  async createBudget(input: CreateBudgetInput) {
    const currency = input.currency || 'INR';
    getMonthBounds(input.month); // validates

    const resolvedLimits: Array<{ categoryId: string; limitAmount: number }> = [];
    for (const limit of input.categoryLimits || []) {
      let categoryId = limit.categoryId;
      if (!categoryId && limit.category) {
        const found = await budgetRepository.findCategoryByName(limit.category);
        if (!found) throw new BadRequestError(`Invalid category '${limit.category}'`);
        categoryId = found.id;
      }
      if (!categoryId) throw new BadRequestError('categoryId or category is required');
      const category = await budgetRepository.findCategoryById(categoryId);
      if (!category) throw new BadRequestError(`Invalid category ID '${categoryId}'`);
      resolvedLimits.push({ categoryId, limitAmount: limit.limitAmount });
    }

    const categoryIds = resolvedLimits.map((limit) => limit.categoryId);
    if (new Set(categoryIds).size !== categoryIds.length) {
      throw new BadRequestError('Duplicate categories in budget request');
    }

    const existing = await budgetRepository.findByUserMonth(input.userId, input.month, currency);
    if (existing) {
      throw new ConflictError('A budget for this month and currency already exists');
    }

    try {
      return await this.withTransaction(async (client) => {
        const budget = await budgetRepository.createBudget(
          {
            userId: input.userId,
            month: input.month,
            overallLimit: input.overallLimit,
            currency,
          },
          client,
        );

        for (const limit of resolvedLimits) {
          await budgetRepository.upsertCategoryLimit(budget.id, limit.categoryId, limit.limitAmount, client);
        }

        const created = await budgetRepository.findById(budget.id, input.userId, client);
        if (!created) throw new Error('Failed to reload created budget');
        return created;
      });
    } catch (error) {
      this.handleUniqueViolation(error);
    }
  }

  async getBudgetById(id: string, userId: string) {
    const budget = await budgetRepository.findById(id, userId);
    if (!budget) throw new NotFoundError('Budget not found');
    return budget;
  }

  async getCurrentBudget(userId: string, month?: string, currency = 'INR') {
    const resolvedMonth = month || new Date().toISOString().slice(0, 7);
    return budgetRepository.findByUserMonth(userId, resolvedMonth, currency);
  }

  async listBudgets(userId: string) {
    return budgetRepository.listByUser(userId);
  }

  async updateBudget(id: string, userId: string, updates: UpdateBudgetInput) {
    const budget = await budgetRepository.findById(id, userId);
    if (!budget) throw new NotFoundError('Budget not found');

    let currency = budget.currency;
    if (updates.currency !== undefined) {
      currency = updates.currency;
      const duplicate = await budgetRepository.findByUserMonth(userId, budget.month, currency);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError('A budget for this month and currency already exists');
      }
    }

    try {
      const updated = await this.withTransaction(async (client) => {
        return budgetRepository.updateBudget(
          id,
          userId,
          {
            overallLimit: updates.overallLimit,
            currency: updates.currency,
          },
          client,
        );
      });
      if (!updated) throw new NotFoundError('Budget not found');
      return updated;
    } catch (error) {
      this.handleUniqueViolation(error);
    }
  }

  async upsertCategoryLimit(budgetId: string, userId: string, categoryId: string, limitAmount: number) {
    const budget = await budgetRepository.findById(budgetId, userId);
    if (!budget) throw new NotFoundError('Budget not found');

    let resolvedCategoryId = categoryId;
    const category = await budgetRepository.findCategoryById(resolvedCategoryId);
    if (!category) {
      const byName = await budgetRepository.findCategoryByName(categoryId);
      if (!byName) throw new BadRequestError(`Invalid category ID '${categoryId}'`);
      resolvedCategoryId = byName.id;
    }

    const updatedLimit = await this.withTransaction(async (client) => {
      return budgetRepository.upsertCategoryLimit(budgetId, resolvedCategoryId, limitAmount, client);
    });

    const refreshed = await budgetRepository.findById(budgetId, userId);
    if (!refreshed) throw new NotFoundError('Budget not found');
    return { budget: refreshed, categoryLimit: updatedLimit };
  }

  async deleteCategoryLimit(budgetId: string, userId: string, categoryId: string) {
    const budget = await budgetRepository.findById(budgetId, userId);
    if (!budget) throw new NotFoundError('Budget not found');

    const deleted = await this.withTransaction(async (client) => {
      return budgetRepository.deleteCategoryLimit(budgetId, categoryId, client);
    });
    if (!deleted) throw new NotFoundError('Category limit not found');
    return budgetRepository.findById(budgetId, userId);
  }

  async calculateSummary(budgetId: string, userId: string): Promise<CalculatedBudgetSummary> {
    const budget = await budgetRepository.findById(budgetId, userId);
    if (!budget) throw new NotFoundError('Budget not found');

    const { start, end } = getMonthBounds(budget.month);
    const actualByCategory = await budgetRepository.getCategorySpending(userId, start, end);

    const categoryInputs = budget.categoryLimits.map((limit) => ({
      categoryId: limit.categoryId,
      categoryName: limit.categoryName,
      limitAmount: limit.limitAmount,
      actualSpending: actualByCategory[limit.categoryName] || 0,
    }));

    return budgetCalculationService.calculateSummary(
      budget.month,
      budget.currency,
      budget.overallLimit,
      categoryInputs,
      actualByCategory,
    );
  }

  async deleteBudget(id: string, userId: string): Promise<void> {
    const budget = await budgetRepository.findById(id, userId);
    if (!budget) throw new NotFoundError('Budget not found');

    await this.withTransaction(async (client) => {
      await client.query('DELETE FROM monthly_budgets WHERE id = $1 AND user_id = $2', [id, userId]);
    });
  }

  async calculateComparison(budgetId: string, userId: string): Promise<CalculatedBudgetSummary> {
    return this.calculateSummary(budgetId, userId);
  }
}

export const budgetService = new BudgetService();