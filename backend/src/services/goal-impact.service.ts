import { pool } from '../config/database.js';
import { goalRepository } from '../repositories/goal.repository.js';
import { goalImpactEngine, GoalFundingInput } from './goal-impact.engine.js';
import { NotFoundError, BadRequestError } from '../errors/app-error.js';

export class GoalImpactService {
  private monthBounds(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match) throw new BadRequestError('month must be in YYYY-MM format');
    const year = parseInt(match[1], 10);
    const mon = parseInt(match[2], 10);
    return {
      start: new Date(Date.UTC(year, mon - 1, 1, 0, 0, 0)),
      end: new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999)),
    };
  }

  async getMonthlySurplus(userId: string, month: string, expenseAdjustment = 0): Promise<number> {
    const bounds = this.monthBounds(month);
    const result = await pool.query<{ income: string; expense: string }>(
      `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0)::text AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0)::text AS expense
       FROM transactions
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [userId, bounds.start, bounds.end],
    );
    const income = parseFloat(result.rows[0]?.income || '0') || 0;
    const expense = (parseFloat(result.rows[0]?.expense || '0') || 0) + expenseAdjustment;
    return income - expense;
  }

  private asOfDate(month: string): Date {
    const bounds = this.monthBounds(month);
    const now = new Date();
    if (now < bounds.start) return bounds.start;
    if (now > bounds.end) return bounds.end;
    return now;
  }

  async getActiveGoalInputs(userId: string): Promise<GoalFundingInput[]> {
    const goals = await goalRepository.listGoals(userId, 'active');
    const inputs: GoalFundingInput[] = [];
    for (const goal of goals) {
      if (!goal.targetDate || goal.targetAmount <= 0) continue;
      const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
      if (remaining <= 0) continue;
      inputs.push({
        goalId: goal.id,
        goalName: goal.name,
        priority: goal.priority,
        targetDate: goal.targetDate,
        savedAmount: goal.savedAmount,
        targetAmount: goal.targetAmount,
        remainingAmount: remaining,
      });
    }
    return inputs;
  }

  async calculateImpactsWithSurplus(userId: string, beforeSurplus: number, afterSurplus: number, month?: string) {
    const resolvedMonth = month || new Date().toISOString().slice(0, 7);
    const goals = await this.getActiveGoalInputs(userId);
    const asOfDate = this.asOfDate(resolvedMonth);
    return goalImpactEngine.calculateImpacts({
      goals,
      beforeSurplus,
      afterSurplus,
      asOfDate,
    });
  }

  async calculateImpacts(userId: string, expenseAmount: number, month?: string) {
    // Hypothetical impact: what if this additional expense occurred?
    const resolvedMonth = month || new Date().toISOString().slice(0, 7);
    const beforeSurplus = await this.getMonthlySurplus(userId, resolvedMonth, 0);
    const afterSurplus = await this.getMonthlySurplus(userId, resolvedMonth, expenseAmount);
    return this.calculateImpactsWithSurplus(userId, beforeSurplus, afterSurplus, resolvedMonth);
  }

  async calculateHypotheticalImpacts(userId: string, expenseAmount: number, month?: string) {
    return this.calculateImpacts(userId, expenseAmount, month);
  }

  async calculateImpactsForTransaction(userId: string, amount: number, transactionDate: string | Date) {
    // Actual transaction impact: compare state without the transaction to state with it.
    const resolvedMonth = (transactionDate instanceof Date ? transactionDate : new Date(transactionDate)).toISOString().slice(0, 7);
    const afterSurplus = await this.getMonthlySurplus(userId, resolvedMonth, 0);
    const beforeSurplus = await this.getMonthlySurplus(userId, resolvedMonth, -amount);
    return this.calculateImpactsWithSurplus(userId, beforeSurplus, afterSurplus, resolvedMonth);
  }
}

export const goalImpactService = new GoalImpactService();