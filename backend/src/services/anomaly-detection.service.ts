import { pool } from '../config/database.js';

export interface Anomaly {
  id: string;
  userId: string;
  month: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  description: string;
  currentValue: number;
  expectedValue: number | null;
  deviationPercentage: number | null;
  transactionIds: string[];
  metadata?: Record<string, any>;
  detectedAt: string;
}

export interface AnomalyDetector {
  name: string;
  detect(context: AnomalyContext): Anomaly[];
}

export interface AnomalyContext {
  userId: string;
  month: string;
  asOf: Date;
  transactions: any[];
  historicalTransactions: any[];
  categoryHistoricalAverages: Record<string, number>;
  historicalAverageTransactionAmount: number;
  historicalMerchantMonthlyFrequency: Record<string, number>;
}

export class LargeTransactionDetector implements AnomalyDetector {
  name = 'LargeTransactionDetector';
  detect(context: AnomalyContext): Anomaly[] {
    const threshold = Math.max(5000, context.historicalAverageTransactionAmount * 3 || 5000);
    const anomalies: Anomaly[] = [];
    for (const tx of context.transactions) {
      if (tx.type !== 'expense') continue;
      const amount = parseFloat(tx.amount) || 0;
      if (amount >= threshold) {
        anomalies.push({
          id: `large-${tx.id}`,
          userId: context.userId,
          month: context.month,
          type: 'LARGE_TRANSACTION',
          severity: amount >= threshold * 2 ? 'HIGH' : 'MEDIUM',
          title: 'Large expense detected',
          description: `A transaction of ${amount} from ${tx.merchant || tx.category} is much larger than your usual spending.`,
          currentValue: amount,
          expectedValue: context.historicalAverageTransactionAmount,
          deviationPercentage: context.historicalAverageTransactionAmount > 0 ? Number(((amount / context.historicalAverageTransactionAmount - 1) * 100).toFixed(2)) : null,
          transactionIds: [tx.id],
          metadata: { merchant: tx.merchant, category: tx.category },
          detectedAt: new Date().toISOString(),
        });
      }
    }
    return anomalies;
  }
}

export class CategorySpikeDetector implements AnomalyDetector {
  name = 'CategorySpikeDetector';
  detect(context: AnomalyContext): Anomaly[] {
    const currentByCategory: Record<string, number> = {};
    for (const tx of context.transactions) {
      if (tx.type !== 'expense') continue;
      currentByCategory[tx.category] = (currentByCategory[tx.category] || 0) + (parseFloat(tx.amount) || 0);
    }

    const anomalies: Anomaly[] = [];
    for (const [category, currentAmount] of Object.entries(currentByCategory)) {
      const expected = context.categoryHistoricalAverages[category];
      if (!expected || expected <= 0) continue;
      const ratio = currentAmount / expected;
      if (ratio >= 1.5 && currentAmount - expected >= 1000) {
        anomalies.push({
          id: `category-spike-${category}`,
          userId: context.userId,
          month: context.month,
          type: 'CATEGORY_SPIKE',
          severity: ratio >= 2 ? 'HIGH' : 'MEDIUM',
          title: `${category} spending spike`,
          description: `${category} spending is ${Number(((ratio - 1) * 100).toFixed(0))}% above your usual level.`,
          currentValue: Number(currentAmount.toFixed(2)),
          expectedValue: Number(expected.toFixed(2)),
          deviationPercentage: Number(((ratio - 1) * 100).toFixed(2)),
          transactionIds: context.transactions.filter((tx) => tx.category === category).map((tx) => tx.id),
          metadata: { category },
          detectedAt: new Date().toISOString(),
        });
      }
    }
    return anomalies;
  }
}

export class DuplicateTransactionDetector implements AnomalyDetector {
  name = 'DuplicateTransactionDetector';
  detect(context: AnomalyContext): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < context.transactions.length; i++) {
      for (let j = i + 1; j < context.transactions.length; j++) {
        const a = context.transactions[i];
        const b = context.transactions[j];
        if (a.type !== 'expense' || b.type !== 'expense') continue;
        if (parseFloat(a.amount) !== parseFloat(b.amount)) continue;
        const aKey = (a.merchant || a.description || a.category || '').toLowerCase();
        const bKey = (b.merchant || b.description || b.category || '').toLowerCase();
        if (aKey !== bKey || aKey === '') continue;
        const timeDiff = Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / 60000;
        if (timeDiff <= 5) {
          const pairKey = [a.id, b.id].sort().join(':');
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);
          anomalies.push({
            id: `duplicate-${pairKey}`,
            userId: context.userId,
            month: context.month,
            type: 'POSSIBLE_DUPLICATE',
            severity: 'MEDIUM',
            title: 'Possible duplicate transaction',
            description: `Two similar ${a.amount} payments to ${a.merchant || a.category} occurred close together.`,
            currentValue: parseFloat(a.amount) || 0,
            expectedValue: parseFloat(a.amount) || 0,
            deviationPercentage: 0,
            transactionIds: [a.id, b.id],
            metadata: { merchant: a.merchant, timeDifferenceMinutes: Number(timeDiff.toFixed(2)) },
            detectedAt: new Date().toISOString(),
          });
        }
      }
    }
    return anomalies;
  }
}

