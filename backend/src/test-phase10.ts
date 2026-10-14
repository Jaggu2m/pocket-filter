import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runPhase10Tests() {
  console.log('=== Starting Phase 10 Forecasting & Anomaly Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3988;
  const server: Server = app.listen(testPort);
  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const email = `phase10.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', firstName: 'Phase10' }),
    });
    const token = (await regRes.json()).data.tokens.accessToken;

    const accRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bank', type: 'bank', balance: 100000 }),
    });
    const accountId = (await accRes.json()).data.account.id;

    // Budget and current spending
    await fetch(`${baseUrl}/budgets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: new Date().toISOString().slice(0, 7), overallLimit: 40000, currency: 'INR', categoryLimits: [] }),
    });

    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 10000, accountId, category: 'Food & Dining', merchant: 'Swiggy', date: new Date().toISOString() }),
    });

    const forecastRes = await fetch(`${baseUrl}/forecast/month-end`, { headers: { Authorization: `Bearer ${token}` } });
    const forecastData = await forecastRes.json();
    if (forecastRes.status !== 200) throw new Error(`Forecast failed: ${JSON.stringify(forecastData)}`);
    const forecast = forecastData.data.forecast;
    if (!forecast || typeof forecast.projectedExpenses !== 'number') throw new Error('Forecast payload invalid');
    if (!['HIGH', 'MEDIUM', 'LOW'].includes(forecast.confidence)) throw new Error('Invalid forecast confidence');

    // Duplicate transactions
    const now = new Date();
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 2999, accountId, category: 'Shopping', merchant: 'Amazon', description: 'Amazon order', date: now.toISOString() }),
    });
    const twoMinLater = new Date(now.getTime() + 2 * 60000);
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 2999, accountId, category: 'Shopping', merchant: 'Amazon', description: 'Amazon order', date: twoMinLater.toISOString() }),
    });

    const anomalyRes = await fetch(`${baseUrl}/anomalies`, { headers: { Authorization: `Bearer ${token}` } });
    const anomalyData = await anomalyRes.json();
    if (anomalyRes.status !== 200) throw new Error(`Anomaly failed: ${JSON.stringify(anomalyData)}`);
    const anomalies = anomalyData.data.anomalies;
    if (!Array.isArray(anomalies)) throw new Error('Anomalies payload invalid');
    const duplicate = anomalies.find((a: any) => a.type === 'POSSIBLE_DUPLICATE');
    if (!duplicate) throw new Error('Duplicate anomaly not detected');

    // AI endpoints (fallback or LLM)
    const forecastAiRes = await fetch(`${baseUrl}/ai/explain/forecast`, { headers: { Authorization: `Bearer ${token}` } });
    if (forecastAiRes.status !== 200) throw new Error('Forecast AI endpoint failed');
    const anomalyAiRes = await fetch(`${baseUrl}/ai/explain/anomalies`, { headers: { Authorization: `Bearer ${token}` } });
    if (anomalyAiRes.status !== 200) throw new Error('Anomaly AI endpoint failed');

    console.log('=== ALL PHASE 10 TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) await redisClient.quit();
  }
}

runPhase10Tests().catch((err) => {
  console.error('Phase 10 test execution error:', err);
  process.exit(1);
});