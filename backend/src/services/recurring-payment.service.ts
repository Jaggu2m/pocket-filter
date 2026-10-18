import { pool } from '../config/database.js';
import { recurringPaymentRepository } from '../repositories/recurring-payment.repository.js';
import { NotFoundError, BadRequestError } from '../errors/app-error.js';

function normalizeMerchant(value: string | null | undefined): string {
  const raw = (value || '').toLowerCase().trim();
  const cleaned = raw.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'unknown';
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function frequencyFromInterval(days: number): string | null {
  if (days >= 5 && days <= 9) return 'WEEKLY';
  if (days >= 13 && days <= 15) return 'BIWEEKLY';
  if (days >= 27 && days <= 35) return 'MONTHLY';
  if (days >= 85 && days <= 95) return 'QUARTERLY';
  if (days >= 355 && days <= 375) return 'YEARLY';
  return null;
}

interface TxRow {
  id: string;
  amount: string;
  merchant: string | null;
  description: string | null;
  category: string;
  date: Date;
  type: string;
}

export class RecurringPaymentService {
  async detect(userId: string, lookbackDays = 180): Promise<void> {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - lookbackDays);

    const result = await pool.query<TxRow>(
      `SELECT id, amount, merchant, description, category, date, type
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND date >= $2
       ORDER BY date ASC`,
      [userId, startDate],
    );

    const groups = new Map<string, TxRow[]>();
    for (const tx of result.rows) {
      const normalized = normalizeMerchant(tx.merchant || tx.description || tx.category);
      if (!groups.has(normalized)) groups.set(normalized, []);
      groups.get(normalized)!.push(tx);
    }

    for (const [normalized, txs] of groups.entries()) {
      if (txs.length < 3) continue;

      const sorted = txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const diff = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
        intervals.push(diff);
      }
      if (intervals.length === 0) continue;

      const avgInterval = mean(intervals);
      const intervalStd = stdDev(intervals);
      const intervalCv = avgInterval > 0 ? intervalStd / avgInterval : 1;
      const frequency = frequencyFromInterval(Math.round(avgInterval));
      if (!frequency) continue;

      const amounts = sorted.map((t) => parseFloat(t.amount) || 0);
      const avgAmount = mean(amounts);
      const amountStd = stdDev(amounts);
      const amountCv = avgAmount > 0 ? amountStd / avgAmount : 1;

      const intervalScore = Math.max(0, 1 - intervalCv / 0.25);
      const amountScore = Math.max(0, 1 - amountCv / 0.25);
      const confidence = 0.6 * intervalScore + 0.4 * amountScore;
      if (confidence < 0.5) continue;

      const lastDate = new Date(sorted[sorted.length - 1].date);
      const nextDate = new Date(lastDate);
      nextDate.setUTCDate(nextDate.getUTCDate() + Math.round(avgInterval));

      const merchantName = sorted[0].merchant || sorted[0].description || normalized;

      await recurringPaymentRepository.upsertRecurring({
        userId,
        merchantName,
        merchantNormalized: normalized,
        category: sorted[0].category,
        frequency,
        averageAmount: this.round(avgAmount),
        medianAmount: this.round(median(amounts)),
        lastPaymentDate: lastDate.toISOString().slice(0, 10),
        nextExpectedDate: nextDate.toISOString().slice(0, 10),
        confidenceScore: Number(confidence.toFixed(4)),
        transactionCount: sorted.length,
      });
    }
  }

  private round(value: number): number {
    return Number((value || 0).toFixed(2));
  }

  async list(userId: string, status?: string) {
    await this.detect(userId);
    return recurringPaymentRepository.listByUser(userId, status);
  }

  async getById(id: string, userId: string) {
    const record = await recurringPaymentRepository.findById(id, userId);
    if (!record) throw new NotFoundError('Recurring payment not found');
    return record;
  }

  async confirm(id: string, userId: string) {
    const updated = await recurringPaymentRepository.updateStatus(id, userId, 'CONFIRMED');
    if (!updated) throw new NotFoundError('Recurring payment not found');
    return updated;
  }

  async dismiss(id: string, userId: string) {
    const updated = await recurringPaymentRepository.updateStatus(id, userId, 'DISMISSED');
    if (!updated) throw new NotFoundError('Recurring payment not found');
    return updated;
  }

  async create(userId: string, input: {
    merchantName: string;
    category?: string | null;
    frequency?: string;
    amount: number;
    nextExpectedDate?: string | null;
  }) {
    return recurringPaymentRepository.createManual({
      userId,
      merchantName: input.merchantName,
      category: input.category,
      frequency: input.frequency,
      amount: input.amount,
      nextExpectedDate: input.nextExpectedDate,
    });
  }

  async delete(id: string, userId: string) {
    const deleted = await recurringPaymentRepository.delete(id, userId);
    if (!deleted) throw new NotFoundError('Recurring payment not found');
    return { success: true };
  }
}

export const recurringPaymentService = new RecurringPaymentService();