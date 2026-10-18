import type { Request, Response } from 'express';
import { insightService } from './insight.service.js';
import { BadRequestError } from '../../errors/app-error.js';

export class InsightController {
  async getDiagnostics(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const month = (req.query.month as string) || undefined;

    const data = await insightService.getSpendingDiagnostics(userId, month);
    return res.json({
      status: 'success',
      data,
    });
  }

  async getMonthlyReview(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const month = (req.query.month as string) || undefined;

    const data = await insightService.getMonthlyReview(userId, month);
    return res.json({
      status: 'success',
      data,
    });
  }

  async evaluate(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const month = (req.query.month as string) || undefined;

    const result = await insightService.evaluateAndNotify(userId, month);
    return res.json({
      status: 'success',
      data: result,
    });
  }

  async list(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const period = (req.query.period as string) || undefined;

    const data = await insightService.listInsights(userId, period);
    return res.json({
      status: 'success',
      data: { insights: data },
    });
  }

  async getById(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const id = String(req.params.id || '');
    if (!id) throw new BadRequestError('Insight ID is required');

    const data = await insightService.getInsightById(id, userId);
    return res.json({
      status: 'success',
      data: { insight: data },
    });
  }
}

export const insightController = new InsightController();
