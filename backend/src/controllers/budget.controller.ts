import type { NextFunction, Request, Response } from 'express';
import { budgetService } from '../services/budget.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class BudgetController {
  async createBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const budget = await budgetService.createBudget({
        userId: req.user.userId,
        month: req.body.month,
        overallLimit: req.body.overallLimit,
        currency: req.body.currency,
        categoryLimits: req.body.categoryLimits,
      });
      sendSuccess(res, { budget }, 'Budget created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  async getCurrentBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const budget = await budgetService.getCurrentBudget(
        req.user.userId,
        req.query.month as string | undefined,
        req.query.currency as string | undefined,
      );
      sendSuccess(res, { budget, month: req.query.month || new Date().toISOString().slice(0, 7) }, 'Current budget retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async listBudgets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const budgets = await budgetService.listBudgets(req.user.userId);
      sendSuccess(res, { budgets }, 'Budgets retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getBudgetById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const budget = await budgetService.getBudgetById(id, req.user.userId);
      sendSuccess(res, { budget }, 'Budget retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const budget = await budgetService.updateBudget(id, req.user.userId, {
        overallLimit: req.body.overallLimit,
        currency: req.body.currency,
      });
      sendSuccess(res, { budget }, 'Budget updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async upsertCategoryLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const categoryId = Array.isArray(req.params.categoryId) ? req.params.categoryId[0] : req.params.categoryId;
      const result = await budgetService.upsertCategoryLimit(id, req.user.userId, categoryId, req.body.limitAmount);
      sendSuccess(res, { budget: result.budget, categoryLimit: result.categoryLimit }, 'Category budget limit updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteCategoryLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const categoryId = Array.isArray(req.params.categoryId) ? req.params.categoryId[0] : req.params.categoryId;
      const budget = await budgetService.deleteCategoryLimit(id, req.user.userId, categoryId);
      sendSuccess(res, { budget }, 'Category budget limit removed successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteBudget(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await budgetService.deleteBudget(id, req.user.userId);
      sendSuccess(res, null, 'Budget deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const summary = await budgetService.calculateSummary(id, req.user.userId);
      sendSuccess(res, { summary, comparison: summary }, 'Budget summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getComparison(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const comparison = await budgetService.calculateComparison(id, req.user.userId);
      sendSuccess(res, { comparison, summary: comparison }, 'Budget comparison retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const budgetController = new BudgetController();