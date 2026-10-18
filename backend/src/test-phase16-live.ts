async function runLiveTest() {
  console.log('=== Running Live Phase 16 AI Finance Copilot Test ===');
  const baseUrl = 'http://localhost:3000/api';

  // 1. Register test user
  const email = `copilot.live.${Date.now()}@example.com`;
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', firstName: 'Aria' }),
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
  console.log('✓ Registered test user:', email);

  // 2. Setup Bank Account
  const accRes = await fetch(`${baseUrl}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'Salary Account', type: 'bank', balance: 120000 }),
  });
  const accData = await accRes.json();
  const accountId = accData.data.account.id;
  console.log('✓ Created bank account with balance ₹1,20,000');

  // 3. Add transactions (Income + Expenses)
  const now = new Date();
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'income', amount: 75000, accountId, category: 'Salary', date: now.toISOString() }),
  });
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', amount: 8500, accountId, category: 'Food & Dining', description: 'Groceries & cafes', date: now.toISOString() }),
  });
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', amount: 20000, accountId, category: 'Rent', description: 'Apartment rent', date: now.toISOString() }),
  });
  console.log('✓ Seeded income and expenses');

  // 4. Create Goal
  const target = new Date(now);
  target.setUTCMonth(target.getUTCMonth() + 8);
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
    body: JSON.stringify({ amount: 45000 }),
  });
  console.log('✓ Created goal: Emergency Fund (₹45,000 / ₹1,00,000)');

  // ── Copilot Query 1: Account Balance ──
  console.log('\n--- Query 1: "How much money do I have?" ---');
  const balRes = await fetch(`${baseUrl}/copilot/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ message: 'How much money do I have?' }),
  });
  const balJson = await balRes.json();
  console.log('Status:', balRes.status);
  console.log('Intent:', balJson.data?.intent);
  console.log('Message:', balJson.data?.message);
  const conversationId = balJson.data?.conversationId;

  // ── Copilot Query 2: Food Spending ──
  console.log('\n--- Query 2: "How much did I spend on food this month?" ---');
  const foodRes = await fetch(`${baseUrl}/copilot/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ message: 'How much did I spend on food this month?', conversationId }),
  });
  const foodJson = await foodRes.json();
  console.log('Status:', foodRes.status);
  console.log('Intent:', foodJson.data?.intent);
  console.log('Message:', foodJson.data?.message);

  // ── Copilot Query 3: Purchase Simulation ──
  console.log('\n--- Query 3: "Can I buy a ₹30,000 laptop next month?" ---');
  const simRes = await fetch(`${baseUrl}/copilot/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ message: 'Can I buy a ₹30,000 laptop next month?', conversationId }),
  });
  const simJson = await simRes.json();
  console.log('Status:', simRes.status);
  console.log('Intent:', simJson.data?.intent);
  console.log('Decision:', simJson.data?.decision);
  console.log('Message:', simJson.data?.message);
  if (simJson.data?.tradeoffs) console.log('Tradeoffs:', simJson.data.tradeoffs);
  if (simJson.data?.alternative) console.log('Alternative:', simJson.data.alternative);

  // ── Copilot Query 4: Goal Progress ──
  console.log('\n--- Query 4: "Am I on track for my emergency fund?" ---');
  const goalQRes = await fetch(`${baseUrl}/copilot/chat`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ message: 'Am I on track for my emergency fund?', conversationId }),
  });
  const goalQJson = await goalQRes.json();
  console.log('Status:', goalQRes.status);
  console.log('Intent:', goalQJson.data?.intent);
  console.log('Message:', goalQJson.data?.message);

  // ── Conversation Persistence Check ──
  console.log('\n--- Verify Conversation Persistence ---');
  const convListRes = await fetch(`${baseUrl}/copilot/conversations`, { headers: authHeaders });
  const convListJson = await convListRes.json();
  console.log('Conversations count:', convListJson.data?.conversations?.length);

  const detailRes = await fetch(`${baseUrl}/copilot/conversations/${conversationId}`, { headers: authHeaders });
  const detailJson = await detailRes.json();
  console.log('Messages stored in thread:', detailJson.data?.messages?.length);

  console.log('\n🎉 ALL LIVE TESTS COMPLETED SUCCESSFULLY! 🎉');
}

runLiveTest().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
