import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';

export interface GoalRecord {
  id: string;
  userId: string;
  accountId: string | null;
  accountName: string | null;
  accountBalance: number | null;
  name: string;
  targetAmount: number;
  targetDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  savedAmount: number;
}

export interface ContributionRecord {
  id: string;
  goalId: string;
  userId: string;
  amount: number;
  type: 'contribution' | 'reversal';
  reversedContributionId: string | null;
  accountId: string | null;
  accountName: string | null;
  note: string | null;
  createdAt: Date;
}

interface GoalRow {
  id: string;
  user_id: string;
  account_id: string | null;
  account_name: string | null;
  account_balance: string | null;
  name: string;
  target_amount: string;
  target_date: Date | string;
  status: string;
  created_at: Date;
  updated_at: Date;
  saved_amount?: string;
}

interface ContributionRow {
  id: string;
  goal_id: string;
  user_id: string;
  amount: string;
  type: string;
  reversed_contribution_id: string | null;
  account_id: string | null;
  account_name: string | null;
  note: string | null;
  created_at: Date;
}

function mapGoal(row: GoalRow): GoalRecord {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    accountName: row.account_name,
    accountBalance: row.account_balance === null || row.account_balance === undefined ? null : parseFloat(row.account_balance),
    name: row.name,
    targetAmount: parseFloat(row.target_amount) || 0,
    targetDate: new Date(row.target_date),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    savedAmount: row.saved_amount !== undefined ? (parseFloat(row.saved_amount) || 0) : 0,
  };
}

function mapContribution(row: ContributionRow): ContributionRecord {
  return {
    id: row.id,
    goalId: row.goal_id,
    userId: row.user_id,
    amount: parseFloat(row.amount) || 0,
    type: row.type === 'reversal' ? 'reversal' : 'contribution',
    reversedContributionId: row.reversed_contribution_id,
    accountId: row.account_id,
    accountName: row.account_name,
    note: row.note,
    createdAt: row.created_at,
  };
}

export class GoalRepository {
  async findGoalById(id: string, userId: string, client?: PoolClient): Promise<GoalRecord | null> {
    const runner: any = client || pool;
    const result = await runner.query(
      `SELECT g.*, a.name AS account_name, a.balance AS account_balance,
              COALESCE((SELECT SUM(CASE WHEN type='contribution' THEN amount ELSE -amount END) FROM goal_contributions WHERE goal_id = g.id), 0)::text AS saved_amount
       FROM savings_goals g
       LEFT JOIN accounts a ON g.account_id = a.id
       WHERE g.id = $1 AND g.user_id = $2 LIMIT 1`,
      [id, userId],
    );
    if (!result.rows[0]) return null;
    return mapGoal(result.rows[0]);
  }

  async listGoals(userId: string, status?: string): Promise<GoalRecord[]> {
    const values: unknown[] = [userId];
    let condition = 'WHERE g.user_id = $1';
    if (status) {
      condition += ' AND g.status = $2';
      values.push(status);
    }
    const result = await pool.query<GoalRow>(
      `SELECT g.*, a.name AS account_name, a.balance AS account_balance,
              COALESCE((SELECT SUM(CASE WHEN type='contribution' THEN amount ELSE -amount END) FROM goal_contributions WHERE goal_id = g.id), 0)::text AS saved_amount
       FROM savings_goals g
       LEFT JOIN accounts a ON g.account_id = a.id
       ${condition}
       ORDER BY g.target_date ASC, g.created_at DESC`,
      values,
    );
    return result.rows.map(mapGoal);
  }

  async createGoal(input: {
    userId: string;
    accountId?: string | null;
    name: string;
    targetAmount: number;
    targetDate: string;
  }, client: PoolClient): Promise<GoalRecord> {
    const result = await client.query<GoalRow>(
      `INSERT INTO savings_goals (user_id, account_id, name, target_amount, target_date)
       VALUES ($1, $2, $3, $4, $5::date)
       RETURNING *`,
      [input.userId, input.accountId || null, input.name, input.targetAmount, input.targetDate],
    );
    // reload with account name/balance
    const reload = await client.query<GoalRow>(
      `SELECT g.*, a.name AS account_name, a.balance AS account_balance,
              0::text AS saved_amount
       FROM savings_goals g
       LEFT JOIN accounts a ON g.account_id = a.id
       WHERE g.id = $1`,
      [result.rows[0].id],
    );
    return mapGoal(reload.rows[0]);
  }

