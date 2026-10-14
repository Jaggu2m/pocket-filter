import type { NextFunction, Request, Response } from 'express';
import { anomalyService } from '../services/anomaly-detection.service.js';
import { sendSuccess } from '../utils/response.js';
import { UnauthorizedError } from '../errors/app-error.js';

export class AnomalyController {
  async getAnomalies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const result = await anomalyService.detect(req.user.userId, req.query.month as string | undefined);
      sendSuccess(res, result, 'Anomalies retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const anomalyController = new AnomalyController();