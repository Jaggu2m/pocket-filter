import { pool } from '../../config/database.js';
import { anomalyService } from '../../services/anomaly-detection.service.js';
import { dashboardService } from '../../services/dashboard.service.js';

export interface CategoryContributor {
  merchant: string;
  current: number;
  baseline: number;
  increase: number;
  isNew: boolean;
  transactionCount: number;
}

export interface CategoryDiagnostic {
  category: string;
  current: number;
  baseline: number;
  change: number;
  changePercent: number;
  contributors: CategoryContributor[];
}

export interface SpendingDiagnosticResult {
  month: string;
  currentTotalSpending: number;
  baselineTotalSpending: number;
  totalChange: number;
  totalChangePercent: number;
  topDeviations: CategoryDiagnostic[];
  macroTrends: {
    totalSpendingChangePercent: number;
    increasingCategories: { category: string; changePercent: number }[];
    decreasingCategories: { category: string; changePercent: number }[];
  };
  microAnomalies: {
    title: string;
    description: string;
    amount: number;
    merchant?: string;
  }[];
  explanation: string;
}

export class CausalDiagnosticService {
  private getApiKey(): string | null {
    return process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || null;
  }

  private get model(): string {
    return process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
  }

  /**
   * Deterministic pipeline that builds structured causal evidence of spending shifts.
   */
  async runDiagnostic(userId: string, targetMonth?: string): Promise<SpendingDiagnosticResult> {
    const month = targetMonth || new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = month.split('-');
    const curYear = parseInt(yearStr, 10);
    const curMonth = parseInt(monthStr, 10);

    // Current month bounds
    const curStart = new Date(Date.UTC(curYear, curMonth - 1, 1));
    const curEnd = new Date(Date.UTC(curYear, curMonth, 0, 23, 59, 59, 999));

    // 3-Month historical baseline bounds
    const baseStart = new Date(Date.UTC(curYear, curMonth - 4, 1));
    const baseEnd = new Date(Date.UTC(curYear, curMonth - 1, 0, 23, 59, 59, 999));

    // Fetch current and historical transactions
    const [curTxRows, baseTxRows, anomaliesResult, dashboardData] = await Promise.all([
      this.fetchExpenseTransactions(userId, curStart, curEnd),
      this.fetchExpenseTransactions(userId, baseStart, baseEnd),
      anomalyService.detect(userId, month).catch(() => ({ anomalies: [] })),
      dashboardService.getDashboard(userId, { month }).catch(() => null),
    ]);

    // 1. Calculate Current Month Totals & Category Breakdown
    let currentTotalSpending = 0;
    const currentByCategory: Record<string, number> = {};
    const currentByCatMerchant: Record<string, Record<string, { total: number; count: number }>> = {};

    for (const tx of curTxRows) {
      const amt = tx.amount;
      currentTotalSpending += amt;
      currentByCategory[tx.category] = (currentByCategory[tx.category] || 0) + amt;

      const m = tx.merchant || 'Other';
      if (!currentByCatMerchant[tx.category]) currentByCatMerchant[tx.category] = {};
      if (!currentByCatMerchant[tx.category][m]) currentByCatMerchant[tx.category][m] = { total: 0, count: 0 };
      currentByCatMerchant[tx.category][m].total += amt;
      currentByCatMerchant[tx.category][m].count += 1;
    }

    // 2. Calculate Baseline Averages (across 3 months, or 1 if new user)
    const baseMonthsCount = Math.max(1, (curMonth - 1) - (curMonth - 4) || 3);
    let baseTotalSpendingSum = 0;
    const baseByCategorySum: Record<string, number> = {};
    const baseByCatMerchantSum: Record<string, Record<string, number>> = {};

    for (const tx of baseTxRows) {
      const amt = tx.amount;
      baseTotalSpendingSum += amt;
      baseByCategorySum[tx.category] = (baseByCategorySum[tx.category] || 0) + amt;

      const m = tx.merchant || 'Other';
      if (!baseByCatMerchantSum[tx.category]) baseByCatMerchantSum[tx.category] = {};
      baseByCatMerchantSum[tx.category][m] = (baseByCatMerchantSum[tx.category][m] || 0) + amt;
    }

    const baselineTotalSpending = Math.round(baseTotalSpendingSum / baseMonthsCount);
    const baseByCategory: Record<string, number> = {};
    for (const cat in baseByCategorySum) {
      baseByCategory[cat] = Math.round(baseByCategorySum[cat] / baseMonthsCount);
    }

    const totalChange = currentTotalSpending - baselineTotalSpending;
    const totalChangePercent = baselineTotalSpending > 0
      ? Number(((totalChange / baselineTotalSpending) * 100).toFixed(1))
      : (currentTotalSpending > 0 ? 100 : 0);

    // 3. Find Categories with Largest Positive Deviations
    const allCategories = Array.from(new Set([...Object.keys(currentByCategory), ...Object.keys(baseByCategory)]));
    const deviations: CategoryDiagnostic[] = [];
    const increasingCategories: { category: string; changePercent: number }[] = [];
    const decreasingCategories: { category: string; changePercent: number }[] = [];

    for (const cat of allCategories) {
      const curAmt = currentByCategory[cat] || 0;
      const baseAmt = baseByCategory[cat] || 0;
      const diff = curAmt - baseAmt;
      const pct = baseAmt > 0 ? Number(((diff / baseAmt) * 100).toFixed(1)) : (curAmt > 0 ? 100 : 0);

      if (diff > 0) {
        increasingCategories.push({ category: cat, changePercent: pct });

        // Calculate merchant contributors for this category
        const contributors: CategoryContributor[] = [];
        const curMerchants = currentByCatMerchant[cat] || {};

        for (const [merchant, data] of Object.entries(curMerchants)) {
          const baseMerchantAvg = Math.round((baseByCatMerchantSum[cat]?.[merchant] || 0) / baseMonthsCount);
          const increase = data.total - baseMerchantAvg;
          if (increase > 0) {
            contributors.push({
              merchant,
              current: data.total,
              baseline: baseMerchantAvg,
              increase,
              isNew: baseMerchantAvg === 0,
              transactionCount: data.count,
            });
          }
        }

        contributors.sort((a, b) => b.increase - a.increase);

        deviations.push({
          category: cat,
          current: curAmt,
          baseline: baseAmt,
          change: diff,
          changePercent: pct,
          contributors: contributors.slice(0, 4),
        });
      } else if (diff < 0) {
        decreasingCategories.push({ category: cat, changePercent: pct });
      }
    }

    deviations.sort((a, b) => b.change - a.change);
    increasingCategories.sort((a, b) => b.changePercent - a.changePercent);
    decreasingCategories.sort((a, b) => a.changePercent - b.changePercent);

    // 4. Extract Micro Anomalies
    const microAnomalies = (anomaliesResult.anomalies || []).slice(0, 4).map((a: any) => ({
      title: a.title,
      description: a.description,
      amount: a.currentValue,
      merchant: a.metadata?.merchant,
    }));

    const topDeviations = deviations.slice(0, 3);

    // 5. Generate AI Explanation using Groq LLM (with deterministic template fallback)
    const explanation = await this.generateExplanation({
      month,
      currentTotalSpending,
      baselineTotalSpending,
      totalChange,
      totalChangePercent,
      topDeviations,
      microAnomalies,
    });

    return {
      month,
      currentTotalSpending,
      baselineTotalSpending,
      totalChange,
      totalChangePercent,
      topDeviations,
      macroTrends: {
        totalSpendingChangePercent: totalChangePercent,
        increasingCategories: increasingCategories.slice(0, 3),
        decreasingCategories: decreasingCategories.slice(0, 3),
      },
      microAnomalies,
      explanation,
    };
  }

