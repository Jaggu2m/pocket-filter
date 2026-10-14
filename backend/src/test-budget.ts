import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function findCategoryId(categories: any[], name: string): Promise<string> {
  const match = categories.find((c: any) => c.name === name);
  if (!match) throw new Error(`Category ${name} not found`);
  return match.id;
}

async function runBudgetTests() {
  console.log('=== Starting Phase 7 Budget Management Integration Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3992;
  const server: Server = app.listen(testPort);
  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `phase7.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Budget' }),
    });
    const regData = await regRes.json();
    const token = regData.data.tokens.accessToken;

    // Get categories
    const catRes = await fetch(`${baseUrl}/categories`, { headers: { Authorization: `Bearer ${token}` } });
    const catData = await catRes.json();
    const categories = catData.data.categories;
    const groceriesId = await findCategoryId(categories, 'Groceries');
    const foodId = await findCategoryId(categories, 'Food & Dining');
    const shoppingId = await findCategoryId(categories, 'Shopping');

    // Create account + transactions (all expenses in current month)
    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bank', type: 'bank', balance: 100000 }),
    });
    const accData = await accRes.json();
    const accountId = accData.data.account.id;

    async function addExpense(amount: number, category: string) {
      await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'expense', amount, accountId, category, merchant: 'Test' }),
      });
    }
    await addExpense(3500, 'Groceries');
    await addExpense(3200, 'Food & Dining');
    await addExpense(4500, 'Shopping');

    const month = new Date().toISOString().slice(0, 7);

    // Create budget
    const createRes = await fetch(`${baseUrl}/budgets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month,
        overallLimit: 25000,
        currency: 'INR',
        categoryLimits: [
          { categoryId: groceriesId, limitAmount: 5000 },
          { categoryId: foodId, limitAmount: 4000 },
          { categoryId: shoppingId, limitAmount: 4000 },
        ],
      }),
    });
    const createData = await createRes.json();
    if (createRes.status !== 201) throw new Error(`Budget create failed: ${JSON.stringify(createData)}`);
    const budgetId = createData.data.budget.id;

    // Duplicate budget should be 409
    const dupRes = await fetch(`${baseUrl}/budgets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, overallLimit: 1000, currency: 'INR', categoryLimits: [] }),
    });
    if (dupRes.status !== 409) throw new Error(`Duplicate budget expected 409 got ${dupRes.status}`);

    // Summary
    const sumRes = await fetch(`${baseUrl}/budgets/${budgetId}/summary`, { headers: { Authorization: `Bearer ${token}` } });
    const sumData = await sumRes.json();
    if (sumRes.status !== 200) throw new Error(`Summary failed: ${JSON.stringify(sumData)}`);
    const summary = sumData.data.summary;
    if (summary.totalActualSpending !== 11200) throw new Error(`Expected total spend 11200 got ${summary.totalActualSpending}`);
    if (summary.overallRemaining !== 13800) throw new Error(`Expected overall remaining 13800 got ${summary.overallRemaining}`);
    const grocery = summary.categories.find((c: any) => c.categoryName === 'Groceries');
    if (!grocery || grocery.actualSpending !== 3500 || grocery.remaining !== 1500) throw new Error('Groceries calculation mismatch');
    const shopping = summary.categories.find((c: any) => c.categoryName === 'Shopping');
    if (!shopping || shopping.exceeded !== true) throw new Error('Shopping exceeded flag mismatch');

    // Comparison alias
    const compRes = await fetch(`${baseUrl}/budgets/${budgetId}/comparison`, { headers: { Authorization: `Bearer ${token}` } });
    if (compRes.status !== 200) throw new Error('Comparison failed');

    // Current budget
    const curRes = await fetch(`${baseUrl}/budgets/current?month=${month}`, { headers: { Authorization: `Bearer ${token}` } });
    const curData = await curRes.json();
    if (curRes.status !== 200 || !curData.data.budget) throw new Error('Current budget failed');

    // v1 alias
    const v1Res = await fetch(`${baseUrl.replace('/api', '/api/v1')}/budgets/current?month=${month}`, { headers: { Authorization: `Bearer ${token}` } });
    if (v1Res.status !== 200) throw new Error('v1 alias failed');

    // Update overall limit
    const updRes = await fetch(`${baseUrl}/budgets/${budgetId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ overallLimit: 20000 }),
    });
    const updData = await updRes.json();
    if (updRes.status !== 200 || updData.data.budget.overallLimit !== 20000) throw new Error('Budget update failed');

    // Upsert category limit
    const upsertRes = await fetch(`${baseUrl}/budgets/${budgetId}/categories/${foodId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limitAmount: 3000 }),
    });
    if (upsertRes.status !== 200) throw new Error(`Upsert category limit failed: ${upsertRes.status}`);
    const upsertData = await upsertRes.json();
    const restLimit = upsertData.data.budget.categoryLimits.find((l: any) => l.categoryId === foodId);
    if (!restLimit || restLimit.limitAmount !== 3000) throw new Error('Upsert did not update limit');

    // Delete category limit
    const delRes = await fetch(`${baseUrl}/budgets/${budgetId}/categories/${shoppingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (delRes.status !== 200) throw new Error(`Delete category limit failed: ${delRes.status}`);

    // Missing budget summary should 404
    const missingRes = await fetch(`${baseUrl}/budgets/00000000-0000-0000-0000-000000000000/summary`, { headers: { Authorization: `Bearer ${token}` } });
    if (missingRes.status !== 404) throw new Error(`Missing budget expected 404 got ${missingRes.status}`);

    console.log('=== ALL PHASE 7 BUDGET TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runBudgetTests().catch((err) => {
  console.error('Phase 7 test execution error:', err);
  process.exit(1);
});