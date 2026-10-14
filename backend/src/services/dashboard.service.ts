import { pool } from '../config/database.js';
import { dashboardRepository, type DashboardTotals } from '../repositories/dashboard.repository.js';
import { NotFoundError, BadRequestError } from '../errors/app-error.js';

export interface DashboardQueryOptions {
  month?: string;
  startDate?: string;
  endDate?: string;
}

interface Period {
  month: string;
  startDate: Date;
  endDate: Date;
  daysInMonth: number;
  elapsedDays: number;
}

export class DashboardService {
  private async getUserCurrency(userId: string): Promise<string> {
    const result = await pool.query<{ base_currency: string }>(
      'SELECT base_currency FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.base_currency || 'INR';
  }

  private parsePeriod(options: DashboardQueryOptions): Period {
    let startDate: Date;
    let endDate: Date;
    let month: string;

    if (options.startDate && options.endDate) {
      startDate = new Date(options.startDate);
      endDate = new Date(options.endDate);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new BadRequestError('Invalid startDate or endDate');
      }
      if (startDate > endDate) {
        throw new BadRequestError('startDate must be before endDate');
      }
      month = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`;
    } else {
      month = options.month || new Date().toISOString().slice(0, 7);
      const match = /^(\d{4})-(\d{2})$/.exec(month);
      if (!match) {
        throw new BadRequestError('month must be in YYYY-MM format');
      }
      const year = parseInt(match[1], 10);
      const mon = parseInt(match[2], 10);
      if (mon < 1 || mon > 12) {
        throw new BadRequestError('Invalid month value');
      }
      startDate = new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0));
      endDate = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
    }

    const daysInMonth =
      Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1) || 1;

    const now = new Date();
    let elapsedDays = daysInMonth;
    if (now >= startDate && now <= endDate) {
      elapsedDays = now.getUTCDate() - startDate.getUTCDate() + 1;
      if (elapsedDays < 1) elapsedDays = 1;
      if (elapsedDays > daysInMonth) elapsedDays = daysInMonth;
    } else if (now < startDate) {
      elapsedDays = 0;
    }

    return { month, startDate, endDate, daysInMonth, elapsedDays: elapsedDays || daysInMonth };
  }

  private computeTotals(totals: DashboardTotals, currency: string) {
    const income = totals.income || 0;
    const expense = totals.expense || 0;
    const netSavings = income - expense;
    const savingsRate = income > 0 ? (netSavings / income) * 100 : 0;
    return {
      currency,
      totalIncome: income,
      totalExpenses: expense,
      netSavings,
      savingsRate: Number(savingsRate.toFixed(2)),
      savingsRateRatio: Number((income > 0 ? netSavings / income : 0).toFixed(4)),
      transactionCount: totals.transactionCount,
    };
  }

  private monthBounds(month: Date): { start: Date; end: Date } {
    const y = month.getUTCFullYear();
    const m = month.getUTCMonth();
    const start = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    return { start, end };
  }

  async getDashboard(userId: string, options: DashboardQueryOptions = {}) {
    const currency = await this.getUserCurrency(userId);
    const period = this.parsePeriod(options);

    const prevStart = new Date(period.startDate);
    prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
    const prevEnd = new Date(period.startDate);
    prevEnd.setUTCDate(0);
    prevEnd.setUTCHours(23, 59, 59, 999);

    const [
      currentTotals,
      prevTotals,
      currentCategories,
      prevCategories,
      dailySpend,
      accountSpend,
      largestTransactions,
      monthlyHistory,
    ] = await Promise.all([
      dashboardRepository.getTotals(userId, period.startDate, period.endDate),
      dashboardRepository.getTotals(userId, prevStart, prevEnd),
      dashboardRepository.getCategoryBreakdown(userId, period.startDate, period.endDate),
      dashboardRepository.getCategoryBreakdown(userId, prevStart, prevEnd),
      dashboardRepository.getDailySpend(userId, period.startDate, period.endDate),
      dashboardRepository.getAccountSpend(userId, period.startDate, period.endDate),
      dashboardRepository.getLargestTransactions(userId, period.startDate, period.endDate, 5),
      dashboardRepository.getMonthlyHistory(userId, period.endDate, 12),
    ]);

    const summary = this.computeTotals(currentTotals, currency);
    const previousSummary = this.computeTotals(prevTotals, currency);

    const totalExpense = summary.totalExpenses || 0;
    const prevCategoryMap = new Map(prevCategories.map((c) => [c.category, c.amount]));

    const categoryBreakdown = currentCategories.map((c) => {
      const previousAmount = prevCategoryMap.get(c.category) || 0;
      const change = c.amount - previousAmount;
      const changePercent =
        previousAmount > 0 ? Number(((change / previousAmount) * 100).toFixed(2)) : null;
      return {
        category: c.category,
        amount: c.amount,
        transactionCount: c.transactionCount,
        percentage: totalExpense > 0 ? Number(((c.amount / totalExpense) * 100).toFixed(2)) : 0,
        previousAmount,
        change: Number(change.toFixed(2)),
        changePercent,
      };
    });

    // Variance across union of categories
    const allCategories = new Set([...currentCategories.map((c) => c.category), ...prevCategories.map((c) => c.category)]);
    const currentMap = new Map(currentCategories.map((c) => [c.category, c.amount]));
    const categoryVariance = [...allCategories].map((category) => {
      const currentAmount = currentMap.get(category) || 0;
      const previousAmount = prevCategoryMap.get(category) || 0;
      const change = currentAmount - previousAmount;
      const changePercent =
        previousAmount > 0 ? Number(((change / previousAmount) * 100).toFixed(2)) : null;
      return {
        category,
        current: currentAmount,
        previous: previousAmount,
        change: Number(change.toFixed(2)),
        changePercent,
      };
    });
    categoryVariance.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    const topCategories = categoryBreakdown.slice(0, 5);

    // Weekly aggregation from daily spend
    const weekMap = new Map<number, number>();
    const totalDays = period.daysInMonth;
    const weeksCount = Math.ceil(totalDays / 7);
    for (const d of dailySpend) {
      const week = Math.floor((d.day - 1) / 7) + 1;
      weekMap.set(week, (weekMap.get(week) || 0) + d.amount);
    }
    const spendingByWeek = Array.from({ length: weeksCount }, (_, i) => {
      const week = i + 1;
      const startDay = week * 7 - 6;
      const endDay = Math.min(week * 7, totalDays);
      return {
        week,
        label: `Week ${week}`,
        startDay,
        endDay,
        amount: Number((weekMap.get(week) || 0).toFixed(2)),
      };
    });

    const largestExpenses = largestTransactions.filter((t) => t.type === 'expense').slice(0, 5);

    const elapsedDays = period.elapsedDays > 0 ? period.elapsedDays : 1;
    const dailyBurnRate = period.elapsedDays > 0 ? (summary.totalExpenses / elapsedDays) : 0;

    // Historical burn rate over last 3 months (completed or selected)
    const last3 = monthlyHistory.slice(-3);
    const last3Expense = last3.reduce((a, b) => a + b.expense, 0);
    const historicalDailyBurnRate = last3.length > 0 ? last3Expense / (last3.length * 30) : 0;

    const accountBreakdown = accountSpend.map((a) => ({
      accountId: a.accountId,
      accountName: a.accountName,
      amount: a.amount,
      transactionCount: a.transactionCount,
      percentage: totalExpense > 0 ? Number(((a.amount / totalExpense) * 100).toFixed(2)) : 0,
    }));

    const dashboard = {
      period: {
        month: period.month,
        startDate: period.startDate.toISOString(),
        endDate: period.endDate.toISOString(),
        daysInMonth: period.daysInMonth,
        elapsedDays: period.elapsedDays,
      },
      currency,
      summary,
      monthlyIncome: summary.totalIncome,
      monthlyExpenses: summary.totalExpenses,
      monthlyNetSavings: summary.netSavings,
      savingsRatePercentage: summary.savingsRate,
      previousPeriod: {
        month: `${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, '0')}`,
        ...previousSummary,
      },
      monthOverMonth: {
        incomeChange: Number((summary.totalIncome - previousSummary.totalIncome).toFixed(2)),
        expenseChange: Number((summary.totalExpenses - previousSummary.totalExpenses).toFixed(2)),
        netSavingsChange: Number((summary.netSavings - previousSummary.netSavings).toFixed(2)),
        incomeChangePercent:
          previousSummary.totalIncome > 0
            ? Number((((summary.totalIncome - previousSummary.totalIncome) / previousSummary.totalIncome) * 100).toFixed(2))
            : null,
        expenseChangePercent:
          previousSummary.totalExpenses > 0
            ? Number((((summary.totalExpenses - previousSummary.totalExpenses) / previousSummary.totalExpenses) * 100).toFixed(2))
            : null,
        savingsRateChange: Number((summary.savingsRate - previousSummary.savingsRate).toFixed(2)),
      },
      savingsRate: summary.savingsRate,
      month: period.month,
      totalIncome: summary.totalIncome,
      totalExpenses: summary.totalExpenses,
      netSavings: summary.netSavings,
      categoryBreakdown,
      spendingByCategory: categoryBreakdown,
      accountBreakdown,
      spendingByAccount: accountBreakdown,
      spendingByDay: dailySpend,
      spendingByWeek,
      spendingByMonth: monthlyHistory,
      monthlyHistory,
      largestTransactions,
      largestExpenses,
      topCategories,
      topSpendingCategories: topCategories,
      categoryVariance,
      dailyBurnRate: Number(dailyBurnRate.toFixed(2)),
      historicalBurnRate: Number(historicalDailyBurnRate.toFixed(2)),
      historicalDailyBurnRate: Number(historicalDailyBurnRate.toFixed(2)),
      burnRate: Number(dailyBurnRate.toFixed(2)),
    };

    // Provide both nested and flattened access for compatibility
    return {
      ...dashboard,
      dashboard,
      summary,
      analytics: dashboard,
      overview: dashboard,
    };
  }
}

export const dashboardService = new DashboardService();