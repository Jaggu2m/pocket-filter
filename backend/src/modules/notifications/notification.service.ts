import { notificationRepository } from './notification.repository.js';
import { notificationDedupService } from './notification-dedup.service.js';
import {
  Notification,
  FinancialEvent,
  NotificationType,
  NotificationSeverity,
} from './types/notification.types.js';
import { NotFoundError } from '../../errors/app-error.js';

export class NotificationService {
  /**
   * Dispatches a structured financial event to the user's notification feed.
   * Enforces deduplication and cooldown to prevent alert fatigue.
   */
  async dispatch(event: FinancialEvent): Promise<Notification | null> {
    const cooldown = event.cooldownHours ?? 24;

    const isDup = await notificationDedupService.isDuplicate(
      event.userId,
      event.type,
      event.entityId,
      event.period,
      cooldown,
    );

    if (isDup) {
      return null;
    }

    const created = await notificationRepository.create({
      userId: event.userId,
      type: event.type,
      title: event.title,
      message: event.message,
      severity: event.severity,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata,
      expiresAt: event.period ? new Date(Date.now() + 30 * 24 * 3600 * 1000) : null,
    });

    await notificationDedupService.recordDispatched(
      event.userId,
      event.type,
      event.entityId,
      event.period,
      cooldown,
    );

    return created;
  }

  async list(userId: string, options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) {
    return notificationRepository.listByUser(userId, options);
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notif = await notificationRepository.markRead(id, userId);
    if (!notif) {
      throw new NotFoundError('Notification not found');
    }
    return notif;
  }

  async markAllAsRead(userId: string): Promise<{ updatedCount: number }> {
    const updatedCount = await notificationRepository.markAllRead(userId);
    return { updatedCount };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await notificationRepository.getUnreadCount(userId);
    return { unreadCount };
  }

  async delete(id: string, userId: string): Promise<{ deleted: boolean }> {
    const deleted = await notificationRepository.delete(id, userId);
    if (!deleted) {
      throw new NotFoundError('Notification not found');
    }
    return { deleted: true };
  }
}

export const notificationService = new NotificationService();
