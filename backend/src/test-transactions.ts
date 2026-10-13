import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runTransactionTests() {
  console.log('=== Starting Phase 3 Transaction Management Integration Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3997;
  const server: Server = app.listen(testPort);

  try {
    const baseUrl = `http://localhost:${testPort}/api`;

    // 1. Register User A
    const userAEmail = `phase3.usera.${Date.now()}@example.com`;
    const regResA = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userAEmail,
        password: 'Password123!',
        firstName: 'Vikram',
        lastName: 'Rathore',
      }),
    });
    const regDataA = await regResA.json();
    const tokenA = regDataA.data.tokens.accessToken;

    // 2. Register User B (for isolation tests)
    const userBEmail = `phase3.userb.${Date.now()}@example.com`;
    const regResB = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userBEmail,
        password: 'Password123!',
        firstName: 'Sneha',
      }),
    });
    const regDataB = await regResB.json();
    const tokenB = regDataB.data.tokens.accessToken;

    // TEST 1: Unlinked Transaction (No account required!)
    console.log('1. Testing Unlinked Expense Transaction (Zero accounts required)...');
    const unlinkedRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'expense',
        amount: 350,
        category: 'Food & Dining',
        merchant: 'Swiggy',
        description: 'Dinner delivery',
        tags: ['food', 'weekend'],
      }),
    });
    const unlinkedData = await unlinkedRes.json();
    if (unlinkedRes.status !== 201 || unlinkedData.data.transaction.accountId !== null) {
      throw new Error(`Unlinked transaction failed: ${JSON.stringify(unlinkedData)}`);
    }
    const unlinkedId = unlinkedData.data.transaction.id;
    console.log('Unlinked transaction: PASS (ID:', unlinkedId, ')');

    // TEST 2: Create Accounts for User A
    console.log('2. Setting up Bank and Cash accounts for balance synchronization testing...');
    const bankRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'SBI Checking',
        type: 'bank',
        balance: 10000,
      }),
    });
    const bankData = await bankRes.json();
    const bankId = bankData.data.account.id;

    const cashRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Physical Cash',
        type: 'cash',
        balance: 500,
      }),
    });
    const cashData = await cashRes.json();
    const cashId = cashData.data.account.id;
    console.log('Accounts setup: PASS (Bank: ₹10,000, Cash: ₹500)');

    // TEST 3: Linked Expense & Income Balance Sync
    console.log('3. Testing Linked Expense & Income with automatic balance synchronization...');
    // Expense ₹1,500 from bank
    const expenseRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'expense',
        amount: 1500,
        accountId: bankId,
        category: 'Shopping',
        merchant: 'Amazon',
      }),
    });
    const expenseData = await expenseRes.json();
    const expenseId = expenseData.data.transaction.id;
    if (expenseRes.status !== 201) throw new Error('Expense transaction failed');

    // Income ₹5,000 into bank
    const incomeRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'income',
        amount: 5000,
        accountId: bankId,
        category: 'Salary',
        merchant: 'Employer',
      }),
    });
    if (incomeRes.status !== 201) throw new Error('Income transaction failed');

    // Check Bank balance: 10000 - 1500 + 5000 = 13500
    const checkBankRes = await fetch(`${baseUrl}/accounts/${bankId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const checkBankData = await checkBankRes.json();
    if (checkBankData.data.account.balance !== 13500) {
      throw new Error(`Expected Bank balance ₹13,500, got: ${checkBankData.data.account.balance}`);
    }
    console.log('Linked Expense & Income Balance Sync: PASS (Bank balance updated to ₹13,500)');

    // TEST 4: Transfer Between Accounts
    console.log('4. Testing Inter-Account Transfer (Bank -> Cash ₹1,000)...');
    const transferRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'transfer',
        amount: 1000,
        accountId: bankId,
        toAccountId: cashId,
        description: 'ATM Cash Withdrawal',
      }),
    });
    if (transferRes.status !== 201) throw new Error('Transfer transaction failed');

    // Verify balances: Bank 13500 - 1000 = 12500, Cash 500 + 1000 = 1500
    const bankAfterTransfer = await (
      await fetch(`${baseUrl}/accounts/${bankId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json();
    const cashAfterTransfer = await (
      await fetch(`${baseUrl}/accounts/${cashId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json();

    if (
      bankAfterTransfer.data.account.balance !== 12500 ||
      cashAfterTransfer.data.account.balance !== 1500
    ) {
      throw new Error(
        `Transfer balance mismatch. Bank: ${bankAfterTransfer.data.account.balance}, Cash: ${cashAfterTransfer.data.account.balance}`,
      );
    }
    console.log('Inter-account Transfer: PASS (Bank: ₹12,500, Cash: ₹1,500)');

    // TEST 5: Update Transaction with Balance Reversal
    console.log('5. Testing Transaction Update with automatic balance delta adjustments...');
    // Change expense from 1500 to 2000
    const updateRes = await fetch(`${baseUrl}/transactions/${expenseId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: 2000,
        description: 'Amazon Prime Day purchase',
      }),
    });
    if (updateRes.status !== 200) throw new Error('Transaction update failed');

    // Bank was 12500 with 1500 expense. Now with 2000 expense, Bank should be 12000.
    const bankAfterUpdate = await (
      await fetch(`${baseUrl}/accounts/${bankId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json();
    if (bankAfterUpdate.data.account.balance !== 12000) {
      throw new Error(
        `Expected Bank balance ₹12,000 after update, got: ${bankAfterUpdate.data.account.balance}`,
      );
    }
    console.log('Transaction Update Balance Adjustment: PASS (Bank updated to ₹12,000)');

    // TEST 6: Delete Transaction with Balance Reversal
    console.log('6. Testing Transaction Delete with balance reversal...');
    const deleteRes = await fetch(`${baseUrl}/transactions/${expenseId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    if (deleteRes.status !== 200) throw new Error('Transaction delete failed');

    // Reversing 2000 expense should restore Bank balance to 14000
    const bankAfterDelete = await (
      await fetch(`${baseUrl}/accounts/${bankId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      })
    ).json();
    if (bankAfterDelete.data.account.balance !== 14000) {
      throw new Error(
        `Expected Bank balance ₹14,000 after delete, got: ${bankAfterDelete.data.account.balance}`,
      );
    }
    console.log('Transaction Delete Balance Reversal: PASS (Bank restored to ₹14,000)');

    // TEST 7: Search, Filter, Sort & Pagination
    console.log('7. Testing Search, Filtering, Sorting and Pagination...');
    // Search by merchant 'Swiggy'
    const searchRes = await fetch(`${baseUrl}/transactions?search=Swiggy`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const searchData = await searchRes.json();
    if (
      searchData.data.transactions.length !== 1 ||
      searchData.data.transactions[0].merchant !== 'Swiggy'
    ) {
      throw new Error(`Search by merchant failed: ${JSON.stringify(searchData)}`);
    }

    // Filter by type 'income'
    const incomeFilterRes = await fetch(`${baseUrl}/transactions?type=income`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const incomeFilterData = await incomeFilterRes.json();
    if (
      incomeFilterData.data.transactions.length !== 1 ||
      incomeFilterData.data.transactions[0].amount !== 5000
    ) {
      throw new Error(`Filter by type failed: ${JSON.stringify(incomeFilterData)}`);
    }

    // Pagination limit=1
    const pageRes = await fetch(`${baseUrl}/transactions?limit=1&offset=0`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const pageData = await pageRes.json();
    if (pageData.data.transactions.length !== 1 || pageData.data.total < 3) {
      throw new Error(`Pagination failed: ${JSON.stringify(pageData)}`);
    }
    console.log('Search, Filter & Pagination: PASS');

    // TEST 8: Cross-User Security Isolation
    console.log('8. Testing Cross-User Tenant Isolation & Invalid Ownership...');
    // User B tries to spend from User A's bank account
    const invalidAccountRes = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'expense',
        amount: 200,
        accountId: bankId, // belongs to User A!
        category: 'Fraud',
      }),
    });
    if (invalidAccountRes.status !== 404) {
      throw new Error(
        `Security breach: User B used User A account! Status: ${invalidAccountRes.status}`,
      );
    }

    // User B tries to view User A's transaction
    const unauthViewRes = await fetch(`${baseUrl}/transactions/${unlinkedId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (unauthViewRes.status !== 404) {
      throw new Error(
        `Security breach: User B viewed User A transaction! Status: ${unauthViewRes.status}`,
      );
    }
    console.log('Cross-User Security Isolation: PASS (404 Not Found for non-owners)');

    console.log('=== ALL PHASE 3 TRANSACTION TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) {
      await redisClient.quit();
    }
  }
}

runTransactionTests().catch((err) => {
  console.error('Phase 3 test execution error:', err);
  process.exit(1);
});
