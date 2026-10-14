import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runCategoryIntegrationTests(): Promise<void> {
  console.log('=== Starting Phase 5 Categorization Integration Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();
  const server: Server = app.listen(3996);

  try {
    const baseUrl = 'http://localhost:3996/api';
    const register = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `phase5.${Date.now()}@example.com`, password: 'Password123!', firstName: 'Category' }),
    });
    const registration = await register.json();
    const token = registration.data.tokens.accessToken as string;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const categories = await fetch(`${baseUrl}/categories`, { headers });
    const categoryData = await categories.json();
    if (categories.status !== 200 || !categoryData.data.categories.some((item: { name: string }) => item.name === 'Food & Dining')) throw new Error('Category taxonomy not available');

    const created = await fetch(`${baseUrl}/transactions`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'expense', amount: 450, merchant: 'SWIGGY ORDER 123', description: 'UPI food delivery' }),
    });
    const createdData = await created.json();
    const transaction = createdData.data.transaction;
    if (created.status !== 201 || transaction.category !== 'Food & Dining' || transaction.categorySource !== 'merchant_rule') throw new Error(`Automatic categorization failed: ${JSON.stringify(createdData)}`);

    const correction = await fetch(`${baseUrl}/transactions/${transaction.id}/category`, {
      method: 'PATCH', headers, body: JSON.stringify({ category: 'Shopping', learn: true }),
    });
    if (correction.status !== 200) throw new Error(`Correction failed: ${await correction.text()}`);

    const learned = await fetch(`${baseUrl}/transactions`, {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'expense', amount: 200, merchant: 'SWIGGY ORDER 456', description: 'UPI test transaction' }),
    });
    const learnedData = await learned.json();
    if (learned.status !== 201 || learnedData.data.transaction.category !== 'Shopping' || learnedData.data.transaction.categorySource !== 'user_rule') throw new Error(`Learned rule failed: ${JSON.stringify(learnedData)}`);

    const recategorized = await fetch(`${baseUrl}/categories/recategorize`, { method: 'POST', headers });
    if (recategorized.status !== 200) throw new Error(`Recategorization failed: ${await recategorized.text()}`);
    console.log('=== ALL PHASE 5 CATEGORIZATION INTEGRATION TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await redisClient.quit();
    await pool.end();
  }
}

runCategoryIntegrationTests().catch((error) => { console.error('Phase 5 test execution error:', error); process.exit(1); });
