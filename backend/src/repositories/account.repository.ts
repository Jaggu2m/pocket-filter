import { pool } from '../config/database.js';

export type AccountType = 'bank' | 'credit_card' | 'cash' | 'upi_wallet' | 'investment' | 'other';

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  institutionName: string | null;
  accountNumberLast4: string | null;
  currency: string;
  balance: number;
  creditLimit: number | null;
  color: string | null;
  icon: string | null;
  isDefault: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAccountInput {
  userId: string;
  name: string;
  type: AccountType;
  institutionName?: string | null;
  accountNumberLast4?: string | null;
  currency?: string;
  balance?: number;
  creditLimit?: number | null;
  color?: string | null;
  icon?: string | null;
  isDefault?: boolean;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  institutionName?: string | null;
  accountNumberLast4?: string | null;
  currency?: string;
  balance?: number;
  creditLimit?: number | null;
  color?: string | null;
  icon?: string | null;
  isDefault?: boolean;
  isArchived?: boolean;
}

export interface AccountSummary {
  unspecifiedBalance: number;
  totalAccountLiquidBalance: number;
  totalLiquidBalance: number;
  totalCreditDebt: number;
  netWorth: number;
  totalAccounts: number;
  byType: Record<AccountType, { count: number; totalBalance: number }>;
}

interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  institution_name: string | null;
  account_number_last4: string | null;
  currency: string;
  balance: string;
  credit_limit: string | null;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    institutionName: row.institution_name,
    accountNumberLast4: row.account_number_last4,
    currency: row.currency,
    balance: parseFloat(row.balance) || 0,
    creditLimit: row.credit_limit !== null ? parseFloat(row.credit_limit) : null,
    color: row.color,
    icon: row.icon,
    isDefault: row.is_default,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AccountRepository {
  async createAccount(input: CreateAccountInput): Promise<Account> {
    const query = `
      INSERT INTO accounts (
        user_id, name, type, institution_name, account_number_last4,
        currency, balance, credit_limit, color, icon, is_default
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'INR'), COALESCE($7, 0.00), $8, $9, $10, COALESCE($11, FALSE))
      RETURNING *;
    `;

    const values = [
      input.userId,
      input.name.trim(),
      input.type,
      input.institutionName ? input.institutionName.trim() : null,
      input.accountNumberLast4 ? input.accountNumberLast4.trim() : null,
      input.currency || 'INR',
      input.balance !== undefined ? input.balance : 0,
      input.creditLimit !== undefined ? input.creditLimit : null,
      input.color || null,
      input.icon || null,
      input.isDefault ?? false,
    ];

    const result = await pool.query<AccountRow>(query, values);
    return mapRowToAccount(result.rows[0]);
  }

  async findById(id: string, userId: string): Promise<Account | null> {
    const query = `
      SELECT * FROM accounts
      WHERE id = $1 AND user_id = $2
      LIMIT 1;
    `;
    const result = await pool.query<AccountRow>(query, [id, userId]);
    return result.rows[0] ? mapRowToAccount(result.rows[0]) : null;
  }

  async findByUserId(
    userId: string,
    options?: { type?: AccountType; includeArchived?: boolean },
  ): Promise<Account[]> {
    const conditions: string[] = ['user_id = $1'];
    const values: unknown[] = [userId];
    const paramIndex = 2;

    if (!options?.includeArchived) {
      conditions.push('is_archived = FALSE');
    }

    if (options?.type) {
      conditions.push(`type = $${paramIndex}`);
      values.push(options.type);
    }

    const query = `
      SELECT * FROM accounts
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_default DESC, created_at ASC;
    `;

    const result = await pool.query<AccountRow>(query, values);
    return result.rows.map(mapRowToAccount);
  }

  async updateAccount(
    id: string,
    userId: string,
    updates: UpdateAccountInput,
  ): Promise<Account | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name.trim());
    }

    if (updates.type !== undefined) {
      fields.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }

    if (updates.institutionName !== undefined) {
      fields.push(`institution_name = $${paramIndex++}`);
      values.push(updates.institutionName ? updates.institutionName.trim() : null);
    }

    if (updates.accountNumberLast4 !== undefined) {
      fields.push(`account_number_last4 = $${paramIndex++}`);
      values.push(updates.accountNumberLast4 ? updates.accountNumberLast4.trim() : null);
    }

    if (updates.currency !== undefined) {
      fields.push(`currency = $${paramIndex++}`);
      values.push(updates.currency.trim().toUpperCase());
    }

    if (updates.balance !== undefined) {
      fields.push(`balance = $${paramIndex++}`);
      values.push(updates.balance);
    }

    if (updates.creditLimit !== undefined) {
      fields.push(`credit_limit = $${paramIndex++}`);
      values.push(updates.creditLimit);
    }

    if (updates.color !== undefined) {
      fields.push(`color = $${paramIndex++}`);
      values.push(updates.color);
    }

    if (updates.icon !== undefined) {
      fields.push(`icon = $${paramIndex++}`);
      values.push(updates.icon);
    }

    if (updates.isDefault !== undefined) {
      fields.push(`is_default = $${paramIndex++}`);
      values.push(updates.isDefault);
    }

    if (updates.isArchived !== undefined) {
      fields.push(`is_archived = $${paramIndex++}`);
      values.push(updates.isArchived);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    const query = `
      UPDATE accounts
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
      RETURNING *;
    `;

    const result = await pool.query<AccountRow>(query, values);
    return result.rows[0] ? mapRowToAccount(result.rows[0]) : null;
  }

  async deleteAccount(id: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM accounts
      WHERE id = $1 AND user_id = $2;
    `;
    const result = await pool.query(query, [id, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async getAccountSummary(userId: string): Promise<AccountSummary> {
    const [accounts, userResult] = await Promise.all([
      this.findByUserId(userId, { includeArchived: false }),
      pool.query<{ unspecified_balance: string }>(
        'SELECT unspecified_balance FROM users WHERE id = $1',
        [userId],
      ),
    ]);

    const rawUnspecified = userResult.rows[0]?.unspecified_balance;
    const unspecifiedBalance = rawUnspecified !== undefined && rawUnspecified !== null
      ? parseFloat(rawUnspecified) || 0
      : 0;

    const summary: AccountSummary = {
      unspecifiedBalance: Math.round(unspecifiedBalance * 100) / 100,
      totalAccountLiquidBalance: 0,
      totalLiquidBalance: 0,
      totalCreditDebt: 0,
      netWorth: 0,
      totalAccounts: accounts.length,
      byType: {
        bank: { count: 0, totalBalance: 0 },
        credit_card: { count: 0, totalBalance: 0 },
        cash: { count: 0, totalBalance: 0 },
        upi_wallet: { count: 0, totalBalance: 0 },
        investment: { count: 0, totalBalance: 0 },
        other: { count: 0, totalBalance: 0 },
      },
    };

    for (const acc of accounts) {
      if (summary.byType[acc.type]) {
        summary.byType[acc.type].count += 1;
        summary.byType[acc.type].totalBalance += acc.balance;
      }

      if (acc.type === 'credit_card') {
        summary.totalCreditDebt += acc.balance;
      } else {
        summary.totalAccountLiquidBalance += acc.balance;
      }
    }

    summary.totalLiquidBalance = summary.totalAccountLiquidBalance + summary.unspecifiedBalance;
    summary.netWorth = summary.totalLiquidBalance - summary.totalCreditDebt;

    // Round values to 2 decimals
    summary.totalAccountLiquidBalance = Math.round(summary.totalAccountLiquidBalance * 100) / 100;
    summary.totalLiquidBalance = Math.round(summary.totalLiquidBalance * 100) / 100;
    summary.totalCreditDebt = Math.round(summary.totalCreditDebt * 100) / 100;
    summary.netWorth = Math.round(summary.netWorth * 100) / 100;

    return summary;
  }

  async getUnspecifiedBalance(userId: string): Promise<number> {
    const result = await pool.query<{ unspecified_balance: string }>(
      'SELECT unspecified_balance FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.unspecified_balance
      ? parseFloat(result.rows[0].unspecified_balance) || 0
      : 0;
  }

  async setUnspecifiedBalance(userId: string, balance: number): Promise<number> {
    const result = await pool.query<{ unspecified_balance: string }>(
      'UPDATE users SET unspecified_balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING unspecified_balance',
      [balance, userId],
    );
    return result.rows[0]?.unspecified_balance
      ? parseFloat(result.rows[0].unspecified_balance) || 0
      : 0;
  }
}

export const accountRepository = new AccountRepository();
