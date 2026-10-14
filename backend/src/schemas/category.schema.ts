import { z } from 'zod';

export const merchantRuleSchema = z.object({
  merchant: z.string().trim().min(2).max(150),
  category: z.string().trim().min(1).max(100),
});

export const correctTransactionCategorySchema = z.object({
  category: z.string().trim().min(1).max(100),
  learn: z.boolean().optional().default(true),
});