export class MerchantPriceChangeDetector implements AnomalyDetector {
  name = 'MerchantPriceChangeDetector';
  detect(context: AnomalyContext): Anomaly[] {
    const historicalByMerchant: Record<string, number[]> = {};
    for (const tx of context.historicalTransactions) {
      if (tx.type !== 'expense') continue;
      const key = (tx.merchant || tx.description || tx.category || '').toLowerCase().trim();
      if (!key) continue;
      if (!historicalByMerchant[key]) historicalByMerchant[key] = [];
      historicalByMerchant[key].push(parseFloat(tx.amount) || 0);
    }

    const anomalies: Anomaly[] = [];
    for (const tx of context.transactions) {
      if (tx.type !== 'expense') continue;
      const key = (tx.merchant || tx.description || tx.category || '').toLowerCase().trim();
      if (!key || !historicalByMerchant[key] || historicalByMerchant[key].length < 2) continue;
      const amounts = historicalByMerchant[key];
      const average = amounts.reduce((s, v) => s + v, 0) / amounts.length;
      const current = parseFloat(tx.amount) || 0;
      if (average <= 0) continue;
      const change = (current - average) / average;
      if (Math.abs(change) >= 0.2 && Math.abs(current - average) >= 100) {
        anomalies.push({
          id: `price-${tx.id}`,
          userId: context.userId,
          month: context.month,
          type: 'MERCHANT_PRICE_CHANGE',
          severity: Math.abs(change) >= 0.5 ? 'HIGH' : 'MEDIUM',
          title: 'Possible merchant price change',
          description: `Payment to ${tx.merchant || tx.category} changed by ${Number((change * 100).toFixed(0))}% versus its usual amount.`,
          currentValue: current,
          expectedValue: Number(average.toFixed(2)),
          deviationPercentage: Number((change * 100).toFixed(2)),
          transactionIds: [tx.id],
          metadata: { merchant: tx.merchant },
          detectedAt: new Date().toISOString(),
        });
      }
    }
    return anomalies;
  }
}

export class UnusualFrequencyDetector implements AnomalyDetector {
  name = 'UnusualFrequencyDetector';
  detect(context: AnomalyContext): Anomaly[] {
    const currentCounts: Record<string, number> = {};
    for (const tx of context.transactions) {
      if (tx.type !== 'expense') continue;
      const key = (tx.merchant || tx.description || tx.category || '').toLowerCase().trim();
      if (!key) continue;
      currentCounts[key] = (currentCounts[key] || 0) + 1;
    }

    const anomalies: Anomaly[] = [];
    for (const [merchantKey, count] of Object.entries(currentCounts)) {
      if (count < 3) continue;
      const historicalMonthlyAvg = context.historicalMerchantMonthlyFrequency[merchantKey] || 0;
      if (historicalMonthlyAvg > 0 && count > historicalMonthlyAvg * 2 + 1) {
        anomalies.push({
          id: `frequency-${merchantKey}`,
          userId: context.userId,
          month: context.month,
          type: 'UNUSUAL_FREQUENCY',
          severity: 'MEDIUM',
          title: 'Unusual payment frequency',
          description: `You paid ${merchantKey} ${count} times this month, more often than usual.`,
          currentValue: count,
          expectedValue: historicalMonthlyAvg,
          deviationPercentage: historicalMonthlyAvg > 0 ? Number(((count / historicalMonthlyAvg - 1) * 100).toFixed(2)) : null,
          transactionIds: context.transactions.filter((tx) => (tx.merchant || tx.description || tx.category || '').toLowerCase().trim() === merchantKey).map((tx) => tx.id),
          metadata: { merchant: merchantKey },
          detectedAt: new Date().toISOString(),
        });
      } else if (historicalMonthlyAvg === 0 && count >= 3) {
        anomalies.push({
          id: `frequency-${merchantKey}`,
          userId: context.userId,
          month: context.month,
          type: 'UNUSUAL_FREQUENCY',
          severity: 'LOW',
          title: 'New recurring-like payment frequency',
          description: `You paid ${merchantKey} ${count} times this month, which may indicate a new recurring payment.`,
          currentValue: count,
          expectedValue: 0,
          deviationPercentage: null,
          transactionIds: context.transactions.filter((tx) => (tx.merchant || tx.description || tx.category || '').toLowerCase().trim() === merchantKey).map((tx) => tx.id),
          metadata: { merchant: merchantKey },
          detectedAt: new Date().toISOString(),
        });
      }
    }
    return anomalies;
  }
}

