import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runDashboardTests() {
  console.log('=== Starting Phase 6 Financial Dashboard & Analytics Integration Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3993;
  const server: Server = app.listen(testPort);

  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `phase6.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Dashboard' }),
    });
    const regData = await regRes.json();
    const token = regData.data.tokens.accessToken;

    // Create an account and transactions
    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bank', type: 'bank', balance: 10000 }),
    });
    const accData = await accRes.json();
    const accountId = accData.data.account.id;

    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'income', amount: 5000, accountId, category: 'Salary', merchant: 'Employer' }),
    });
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 1200, accountId, category: 'Food & Dining', merchant: 'Swiggy' }),
    });
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 800, category: 'Transportation', merchant: 'Uber' }),
    });

    const dashRes = await fetch(`${baseUrl}/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
    const dashData = await dashRes.json();
    if (dashRes.status !== 200) throw new Error(`Dashboard failed: ${JSON.stringify(dashData)}`);

    const d = dashData.data;
    const summary = d.summary || d.dashboard?.summary;
    if (!summary) throw new Error('Missing summary in dashboard response');
    if (summary.totalIncome !== 5000) throw new Error(`Expected income 5000 got ${summary.totalIncome}`);
    if (summary.totalExpenses !== 2000) throw new Error(`Expected expenses 2000 got ${summary.totalExpenses}`);
    if (summary.netSavings !== 3000) throw new Error(`Expected net savings 3000 got ${summary.netSavings}`);
    if (!Array.isArray(d.categoryBreakdown)) throw new Error('Missing categoryBreakdown');
    if (!Array.isArray(d.spendingByDay)) throw new Error('Missing spendingByDay');
    if (!Array.isArray(d.spendingByWeek)) throw new Error('Missing spendingByWeek');
    if (!Array.isArray(d.spendingByMonth)) throw new Error('Missing spendingByMonth');
    if (!Array.isArray(d.largestTransactions)) throw new Error('Missing largestTransactions');
    if (!Array.isArray(d.topCategories)) throw new Error('Missing topCategories');

    // Alias endpoints
    for (const path of ['/analytics', '/insights', '/dashboard/summary']) {
      const r = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.status !== 200) throw new Error(`Alias ${path} failed with ${r.status}`);
    }

    // Month filter should work
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const filteredRes = await fetch(`${baseUrl}/dashboard?month=${month}`, { headers: { Authorization: `Bearer ${token}` } });
    if (filteredRes.status !== 200) throw new Error('Month filter failed');

    console.log('=== ALL PHASE 6 DASHBOARD TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runDashboardTests().catch((err) => {
  console.error('Phase 6 test execution error:', err);
  process.exit(1);
});