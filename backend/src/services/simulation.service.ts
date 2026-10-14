import { pool } from '../config/database.js';
import { accountRepository } from '../repositories/account.repository.js';
import { budgetRepository } from '../repositories/budget.repository.js';
import { goalRepository } from '../repositories/goal.repository.js';
import { recurringPaymentService } from './recurring-payment.service.js';
import { forecastService } from './forecast.service.js';
import { goalImpactService } from './goal-impact.service.js';
import { BadRequestError } from '../errors/app-error.js';

export type ScenarioType = 'ONE_TIME_EXPENSE' | 'ONE_TIME_INCOME' | 'NEW_RECURRING_EXPENSE' | 'NEW_EMI';

export interface Scenario {
  type: ScenarioType;
  amount: number;
  category?: string | null;
  description?: string | null;
  date?: string | Date | null;
}

export interface FinancialSnapshot {
  month: string;
  currency: string;
  asOf: string;
  liquidBalance: number;
  liquidMoney: number;
  emergencyReserve: number;
  availableLiquidity: number;
  unallocatedLiquidity: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  currentSurplus: number;
  commitmentTotal: number;
  budget: {
    overallLimit: number;
    currentExpenses: number;
    utilization: number;
  } | null;
  goals: Array<{
    id: string;
    name: string;
    targetAmount: number;
    savedAmount: number;
    remainingAmount: number;
    priority: number;
    targetDate: string;
  }>;
  forecast: {
    projectedExpenses: number;
    projectedSavings: number;
    confidence: string;
  } | null;
}

export interface SimulationResult {
  scenario: Scenario;
  action: Scenario;
  before: FinancialSnapshot;
  after: FinancialSnapshot;
  liquidityImpact: number;
  emergencyReserveImpact: number;
  budgetImpact: {
    overallLimit: number | null;
    beforeExpenses: number;
    afterExpenses: number;
    beforeUtilization: number | null;
    afterUtilization: number | null;
    impactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  };
  commitmentImpact: {
    beforeCommitments: number;
    afterCommitments: number;
    monthlyIncrease: number;
    yearlyIncrease: number;
  };
  goalImpacts: any[];
  impacts: {
    budget: any;
    goals: any[];
    commitments: any;
    forecast: any;
  };
  forecastImpact: {
    beforeProjectedExpenses: number;
    afterProjectedExpenses: number;
    beforeProjectedSavings: number;
    afterProjectedSavings: number;
  };
  decision: {
    status: 'AFFORDABLE' | 'AFFORDABLE_WITH_IMPACT' | 'NOT_RECOMMENDED';
    reasons: Array<{
      type: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH';
      message: string;
    }>;
  };
}

export class SimulationService {
  private normalizeScenario(input: any): Scenario {
    const rawType = (input?.type || input?.scenarioType || input?.actionType || 'ONE_TIME_EXPENSE').toString().toUpperCase();
    const typeMap: Record<string, ScenarioType> = {
      EXPENSE: 'ONE_TIME_EXPENSE',
      INCOME: 'ONE_TIME_INCOME',
      RECURRING: 'NEW_RECURRING_EXPENSE',
      RECURRING_EXPENSE: 'NEW_RECURRING_EXPENSE',
      EMI: 'NEW_EMI',
    };
    const type = typeMap[rawType] || rawType;
    const validTypes: ScenarioType[] = ['ONE_TIME_EXPENSE', 'ONE_TIME_INCOME', 'NEW_RECURRING_EXPENSE', 'NEW_EMI'];
    if (!validTypes.includes(type as ScenarioType)) {
      throw new BadRequestError('type must be ONE_TIME_EXPENSE, ONE_TIME_INCOME, NEW_RECURRING_EXPENSE, or NEW_EMI');
    }
    const amount = Number(input?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestError('amount must be a non-negative number');
    }
    return {
      type: type as ScenarioType,
      amount,
      category: input?.category ?? null,
      description: input?.description ?? null,
      date: input?.date ?? null,
    };
  }

