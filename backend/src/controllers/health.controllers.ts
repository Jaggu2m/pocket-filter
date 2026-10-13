import type { Request, Response, NextFunction } from 'express';
import { getReadiness } from '../services/health.service.js';

export function getLiveness(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    message: 'Application is running',
    timestamp: new Date().toISOString(),
  });
}

export async function getReadinessStatus(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getReadiness();

    res.status(result.status === 'ok' ? 200 : 503).json(result);
  } catch (error) {
    next(error);
  }
}
