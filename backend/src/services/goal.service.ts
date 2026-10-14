import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { goalRepository } from '../repositories/goal.repository.js';
import { goalCalculationService } from './goal-calculation.service.js';
import { goalHealthService } from './goal-health.service.js';
import { waterfallAllocationStrategy } from './goal-waterfall.service.js';
import { NotFoundError, BadRequestError, ConflictError } from '../errors/app-error.js';

export class GoalService {
  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private validateDate(dateString: string): string {
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestError('targetDate must be a valid date');
    }
    return dateString;
  }

  async createGoal(userId: string, data: any) {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new BadRequestError('name is required');
    }
    if (typeof data.targetAmount !== 'number' || data.targetAmount < 0) {
      throw new BadRequestError('targetAmount must be a non-negative number');
    }
    const targetDate = this.validateDate(data.targetDate);

    if (data.priority !== undefined && (typeof data.priority !== 'number' || data.priority < 1)) {
      throw new BadRequestError('priority must be a positive integer');
    }
    if (data.goalType !== undefined && (typeof data.goalType !== 'string' || !data.goalType.trim())) {
      throw new BadRequestError('goalType must be a non-empty string');
    }

    let accountId: string | null = null;
    if (data.accountId) {
      const owned = await goalRepository.accountExistsAndOwned(data.accountId, userId);
      if (!owned) throw new BadRequestError('Invalid or unowned accountId');
      accountId = data.accountId;
    }

    const goal = await this.withTransaction(async (client) => {
      return goalRepository.createGoal(
        {
          userId,
          accountId,
          name: data.name.trim(),
          targetAmount: data.targetAmount,
          targetDate,
          priority: data.priority,
          goalType: data.goalType,
        },
        client,
      );
    });

    const savedAmount = await goalRepository.getSavedAmount(goal.id);
    goal.savedAmount = savedAmount;
    await this.syncStatus(goal.id, userId, goal.targetAmount, savedAmount);
    return goalRepository.findGoalById(goal.id, userId);
  }

  async getGoal(id: string, userId: string) {
    const goal = await goalRepository.findGoalById(id, userId);
    if (!goal) throw new NotFoundError('Goal not found');
    const savedAmount = goal.savedAmount;
    await this.syncStatus(goal.id, userId, goal.targetAmount, savedAmount);
    return goalRepository.findGoalById(id, userId);
  }

  async listGoals(userId: string, status?: string) {
    const goals = await goalRepository.listGoals(userId, status);
    for (const goal of goals) {
      await this.syncStatus(goal.id, userId, goal.targetAmount, goal.savedAmount);
    }
    if (status) {
      return goalRepository.listGoals(userId, status);
    }
    return goalRepository.listGoals(userId);
  }

  async updateGoal(id: string, userId: string, data: any) {
    const existing = await goalRepository.findGoalById(id, userId);
    if (!existing) throw new NotFoundError('Goal not found');

    const updates: any = {};
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !data.name.trim()) throw new BadRequestError('name must be a non-empty string');
      updates.name = data.name.trim();
    }
    if (data.targetAmount !== undefined) {
      if (typeof data.targetAmount !== 'number' || data.targetAmount < 0) throw new BadRequestError('targetAmount must be a non-negative number');
      updates.targetAmount = data.targetAmount;
    }
    if (data.targetDate !== undefined) {
      updates.targetDate = this.validateDate(data.targetDate);
    }
    if (data.status !== undefined) {
      if (!['active', 'completed', 'cancelled', 'archived'].includes(data.status)) throw new BadRequestError('Invalid status');
      updates.status = data.status;
    }
    if (data.accountId !== undefined) {
      if (data.accountId === null) {
        updates.accountId = null;
      } else {
        const owned = await goalRepository.accountExistsAndOwned(data.accountId, userId);
        if (!owned) throw new BadRequestError('Invalid or unowned accountId');
        updates.accountId = data.accountId;
      }
    }
    if (data.priority !== undefined) {
      if (typeof data.priority !== 'number' || data.priority < 1) throw new BadRequestError('priority must be a positive integer');
      updates.priority = data.priority;
    }
    if (data.goalType !== undefined) {
      if (typeof data.goalType !== 'string' || !data.goalType.trim()) throw new BadRequestError('goalType must be a non-empty string');
      updates.goalType = data.goalType.trim();
    }

    const updated = await this.withTransaction(async (client) => {
      return goalRepository.updateGoal(id, userId, updates, client);
    });
    if (!updated) throw new NotFoundError('Goal not found');

    const savedAmount = await goalRepository.getSavedAmount(id);
    await this.syncStatus(id, userId, updated.targetAmount, savedAmount);
    return goalRepository.findGoalById(id, userId);
  }

  async getGoalHealth(id: string, userId: string, month?: string) {
    const goal = await goalRepository.findGoalById(id, userId);
    if (!goal) throw new NotFoundError('Goal not found');
    const availableMonthlyCapacity = await goalHealthService.calculateAvailableMonthlyCapacity(userId, month);
    return goalHealthService.calculate({
      goalId: goal.id,
      targetAmount: goal.targetAmount,
      savedAmount: goal.savedAmount,
      createdAt: goal.createdAt,
      targetDate: goal.targetDate,
      availableMonthlyCapacity,
    });
  }

  async listGoalHealth(userId: string, month?: string) {
    const goals = await goalRepository.listGoals(userId);
    const availableMonthlyCapacity = await goalHealthService.calculateAvailableMonthlyCapacity(userId, month);
    const healthResults = [];
    for (const goal of goals) {
      if (goal.status === 'cancelled' || goal.status === 'archived') continue;
      healthResults.push(
        goalHealthService.calculate({
          goalId: goal.id,
          targetAmount: goal.targetAmount,
          savedAmount: goal.savedAmount,
          createdAt: goal.createdAt,
          targetDate: goal.targetDate,
          availableMonthlyCapacity,
        }),
      );
    }
    return healthResults;
  }

  async getFundingPlan(userId: string, availableSurplus?: number, month?: string) {
    const goals = await goalRepository.listGoals(userId, 'active');
    const available = availableSurplus !== undefined
      ? availableSurplus
      : await goalHealthService.calculateAvailableMonthlyCapacity(userId, month);

    const requirements = goals
      .filter((goal) => goal.targetAmount - goal.savedAmount > 0)
      .map((goal) => {
        const health = goalHealthService.calculate({
          goalId: goal.id,
          targetAmount: goal.targetAmount,
          savedAmount: goal.savedAmount,
          createdAt: goal.createdAt,
          targetDate: goal.targetDate,
          availableMonthlyCapacity: 0,
        });
        return {
          goal,
          requiredAmount: health.requiredMonthlySaving,
        };
      })
      .filter((item) => item.requiredAmount > 0)
      .map((item) => ({
        goalId: item.goal.id,
        goalName: item.goal.name,
        priority: item.goal.priority,
        requiredAmount: item.requiredAmount,
      }));

    const allocations = waterfallAllocationStrategy.allocate(available, requirements);

    const goalMap = new Map(goals.map((goal) => [goal.id, goal]));
    const enrichedAllocations = allocations.map((allocation) => {
      const goal = goalMap.get(allocation.goalId);
      const required = allocation.requiredAmount;
      const dedicatedHealth = goal
        ? goalHealthService.calculate({
            goalId: goal.id,
            targetAmount: goal.targetAmount,
            savedAmount: goal.savedAmount,
            createdAt: goal.createdAt,
            targetDate: goal.targetDate,
            availableMonthlyCapacity: allocation.allocatedAmount,
          })
        : null;
      return {
        ...allocation,
        targetAmount: goal?.targetAmount ?? 0,
        savedAmount: goal?.savedAmount ?? 0,
        remainingAmount: goal ? Math.max(0, goal.targetAmount - goal.savedAmount) : 0,
        health: dedicatedHealth,
      };
    });

    return {
      availableSurplus: Number(available.toFixed(2)),
      month: month || new Date().toISOString().slice(0, 7),
      allocations: enrichedAllocations,
      totalRequired: Number(requirements.reduce((sum, item) => sum + item.requiredAmount, 0).toFixed(2)),
      totalAllocated: Number(enrichedAllocations.reduce((sum, item) => sum + item.allocatedAmount, 0).toFixed(2)),
      totalShortfall: Number(enrichedAllocations.reduce((sum, item) => sum + item.shortfall, 0).toFixed(2)),
    };
  }

  async deleteGoal(id: string, userId: string) {
    const existing = await goalRepository.findGoalById(id, userId);
    if (!existing) throw new NotFoundError('Goal not found');
    const deleted = await this.withTransaction(async (client) => {
      return goalRepository.deleteGoal(id, userId, client);
    });
    if (!deleted) throw new NotFoundError('Goal not found');
  }

  async addContribution(goalId: string, userId: string, data: any) {
    const goal = await goalRepository.findGoalById(goalId, userId);
    if (!goal) throw new NotFoundError('Goal not found');
    if (goal.status === 'cancelled' || goal.status === 'archived') {
      throw new BadRequestError('Cannot contribute to a cancelled or archived goal');
    }

    if (typeof data.amount !== 'number' || data.amount <= 0) {
      throw new BadRequestError('amount must be a positive number');
    }

    let accountId: string | null = goal.accountId;
    if (data.accountId !== undefined) {
      if (data.accountId === null) {
        accountId = null;
      } else {
        const owned = await goalRepository.accountExistsAndOwned(data.accountId, userId);
        if (!owned) throw new BadRequestError('Invalid or unowned accountId');
        accountId = data.accountId;
      }
    }

    const contribution = await this.withTransaction(async (client) => {
      return goalRepository.createContribution(
        {
          goalId,
          userId,
          amount: data.amount,
          type: 'contribution',
          accountId,
          note: data.note || null,
        },
        client,
      );
    });

    const savedAmount = await goalRepository.getSavedAmount(goalId);
    await this.syncStatus(goalId, userId, goal.targetAmount, savedAmount);

    return contribution;
  }

  async reverseContribution(goalId: string, contributionId: string, userId: string, data: any = {}) {
    const goal = await goalRepository.findGoalById(goalId, userId);
    if (!goal) throw new NotFoundError('Goal not found');

    const original = await goalRepository.findContribution(contributionId, userId);
    if (!original || original.goalId !== goalId) throw new NotFoundError('Contribution not found');
    if (original.type !== 'contribution') throw new BadRequestError('Only original contributions can be reversed');
    if (original.isReversed) throw new ConflictError('Contribution has already been fully reversed');

    const reversedSoFar = await this.getReversedAmount(contributionId);
    const maxReversible = original.amount - reversedSoFar;
    if (maxReversible <= 0) throw new ConflictError('Contribution has already been fully reversed');

    let amount = (typeof data.amount === 'number' && data.amount > 0) ? data.amount : maxReversible;
    if (amount > maxReversible) {
      throw new BadRequestError(`Reversal amount exceeds remaining reversible amount of ${maxReversible}`);
    }

    const reversal = await this.withTransaction(async (client) => {
      return goalRepository.reverseContribution(
        contributionId,
        amount,
        userId,
        data.note || null,
        data.accountId || original.accountId || null,
        client,
      );
    });

    const savedAmount = await goalRepository.getSavedAmount(goalId);
    await this.syncStatus(goalId, userId, goal.targetAmount, savedAmount);

    return reversal;
  }

  private async getReversedAmount(contributionId: string): Promise<number> {
    // query sum of reversal amounts referencing this contribution
    const result = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM goal_contributions
       WHERE reversed_contribution_id = $1 AND type = 'reversal'`,
      [contributionId],
    );
    return parseFloat(result.rows[0]?.total || '0') || 0;
  }

  async listContributions(goalId: string, userId: string) {
    const goal = await goalRepository.findGoalById(goalId, userId);
    if (!goal) throw new NotFoundError('Goal not found');
    return goalRepository.listContributions(goalId, userId);
  }

  async getSavingPlan(goalId: string, userId: string, asOfDate?: string) {
    const goal = await goalRepository.findGoalById(goalId, userId);
    if (!goal) throw new NotFoundError('Goal not found');
    const asOf = asOfDate ? new Date(asOfDate) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new BadRequestError('Invalid asOfDate');
    const savedAmount = goal.savedAmount;
    return goalCalculationService.calculate(goal.id, goal.targetAmount, savedAmount, goal.targetDate, asOf);
  }

  private async syncStatus(goalId: string, userId: string, targetAmount: number, savedAmount: number) {
    const goal = await goalRepository.findGoalById(goalId, userId);
    if (!goal) return;
    if (goal.status === 'cancelled' || goal.status === 'archived') return;

    let newStatus = goal.status;
    if (savedAmount >= targetAmount && targetAmount >= 0) {
      newStatus = 'completed';
    } else if (goal.status === 'completed' && savedAmount < targetAmount) {
      newStatus = 'active';
    }
    if (newStatus !== goal.status) {
      await pool.query('UPDATE savings_goals SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newStatus, goalId]);
    }
  }
}

export const goalService = new GoalService();