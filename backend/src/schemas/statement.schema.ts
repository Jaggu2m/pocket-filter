import { z } from 'zod';

const importTransactionSchema = z.object({
  date: z.coerce.date(),
  merchant: z.string().trim().max(150).nullable().optional(),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  type: z.enum(['income', 'expense']),
  category: z.string().trim().min(1).max(100).optional(),
  importHash: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid import transaction fingerprint').optional(),
});

export const confirmStatementImportSchema = z.object({
  fileName: z.string().trim().min(1).max(255).default('statement'),
  fileType: z.enum(['csv', 'pdf', 'image']).default('pdf'),
  accountId: z.string().uuid().nullable().optional(),
  transactions: z.array(importTransactionSchema).min(1).max(2_000).optional(),
  selectedTransactions: z.array(importTransactionSchema).min(1).max(2_000).optional(),
}).refine(
  (data) => !!(data.transactions?.length || data.selectedTransactions?.length),
  { message: 'At least one transaction must be provided for import', path: ['transactions'] },
).transform((data) => ({
  ...data,
  transactions: (data.transactions || data.selectedTransactions)!,
}));
