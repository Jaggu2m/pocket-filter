import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runPhase16Tests() {
  console.log('=== Starting Phase 16 AI Finance Copilot Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3986;
  const server: Server = app.listen(testPort);

  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `copilot.${Date.now()}@example.com`;

    // 1. Register test user
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'CopilotTester' }),
    });
    const regData = await regRes.json();
    if (!regData?.data?.tokens?.accessToken) {
      throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
    }
    const token = regData.data.tokens.accessToken;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // 2. Setup account
    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'HDFC Savings', type: 'bank', balance: 150000 }),
    });
    const accData = await accRes.json();
    const accountId = accData.data.account.id;

    // 3. Add transactions
    const now = new Date();
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ type: 'income', amount: 80000, accountId, category: 'Salary', date: now.toISOString() }),
    });
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ type: 'expense', amount: 12000, accountId, category: 'Food & Dining', description: 'Groceries & Dining', date: now.toISOString() }),
    });
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ type: 'expense', amount: 25000, accountId, category: 'Rent', description: 'Monthly Apartment Rent', date: now.toISOString() }),
    });

    // 4. Create goal
    const target = new Date(now);
    target.setUTCMonth(target.getUTCMonth() + 10);
    const goalRes = await fetch(`${baseUrl}/goals`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Emergency Fund', targetAmount: 100000, targetDate: target.toISOString().slice(0, 10), priority: 1 }),
    });
    const goalData = await goalRes.json();
    const goalId = goalData.data.goal.id;
    await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ amount: 30000 }),
    });

    console.log('✓ Test user & financial setup completed.');

    // ── Test 1: Balance Query ──
    console.log('\n--- Test 1: Account Balance Query ---');
    const balRes = await fetch(`${baseUrl}/copilot/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'How much money do I have?' }),
    });
    const balJson = await balRes.json();
    if (!balRes.ok || balJson.status !== 'success') {
      throw new Error(`Balance query failed: ${JSON.stringify(balJson)}`);
    }
    console.log('Intent detected:', balJson.data.intent);
    console.log('Copilot response:', balJson.data.message);
    const conversationId = balJson.data.conversationId;
    if (!conversationId) throw new Error('Expected conversationId in response');
    console.log('✓ Account Balance query passed.');

    // ── Test 2: Transaction Query in same conversation ──
    console.log('\n--- Test 2: Transaction Query (Food spending) ---');
    const txRes = await fetch(`${baseUrl}/copilot/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'How much did I spend on food this month?', conversationId }),
    });
    const txJson = await txRes.json();
    if (!txRes.ok || txJson.status !== 'success') {
      throw new Error(`Transaction query failed: ${JSON.stringify(txJson)}`);
    }
    console.log('Intent detected:', txJson.data.intent);
    console.log('Copilot response:', txJson.data.message);
    console.log('✓ Transaction query passed.');

    // ── Test 3: Purchase Simulation ──
    console.log('\n--- Test 3: Purchase Simulation ---');
    const simRes = await fetch(`${baseUrl}/copilot/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'Can I buy a ₹40,000 phone next month?', conversationId }),
    });
    const simJson = await simRes.json();
    if (!simRes.ok || simJson.status !== 'success') {
      throw new Error(`Simulation query failed: ${JSON.stringify(simJson)}`);
    }
    console.log('Intent detected:', simJson.data.intent);
    console.log('Decision status:', simJson.data.decision);
    console.log('Copilot response:', simJson.data.message);
    if (simJson.data.tradeoffs) console.log('Tradeoffs:', simJson.data.tradeoffs);
    console.log('✓ Purchase simulation passed.');

    // ── Test 4: Goal Progress ──
    console.log('\n--- Test 4: Goal Progress ---');
    const goalQueryRes = await fetch(`${baseUrl}/copilot/chat`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ message: 'Am I on track with my emergency fund?', conversationId }),
    });
    const goalQueryJson = await goalQueryRes.json();
    if (!goalQueryRes.ok || goalQueryJson.status !== 'success') {
      throw new Error(`Goal progress query failed: ${JSON.stringify(goalQueryJson)}`);
    }
    console.log('Intent detected:', goalQueryJson.data.intent);
    console.log('Copilot response:', goalQueryJson.data.message);
    console.log('✓ Goal progress passed.');

    // ── Test 5: List Conversations ──
    console.log('\n--- Test 5: Conversation Management ---');
    const listRes = await fetch(`${baseUrl}/copilot/conversations`, {
      headers: authHeaders,
    });
    const listJson = await listRes.json();
    if (!listRes.ok || listJson.status !== 'success') {
      throw new Error(`List conversations failed: ${JSON.stringify(listJson)}`);
    }
    console.log(`Conversations found: ${listJson.data.conversations.length}`);
    if (listJson.data.conversations.length === 0) {
      throw new Error('Expected at least 1 conversation');
    }

    // ── Test 6: Get Conversation Detail ──
    const getRes = await fetch(`${baseUrl}/copilot/conversations/${conversationId}`, {
      headers: authHeaders,
    });
    const getJson = await getRes.json();
    if (!getRes.ok || getJson.status !== 'success') {
      throw new Error(`Get conversation failed: ${JSON.stringify(getJson)}`);
    }
    console.log(`Messages in conversation: ${getJson.data.messages.length}`);
    if (getJson.data.messages.length < 8) {
      // 4 queries * 2 (user + assistant) = 8 messages
      throw new Error(`Expected at least 8 messages, got ${getJson.data.messages.length}`);
    }

    // ── Test 7: Delete Conversation ──
    const delRes = await fetch(`${baseUrl}/copilot/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const delJson = await delRes.json();
    if (!delRes.ok || delJson.status !== 'success') {
      throw new Error(`Delete conversation failed: ${JSON.stringify(delJson)}`);
    }
    console.log('✓ Conversation deleted successfully.');

    console.log('\n======================================================');
    console.log('🎉 ALL PHASE 16 AI FINANCE COPILOT TESTS PASSED! 🎉');
    console.log('======================================================\n');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  }
}

runPhase16Tests().catch((err) => {
  console.error('Phase 16 tests failed:', err);
  process.exit(1);
});
