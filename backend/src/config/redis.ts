import { createClient } from 'redis';
import { env } from './env.js';

export const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (error) => {
  console.error('Redis client error:', error);
});

redisClient.on('connect', () => {
  console.log('Connecting to Redis...');
});

redisClient.on('ready', () => {
  console.log('Redis client is ready');
});

redisClient.on('reconnecting', () => {
  console.log('Reconnecting to Redis...');
});

export async function connectRedis(): Promise<void> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  const response = await redisClient.ping();

  if (response !== 'PONG') {
    throw new Error('Redis connectivity verification failed');
  }

  console.log('Redis connectivity verified:', response);
}