  async updateGoal(id: string, userId: string, updates: {
    name?: string;
    targetAmount?: number;
    targetDate?: string;
    status?: string;
    accountId?: string | null;
  }, client: PoolClient): Promise<GoalRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name.trim());
    }
    if (updates.targetAmount !== undefined) {
      fields.push(`target_amount = $${paramIndex++}`);
      values.push(updates.targetAmount);
    }
    if (updates.targetDate !== undefined) {
      fields.push(`target_date = $${paramIndex++}::date`);
      values.push(updates.targetDate);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.accountId !== undefined) {
      fields.push(`account_id = $${paramIndex++}`);
      values.push(updates.accountId || null);
    }
    if (fields.length === 0) {
      return this.findGoalById(id, userId, client);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    const result = await client.query<GoalRow>(
      `UPDATE savings_goals SET ${fields.join(', ')}
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
       RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return null;
    return this.findGoalById(id, userId, client);
  }

  async deleteGoal(id: string, userId: string, client: PoolClient): Promise<boolean> {
    const result = await client.query(
      'DELETE FROM savings_goals WHERE id = $1 AND user_id = $2',
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createContribution(input: {
    goalId: string;
    userId: string;
    amount: number;
    type: 'contribution' | 'reversal';
    reversedContributionId?: string | null;
    accountId?: string | null;
    note?: string | null;
  }, client: PoolClient): Promise<ContributionRecord> {
    const result = await client.query<ContributionRow>(
      `INSERT INTO goal_contributions (goal_id, user_id, amount, type, reversed_contribution_id, account_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.goalId, input.userId, input.amount, input.type, input.reversedContributionId || null, input.accountId || null, input.note || null],
    );
    // reload with account name
    const reload = await client.query<ContributionRow>(
      `SELECT gc.*, a.name AS account_name
       FROM goal_contributions gc
       LEFT JOIN accounts a ON gc.account_id = a.id
       WHERE gc.id = $1`,
      [result.rows[0].id],
    );
    return mapContribution(reload.rows[0]);
  }

  async findContribution(id: string, userId: string, client?: any): Promise<ContributionRecord & { goalId: string; reversedAt?: Date | null; isReversed?: boolean } | null> {
    const runner: any = client || pool;
    const result = await runner.query(
      `SELECT gc.*, a.name AS account_name,
              EXISTS (SELECT 1 FROM goal_contributions r WHERE r.reversed_contribution_id = gc.id) AS is_reversed
       FROM goal_contributions gc
       JOIN savings_goals g ON gc.goal_id = g.id
       LEFT JOIN accounts a ON gc.account_id = a.id
       WHERE gc.id = $1 AND g.user_id = $2
       LIMIT 1`,
      [id, userId],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return { ...mapContribution(row), isReversed: row.is_reversed };
  }

  async listContributions(goalId: string, userId: string): Promise<ContributionRecord[]> {
    const result = await pool.query<ContributionRow>(
      `SELECT gc.*, a.name AS account_name
       FROM goal_contributions gc
       JOIN savings_goals g ON gc.goal_id = g.id
       LEFT JOIN accounts a ON gc.account_id = a.id
       WHERE gc.goal_id = $1 AND g.user_id = $2
       ORDER BY gc.created_at DESC`,
      [goalId, userId],
    );
    return result.rows.map(mapContribution);
  }

  async reverseContribution(originalId: string, amount: number, userId: string, note?: string | null, accountId?: string | null, client?: PoolClient): Promise<ContributionRecord> {
    const runner: any = client || pool;
    // create reversal record
    const original = await this.findContribution(originalId, userId, runner);
    if (!original) throw new Error('Contribution not found');
    // insert
    const result = await runner.query(
      `INSERT INTO goal_contributions (goal_id, user_id, amount, type, reversed_contribution_id, account_id, note)
       VALUES ($1, $2, $3, 'reversal', $4, $5, $6)
       RETURNING *`,
      [original.goalId, userId, amount, originalId, accountId || original.accountId, note || null],
    );
    const reload = await runner.query(
      `SELECT gc.*, a.name AS account_name
       FROM goal_contributions gc
       LEFT JOIN accounts a ON gc.account_id = a.id
       WHERE gc.id = $1`,
      [result.rows[0].id],
    );
    return mapContribution(reload.rows[0]);
  }

  async getSavedAmount(goalId: string, client?: PoolClient): Promise<number> {
    const runner: any = client || pool;
    const result = await runner.query(
      `SELECT COALESCE(SUM(CASE WHEN type='contribution' THEN amount ELSE -amount END), 0)::text AS total
       FROM goal_contributions WHERE goal_id = $1`,
      [goalId],
    );
    return parseFloat(result.rows[0]?.total || '0') || 0;
  }

  async accountExistsAndOwned(accountId: string, userId: string): Promise<boolean> {
    const result = await pool.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2 LIMIT 1', [accountId, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const goalRepository = new GoalRepository();