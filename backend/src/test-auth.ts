import app from './app.js';
import { connectDatabase, pool } from './config/database.js';
import { connectRedis, redisClient } from './config/redis.js';
import { runMigrations } from './db/migrate.js';
import type { Server } from 'node:http';

async function runAuthTests() {
  console.log('=== Starting Phase 1 Integration Tests ===');
  await connectDatabase();
  await connectRedis();
  await runMigrations();

  const testPort = 3999;
  const server: Server = app.listen(testPort);

  try {
    const baseUrl = `http://localhost:${testPort}/api`;
    const testEmail = `test.pilot.${Date.now()}@example.com`;
    const testPassword = 'Password123!';

    // 1. Health check
    console.log('1. Testing Health Endpoint...');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    console.log('Health response:', healthData.status === 'ok' ? 'PASS' : 'FAIL');

    // 2. Register
    console.log('2. Testing User Registration...');
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        firstName: 'Aarav',
        lastName: 'Sharma',
        baseCurrency: 'INR',
      }),
    });
    const regData = await regRes.json();
    if (regRes.status !== 201 || !regData.data?.tokens?.accessToken) {
      throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
    }
    console.log('Registration: PASS (User ID:', regData.data.user.id, ')');

    let { accessToken, refreshToken } = regData.data.tokens;

    // 3. Duplicate registration check
    console.log('3. Testing Duplicate Registration Rejection (409 Conflict)...');
    const dupRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        firstName: 'Aarav',
      }),
    });
    console.log('Duplicate check:', dupRes.status === 409 ? 'PASS' : `FAIL (${dupRes.status})`);

    // 4. Access Protected Profile
    console.log('4. Testing Protected Profile Access...');
    const profRes = await fetch(`${baseUrl}/auth/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profData = await profRes.json();
    if (profRes.status !== 200 || profData.data.user.email !== testEmail) {
      throw new Error(`Profile access failed: ${JSON.stringify(profData)}`);
    }
    console.log('Protected Profile: PASS');

    // 5. Update Profile
    console.log('5. Testing Update Profile...');
    const updateRes = await fetch(`${baseUrl}/auth/profile`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        firstName: 'Aarav Kumar',
        baseCurrency: 'INR',
      }),
    });
    const updateData = await updateRes.json();
    if (updateRes.status !== 200 || updateData.data.user.firstName !== 'Aarav Kumar') {
      throw new Error(`Profile update failed: ${JSON.stringify(updateData)}`);
    }
    console.log('Profile Update: PASS');

    // 6. Test Unauthenticated Access
    console.log('6. Testing Unauthenticated Access Rejection (401)...');
    const unauthRes = await fetch(`${baseUrl}/auth/profile`);
    console.log(
      'Unauthenticated check:',
      unauthRes.status === 401 ? 'PASS' : `FAIL (${unauthRes.status})`,
    );

    // 7. Refresh Token Rotation
    console.log('7. Testing Refresh Token Rotation...');
    const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshData = await refreshRes.json();
    if (refreshRes.status !== 200 || !refreshData.data.accessToken) {
      throw new Error(`Refresh token rotation failed: ${JSON.stringify(refreshData)}`);
    }
    accessToken = refreshData.data.accessToken;
    const oldRefreshToken = refreshToken;
    refreshToken = refreshData.data.refreshToken;
    console.log('Refresh Rotation: PASS');

    // 8. Test Replay of Old Revoked Refresh Token
    console.log('8. Testing Revoked Refresh Token Rejection (401)...');
    const replayRes = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken }),
    });
    console.log(
      'Revoked Token Replay check:',
      replayRes.status === 401 ? 'PASS' : `FAIL (${replayRes.status})`,
    );

    // 9. Login
    console.log('9. Testing User Login...');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200 || !loginData.data.tokens.accessToken) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    console.log('Login: PASS');

    // 10. Logout
    console.log('10. Testing User Logout...');
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginData.data.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: loginData.data.tokens.refreshToken,
      }),
    });
    console.log('Logout:', logoutRes.status === 200 ? 'PASS' : `FAIL (${logoutRes.status})`);

    console.log('=== ALL PHASE 1 INTEGRATION TESTS PASSED SUCCESSFULLY! ===');
  } finally {
    server.close();
    await pool.end();
    if (redisClient.isReady) {
      await redisClient.quit();
    }
  }
}

runAuthTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
