import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format');

export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetAmount: z.coerce.number().min(0, 'targetAmount must be non-negative'),
  targetDate: dateSchema,
  accountId: z.string().uuid().nullable().optional(),
  status: z.enum(['active', 'completed', 'cancelled', 'archived']).optional(),
});

export const updateGoalSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  targetAmount: z.coerce.number().min(0).optional(),
  targetDate: dateSchema.optional(),
  status: z.enum(['active', 'completed', 'cancelled', 'archived']).optional(),
  accountId: z.string().uuid().nullable().optional(),
});

export const contributionSchema = z.object({
  amount: z.coerce.number().positive('amount must be positive'),
  accountId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).optional(),
  type: z.enum(['contribution']).optional().default('contribution'),
});

export const reversalSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
  accountId: z.string().uuid().nullable().optional(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const contributionParamsSchema = z.object({
  id: z.string().uuid(),
  contributionId: z.string().uuid(),
});