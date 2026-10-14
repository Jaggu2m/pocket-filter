import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runPhase11Tests() {
  console.log('=== Starting Phase 11 Goal Health & Waterfall Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3987;
  const server: Server = app.listen(testPort);
  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `phase11.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Phase11' }),
    });
    const token = (await regRes.json()).data.tokens.accessToken;

    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setUTCMonth(targetDate.getUTCMonth() + 10);
    const target = targetDate.toISOString().slice(0, 10);

    // Create emergency fund goal
    const efRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Emergency Fund', targetAmount: 100000, targetDate: target, priority: 1 }),
    });
    const efId = (await efRes.json()).data.goal.id;

    // Create laptop goal with saved amount 20000
    const laptopRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'MacBook', targetAmount: 100000, targetDate: target, priority: 2 }),
    });
    const laptopId = (await laptopRes.json()).data.goal.id;

    await fetch(`${baseUrl}/goals/${laptopId}/contributions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 20000 }),
    });

    // Vacation goal
    const vacRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Vacation', targetAmount: 50000, targetDate: target, priority: 3 }),
    });
    const vacId = (await vacRes.json()).data.goal.id;

    // Goal health
    const healthRes = await fetch(`${baseUrl}/goals/${laptopId}/health?month=${new Date().toISOString().slice(0, 7)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const healthData = await healthRes.json();
    if (healthRes.status !== 200) throw new Error(`Goal health failed: ${JSON.stringify(healthData)}`);
    const health = healthData.data.health || healthData.data.goalHealth;
    if (health.remainingAmount !== 80000) throw new Error(`Remaining mismatch ${health.remainingAmount}`);
    if (!(health.requiredMonthlySaving > 0)) throw new Error('requiredMonthlySaving missing');

    const listHealthRes = await fetch(`${baseUrl}/goals/health`, { headers: { Authorization: `Bearer ${token}` } });
    if (listHealthRes.status !== 200) throw new Error('List goal health failed');

    // Funding plan
    const planRes = await fetch(`${baseUrl}/goals/funding-plan?availableSurplus=20000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const planData = await planRes.json();
    if (planRes.status !== 200) throw new Error(`Funding plan failed: ${JSON.stringify(planData)}`);
    const plan = planData.data.fundingPlan || planData.data.funding_plan || planData.data.plan;
    if (!plan || !Array.isArray(plan.allocations)) throw new Error('Funding plan missing allocations');
    const efAlloc = plan.allocations.find((a: any) => a.goalName === 'Emergency Fund');
    const laptopAlloc = plan.allocations.find((a: any) => a.goalName === 'MacBook');
    const vacAlloc = plan.allocations.find((a: any) => a.goalName === 'Vacation');
    if (!efAlloc || !laptopAlloc || !vacAlloc) throw new Error('Missing allocations');
    if (efAlloc.allocatedAmount !== efAlloc.requiredAmount) throw new Error('Priority 1 not fully funded');
    if (laptopAlloc.allocatedAmount !== laptopAlloc.requiredAmount) throw new Error('Priority 2 not fully funded');
    if (vacAlloc.shortfall <= 0) throw new Error('Expected vacation shortfall');

    // Update priority/goalType
    const updRes = await fetch(`${baseUrl}/goals/${efId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 2, goalType: 'EMERGENCY_FUND' }),
    });
    const updData = await updRes.json();
    if (updRes.status !== 200) throw new Error(`Goal update failed: ${JSON.stringify(updData)}`);
    if (updData.data.goal.priority !== 2) throw new Error('Priority update failed');

    console.log('=== ALL PHASE 11 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runPhase11Tests().catch((err) => {
  console.error('Phase 11 test execution error:', err);
  process.exit(1);
});