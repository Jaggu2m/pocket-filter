import { redisClient } from '../../config/redis.js';
import { notificationRepository } from './notification.repository.js';
import { NotificationType } from './types/notification.types.js';

export class NotificationDedupService {
  /**
   * Generates a unique deduplication key for a financial event.
   */
  buildKey(userId: string, type: string, entityId?: string | null, period?: string | null): string {
    const cleanEntity = entityId ? entityId.replace(/[^a-zA-Z0-9_-]/g, '') : 'global';
    const cleanPeriod = period ? period.replace(/[^a-zA-Z0-9_-]/g, '') : 'current';
    return `notif_dedup:${userId}:${type}:${cleanEntity}:${cleanPeriod}`;
  }

  /**
   * Checks whether this event was already dispatched within its cooldown window.
   */
  async isDuplicate(
    userId: string,
    type: NotificationType,
    entityId?: string | null,
    period?: string | null,
    cooldownHours: number = 24,
  ): Promise<boolean> {
    const key = this.buildKey(userId, type, entityId, period);

    // 1. Check Redis if connected
    if (redisClient.isOpen) {
      try {
        const exists = await redisClient.get(key);
        if (exists) return true;
      } catch (err) {
        console.warn('Redis dedup check error, falling back to DB:', err);
      }
    }

    // 2. Database fallback: check if similar notification exists within cooldown window
    const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const dbExists = await notificationRepository.existsSimilar(
      userId,
      type,
      entityId || null,
      since,
    );

    return dbExists;
  }

  /**
   * Records that this notification was dispatched to enforce the cooldown.
   */
  async recordDispatched(
    userId: string,
    type: NotificationType,
    entityId?: string | null,
    period?: string | null,
    cooldownHours: number = 24,
  ): Promise<void> {
    const key = this.buildKey(userId, type, entityId, period);
    const ttlSeconds = Math.max(60, cooldownHours * 3600);

    if (redisClient.isOpen) {
      try {
        await redisClient.set(key, '1', { EX: ttlSeconds });
      } catch (err) {
        console.warn('Failed to record dedup key in Redis:', err);
      }
    }
  }
}

export const notificationDedupService = new NotificationDedupService();
