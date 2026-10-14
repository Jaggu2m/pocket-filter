import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runPhase12Tests() {
  console.log('=== Starting Phase 12 Goal-Aware Spending Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3986;
  const server: Server = app.listen(testPort);
  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `phase12.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Phase12' }),
    });
    const token = (await regRes.json()).data.tokens.accessToken;

    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bank', type: 'bank', balance: 100000 }),
    });
    const accountId = (await accRes.json()).data.account.id;

    const now = new Date();
    const target = new Date(now);
    target.setUTCMonth(target.getUTCMonth() + 6);
    const targetDate = target.toISOString().slice(0, 10);

    const goalRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Kashmir Trip', targetAmount: 60000, targetDate, priority: 1 }),
    });
    const goalId = (await goalRes.json()).data.goal.id;

    // Seed savings 30000
    await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 30000 }),
    });

    // Seed monthly income/expenses so surplus equals required-ish amount
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'income', amount: 45000, accountId, category: 'Salary', date: now.toISOString() }),
    });
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 40000, accountId, category: 'Shopping', merchant: 'Rent', date: now.toISOString() }),
    });

    // Create impacting expense
    const spendRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 3500, accountId, category: 'Shopping', merchant: 'Extra', date: now.toISOString() }),
    });
    const spendData = await spendRes.json();
    if (spendRes.status !== 201) throw new Error(`Spend failed: ${JSON.stringify(spendData)}`);
    if (!Array.isArray(spendData.data.goalImpacts) || spendData.data.goalImpacts.length < 1) {
      throw new Error('Transaction response missing goalImpacts');
    }
    const impact = spendData.data.goalImpacts[0];
    if (impact.goalId !== goalId) throw new Error('Impact goal mismatch');
    if (!(impact.impactLevel === 'MEDIUM' || impact.impactLevel === 'HIGH')) throw new Error(`Unexpected impact level ${impact.impactLevel}`);
    if (!(impact.monthsDelayed > 0)) throw new Error('Impact did not delay goal');

    // On-demand impact endpoint
    const impactRes = await fetch(`${baseUrl}/goals/impact?amount=3500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const impactData = await impactRes.json();
    if (impactRes.status !== 200) throw new Error(`Impact endpoint failed: ${JSON.stringify(impactData)}`);
    const onDemandImpact = (impactData.data.goalImpacts || impactData.data.impacts)[0];
    if (onDemandImpact.goalId !== goalId) throw new Error('On-demand impact mismatch');

    const perGoalRes = await fetch(`${baseUrl}/goals/${goalId}/impact?amount=3500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (perGoalRes.status !== 200) throw new Error('Per-goal impact failed');

    console.log('=== ALL PHASE 12 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runPhase12Tests().catch((err) => {
  console.error('Phase 12 test execution error:', err);
  process.exit(1);
});