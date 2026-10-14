import { z } from 'zod';

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const createBudgetSchema = z.object({
  month: z.string().regex(monthRegex, 'month must be in YYYY-MM format'),
  overallLimit: z.coerce.number().min(0, 'overallLimit must be non-negative'),
  currency: z.string().trim().min(3).max(10).optional().default('INR'),
  categoryLimits: z
    .array(
      z
        .object({
          categoryId: z.string().uuid('categoryId must be a valid UUID').optional(),
          category: z.string().trim().min(1).max(100).optional(),
          limitAmount: z.coerce.number().min(0, 'limitAmount must be non-negative'),
        })
        .refine((value) => value.categoryId || value.category, {
          message: 'categoryId or category is required',
        }),
    )
    .optional()
    .default([]),
});

export const updateBudgetSchema = z.object({
  overallLimit: z.coerce.number().min(0).optional(),
  currency: z.string().trim().min(3).max(10).optional(),
});

export const budgetMonthQuerySchema = z.object({
  month: z.string().regex(monthRegex).optional(),
  currency: z.string().trim().min(3).max(10).optional(),
});

export const categoryLimitBodySchema = z.object({
  limitAmount: z.coerce.number().min(0, 'limitAmount must be non-negative'),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const budgetCategoryParamsSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
});