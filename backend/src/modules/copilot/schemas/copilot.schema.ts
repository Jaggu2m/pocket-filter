import { z } from 'zod';

export enum CopilotIntent {
  TRANSACTION_QUERY = 'TRANSACTION_QUERY',
  SPENDING_DIAGNOSTIC = 'SPENDING_DIAGNOSTIC',
  BUDGET_QUERY = 'BUDGET_QUERY',
  GOAL_PROGRESS = 'GOAL_PROGRESS',
  PURCHASE_SIMULATION = 'PURCHASE_SIMULATION',
  DEBT_QUERY = 'DEBT_QUERY',
  ACCOUNT_BALANCE = 'ACCOUNT_BALANCE',
  INCOME_QUERY = 'INCOME_QUERY',
  GENERAL_FINANCE = 'GENERAL_FINANCE',
}

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
  conversationId: z.string().uuid('Invalid conversation ID').nullable().optional(),
});

export const extractedIntentSchema = z.object({
  intent: z.nativeEnum(CopilotIntent),
  confidence: z.number().min(0).max(1).default(1.0),
  parameters: z.object({
    category: z.string().nullable().optional(),
    amount: z.number().nullable().optional(),
    item: z.string().nullable().optional(),
    period: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    comparisonPeriod: z.string().nullable().optional(),
    goalType: z.string().nullable().optional(),
    goalName: z.string().nullable().optional(),
    targetAmount: z.number().nullable().optional(),
    timeframe: z.string().nullable().optional(),
    accountName: z.string().nullable().optional(),
    actionType: z.string().nullable().optional(),
  }).default({}),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ExtractedIntent = z.infer<typeof extractedIntentSchema>;
