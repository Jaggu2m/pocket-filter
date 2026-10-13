import { pool } from '../config/database.js';
import { redisClient } from '../config/redis.js';

export interface DependencyHealth {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export interface ReadinessResult {
  status: 'ok' | 'error';
  timestamp: string;
  dependencies: {
    postgres: DependencyHealth;
    redis: DependencyHealth;
  };
}

async function checkPostgres(): Promise<DependencyHealth> {
  const start = Date.now();

  try {
    await pool.query('SELECT 1');

    return {
      status: 'up',
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
    };
  }
}

async function checkRedis(): Promise<DependencyHealth> {
  const start = Date.now();

  try {
    if (!redisClient.isReady) {
      return { status: 'down' };
    }

    await redisClient.ping();

    return {
      status: 'up',
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
    };
  }
}

export async function getReadiness(): Promise<ReadinessResult> {
  const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);

  const healthy = postgres.status === 'up' && redis.status === 'up';

  return {
    status: healthy ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    dependencies: {
      postgres,
      redis,
    },
  };
}
