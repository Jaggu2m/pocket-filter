import crypto from 'node:crypto';
import { redisClient } from '../config/redis.js';
import { env } from '../config/env.js';

export interface SessionData {
  userId: string;
  sessionId: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
}

export class SessionService {
  private getSessionKey(userId: string, sessionId: string): string {
    return `session:${userId}:${sessionId}`;
  }

  async createSession(
    userId: string,
    metadata?: { userAgent?: string; ip?: string },
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const key = this.getSessionKey(userId, sessionId);
    const ttlSeconds = env.JWT_REFRESH_EXPIRATION_DAYS * 24 * 60 * 60;

    const sessionData: SessionData = {
      userId,
      sessionId,
      userAgent: metadata?.userAgent,
      ip: metadata?.ip,
      createdAt: new Date().toISOString(),
    };

    await redisClient.set(key, JSON.stringify(sessionData), {
      EX: ttlSeconds,
    });

    return sessionId;
  }

  async validateSession(userId: string, sessionId: string): Promise<boolean> {
    const key = this.getSessionKey(userId, sessionId);
    const exists = await redisClient.exists(key);
    return exists === 1;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const key = this.getSessionKey(userId, sessionId);
    await redisClient.del(key);
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    const pattern = `session:${userId}:*`;
    const keys: string[] = [];
    let cursor = '0';

    do {
      const reply = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = reply.cursor;
      keys.push(...reply.keys);
    } while (cursor !== '0');

    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}

export const sessionService = new SessionService();
