import { z } from 'zod';

export const accountTypeEnum = z.enum([
  'bank',
  'credit_card',
  'cash',
  'upi_wallet',
  'investment',
  'other',
]);

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required').max(100),
  type: accountTypeEnum,
  institutionName: z.string().trim().max(100).optional().nullable(),
  accountNumberLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Last 4 digits must contain exactly 4 numbers')
    .optional()
    .nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Currency must be a 3-letter code (e.g. INR)')
    .optional(),
  balance: z.number().default(0),
  creditLimit: z.number().nonnegative('Credit limit must be non-negative').optional().nullable(),
  color: z.string().trim().max(30).optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1, 'Account name cannot be empty').max(100).optional(),
  type: accountTypeEnum.optional(),
  institutionName: z.string().trim().max(100).optional().nullable(),
  accountNumberLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Last 4 digits must contain exactly 4 numbers')
    .optional()
    .nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Currency must be a 3-letter code')
    .optional(),
  balance: z.number().optional(),
  creditLimit: z.number().nonnegative('Credit limit must be non-negative').optional().nullable(),
  color: z.string().trim().max(30).optional().nullable(),
  icon: z.string().trim().max(50).optional().nullable(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const accountQuerySchema = z.object({
  type: accountTypeEnum.optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});