  /**
   * Translates structured evidence into a clear causal narrative via Groq LLM.
   */
  private async generateExplanation(evidence: {
    month: string;
    currentTotalSpending: number;
    baselineTotalSpending: number;
    totalChange: number;
    totalChangePercent: number;
    topDeviations: CategoryDiagnostic[];
    microAnomalies: any[];
  }): Promise<string> {
    const topDev = evidence.topDeviations[0];
    const topContributors = topDev?.contributors.map(c => `${c.merchant} (+₹${c.increase.toLocaleString('en-IN')})`).join(', ');

    // Fallback template
    const fallback = topDev
      ? `Your spending is ${Math.abs(evidence.totalChangePercent)}% ${evidence.totalChange >= 0 ? 'higher' : 'lower'} this month, primarily because ${topDev.category} increased by ₹${topDev.change.toLocaleString('en-IN')} (${topDev.changePercent}%). ${topContributors ? `Key drivers include ${topContributors}.` : ''}`
      : `Your spending this month is ₹${evidence.currentTotalSpending.toLocaleString('en-IN')}, compared to your 3-month baseline of ₹${evidence.baselineTotalSpending.toLocaleString('en-IN')}.`;

    const apiKey = this.getApiKey();
    if (!apiKey) return fallback;

    try {
      const prompt = `You are an expert personal finance analyst.
Synthesize this EXACT financial calculation evidence into 2-3 concise, professional, human-readable sentences explaining what happened and the causes.
CRITICAL: Do NOT invent or alter any numbers. Only mention numbers present in the JSON evidence.

Evidence:
${JSON.stringify({
  totalChange: evidence.totalChange,
  totalChangePercent: evidence.totalChangePercent,
  currentTotal: evidence.currentTotalSpending,
  baselineTotal: evidence.baselineTotalSpending,
  topDeviations: evidence.topDeviations,
  microAnomalies: evidence.microAnomalies,
}, null, 2)}`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a precise financial intelligence explainer. Be concise, factual, and strictly truthful to the given numbers.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 250,
        }),
      });

      if (response.ok) {
        const json: any = await response.json();
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch {
      // Return deterministic fallback
    }

    return fallback;
  }

  private async fetchExpenseTransactions(userId: string, start: Date, end: Date) {
    const res = await pool.query(
      `SELECT id, amount, category, merchant, description, date
       FROM transactions
       WHERE user_id = $1 AND type = 'expense' AND date >= $2 AND date <= $3
       ORDER BY date ASC`,
      [userId, start, end],
    );
    return res.rows.map((r: any) => ({
      id: r.id,
      amount: parseFloat(r.amount) || 0,
      category: r.category || 'General',
      merchant: r.merchant || r.description || 'Unknown',
      date: r.date,
    }));
  }
}

export const causalDiagnosticService = new CausalDiagnosticService();