export class AnomalyDetectionService {
  constructor(private readonly detectors: AnomalyDetector[]) {}

  detect(context: AnomalyContext): Anomaly[] {
    return this.detectors.flatMap((detector) => detector.detect(context));
  }
}

function normalizeMerchantValue(tx: any): string {
  return (tx.merchant || tx.description || tx.category || '').toLowerCase().trim();
}

export class AnomalyService {
  private detectors = [
    new LargeTransactionDetector(),
    new CategorySpikeDetector(),
    new DuplicateTransactionDetector(),
    new MerchantPriceChangeDetector(),
    new UnusualFrequencyDetector(),
  ];

  private monthBounds(month: string): { start: Date; end: Date } {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new Error('invalid month');
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    return {
      start: new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0)),
      end: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
    };
  }

  async detect(userId: string, month?: string) {
    const resolvedMonth = month || new Date().toISOString().slice(0, 7);
    const bounds = this.monthBounds(resolvedMonth);

    const contextTransactions = await this.fetchTransactions(userId, bounds.start, bounds.end);

    const historyStart = new Date(bounds.start);
    historyStart.setUTCMonth(historyStart.getUTCMonth() - 3);
    const historicalTransactions = await this.fetchTransactions(userId, historyStart, new Date(bounds.start.getTime() - 1));

    // Category averages over historical period
    const categoryTotals: Record<string, number> = {};
    const categoryMonths: Record<string, Set<string>> = {};
    for (const tx of historicalTransactions) {
      if (tx.type !== 'expense') continue;
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + (parseFloat(tx.amount) || 0);
      if (!categoryMonths[tx.category]) categoryMonths[tx.category] = new Set();
      categoryMonths[tx.category].add(String(tx.date).slice(0, 7));
    }
    const categoryHistoricalAverages: Record<string, number> = {};
    for (const [category, total] of Object.entries(categoryTotals)) {
      const months = categoryMonths[category]?.size || 1;
      categoryHistoricalAverages[category] = total / months;
    }

    // Historical average transaction amount
    const historicalExpenseAmounts = historicalTransactions.filter((tx: any) => tx.type === 'expense').map((tx: any) => parseFloat(tx.amount) || 0);
    const historicalAverageTransactionAmount = historicalExpenseAmounts.length
      ? historicalExpenseAmounts.reduce((a, b) => a + b, 0) / historicalExpenseAmounts.length
      : 0;

    // Historical merchant monthly frequency
    const merchantMonthSets: Record<string, Set<string>> = {};
    for (const tx of historicalTransactions) {
      if (tx.type !== 'expense') continue;
      const key = normalizeMerchantValue(tx);
      if (!merchantMonthSets[key]) merchantMonthSets[key] = new Set();
      merchantMonthSets[key].add(String(tx.date).slice(0, 7));
    }
    const historicalMerchantMonthlyFrequency: Record<string, number> = {};
    for (const [key, months] of Object.entries(merchantMonthSets)) {
      historicalMerchantMonthlyFrequency[key] = months.size > 0 ? (historicalTransactions.filter((tx: any) => normalizeMerchantValue(tx) === key).length / months.size) : 0;
    }

    const context: AnomalyContext = {
      userId,
      month: resolvedMonth,
      asOf: new Date(),
      transactions: contextTransactions,
      historicalTransactions,
      categoryHistoricalAverages,
      historicalAverageTransactionAmount,
      historicalMerchantMonthlyFrequency,
    };

    const orchestrator = new AnomalyDetectionService(this.detectors);
    const anomalies = orchestrator.detect(context);

    return {
      month: resolvedMonth,
      count: anomalies.length,
      anomalies,
    };
  }

  private async fetchTransactions(userId: string, start: Date, end: Date): Promise<any[]> {
    const result = await pool.query(
      `SELECT id, user_id, account_id, type, amount, currency, category, merchant, description, date, payment_rail
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [userId, start, end],
    );
    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      type: row.type,
      amount: row.amount,
      currency: row.currency,
      category: row.category,
      merchant: row.merchant,
      description: row.description,
      date: row.date,
      paymentRail: row.payment_rail,
    }));
  }
}

export const anomalyService = new AnomalyService();