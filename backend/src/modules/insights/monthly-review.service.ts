import { dashboardService } from '../../services/dashboard.service.js';
import { budgetService } from '../../services/budget.service.js';
import { goalService } from '../../services/goal.service.js';
import { goalHealthService } from '../../services/goal-health.service.js';
import { causalDiagnosticService } from './causal-diagnostic.service.js';

export interface MonthlyReviewResult {
  month: string;
  monthName: string;
  metrics: {
    income: number;
    expenses: number;
    netSavings: number;
    savingsRate: number;
  };
  whatWentWell: string[];
  whatChanged: string[];
  majorDrivers: string[];
  goalHealth: {
    name: string;
    targetAmount: number;
    savedAmount: number;
    status: 'GREEN' | 'YELLOW' | 'RED' | 'COMPLETED';
  }[];
  suggestedFocus: string;
  aiNarrative: string;
}

export class MonthlyReviewService {
  private getApiKey(): string | null {
    return process.env.GROQ_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || null;
  }

  private get model(): string {
    return process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
  }

  async generateReview(userId: string, targetMonth?: string): Promise<MonthlyReviewResult> {
    const month = targetMonth || new Date().toISOString().slice(0, 7);
    const dateObj = new Date(`${month}-01T00:00:00Z`);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // Fetch dashboard, budget, goals, and causal diagnostics
    const [dashboard, budget, goals, diagnostics] = await Promise.all([
      dashboardService.getDashboard(userId, { month }),
      budgetService.getCurrentBudget(userId, month).catch(() => null),
      goalService.listGoals(userId).catch(() => []),
      causalDiagnosticService.runDiagnostic(userId, month),
    ]);

    const income = Number(dashboard.totalIncome || 0);
    const expenses = Number(dashboard.totalExpenses || 0);
    const netSavings = Number(dashboard.netSavings || 0);
    const savingsRate = Number(dashboard.savingsRate || 0);

    // 1. Determine "What Went Well"
    const whatWentWell: string[] = [];
    if (budget && budget.overallLimit && expenses <= Number(budget.overallLimit)) {
      whatWentWell.push(`Stayed under overall budget limit of ₹${Number(budget.overallLimit).toLocaleString('en-IN')}`);
    }
    if (netSavings > 0) {
      whatWentWell.push(`Generated positive net savings of ₹${netSavings.toLocaleString('en-IN')}`);
    }
    if (savingsRate >= 20) {
      whatWentWell.push(`Achieved a healthy savings rate of ${savingsRate}%`);
    }
    for (const dec of diagnostics.macroTrends.decreasingCategories) {
      whatWentWell.push(`${dec.category} spending decreased by ${Math.abs(dec.changePercent)}%`);
    }
    if (whatWentWell.length === 0) {
      whatWentWell.push('Actively tracked transactions and maintained financial visibility');
    }

    // 2. Determine "What Changed"
    const whatChanged: string[] = [];
    for (const inc of diagnostics.macroTrends.increasingCategories) {
      whatChanged.push(`${inc.category} increased by ${inc.changePercent}%`);
    }
    if (whatChanged.length === 0) {
      whatChanged.push('Spending remained consistent with your previous monthly baseline');
    }

    // 3. Determine "Major Drivers"
    const majorDrivers: string[] = [];
    for (const dev of diagnostics.topDeviations) {
      if (dev.contributors.length > 0) {
        for (const c of dev.contributors.slice(0, 2)) {
          majorDrivers.push(`${c.merchant} (${dev.category}): ₹${c.current.toLocaleString('en-IN')}`);
        }
      } else {
        majorDrivers.push(`${dev.category}: ₹${dev.current.toLocaleString('en-IN')}`);
      }
    }
    if (majorDrivers.length === 0 && expenses > 0) {
      majorDrivers.push('Standard everyday expenses across tracked categories');
    }

    // 4. Determine "Goal Health"
    const goalHealthList: MonthlyReviewResult['goalHealth'] = [];
    for (const g of (goals as any[])) {
      const targetAmt = Number(g.targetAmount || 0);
      const savedAmt = Number(g.savedAmount || g.currentAmount || 0);
      const targetDate = g.targetDate ? new Date(g.targetDate) : new Date();

      const health = goalHealthService.calculate({
        goalId: g.id,
        targetAmount: targetAmt,
        savedAmount: savedAmt,
        createdAt: g.createdAt ? new Date(g.createdAt) : new Date(),
        targetDate,
        availableMonthlyCapacity: Math.max(0, netSavings),
      });

      goalHealthList.push({
        name: g.name,
        targetAmount: targetAmt,
        savedAmount: savedAmt,
        status: health.status,
      });
    }

    // 5. Suggested Focus
    let suggestedFocus = 'Continue monitoring recurring commitments and build liquidity.';
    if (diagnostics.topDeviations.length > 0) {
      const top = diagnostics.topDeviations[0];
      const targetCap = Math.round(top.baseline > 0 ? top.baseline * 1.05 : top.current * 0.85);
      suggestedFocus = `Target keeping ${top.category} spending below ₹${targetCap.toLocaleString('en-IN')} next month.`;
    }

    // 6. Generate AI Narrative
    const aiNarrative = await this.generateNarrative({
      monthName,
      income,
      expenses,
      netSavings,
      savingsRate,
      whatWentWell,
      whatChanged,
      suggestedFocus,
    });

    return {
      month,
      monthName,
      metrics: {
        income,
        expenses,
        netSavings,
        savingsRate,
      },
      whatWentWell,
      whatChanged,
      majorDrivers: majorDrivers.slice(0, 4),
      goalHealth: goalHealthList,
      suggestedFocus,
      aiNarrative,
    };
  }

  private async generateNarrative(data: {
    monthName: string;
    income: number;
    expenses: number;
    netSavings: number;
    savingsRate: number;
    whatWentWell: string[];
    whatChanged: string[];
    suggestedFocus: string;
  }): Promise<string> {
    const fallback = `In ${data.monthName}, you earned ₹${data.income.toLocaleString('en-IN')} and spent ₹${data.expenses.toLocaleString('en-IN')}, achieving a ${data.savingsRate}% savings rate. ${data.suggestedFocus}`;

    const apiKey = this.getApiKey();
    if (!apiKey) return fallback;

    try {
      const prompt = `You are an AI personal financial coach writing an end-of-month financial review.
Summarize the user's monthly performance in 3-4 inspiring, factual sentences based ONLY on these numbers:
Month: ${data.monthName}
Income: ₹${data.income.toLocaleString('en-IN')}
Expenses: ₹${data.expenses.toLocaleString('en-IN')}
Net Savings: ₹${data.netSavings.toLocaleString('en-IN')}
Savings Rate: ${data.savingsRate}%
Highlights: ${data.whatWentWell.join('; ')}
Shifts: ${data.whatChanged.join('; ')}
Recommended Focus: ${data.suggestedFocus}

Never invent numbers. Provide a balanced, encouraging, actionable executive summary.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are an inspiring, fact-enforced personal finance coach.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 300,
        }),
      });

      if (res.ok) {
        const json: any = await res.json();
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch {
      // Return deterministic fallback
    }

    return fallback;
  }
}

export const monthlyReviewService = new MonthlyReviewService();
