import { pool } from '../config/database.js';

export interface RecurringPaymentRecord {
  id: string;
  userId: string;
  merchantName: string;
  merchantNormalized: string;
  category: string | null;
  frequency: string;
  averageAmount: number;
  medianAmount: number;
  lastPaymentDate: Date;
  nextExpectedDate: Date | null;
  confidenceScore: number;
  transactionCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Row {
  id: string;
  user_id: string;
  merchant_name: string;
  merchant_normalized: string;
  category: string | null;
  frequency: string;
  average_amount: string;
  median_amount: string;
  last_payment_date: Date | string;
  next_expected_date: Date | string | null;
  confidence_score: string;
  transaction_count: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: Row): RecurringPaymentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    merchantName: row.merchant_name,
    merchantNormalized: row.merchant_normalized,
    category: row.category,
    frequency: row.frequency,
    averageAmount: parseFloat(row.average_amount) || 0,
    medianAmount: parseFloat(row.median_amount) || 0,
    lastPaymentDate: new Date(row.last_payment_date),
    nextExpectedDate: row.next_expected_date ? new Date(row.next_expected_date) : null,
    confidenceScore: parseFloat(row.confidence_score) || 0,
    transactionCount: row.transaction_count || 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RecurringPaymentRepository {
  async listByUser(userId: string, status?: string): Promise<RecurringPaymentRecord[]> {
    const values: unknown[] = [userId];
    let condition = 'WHERE user_id = $1';
    if (status) {
      condition += ' AND status = $2';
      values.push(status);
    }
    const result = await pool.query<Row>(`SELECT * FROM recurring_payments ${condition} ORDER BY next_expected_date ASC NULLS LAST, confidence_score DESC`, values);
    return result.rows.map(mapRow);
  }

  async findById(id: string, userId: string): Promise<RecurringPaymentRecord | null> {
    const result = await pool.query<Row>('SELECT * FROM recurring_payments WHERE id = $1 AND user_id = $2 LIMIT 1', [id, userId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async upsertRecurring(input: {
    userId: string;
    merchantName: string;
    merchantNormalized: string;
    category?: string | null;
    frequency: string;
    averageAmount: number;
    medianAmount: number;
    lastPaymentDate: string;
    nextExpectedDate: string | null;
    confidenceScore: number;
    transactionCount: number;
  }): Promise<RecurringPaymentRecord> {
    const result = await pool.query<Row>(
      `INSERT INTO recurring_payments (
        user_id, merchant_name, merchant_normalized, category, frequency,
        average_amount, median_amount, last_payment_date, next_expected_date,
        confidence_score, transaction_count, status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,'DETECTED')
      ON CONFLICT (user_id, merchant_normalized, frequency)
      DO UPDATE SET
        merchant_name = EXCLUDED.merchant_name,
        category = EXCLUDED.category,
        average_amount = EXCLUDED.average_amount,
        median_amount = EXCLUDED.median_amount,
        last_payment_date = EXCLUDED.last_payment_date,
        next_expected_date = EXCLUDED.next_expected_date,
        confidence_score = EXCLUDED.confidence_score,
        transaction_count = EXCLUDED.transaction_count,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        input.userId,
        input.merchantName,
        input.merchantNormalized,
        input.category || null,
        input.frequency,
        input.averageAmount,
        input.medianAmount,
        input.lastPaymentDate,
        input.nextExpectedDate,
        input.confidenceScore,
        input.transactionCount,
      ],
    );
    return mapRow(result.rows[0]);
  }

  async updateStatus(id: string, userId: string, status: string): Promise<RecurringPaymentRecord | null> {
    const result = await pool.query<Row>(
      `UPDATE recurring_payments SET status = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, status],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async createManual(input: {
    userId: string;
    merchantName: string;
    category?: string | null;
    frequency?: string;
    amount: number;
    nextExpectedDate?: string | null;
  }): Promise<RecurringPaymentRecord> {
    const merchantNormalized = input.merchantName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const frequency = input.frequency || 'MONTHLY';
    const result = await pool.query<Row>(
      `INSERT INTO recurring_payments (
        user_id, merchant_name, merchant_normalized, category, frequency,
        average_amount, median_amount, last_payment_date, next_expected_date,
        confidence_score, transaction_count, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6, CURRENT_DATE, $7::date, 1.0, 1, 'CONFIRMED')
      ON CONFLICT (user_id, merchant_normalized, frequency)
      DO UPDATE SET
        merchant_name = EXCLUDED.merchant_name,
        category = EXCLUDED.category,
        average_amount = EXCLUDED.average_amount,
        median_amount = EXCLUDED.median_amount,
        next_expected_date = EXCLUDED.next_expected_date,
        status = 'CONFIRMED',
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        input.userId,
        input.merchantName.trim(),
        merchantNormalized,
        input.category || 'EMI',
        frequency,
        input.amount,
        input.nextExpectedDate || null,
      ],
    );
    return mapRow(result.rows[0]);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM recurring_payments WHERE id = $1 AND user_id = $2', [id, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const recurringPaymentRepository = new RecurringPaymentRepository();