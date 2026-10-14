import { z } from 'zod';

export const transactionTypeEnum = z.enum(['income', 'expense', 'transfer']);

export const createTransactionSchema = z
  .object({
    type: transactionTypeEnum.default('expense'),
    amount: z.number().positive('Amount must be greater than zero'),
    accountId: z.string().uuid('Invalid account ID').optional().nullable(),
    toAccountId: z.string().uuid('Invalid destination account ID').optional().nullable(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .length(3, 'Currency must be a 3-letter code (e.g. INR)')
      .optional(),
    category: z.string().trim().min(1, 'Category cannot be empty').max(100).optional(),
    merchant: z.string().trim().max(150).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    date: z.coerce.date().optional(),
    paymentRail: z.string().trim().max(50).optional().nullable(),
    isRecurring: z.boolean().optional(),
    tags: z.array(z.string().trim().max(50)).optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer') {
        return !!data.accountId && !!data.toAccountId && data.accountId !== data.toAccountId;
      }
      return true;
    },
    {
      message:
        'Transfers require both source and destination accounts to be specified and different',
      path: ['toAccountId'],
    },
  )
  .transform((data) => ({
    ...data,
    description: data.description ?? data.notes ?? null,
  }));

export const updateTransactionSchema = z
  .object({
    type: transactionTypeEnum.optional(),
    amount: z.number().positive('Amount must be greater than zero').optional(),
    accountId: z.string().uuid('Invalid account ID').optional().nullable(),
    toAccountId: z.string().uuid('Invalid destination account ID').optional().nullable(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    merchant: z.string().trim().max(150).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
    date: z.coerce.date().optional(),
    paymentRail: z.string().trim().max(50).optional().nullable(),
    isRecurring: z.boolean().optional(),
    tags: z.array(z.string().trim().max(50)).optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer' && data.accountId && data.toAccountId) {
        return data.accountId !== data.toAccountId;
      }
      return true;
    },
    {
      message: 'Source and destination accounts must be different',
      path: ['toAccountId'],
    },
  );

export const transactionQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  type: transactionTypeEnum.optional(),
  category: z.string().trim().optional(),
  accountId: z.string().uuid('Invalid account ID').optional(),
  search: z.string().trim().optional(),
  sortBy: z.enum(['date', 'amount', 'created_at']).optional(),
  sortOrder: z.enum(['ASC', 'DESC']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
