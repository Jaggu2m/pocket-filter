import type { NextFunction, Request, Response } from 'express';
import { aiExplanationService } from '../services/ai-explanation.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class AIController {
  async explainBudgetPace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await aiExplanationService.explainBudgetPace(
        req.user.userId,
        req.query.month as string | undefined,
        req.query.currency as string | undefined,
      );
      sendSuccess(res, result, 'Budget pace explanation retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async explainForecast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await aiExplanationService.explainForecast(
        req.user.userId,
        req.query.month as string | undefined,
        req.query.currency as string | undefined,
      );
      sendSuccess(res, result, 'Forecast explanation retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async explainAnomalies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await aiExplanationService.explainAnomalies(
        req.user.userId,
        req.query.month as string | undefined,
      );
      sendSuccess(res, result, 'Anomaly explanation retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const aiController = new AIController();