  private monthFromDate(date?: string | Date | null): string {
    if (date) {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
  }

  private asOfDate(month: string): Date {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) return new Date();
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    const bounds = { start: new Date(Date.UTC(year, mon - 1, 1)), end: new Date(Date.UTC(year, mon, 0)) };
    const now = new Date();
    if (now < bounds.start) return bounds.start;
    if (now > bounds.end) return bounds.end;
    return now;
  }

  private monthBounds(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestError('invalid month');
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    return {
      start: new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0)),
      end: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
    };
  }

  private round(value: number) {
    return Number((value || 0).toFixed(2));
  }

  async buildSnapshot(userId: string, month: string): Promise<FinancialSnapshot> {
    const bounds = this.monthBounds(month);
    const currency = 'INR';

    const accounts = await accountRepository.findByUserId(userId, { includeArchived: false });
    const liquidBalance = accounts.reduce((sum: number, account: any) => sum + (account.balance || 0), 0);

    const transactionTotals = await pool.query<{ type: string; total: string }>(
      `SELECT type, COALESCE(SUM(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND type IN ('income','expense') AND date >= $2 AND date <= $3
       GROUP BY type`,
      [userId, bounds.start, bounds.end],
    );
    let monthlyIncome = 0;
    let monthlyExpenses = 0;
    for (const row of transactionTotals.rows) {
      if (row.type === 'income') monthlyIncome = parseFloat(row.total) || 0;
      if (row.type === 'expense') monthlyExpenses = parseFloat(row.total) || 0;
    }

    const budget = await budgetRepository.findByUserMonth(userId, month, currency);
    let budgetSnapshot: FinancialSnapshot['budget'] = null;
    if (budget) {
      budgetSnapshot = {
        overallLimit: budget.overallLimit,
        currentExpenses: monthlyExpenses,
        utilization: budget.overallLimit > 0 ? this.round((monthlyExpenses / budget.overallLimit) * 100) : 0,
      };
    }

    const goals = await goalRepository.listGoals(userId, 'active');
    const goalSnapshots = goals
      .filter((goal) => goal.targetAmount > 0)
      .map((goal) => ({
        id: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        savedAmount: goal.savedAmount,
        remainingAmount: Math.max(0, goal.targetAmount - goal.savedAmount),
        priority: goal.priority,
        targetDate: goal.targetDate.toISOString().slice(0, 10),
      }));

    const recurringPayments = await recurringPaymentService.list(userId);
    const commitmentTotal = recurringPayments
      .filter((payment: any) => payment.status !== 'DISMISSED')
      .reduce((sum: number, payment: any) => sum + (payment.averageAmount || 0), 0);

    let forecastSnapshot: FinancialSnapshot['forecast'] = null;
    try {
      const forecast = await forecastService.getForecast(userId, month, currency);
      forecastSnapshot = {
        projectedExpenses: forecast.projectedExpenses,
        projectedSavings: forecast.projectedSavings,
        confidence: forecast.confidence,
      };
    } catch (_error) {
      forecastSnapshot = null;
    }

    return {
      month,
      currency,
      asOf: this.asOfDate(month).toISOString().slice(0, 10),
      liquidBalance: this.round(liquidBalance),
      liquidMoney: this.round(liquidBalance),
      emergencyReserve: 0,
      availableLiquidity: this.round(liquidBalance),
      unallocatedLiquidity: this.round(liquidBalance),
      monthlyIncome: this.round(monthlyIncome),
      monthlyExpenses: this.round(monthlyExpenses),
      currentSurplus: this.round(monthlyIncome - monthlyExpenses),
      commitmentTotal: this.round(commitmentTotal),
      budget: budgetSnapshot,
      goals: goalSnapshots,
      forecast: forecastSnapshot,
    };
  }

  private applyScenario(snapshot: FinancialSnapshot, scenario: Scenario): FinancialSnapshot {
    const after = { ...snapshot, goals: snapshot.goals.map((goal) => ({ ...goal })) };
    if (scenario.type === 'ONE_TIME_EXPENSE') {
      after.liquidBalance = this.round(after.liquidBalance - scenario.amount);
      after.liquidMoney = after.liquidBalance;
      after.monthlyExpenses = this.round(after.monthlyExpenses + scenario.amount);
    } else if (scenario.type === 'ONE_TIME_INCOME') {
      after.liquidBalance = this.round(after.liquidBalance + scenario.amount);
      after.liquidMoney = after.liquidBalance;
      after.monthlyIncome = this.round(after.monthlyIncome + scenario.amount);
    } else if (scenario.type === 'NEW_RECURRING_EXPENSE' || scenario.type === 'NEW_EMI') {
      after.monthlyExpenses = this.round(after.monthlyExpenses + scenario.amount);
      after.commitmentTotal = this.round(after.commitmentTotal + scenario.amount);
    }
    after.liquidMoney = after.liquidBalance;
    after.unallocatedLiquidity = after.availableLiquidity;

    after.currentSurplus = this.round(after.monthlyIncome - after.monthlyExpenses);
    after.availableLiquidity = this.round(after.liquidBalance - after.emergencyReserve);
    after.unallocatedLiquidity = after.availableLiquidity;
    after.liquidMoney = after.liquidBalance;
    if (after.budget) {
      after.budget = {
        ...after.budget,
        currentExpenses: after.monthlyExpenses,
        utilization: after.budget.overallLimit > 0 ? this.round((after.monthlyExpenses / after.budget.overallLimit) * 100) : 0,
      };
    }
    return after;
  }

  private classifyImpactLevel(value: number, thresholdLow: number, thresholdHigh: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (value >= thresholdHigh) return 'HIGH';
    if (value >= thresholdLow) return 'MEDIUM';
    return 'LOW';
  }

  async simulate(userId: string, rawScenario: any, explain = false) {
    const scenario = this.normalizeScenario(rawScenario);
    const month = this.monthFromDate(scenario.date);
    const before = await this.buildSnapshot(userId, month);
    const after = this.applyScenario(before, scenario);

    let goalImpacts: any[] = [];
    if (scenario.type === 'ONE_TIME_EXPENSE') {
      goalImpacts = await goalImpactService.calculateHypotheticalImpacts(userId, scenario.amount, month);
    } else if (scenario.type === 'NEW_RECURRING_EXPENSE' || scenario.type === 'NEW_EMI') {
      // Treat as a sustained monthly reduction in liquidity for a hypothetical recurring expense.
      goalImpacts = await goalImpactService.calculateHypotheticalImpacts(userId, scenario.amount, month);
    }
    // Income improvements do not need delay calculation, but they can still be represented as empty impact.

    const liquidityImpact = this.round(after.liquidBalance - before.liquidBalance);
    const emergencyReserveImpact = this.round(after.emergencyReserve - before.emergencyReserve);

    const beforeExpenses = before.monthlyExpenses;
    const afterExpenses = after.monthlyExpenses;
    let budgetImpactLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';
    if (before.budget) {
      const beforeUtilization = before.budget.utilization;
      const afterUtilization = after.budget?.utilization || 0;
      if (afterUtilization > 100) budgetImpactLevel = 'HIGH';
      else if (afterUtilization - beforeUtilization >= 15) budgetImpactLevel = 'MEDIUM';
      else if (afterExpenses > beforeExpenses) budgetImpactLevel = 'LOW';
    } else if (afterExpenses > beforeExpenses) {
      budgetImpactLevel = 'LOW';
    }

    const commitmentMonthlyIncrease = scenario.type === 'NEW_RECURRING_EXPENSE' || scenario.type === 'NEW_EMI' ? scenario.amount : 0;
    const commitmentImpact = {
      beforeCommitments: before.commitmentTotal,
      afterCommitments: after.commitmentTotal,
      monthlyIncrease: this.round(commitmentMonthlyIncrease),
      yearlyIncrease: this.round(commitmentMonthlyIncrease * 12),
    };

    const forecastImpact = {
      beforeProjectedExpenses: before.forecast?.projectedExpenses ?? before.monthlyExpenses,
      afterProjectedExpenses: (before.forecast?.projectedExpenses ?? before.monthlyExpenses) + (scenario.type === 'ONE_TIME_INCOME' ? -scenario.amount : scenario.amount),
      beforeProjectedSavings: before.forecast?.projectedSavings ?? before.currentSurplus,
      afterProjectedSavings: (before.forecast?.projectedSavings ?? before.currentSurplus) - (scenario.type === 'ONE_TIME_INCOME' ? -scenario.amount : scenario.amount),
    };

    const reasons: Array<{ type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }> = [];
    if (scenario.amount > before.availableLiquidity) {
      reasons.push({ type: 'LIQUIDITY', severity: 'HIGH', message: 'This scenario exceeds current available liquidity.' });
    } else if (scenario.amount > 0) {
      reasons.push({ type: 'LIQUIDITY', severity: 'LOW', message: 'The scenario remains within available liquidity.' });
    }
    if (budgetImpactLevel !== 'NONE') {
      reasons.push({ type: 'BUDGET', severity: budgetImpactLevel === 'HIGH' ? 'HIGH' : budgetImpactLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW', message: 'This scenario changes monthly budget pressure.' });
    }
    const highGoalImpact = goalImpacts.some((impact: any) => impact.impactLevel === 'HIGH');
    const mediumGoalImpact = goalImpacts.some((impact: any) => impact.impactLevel === 'MEDIUM');
    if (highGoalImpact || mediumGoalImpact) {
      const delayed = goalImpacts.filter((impact: any) => impact.isGoalDelayed).map((impact: any) => impact.goalName);
      reasons.push({
        type: 'GOAL',
        severity: highGoalImpact ? 'HIGH' : 'MEDIUM',
        message: delayed.length > 0
          ? `This may affect goals: ${delayed.join(', ')}.`
          : 'This scenario may reduce goal funding capacity.',
      });
    }
    if (commitmentMonthlyIncrease > 0) {
      reasons.push({ type: 'COMMITMENT', severity: 'MEDIUM', message: `This adds an estimated ${commitmentMonthlyIncrease} monthly commitment.` });
    }

    let status: 'AFFORDABLE' | 'AFFORDABLE_WITH_IMPACT' | 'NOT_RECOMMENDED' = 'AFFORDABLE';
    if (scenario.amount > before.availableLiquidity) {
      status = 'NOT_RECOMMENDED';
    } else if (budgetImpactLevel === 'HIGH' || highGoalImpact || mediumGoalImpact || commitmentMonthlyIncrease > 0) {
      status = 'AFFORDABLE_WITH_IMPACT';
    }

    const result: SimulationResult = {
      scenario,
      action: { ...scenario },
      before,
      after,
      liquidityImpact,
      emergencyReserveImpact,
      budgetImpact: {
        overallLimit: before.budget?.overallLimit ?? null,
        beforeExpenses: before.monthlyExpenses,
        afterExpenses: after.monthlyExpenses,
        beforeUtilization: before.budget?.utilization ?? null,
        afterUtilization: after.budget?.utilization ?? null,
        impactLevel: budgetImpactLevel,
      },
      commitmentImpact,
      goalImpacts,
      impacts: {
        budget: {
          overallLimit: before.budget?.overallLimit ?? null,
          beforeExpenses: before.monthlyExpenses,
          afterExpenses: after.monthlyExpenses,
          beforeUtilization: before.budget?.utilization ?? null,
          afterUtilization: after.budget?.utilization ?? null,
          impactLevel: budgetImpactLevel,
        },
        goals: goalImpacts,
        commitments: commitmentImpact,
        forecast: forecastImpact,
      },
      forecastImpact,
      decision: {
        status,
        reasons,
      },
    };

    return result;
  }
}

export const simulationService = new SimulationService();