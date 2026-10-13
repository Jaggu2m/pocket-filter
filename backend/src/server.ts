import 'dotenv/config';
import type { Server } from 'node:http';

import app from './app.js';
import { env } from './config/env.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';

let server: Server | undefined;
let isShuttingDown = false;

async function closeResources(): Promise<void> {
  const results = await Promise.allSettled([
    pool.end(),
    redisClient.isReady ? redisClient.quit() : Promise.resolve(),
  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Error closing a resource:', result.reason);
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`${signal} received. Starting graceful shutdown...`);

  // Allow the server to drain existing requests, with a deadline.
  const forceCloseTimer = setTimeout(() => {
    console.error('Shutdown deadline exceeded. Closing HTTP connections.');
    server?.closeAllConnections();
  }, 10_000);

  forceCloseTimer.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    await closeResources();
    console.log('Graceful shutdown completed.');
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(forceCloseTimer);
  }
}

async function startServer(): Promise<void> {
  try {
    await Promise.all([connectDatabase(), connectRedis()]);

    await runMigrations();

    if (isShuttingDown) {
      await closeResources();
      return;
    }

    server = app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
    });

    server.on('error', (error) => {
      console.error('HTTP server error:', error);
      process.exitCode = 1;
      void shutdown('SERVER_ERROR');
    });
  } catch (error) {
    console.error('Application startup failed:', error);
    process.exitCode = 1;
    await closeResources();
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void startServer();
