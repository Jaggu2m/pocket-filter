import type { Request, Response } from 'express';
import { notificationService } from './notification.service.js';
import { BadRequestError } from '../../errors/app-error.js';

export class NotificationController {
  async list(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const data = await notificationService.list(userId, { unreadOnly, limit, offset });
    return res.json({
      status: 'success',
      data,
    });
  }

  async markRead(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const id = String(req.params.id || '');
    if (!id) throw new BadRequestError('Notification ID is required');

    const notification = await notificationService.markAsRead(id, userId);
    return res.json({
      status: 'success',
      data: { notification },
    });
  }

  async markAllRead(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const result = await notificationService.markAllAsRead(userId);
    return res.json({
      status: 'success',
      data: result,
    });
  }

  async getUnreadCount(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const data = await notificationService.getUnreadCount(userId);
    return res.json({
      status: 'success',
      data,
    });
  }

  async delete(req: Request, res: Response) {
    const userId = (req as any).user.userId;
    const id = String(req.params.id || '');
    if (!id) throw new BadRequestError('Notification ID is required');

    const result = await notificationService.delete(id, userId);
    return res.json({
      status: 'success',
      data: result,
    });
  }
}

export const notificationController = new NotificationController();
