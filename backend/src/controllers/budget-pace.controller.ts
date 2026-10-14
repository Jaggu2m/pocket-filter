import type { NextFunction, Request, Response } from 'express';
import { budgetPaceService } from '../services/budget-pace.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class BudgetPaceController {
  async getPace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const pace = await budgetPaceService.getPace(
        req.user.userId,
        req.query.month as string | undefined,
        req.query.currency as string | undefined,
      );
      sendSuccess(res, pace, 'Budget pace retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const budgetPaceController = new BudgetPaceController();