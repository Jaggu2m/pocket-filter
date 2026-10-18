export enum NotificationType {
  BUDGET_PACE_BREACH = 'BUDGET_PACE_BREACH',
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED',
  GOAL_HEALTH_DOWNGRADE = 'GOAL_HEALTH_DOWNGRADE',
  GOAL_MILESTONE = 'GOAL_MILESTONE',
  BILL_UPCOMING = 'BILL_UPCOMING',
  SUBSCRIPTION_UPCOMING = 'SUBSCRIPTION_UPCOMING',
  SPENDING_ANOMALY = 'SPENDING_ANOMALY',
  SPENDING_SHIFT = 'SPENDING_SHIFT',
  MONTHLY_REVIEW = 'MONTHLY_REVIEW',
  DEBT_MILESTONE = 'DEBT_MILESTONE',
  SAVINGS_MILESTONE = 'SAVINGS_MILESTONE',
}

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, any>;
  isRead: boolean;
  createdAt: Date;
  expiresAt?: Date | null;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, any>;
  expiresAt?: Date | null;
}

export interface FinancialEvent {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  entityType?: string;
  entityId?: string;
  period?: string;
  cooldownHours?: number;
  metadata?: Record<string, any>;
}
