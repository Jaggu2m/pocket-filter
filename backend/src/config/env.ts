import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),

  JWT_ACCESS_EXPIRATION: z.string().default('15m'),

  JWT_REFRESH_EXPIRATION_DAYS: z.coerce.number().int().min(1).default(7),

  // Optional self-hosted OCR service. It must accept a PDF POST body and return { text: string }.
  OCR_ENDPOINT: z.string().url().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment configuration:', z.treeifyError(result.error));

  throw new Error('Environment configuration validation failed');
}

export const env = result.data;
