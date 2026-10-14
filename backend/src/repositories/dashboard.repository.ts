import { pool } from '../config/database.js';

export interface DashboardTotals {
  income: number;
  expense: number;
  transactionCount: number;
}

export interface CategoryBreakdownItem {
  category: string;
  amount: number;
  transactionCount: number;
}

export interface DailySpendItem {
  date: string;
  day: number;
  amount: number;
}

export interface AccountSpendItem {
  accountId: string | null;
  accountName: string;
  amount: number;
  transactionCount: number;
}

export interface LargestTransactionItem {
  id: string;
  type: string;
  amount: number;
  category: string;
  merchant: string | null;
  description: string | null;
  date: Date;
  accountId: string | null;
  accountName: string | null;
}

export interface MonthlyHistoryItem {
  month: string;
  income: number;
  expense: number;
  netSavings: number;
}

export class DashboardRepository {
  async getTotals(userId: string, startDate: Date, endDate: Date): Promise<DashboardTotals> {
    const result = await pool.query<{ type: string; total: string; count: string }>(
      `SELECT type, COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS count
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3 AND type IN ('income', 'expense')
       GROUP BY type`,
      [userId, startDate, endDate],
    );

    let income = 0;
    let expense = 0;
    let transactionCount = 0;
    for (const row of result.rows) {
      if (row.type === 'income') {
        income = parseFloat(row.total) || 0;
      } else if (row.type === 'expense') {
        expense = parseFloat(row.total) || 0;
      }
      transactionCount += parseInt(row.count, 10) || 0;
    }
    // transactionCount should be all transactions in period, including transfers; fetch separately for accuracy
    const countRes = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM transactions WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [userId, startDate, endDate],
    );
    transactionCount = parseInt(countRes.rows[0]?.count || '0', 10);

    return { income, expense, transactionCount };
  }

  async getCategoryBreakdown(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CategoryBreakdownItem[]> {
    const result = await pool.query<{ category: string; total: string; count: string }>(
      `SELECT category, COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS count
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND date >= $2 AND date <= $3
       GROUP BY category
       ORDER BY SUM(amount) DESC`,
      [userId, startDate, endDate],
    );

    return result.rows.map((row) => ({
      category: row.category,
      amount: parseFloat(row.total) || 0,
      transactionCount: parseInt(row.count, 10) || 0,
    }));
  }

  async getDailySpend(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<DailySpendItem[]> {
    const result = await pool.query<{ day: Date; total: string }>(
      `SELECT date_trunc('day', date) AS day, COALESCE(SUM(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND date >= $2 AND date <= $3
       GROUP BY date_trunc('day', date)
       ORDER BY day`,
      [userId, startDate, endDate],
    );

    const map = new Map<string, number>();
    for (const row of result.rows) {
      const d = new Date(row.day);
      map.set(d.toISOString().slice(0, 10), parseFloat(row.total) || 0);
    }

    const items: DailySpendItem[] = [];
    const cursor = new Date(startDate);
    cursor.setUTCHours(0, 0, 0, 0);
    const last = new Date(endDate);
    last.setUTCHours(23, 59, 59, 999);
    while (cursor <= last) {
      const key = cursor.toISOString().slice(0, 10);
      items.push({
        date: key,
        day: cursor.getUTCDate(),
        amount: map.get(key) || 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return items;
  }

  async getAccountSpend(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AccountSpendItem[]> {
    const result = await pool.query<{
      account_id: string | null;
      account_name: string | null;
      total: string;
      count: string;
    }>(
      `SELECT t.account_id,
              a.name AS account_name,
              COALESCE(SUM(t.amount), 0)::text AS total,
              COUNT(*)::text AS count
       FROM transactions t
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = $1 AND t.type = 'expense' AND t.date >= $2 AND t.date <= $3
       GROUP BY t.account_id, a.name
       ORDER BY SUM(t.amount) DESC`,
      [userId, startDate, endDate],
    );

    return result.rows.map((row) => ({
      accountId: row.account_id,
      accountName: row.account_name || 'Unlinked',
      amount: parseFloat(row.total) || 0,
      transactionCount: parseInt(row.count, 10) || 0,
    }));
  }

  async getLargestTransactions(
    userId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 5,
  ): Promise<LargestTransactionItem[]> {
    const result = await pool.query<{
      id: string;
      type: string;
      amount: string;
      category: string;
      merchant: string | null;
      description: string | null;
      date: Date;
      account_id: string | null;
      account_name: string | null;
    }>(
      `SELECT t.id, t.type, t.amount, t.category, t.merchant, t.description, t.date,
              t.account_id, a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = $1 AND t.date >= $2 AND t.date <= $3
       ORDER BY t.amount DESC
       LIMIT $4`,
      [userId, startDate, endDate, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: parseFloat(row.amount) || 0,
      category: row.category,
      merchant: row.merchant,
      description: row.description,
      date: row.date,
      accountId: row.account_id,
      accountName: row.account_name,
    }));
  }

  async getMonthlyHistory(
    userId: string,
    endDate: Date,
    months: number = 12,
  ): Promise<MonthlyHistoryItem[]> {
    const start = new Date(endDate);
    start.setUTCMonth(start.getUTCMonth() - (months - 1));
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);

    const result = await pool.query<{ month: string; income: string; expense: string }>(
      `SELECT to_char(date, 'YYYY-MM') AS month,
              COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::text AS income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::text AS expense
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3 AND type IN ('income', 'expense')
       GROUP BY to_char(date, 'YYYY-MM')
       ORDER BY month`,
      [userId, start, endDate],
    );

    const map = new Map<string, { income: number; expense: number }>();
    for (const row of result.rows) {
      map.set(row.month, {
        income: parseFloat(row.income) || 0,
        expense: parseFloat(row.expense) || 0,
      });
    }

    const items: MonthlyHistoryItem[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      const vals = map.get(key) || { income: 0, expense: 0 };
      items.push({
        month: key,
        income: vals.income,
        expense: vals.expense,
        netSavings: vals.income - vals.expense,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return items;
  }
}

export const dashboardRepository = new DashboardRepository();