import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runPhase9Tests() {
  console.log('=== Starting Phase 9 Budget Pace & Recurring Detection Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3990;
  const server: Server = app.listen(testPort);
  try {
    const baseUrl = `http://localhost:${testPort}/api`;

    // ---- Budget Pace ----
    const email = `phase9.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Pace' }),
    });
    const token = (await regRes.json()).data.tokens.accessToken;

    const catRes = await fetch(`${baseUrl}/categories`, { headers: { Authorization: `Bearer ${token}` } });
    const catData = await catRes.json();
    const foodId = catData.data.categories.find((c: any) => c.name === 'Food & Dining').id;

    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bank', type: 'bank', balance: 100000 }),
    });
    const accountId = (await accRes.json()).data.account.id;

    await fetch(`${baseUrl}/budgets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month: new Date().toISOString().slice(0, 7),
        overallLimit: 40000,
        currency: 'INR',
        categoryLimits: [{ categoryId: foodId, limitAmount: 8000 }],
      }),
    });

    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 4000, accountId, category: 'Food & Dining', merchant: 'Swiggy', date: new Date().toISOString() }),
    });

    const paceRes = await fetch(`${baseUrl}/budget-pace`, { headers: { Authorization: `Bearer ${token}` } });
    const paceData = await paceRes.json();
    if (paceRes.status !== 200) throw new Error(`Budget pace failed: ${JSON.stringify(paceData)}`);
    const pace = paceData.data;
    if (!pace.overall || !Array.isArray(pace.categories)) throw new Error('Budget pace missing data');
    if (pace.categories.length < 1) throw new Error('Budget pace categories missing');
    if (!['BELOW_PACE', 'ON_TRACK', 'SLIGHTLY_AHEAD', 'AHEAD_OF_PACE', 'UNBUDGETED'].includes(pace.categories[0].status)) {
      throw new Error('Invalid category pace status');
    }

    // ---- Recurring Detection ----
    const email2 = `phase9b.${Date.now()}@example.com`;
    const regRes2 = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email2, password: 'Password123!', firstName: 'Recurring' }),
    });
    const token2 = (await regRes2.json()).data.tokens.accessToken;

    const now = new Date();
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - (i * 30));
      await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'expense',
          amount: 649,
          category: 'Entertainment',
          merchant: 'Netflix',
          description: 'Netflix subscription',
          date: d.toISOString(),
        }),
      });
    }

    const listRes = await fetch(`${baseUrl}/recurring-payments`, { headers: { Authorization: `Bearer ${token2}` } });
    const listData = await listRes.json();
    if (listRes.status !== 200) throw new Error(`Recurring list failed: ${JSON.stringify(listData)}`);
    const payments = listData.data.recurringPayments || listData.data.recurring_payments;
    if (!Array.isArray(payments) || payments.length < 1) throw new Error('Recurring payment not detected');
    const netflix = payments.find((p: any) => /netflix/i.test(p.merchantName));
    if (!netflix) throw new Error('Netflix recurring payment not found');
    if (netflix.frequency !== 'MONTHLY') throw new Error(`Expected MONTHLY got ${netflix.frequency}`);
    if (Math.abs(netflix.medianAmount - 649) > 0.01) throw new Error('Recurring amount mismatch');

    const confirmRes = await fetch(`${baseUrl}/recurring-payments/${netflix.id}/confirm`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token2}` },
    });
    if (confirmRes.status !== 200) throw new Error('Confirm recurring failed');

    console.log('=== ALL PHASE 9 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runPhase9Tests().catch((err) => {
  console.error('Phase 9 test execution error:', err);
  process.exit(1);
});