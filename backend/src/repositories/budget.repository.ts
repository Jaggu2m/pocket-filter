import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';

export interface BudgetCategoryLimitRecord {
  id: string;
  budgetId: string;
  categoryId: string;
  categoryName: string;
  limitAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonthlyBudgetRecord {
  id: string;
  userId: string;
  month: string;
  overallLimit: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  categoryLimits: BudgetCategoryLimitRecord[];
}

interface BudgetRow {
  id: string;
  user_id: string;
  month: string;
  overall_limit: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

interface LimitRow {
  id: string;
  budget_id: string;
  category_id: string;
  category_name: string;
  limit_amount: string;
  created_at: Date;
  updated_at: Date;
}

function mapBudget(row: BudgetRow, limits: BudgetCategoryLimitRecord[] = []): MonthlyBudgetRecord {
  return {
    id: row.id,
    userId: row.user_id,
    month: row.month,
    overallLimit: parseFloat(row.overall_limit) || 0,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryLimits: limits,
  };
}

function mapLimit(row: LimitRow): BudgetCategoryLimitRecord {
  return {
    id: row.id,
    budgetId: row.budget_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    limitAmount: parseFloat(row.limit_amount) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BudgetRepository {
  async findCategoryById(categoryId: string): Promise<{ id: string; name: string } | null> {
    const result = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE id = $1 LIMIT 1',
      [categoryId],
    );
    return result.rows[0] ? { id: result.rows[0].id, name: result.rows[0].name } : null;
  }

  async findCategoryByName(name: string): Promise<{ id: string; name: string } | null> {
    const result = await pool.query<{ id: string; name: string }>(
      'SELECT id, name FROM categories WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [name.trim()],
    );
    return result.rows[0] ? { id: result.rows[0].id, name: result.rows[0].name } : null;
  }

  async loadLimits(budgetId: string, client: PoolClient | typeof pool = pool): Promise<BudgetCategoryLimitRecord[]> {
    const result = await (client as any).query(
      `SELECT bcl.id, bcl.budget_id, bcl.category_id, c.name AS category_name,
              bcl.limit_amount, bcl.created_at, bcl.updated_at
       FROM budget_category_limits bcl
       JOIN categories c ON bcl.category_id = c.id
       WHERE bcl.budget_id = $1
       ORDER BY c.name`,
      [budgetId],
    );
    return result.rows.map(mapLimit);
  }

  async findById(id: string, userId: string, client?: PoolClient): Promise<MonthlyBudgetRecord | null> {
    const runner = client || pool;
    const result = await runner.query<BudgetRow>(
      'SELECT * FROM monthly_budgets WHERE id = $1 AND user_id = $2 LIMIT 1',
      [id, userId],
    );
    if (!result.rows[0]) return null;
    const limits = await this.loadLimits(id, runner);
    return mapBudget(result.rows[0], limits);
  }

  async findByUserMonth(userId: string, month: string, currency: string, client?: PoolClient): Promise<MonthlyBudgetRecord | null> {
    const runner = client || pool;
    const result = await runner.query<BudgetRow>(
      'SELECT * FROM monthly_budgets WHERE user_id = $1 AND month = $2 AND currency = $3 LIMIT 1',
      [userId, month, currency],
    );
    if (!result.rows[0]) return null;
    const limits = await this.loadLimits(result.rows[0].id, runner);
    return mapBudget(result.rows[0], limits);
  }

  async listByUser(userId: string, client?: PoolClient): Promise<MonthlyBudgetRecord[]> {
    const runner = client || pool;
    const result = await runner.query<BudgetRow>(
      'SELECT * FROM monthly_budgets WHERE user_id = $1 ORDER BY month DESC, created_at DESC',
      [userId],
    );
    const budgets: MonthlyBudgetRecord[] = [];
    for (const row of result.rows) {
      const limits = await this.loadLimits(row.id, runner);
      budgets.push(mapBudget(row, limits));
    }
    return budgets;
  }

  async createBudget(
    input: { userId: string; month: string; overallLimit: number; currency: string },
    client: PoolClient,
  ): Promise<MonthlyBudgetRecord> {
    const result = await client.query<BudgetRow>(
      `INSERT INTO monthly_budgets (user_id, month, overall_limit, currency)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.userId, input.month, input.overallLimit, input.currency],
    );
    return mapBudget(result.rows[0], []);
  }

  async updateBudget(
    id: string,
    userId: string,
    updates: { overallLimit?: number; currency?: string },
    client: PoolClient,
  ): Promise<MonthlyBudgetRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.overallLimit !== undefined) {
      fields.push(`overall_limit = $${paramIndex++}`);
      values.push(updates.overallLimit);
    }
    if (updates.currency !== undefined) {
      fields.push(`currency = $${paramIndex++}`);
      values.push(updates.currency);
    }
    if (fields.length === 0) {
      return this.findById(id, userId, client);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    const result = await client.query<BudgetRow>(
      `UPDATE monthly_budgets SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING *`,
      values,
    );
    if (!result.rows[0]) return null;
    const limits = await this.loadLimits(id, client);
    return mapBudget(result.rows[0], limits);
  }

  async upsertCategoryLimit(
    budgetId: string,
    categoryId: string,
    limitAmount: number,
    client: PoolClient,
  ): Promise<BudgetCategoryLimitRecord> {
    const result = await client.query<LimitRow>(
      `INSERT INTO budget_category_limits (budget_id, category_id, limit_amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (budget_id, category_id)
       DO UPDATE SET limit_amount = EXCLUDED.limit_amount, updated_at = CURRENT_TIMESTAMP
       RETURNING id, budget_id, category_id, limit_amount, created_at, updated_at`,
      [budgetId, categoryId, limitAmount],
    );
    const category = await client.query<{ name: string }>('SELECT name FROM categories WHERE id = $1', [categoryId]);
    const row = result.rows[0];
    return {
      id: row.id,
      budgetId: row.budget_id,
      categoryId: row.category_id,
      categoryName: category.rows[0]?.name || 'Unknown',
      limitAmount: parseFloat(row.limit_amount) || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async deleteCategoryLimit(budgetId: string, categoryId: string, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      'DELETE FROM budget_category_limits WHERE budget_id = $1 AND category_id = $2',
      [budgetId, categoryId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getCategorySpending(userId: string, monthStart: Date, monthEnd: Date): Promise<Record<string, number>> {
    const result = await pool.query<{ category: string; total: string }>(
      `SELECT category, COALESCE(SUM(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND date >= $2 AND date <= $3
       GROUP BY category`,
      [userId, monthStart, monthEnd],
    );
    const map: Record<string, number> = {};
    for (const row of result.rows) {
      map[row.category] = parseFloat(row.total) || 0;
    }
    return map;
  }
}

export const budgetRepository = new BudgetRepository();