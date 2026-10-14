import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runPhase13Tests() {
  console.log('=== Starting Phase 13 Simulation Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3985;
  const server: Server = app.listen(testPort);
  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `phase13.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Phase13' }),
    });
    const token = (await regRes.json()).data.tokens.accessToken;

    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bank', type: 'bank', balance: 90000 }),
    });
    const accountId = (await accRes.json()).data.account.id;

    const now = new Date();
    const target = new Date(now);
    target.setUTCMonth(target.getUTCMonth() + 6);
    const goalRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Laptop', targetAmount: 80000, targetDate: target.toISOString().slice(0, 10), priority: 2 }),
    });
    const goalId = (await goalRes.json()).data.goal.id;
    await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 40000 }),
    });

    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'income', amount: 60000, accountId, category: 'Salary', date: now.toISOString() }),
    });
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 40000, accountId, category: 'Rent', date: now.toISOString() }),
    });

    // Simulation
    const simRes = await fetch(`${baseUrl}/simulations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ONE_TIME_EXPENSE', amount: 40000, category: 'electronics' }),
    });
    const simData = await simRes.json();
    if (simRes.status !== 200) throw new Error(`Simulation failed: ${JSON.stringify(simData)}`);
    const sim = simData.data;
    if (!sim.before || !sim.after) throw new Error('Simulation missing before/after');
    if (sim.after.liquidBalance !== 70000) throw new Error(`Expected after liquid 70000 got ${sim.after.liquidBalance}`);
    if (!sim.decision || !Array.isArray(sim.decision.reasons)) throw new Error('Simulation missing decision');
    if (!Array.isArray(sim.goalImpacts)) throw new Error('Simulation missing goalImpacts');

    const aiRes = await fetch(`${baseUrl}/simulations?explain=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ONE_TIME_EXPENSE', amount: 40000, category: 'electronics' }),
    });
    const aiData = await aiRes.json();
    if (aiRes.status !== 200) throw new Error('Simulation explain failed');
    if (!aiData.data.ai) throw new Error('Missing ai block');

    // Alias
    const aliasRes = await fetch(`${baseUrl}/what-if`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ONE_TIME_EXPENSE', amount: 1000, category: 'food' }),
    });
    if (aliasRes.status !== 200) throw new Error('Simulation alias failed');

    console.log('=== ALL PHASE 13 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runPhase13Tests().catch((err) => {
  console.error('Phase 13 test execution error:', err);
  process.exit(1);
});