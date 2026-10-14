import type { NextFunction, Request, Response } from 'express';
import { forecastService } from '../services/forecast.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class ForecastController {
  async getMonthEndForecast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const forecast = await forecastService.getForecast(
        req.user.userId,
        req.query.month as string | undefined,
        req.query.currency as string | undefined,
      );
      sendSuccess(res, { forecast }, 'Month-end forecast retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const forecastController = new ForecastController();