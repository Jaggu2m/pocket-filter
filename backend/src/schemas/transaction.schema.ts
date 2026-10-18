import { z } from 'zod';

export const transactionTypeEnum = z.enum(['income', 'expense', 'transfer']);

export const moneySourceTypeEnum = z.enum(['ACCOUNT', 'UNSPECIFIED']);

export const createTransactionSchema = z
  .object({
    type: transactionTypeEnum.default('expense'),
    amount: z.number().positive('Amount must be greater than zero'),
    accountId: z.string().uuid('Invalid account ID').optional().nullable(),
    toAccountId: z.string().uuid('Invalid destination account ID').optional().nullable(),
    sourceType: moneySourceTypeEnum.optional(),
    destinationType: moneySourceTypeEnum.optional(),
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
        const isSrcAccount = data.sourceType === 'ACCOUNT' || (data.sourceType === undefined && !!data.accountId);
        const isDstAccount = data.destinationType === 'ACCOUNT' || (data.destinationType === undefined && !!data.toAccountId);

        // Cannot transfer from unspecified to unspecified
        if (!isSrcAccount && !isDstAccount) {
          return false;
        }

        // If source is account, accountId must be present
        if (isSrcAccount && !data.accountId) {
          return false;
        }

        // If destination is account, toAccountId must be present
        if (isDstAccount && !data.toAccountId) {
          return false;
        }

        // If both are accounts, they must be different
        if (isSrcAccount && isDstAccount && data.accountId === data.toAccountId) {
          return false;
        }

        return true;
      }
      return true;
    },
    {
      message:
        'Transfers require different source and destination money sources (account or general balance)',
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
    sourceType: moneySourceTypeEnum.optional(),
    destinationType: moneySourceTypeEnum.optional(),
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
      if (data.type === 'transfer') {
        if (data.accountId && data.toAccountId && data.accountId === data.toAccountId) {
          return false;
        }
        if (data.sourceType === 'UNSPECIFIED' && data.destinationType === 'UNSPECIFIED') {
          return false;
        }
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
