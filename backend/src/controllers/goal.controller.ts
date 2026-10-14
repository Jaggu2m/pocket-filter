import type { NextFunction, Request, Response } from 'express';
import { goalService } from '../services/goal.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class GoalController {
  async createGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const goal = await goalService.createGoal(req.user.userId, req.body);
      sendSuccess(res, { goal }, 'Goal created successfully', 201);
    } catch (error) { next(error); }
  }

  async listGoals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const goals = await goalService.listGoals(req.user.userId, req.query.status as string | undefined);
      sendSuccess(res, { goals }, 'Goals retrieved successfully');
    } catch (error) { next(error); }
  }

  async getGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const goal = await goalService.getGoal(id, req.user.userId);
      sendSuccess(res, { goal }, 'Goal retrieved successfully');
    } catch (error) { next(error); }
  }

  async updateGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const goal = await goalService.updateGoal(id, req.user.userId, req.body);
      sendSuccess(res, { goal }, 'Goal updated successfully');
    } catch (error) { next(error); }
  }

  async deleteGoal(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await goalService.deleteGoal(id, req.user.userId);
      sendSuccess(res, null, 'Goal deleted successfully');
    } catch (error) { next(error); }
  }

  async addContribution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const contribution = await goalService.addContribution(id, req.user.userId, req.body);
      const goal = await goalService.getGoal(id, req.user.userId);
      sendSuccess(res, { contribution, goal }, 'Contribution added successfully', 201);
    } catch (error) { next(error); }
  }

  async reverseContribution(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const contributionId = Array.isArray(req.params.contributionId) ? req.params.contributionId[0] : req.params.contributionId;
      const reversal = await goalService.reverseContribution(id, contributionId, req.user.userId, req.body);
      const goal = await goalService.getGoal(id, req.user.userId);
      sendSuccess(res, { reversal, goal }, 'Contribution reversed successfully', 201);
    } catch (error) { next(error); }
  }

  async listContributions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const contributions = await goalService.listContributions(id, req.user.userId);
      sendSuccess(res, { contributions }, 'Contributions retrieved successfully');
    } catch (error) { next(error); }
  }

  async getSavingPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const plan = await goalService.getSavingPlan(id, req.user.userId, req.query.asOf as string | undefined);
      sendSuccess(res, { savingPlan: plan, saving_plan: plan, plan }, 'Saving plan retrieved successfully');
    } catch (error) { next(error); }
  }
}

export const goalController = new GoalController();