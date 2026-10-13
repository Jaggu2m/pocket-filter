import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runAccountTests() {
  console.log('=== Starting Phase 2 Financial Accounts Integration Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3998;
  const server: Server = app.listen(testPort);

  try {
    const baseUrl = `http://localhost:${testPort}/api`;

    // 1. Register User A
    const userAEmail = `phase2.usera.${Date.now()}@example.com`;
    const regResA = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password: 'Password123!',
        firstName: 'Ananya',
        lastName: 'Verma',
        baseCurrency: 'INR',
      }),
    });
    const regDataA = await regResA.json();
    const tokenA = regDataA.data.tokens.accessToken;

    // 2. Register User B (for isolation testing)
    const userBEmail = `phase2.userb.${Date.now()}@example.com`;
    const regResB = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userBEmail,
        password: 'Password123!',
        firstName: 'Rohan',
        lastName: 'Mehta',
      }),
    });
    const regDataB = await regResB.json();
    const tokenB = regDataB.data.tokens.accessToken;

    // TEST 1: ACCOUNTS ARE NON-MANDATORY
    console.log('1. Verifying accounts are NOT mandatory (empty state handling)...');
    const emptyListRes = await fetch(`${baseUrl}/accounts`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const emptyListData = await emptyListRes.json();
    if (emptyListRes.status !== 200 || emptyListData.data.accounts.length !== 0) {
      throw new Error(`Expected 0 accounts for new user: ${JSON.stringify(emptyListData)}`);
    }

    const emptySummaryRes = await fetch(`${baseUrl}/accounts/summary`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const emptySummaryData = await emptySummaryRes.json();
    if (
      emptySummaryRes.status !== 200 ||
      emptySummaryData.data.summary.totalAccounts !== 0 ||
      emptySummaryData.data.summary.netWorth !== 0
    ) {
      throw new Error(
        `Expected zero summary for user with 0 accounts: ${JSON.stringify(emptySummaryData)}`,
      );
    }
    console.log('Zero accounts handling (Non-mandatory): PASS');

    // TEST 2: Add Bank Account
    console.log('2. Adding Bank Account...');
    const bankRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'HDFC Salary Account',
        type: 'bank',
        institutionName: 'HDFC Bank',
        accountNumberLast4: '4321',
        balance: 50000,
        isDefault: true,
      }),
    });
    const bankData = await bankRes.json();
    if (bankRes.status !== 201 || !bankData.data.account.id) {
      throw new Error(`Bank account creation failed: ${JSON.stringify(bankData)}`);
    }
    const bankId = bankData.data.account.id;
    console.log('Bank account added: PASS (ID:', bankId, ')');

    // TEST 3: Add Credit Card
    console.log('3. Adding Credit Card Account...');
    const ccRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Amazon Pay ICICI Card',
        type: 'credit_card',
        institutionName: 'ICICI Bank',
        accountNumberLast4: '9876',
        balance: 12000,
        creditLimit: 150000,
      }),
    });
    const ccData = await ccRes.json();
    if (ccRes.status !== 201 || ccData.data.account.creditLimit !== 150000) {
      throw new Error(`Credit card creation failed: ${JSON.stringify(ccData)}`);
    }
    const ccId = ccData.data.account.id;
    console.log('Credit Card added: PASS');

    // TEST 4: Add Cash Account & UPI Wallet
    console.log('4. Adding Cash & UPI Accounts...');
    const cashRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Pocket Cash',
        type: 'cash',
        balance: 3500,
      }),
    });
    if (cashRes.status !== 201) throw new Error('Cash account failed');

    const upiRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Google Pay UPI',
        type: 'upi_wallet',
        balance: 500,
      }),
    });
    if (upiRes.status !== 201) throw new Error('UPI wallet account failed');
    console.log('Cash & UPI accounts added: PASS');

    // TEST 5: Verify Aggregated Financial Summary
    console.log('5. Testing Account Summary Calculations...');
    const summaryRes = await fetch(`${baseUrl}/accounts/summary`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const summaryData = await summaryRes.json();
    const sum = summaryData.data.summary;
    // Liquid = 50000 (bank) + 3500 (cash) + 500 (upi) = 54000
    // Credit Debt = 12000
    // Net Worth = 54000 - 12000 = 42000
    if (
      sum.totalLiquidBalance !== 54000 ||
      sum.totalCreditDebt !== 12000 ||
      sum.netWorth !== 42000 ||
      sum.totalAccounts !== 4
    ) {
      throw new Error(`Financial summary calculation mismatch: ${JSON.stringify(sum)}`);
    }
    console.log('Summary calculation (Liquid: ₹54,000, Debt: ₹12,000, Net Worth: ₹42,000): PASS');

    // TEST 6: Filter by Type
    console.log('6. Testing Filter Accounts by Type...');
    const filterRes = await fetch(`${baseUrl}/accounts?type=credit_card`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const filterData = await filterRes.json();
    if (filterData.data.accounts.length !== 1 || filterData.data.accounts[0].id !== ccId) {
      throw new Error(`Filter by type failed: ${JSON.stringify(filterData)}`);
    }
    console.log('Filter by type: PASS');

    // TEST 7: Update Account
    console.log('7. Testing Update Account...');
    const updateRes = await fetch(`${baseUrl}/accounts/${bankId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'HDFC Premium Salary Account',
        balance: 55000,
      }),
    });
    const updateData = await updateRes.json();
    if (updateRes.status !== 200 || updateData.data.account.balance !== 55000) {
      throw new Error(`Update account failed: ${JSON.stringify(updateData)}`);
    }
    console.log('Update account: PASS');

    // TEST 8: Soft Archive Account
    console.log('8. Testing Archive Account...');
    const archiveRes = await fetch(`${baseUrl}/accounts/${ccId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (archiveRes.status !== 200) throw new Error('Archive account failed');

    const activeListRes = await fetch(`${baseUrl}/accounts`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const activeListData = await activeListRes.json();
    const hasArchived = activeListData.data.accounts.some((a: { id: string }) => a.id === ccId);
    if (hasArchived) throw new Error('Archived account was found in active accounts list');
    console.log('Archive account: PASS');

    // TEST 9: Cross-User Security Isolation
    console.log('9. Testing Cross-User Security Isolation (User B accessing User A account)...');
    const unauthorizedAccessRes = await fetch(`${baseUrl}/accounts/${bankId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (unauthorizedAccessRes.status !== 404) {
      throw new Error(
        `Security breach: User B accessed User A account with status ${unauthorizedAccessRes.status}`,
      );
    }
    console.log('Cross-user isolation: PASS (404 Not Found for non-owner)');

    // TEST 10: Delete Account
    console.log('10. Testing Delete Account...');
    const deleteRes = await fetch(`${baseUrl}/accounts/${bankId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (deleteRes.status !== 200) throw new Error('Delete account failed');

    const verifyDeleteRes = await fetch(`${baseUrl}/accounts/${bankId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (verifyDeleteRes.status !== 404) throw new Error('Account still exists after deletion');
    console.log('Delete account: PASS');

    console.log('=== ALL PHASE 2 FINANCIAL ACCOUNT TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) {
      await redisClient.quit();
    }
  }
}

runAccountTests().catch((err) => {
  console.error('Phase 2 test execution error:', err);
  process.exit(1);
});
