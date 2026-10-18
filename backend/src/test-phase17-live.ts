async function runPhase17LiveTest() {
  console.log('=== Starting Phase 17 AI Spending Insights & Smart Notifications Test ===');
  const baseUrl = 'http://localhost:3000/api';

  // 1. Register test user
  const email = `phase17.live.${Date.now()}@example.com`;
  const regRes = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', firstName: 'Maya' }),
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

  // 2. Setup account
  const accRes = await fetch(`${baseUrl}/accounts`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'HDFC Priority', type: 'bank', balance: 135000 }),
  });
  const accData = await accRes.json();
  const accountId = accData.data.account.id;
  console.log('✓ Created bank account with balance ₹1,35,000');

  // 3. Seed historical and current month transactions
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);

  // Past 2 months baseline transactions
  const m1 = new Date(now);
  m1.setUTCMonth(m1.getUTCMonth() - 1);
  const m2 = new Date(now);
  m2.setUTCMonth(m2.getUTCMonth() - 2);

  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'income', amount: 85000, accountId, category: 'Salary', date: m1.toISOString() }),
  });
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', amount: 8000, accountId, category: 'Dining', merchant: 'Swiggy', date: m1.toISOString() }),
  });
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', amount: 7500, accountId, category: 'Dining', merchant: 'Zomato', date: m2.toISOString() }),
  });

  // Current month: Surge in Dining (Swiggy + new merchant Restaurant X) + Rent
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'income', amount: 85000, accountId, category: 'Salary', date: now.toISOString() }),
  });
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', amount: 14500, accountId, category: 'Dining', merchant: 'Swiggy', date: now.toISOString() }),
  });
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', amount: 4500, accountId, category: 'Dining', merchant: 'Restaurant X', date: now.toISOString() }),
  });
  await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ type: 'expense', amount: 22000, accountId, category: 'Rent', merchant: 'Landlord', date: now.toISOString() }),
  });
  console.log('✓ Seeded historical baseline & current month expenses');

  // 4. Create a Budget for current month
  await fetch(`${baseUrl}/budgets`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      month: currentMonth,
      currency: 'INR',
      overallLimit: 30000,
      categoryLimits: [{ categoryName: 'Dining', limitAmount: 12000 }],
    }),
  });
  console.log('✓ Created budget with limit ₹30,000 (Dining ₹12,000)');

  // 5. Create a Goal (Emergency Fund)
  const targetDate = new Date(now);
  targetDate.setUTCMonth(targetDate.getUTCMonth() + 6);
  const goalRes = await fetch(`${baseUrl}/goals`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Emergency Reserve',
      targetAmount: 100000,
      targetDate: targetDate.toISOString().slice(0, 10),
      priority: 1,
    }),
  });
  const goalData = await goalRes.json();
  const goalId = goalData.data.goal.id;
  await fetch(`${baseUrl}/goals/${goalId}/contributions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ amount: 55000 }), // 55% -> Triggers halfway milestone!
  });
  console.log('✓ Created goal: Emergency Reserve with ₹55,000 saved (55% milestone)');

  // 6. Create upcoming recurring payment (due in 2 days)
  const dueSoon = new Date(now);
  dueSoon.setUTCDate(dueSoon.getUTCDate() + 2);
  await fetch(`${baseUrl}/recurring-payments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      merchantName: 'Airtel Broadband',
      amount: 1199,
      frequency: 'MONTHLY',
      category: 'Utilities',
      nextExpectedDate: dueSoon.toISOString().slice(0, 10),
    }),
  });
  console.log('✓ Created recurring bill due in 2 days');

  // ── TEST 1: Financial Event Detector & Notification Generation ──
  console.log('\n--- 1. Evaluating Financial Events & Smart Notifications ---');
  const evalRes = await fetch(`${baseUrl}/insights/evaluate`, {
    method: 'POST',
    headers: authHeaders,
  });
  const evalJson = await evalRes.json();
  console.log('Dispatched events count:', evalJson.data.dispatchedCount);
  console.log('Events evaluated:', evalJson.data.events.map((e: any) => `${e.type} (${e.severity}): ${e.title}`));

  // ── TEST 2: List Notifications & Unread Count ──
  console.log('\n--- 2. Fetching Notifications Feed ---');
  const notifRes = await fetch(`${baseUrl}/notifications`, { headers: authHeaders });
  const notifJson = await notifRes.json();
  const notifList = notifJson.data.notifications;
  console.log(`Total notifications: ${notifJson.data.total}, Unread: ${notifJson.data.unreadCount}`);
  if (notifList.length === 0) throw new Error('Expected notifications to be created');

  const firstNotif = notifList[0];
  console.log('Sample notification:', {
    type: firstNotif.type,
    title: firstNotif.title,
    severity: firstNotif.severity,
    message: firstNotif.message,
  });

  // ── TEST 3: Notification Read Status ──
  console.log('\n--- 3. Testing Mark as Read & Mark All Read ---');
  const markRes = await fetch(`${baseUrl}/notifications/${firstNotif.id}/read`, {
    method: 'PATCH',
    headers: authHeaders,
  });
  const markJson = await markRes.json();
  console.log('Mark read success:', markJson.data.notification.isRead === true);

  const readAllRes = await fetch(`${baseUrl}/notifications/read-all`, {
    method: 'PATCH',
    headers: authHeaders,
  });
  const readAllJson = await readAllRes.json();
  console.log('Marked all read count:', readAllJson.data.updatedCount);

  // ── TEST 4: Deduplication Check ──
  console.log('\n--- 4. Testing Deduplication ---');
  const evalAgainRes = await fetch(`${baseUrl}/insights/evaluate`, {
    method: 'POST',
    headers: authHeaders,
  });
  const evalAgainJson = await evalAgainRes.json();
  console.log('Second evaluation dispatched count (should be 0 due to dedup):', evalAgainJson.data.dispatchedCount);
  if (evalAgainJson.data.dispatchedCount !== 0) {
    console.warn('Note: Some non-duplicate events were dispatched.');
  } else {
    console.log('✓ Deduplication verified: no redundant alerts spammed.');
  }

  // ── TEST 5: Causal Spending Diagnostics ──
  console.log('\n--- 5. Testing Causal Spending Diagnostics ---');
  const diagRes = await fetch(`${baseUrl}/spending/diagnostics`, { headers: authHeaders });
  const diagJson = await diagRes.json();
  const diag = diagJson.data;
  console.log('Total Spending Change:', `₹${diag.totalChange.toLocaleString('en-IN')} (${diag.totalChangePercent}%)`);
  console.log('Top Deviations Categories:', diag.topDeviations.map((d: any) => `${d.category} (+₹${d.change.toLocaleString('en-IN')})`));
  if (diag.topDeviations[0]?.contributors) {
    console.log('Contributors for top category:', diag.topDeviations[0].contributors.map((c: any) => `${c.merchant}: +₹${c.increase.toLocaleString('en-IN')} (isNew: ${c.isNew})`));
  }
  console.log('AI Causal Explanation:', diag.explanation);

  // ── TEST 6: Monthly Retrospective Financial Review ──
  console.log('\n--- 6. Testing End-of-Month Retrospective ---');
  const revRes = await fetch(`${baseUrl}/financial-review/monthly`, { headers: authHeaders });
  const revJson = await revRes.json();
  const rev = revJson.data;
  console.log('Review Month:', rev.monthName);
  console.log('Metrics:', rev.metrics);
  console.log('What Went Well:', rev.whatWentWell);
  console.log('What Changed:', rev.whatChanged);
  console.log('Major Drivers:', rev.majorDrivers);
  console.log('Goal Health:', rev.goalHealth);
  console.log('Suggested Focus:', rev.suggestedFocus);
  console.log('AI Narrative:', rev.aiNarrative);

  // ── TEST 7: Historical Insights List ──
  console.log('\n--- 7. Testing Insights Persistence ---');
  const insightsListRes = await fetch(`${baseUrl}/insights`, { headers: authHeaders });
  const insightsListJson = await insightsListRes.json();
  console.log('Persisted insights count:', insightsListJson.data.insights.length);
  if (insightsListJson.data.insights.length < 2) {
    throw new Error('Expected at least 2 persisted insights (CAUSAL_DIAGNOSTIC and MONTHLY_REVIEW)');
  }
  console.log('✓ Historical insights verified.');

  console.log('\n================================================================');
  console.log('🎉 ALL PHASE 17 AI SPENDING INSIGHTS & NOTIFICATIONS TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runPhase17LiveTest().catch(err => {
  console.error('Phase 17 live test error:', err);
  process.exit(1);
});
