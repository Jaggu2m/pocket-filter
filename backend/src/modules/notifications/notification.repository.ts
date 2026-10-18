import { pool } from '../../config/database.js';
import {
  Notification,
  NotificationType,
  NotificationSeverity,
  CreateNotificationInput,
} from './types/notification.types.js';

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  entity_type: string | null;
  entity_id: string | null;
  metadata: any;
  is_read: boolean;
  created_at: Date;
  expires_at: Date | null;
}

function mapRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    severity: row.severity,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata || {},
    isRead: row.is_read,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export class NotificationRepository {
  async create(input: CreateNotificationInput): Promise<Notification> {
    const query = `
      INSERT INTO notifications (
        user_id, type, title, message, severity, entity_type, entity_id, metadata, expires_at
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, 'INFO'), $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      input.userId,
      input.type,
      input.title,
      input.message,
      input.severity || 'INFO',
      input.entityType || null,
      input.entityId || null,
      JSON.stringify(input.metadata || {}),
      input.expiresAt || null,
    ];

    const result = await pool.query<NotificationRow>(query, values);
    return mapRow(result.rows[0]);
  }

  async listByUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const limit = Math.min(100, Math.max(1, options.limit || 30));
    const offset = Math.max(0, options.offset || 0);

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];

    if (options.unreadOnly) {
      whereClause += ' AND is_read = FALSE';
    }

    const listQuery = `
      SELECT *
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const countQuery = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(CASE WHEN is_read = FALSE THEN 1 END)::int AS unread_count
      FROM notifications
      WHERE user_id = $1;
    `;

    const [listRes, countRes] = await Promise.all([
      pool.query<NotificationRow>(listQuery, [userId, limit, offset]),
      pool.query<{ total: number; unread_count: number }>(countQuery, [userId]),
    ]);

    return {
      notifications: listRes.rows.map(mapRow),
      total: countRes.rows[0]?.total || 0,
      unreadCount: countRes.rows[0]?.unread_count || 0,
    };
  }

  async findById(id: string, userId: string): Promise<Notification | null> {
    const query = `
      SELECT * FROM notifications
      WHERE id = $1 AND user_id = $2
      LIMIT 1;
    `;
    const result = await pool.query<NotificationRow>(query, [id, userId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async markRead(id: string, userId: string): Promise<Notification | null> {
    const query = `
      UPDATE notifications
      SET is_read = TRUE
      WHERE id = $1 AND user_id = $2
      RETURNING *;
    `;
    const result = await pool.query<NotificationRow>(query, [id, userId]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async markAllRead(userId: string): Promise<number> {
    const query = `
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = $1 AND is_read = FALSE;
    `;
    const result = await pool.query(query, [userId]);
    return result.rowCount || 0;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const query = `
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE user_id = $1 AND is_read = FALSE;
    `;
    const result = await pool.query<{ count: number }>(query, [userId]);
    return result.rows[0]?.count || 0;
  }

  async existsSimilar(
    userId: string,
    type: string,
    entityId: string | null,
    since: Date,
  ): Promise<boolean> {
    let query = `
      SELECT id FROM notifications
      WHERE user_id = $1 AND type = $2 AND created_at >= $3
    `;
    const params: any[] = [userId, type, since];

    if (entityId) {
      query += ' AND entity_id = $4';
      params.push(entityId);
    }
    query += ' LIMIT 1;';

    const result = await pool.query(query, params);
    return result.rows.length > 0;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM notifications
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;
    const result = await pool.query(query, [id, userId]);
    return (result.rowCount || 0) > 0;
  }
}

export const notificationRepository = new NotificationRepository();
