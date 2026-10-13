import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  userId: string;
  accountId: string | null;
  toAccountId: string | null;
  accountName?: string | null;
  toAccountName?: string | null;
  type: TransactionType;
  amount: number;
  currency: string;
  category: string;
  merchant: string | null;
  description: string | null;
  date: Date;
  paymentRail: string | null;
  isRecurring: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTransactionInput {
  userId: string;
  accountId?: string | null;
  toAccountId?: string | null;
  type: TransactionType;
  amount: number;
  currency?: string;
  category?: string;
  merchant?: string | null;
  description?: string | null;
  date?: Date;
  paymentRail?: string | null;
  isRecurring?: boolean;
  tags?: string[];
}

export interface UpdateTransactionInput {
  accountId?: string | null;
  toAccountId?: string | null;
  type?: TransactionType;
  amount?: number;
  currency?: string;
  category?: string;
  merchant?: string | null;
  description?: string | null;
  date?: Date;
  paymentRail?: string | null;
  isRecurring?: boolean;
  tags?: string[];
}

export interface TransactionFilterOptions {
  startDate?: Date;
  endDate?: Date;
  type?: TransactionType;
  category?: string;
  accountId?: string;
  search?: string;
  sortBy?: 'date' | 'amount' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface PaginatedTransactions {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

interface TransactionRow {
  id: string;
  user_id: string;
  account_id: string | null;
  to_account_id: string | null;
  account_name?: string | null;
  to_account_name?: string | null;
  type: TransactionType;
  amount: string;
  currency: string;
  category: string;
  merchant: string | null;
  description: string | null;
  date: Date;
  payment_rail: string | null;
  is_recurring: boolean;
  tags: string[] | null;
  created_at: Date;
  updated_at: Date;
  full_count?: string;
}

function mapRowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    accountName: row.account_name ?? null,
    toAccountName: row.to_account_name ?? null,
    type: row.type,
    amount: parseFloat(row.amount) || 0,
    currency: row.currency,
    category: row.category,
    merchant: row.merchant,
    description: row.description,
    date: row.date,
    paymentRail: row.payment_rail,
    isRecurring: row.is_recurring,
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class TransactionRepository {
  async createTransaction(
    input: CreateTransactionInput,
    client?: PoolClient,
  ): Promise<Transaction> {
    const runner = client || pool;
    const query = `
      INSERT INTO transactions (
        user_id, account_id, to_account_id, type, amount,
        currency, category, merchant, description, date,
        payment_rail, is_recurring, tags
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'INR'), COALESCE($7, 'General'), $8, $9, COALESCE($10, CURRENT_TIMESTAMP), $11, COALESCE($12, FALSE), $13::text[])
      RETURNING *;
    `;

    const values = [
      input.userId,
      input.accountId || null,
      input.toAccountId || null,
      input.type,
      input.amount,
      input.currency || 'INR',
      input.category ? input.category.trim() : 'General',
      input.merchant ? input.merchant.trim() : null,
      input.description ? input.description.trim() : null,
      input.date || new Date(),
      input.paymentRail ? input.paymentRail.trim() : null,
      input.isRecurring ?? false,
      input.tags || [],
    ];

    const result = await runner.query<TransactionRow>(query, values);
    return mapRowToTransaction(result.rows[0]);
  }

  async findById(id: string, userId: string): Promise<Transaction | null> {
    const query = `
      SELECT t.*, a.name AS account_name, ta.name AS to_account_name
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      WHERE t.id = $1 AND t.user_id = $2
      LIMIT 1;
    `;

    const result = await pool.query<TransactionRow>(query, [id, userId]);
    return result.rows[0] ? mapRowToTransaction(result.rows[0]) : null;
  }

  async findTransactions(
    userId: string,
    options: TransactionFilterOptions = {},
  ): Promise<PaginatedTransactions> {
    const conditions: string[] = ['t.user_id = $1'];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    if (options.startDate) {
      conditions.push(`t.date >= $${paramIndex++}`);
      values.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`t.date <= $${paramIndex++}`);
      values.push(options.endDate);
    }

    if (options.type) {
      conditions.push(`t.type = $${paramIndex++}`);
      values.push(options.type);
    }

    if (options.category) {
      conditions.push(`LOWER(t.category) = LOWER($${paramIndex++})`);
      values.push(options.category.trim());
    }

    if (options.accountId) {
      conditions.push(`(t.account_id = $${paramIndex} OR t.to_account_id = $${paramIndex})`);
      paramIndex++;
      values.push(options.accountId);
    }

    if (options.search) {
      conditions.push(
        `(t.merchant ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex} OR t.category ILIKE $${paramIndex})`,
      );
      paramIndex++;
      values.push(`%${options.search.trim()}%`);
    }

    const sortField =
      options.sortBy === 'amount'
        ? 't.amount'
        : options.sortBy === 'created_at'
          ? 't.created_at'
          : 't.date';
    const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const offset = Math.max(options.offset || 0, 0);

    const dataQuery = `
      SELECT t.*, a.name AS account_name, ta.name AS to_account_name, count(*) OVER() AS full_count
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortField} ${sortOrder}, t.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex};
    `;

    values.push(limit, offset);

    const result = await pool.query<TransactionRow>(dataQuery, values);
    const total = result.rows.length > 0 ? parseInt(result.rows[0].full_count || '0', 10) : 0;
    const transactions = result.rows.map(mapRowToTransaction);

    return {
      transactions,
      total,
      limit,
      offset,
    };
  }

  async updateTransaction(
    id: string,
    userId: string,
    updates: UpdateTransactionInput,
    client?: PoolClient,
  ): Promise<Transaction | null> {
    const runner = client || pool;
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.accountId !== undefined) {
      fields.push(`account_id = $${paramIndex++}`);
      values.push(updates.accountId || null);
    }

    if (updates.toAccountId !== undefined) {
      fields.push(`to_account_id = $${paramIndex++}`);
      values.push(updates.toAccountId || null);
    }

    if (updates.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }

    if (updates.amount !== undefined) {
      fields.push(`amount = $${paramIndex++}`);
      values.push(updates.amount);
    }

    if (updates.currency !== undefined) {
      fields.push(`currency = $${paramIndex++}`);
      values.push(updates.currency.trim().toUpperCase());
    }

    if (updates.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      values.push(updates.category.trim());
    }

    if (updates.merchant !== undefined) {
      fields.push(`merchant = $${paramIndex++}`);
      values.push(updates.merchant ? updates.merchant.trim() : null);
    }

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description ? updates.description.trim() : null);
    }

    if (updates.date !== undefined) {
      fields.push(`date = $${paramIndex++}`);
      values.push(updates.date);
    }

    if (updates.paymentRail !== undefined) {
      fields.push(`payment_rail = $${paramIndex++}`);
      values.push(updates.paymentRail ? updates.paymentRail.trim() : null);
    }

    if (updates.isRecurring !== undefined) {
      fields.push(`is_recurring = $${paramIndex++}`);
      values.push(updates.isRecurring);
    }

    if (updates.tags !== undefined) {
      fields.push(`tags = $${paramIndex++}::text[]`);
      values.push(updates.tags);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    const query = `
      UPDATE transactions
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
      RETURNING *;
    `;

    const result = await runner.query<TransactionRow>(query, values);
    return result.rows[0] ? mapRowToTransaction(result.rows[0]) : null;
  }

  async deleteTransaction(id: string, userId: string, client?: PoolClient): Promise<boolean> {
    const runner = client || pool;
    const query = `
      DELETE FROM transactions
      WHERE id = $1 AND user_id = $2;
    `;
    const result = await runner.query(query, [id, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const transactionRepository = new TransactionRepository();
