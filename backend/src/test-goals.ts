import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runGoalTests() {
  console.log('=== Starting Phase 8 Goal Management Integration Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3991;
  const server: Server = app.listen(testPort);
  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `phase8.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Goal' }),
    });
    const regData = await regRes.json();
    const token = regData.data.tokens.accessToken;

    // Account
    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Savings', type: 'bank', balance: 10000 }),
    });
    const accData = await accRes.json();
    const accountId = accData.data.account.id;

    // Create goal
    const createRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Headphones',
        targetAmount: 8000,
        targetDate: '2026-12-31',
        accountId,
      }),
    });
    const createData = await createRes.json();
    if (createRes.status !== 201) throw new Error(`Goal create failed: ${JSON.stringify(createData)}`);
    const goalId = createData.data.goal.id;
    const initialStatus = createData.data.goal.status;
    if (initialStatus !== 'active') throw new Error(`Expected active got ${initialStatus}`);

    // Add contribution 5000
    const contribRes = await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 5000, accountId, note: 'Initial saving' }),
    });
    const contribData = await contribRes.json();
    if (contribRes.status !== 201) throw new Error(`Contribution failed: ${JSON.stringify(contribData)}`);
    const contributionId = contribData.data.contribution.id;

    // Get goal: saved 5000, progress 62.5, remaining 3000
    const goalRes = await fetch(`${baseUrl}/goals/${goalId}`, { headers: { Authorization: `Bearer ${token}` } });
    const goalData = await goalRes.json();
    const goal = goalData.data.goal;
    if (goal.savedAmount !== 5000) throw new Error(`Expected saved 5000 got ${goal.savedAmount}`);
    if (goal.targetAmount !== 8000) throw new Error('target amount mismatch');
    if (goal.status !== 'active') throw new Error(`Expected active got ${goal.status}`);

    // Funding history
    const histRes = await fetch(`${baseUrl}/goals/${goalId}/contributions`, { headers: { Authorization: `Bearer ${token}` } });
    const histData = await histRes.json();
    if (!Array.isArray(histData.data.contributions) || histData.data.contributions.length !== 1) {
      throw new Error('Funding history mismatch');
    }

    // Saving plan
    const planRes = await fetch(`${baseUrl}/goals/${goalId}/saving-plan`, { headers: { Authorization: `Bearer ${token}` } });
    const planData = await planRes.json();
    if (planRes.status !== 200) throw new Error(`Saving plan failed: ${JSON.stringify(planData)}`);
    const plan = planData.data.savingPlan || planData.data.saving_plan || planData.data.plan;
    if (plan.remainingAmount !== 3000) throw new Error(`Expected remaining 3000 got ${plan.remainingAmount}`);
    if (!(plan.requiredPerMonth > 0)) throw new Error('requiredPerMonth should be >0');

    // Linked account balance should be unchanged (virtual allocation)
    const accAfterRes = await fetch(`${baseUrl}/accounts/${accountId}`, { headers: { Authorization: `Bearer ${token}` } });
    const accAfterData = await accAfterRes.json();
    if (accAfterData.data.account.balance !== 10000) throw new Error('Account balance changed unexpectedly');

    // Update goal
    const updRes = await fetch(`${baseUrl}/goals/${goalId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Headphones Pro', targetAmount: 5000 }),
    });
    const updData = await updRes.json();
    if (updRes.status !== 200) throw new Error(`Update failed: ${JSON.stringify(updData)}`);
    if (updData.data.goal.name !== 'Headphones Pro') throw new Error('Goal update name mismatch');
    if (updData.data.goal.status !== 'completed') throw new Error('Goal should be completed after lowering target');

    // Reverse contribution
    const revRes = await fetch(`${baseUrl}/goals/${goalId}/contributions/${contributionId}/reversal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 5000, note: 'Undo' }),
    });
    const revData = await revRes.json();
    if (revRes.status !== 201) throw new Error(`Reversal failed: ${JSON.stringify(revData)}`);

    const afterRevRes = await fetch(`${baseUrl}/goals/${goalId}`, { headers: { Authorization: `Bearer ${token}` } });
    const afterRevData = await afterRevRes.json();
    if (afterRevData.data.goal.savedAmount !== 0) throw new Error(`Expected saved 0 after reversal got ${afterRevData.data.goal.savedAmount}`);

    // Reversing again should fail 409
    const rev2Res = await fetch(`${baseUrl}/goals/${goalId}/contributions/${contributionId}/reversal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000 }),
    });
    if (rev2Res.status !== 409) throw new Error(`Expected second reversal to fail 409 got ${rev2Res.status}`);

    // Delete goal
    const delRes = await fetch(`${baseUrl}/goals/${goalId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (delRes.status !== 200) throw new Error(`Delete failed: ${delRes.status}`);

    const missingRes = await fetch(`${baseUrl}/goals/${goalId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (missingRes.status !== 404) throw new Error(`Expected 404 after delete got ${missingRes.status}`);

    // v1 alias
    // (skip further)

    console.log('=== ALL PHASE 8 GOAL TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runGoalTests().catch((err) => {
  console.error('Phase 8 test execution error:', err);
  process.exit(1);
});