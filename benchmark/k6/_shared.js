import http from 'k6/http';
import { check } from 'k6';

export const SEED_USER_ID = '11111111-1111-4111-8111-111111111111';
export const SEED_MERCHANT_ID = '22222222-2222-4222-8222-222222222222';
export const SEED_WALLET_ID = '33333333-3333-4333-8333-333333333333';

export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function buildRampStages(targetVUs, scaleSteps, stepDuration, cooldownDuration) {
  const stages = [];
  const step = Math.ceil(targetVUs / scaleSteps);
  for (let i = 1; i <= scaleSteps; i++) {
    stages.push({ duration: stepDuration, target: step * i });
  }
  stages.push({ duration: cooldownDuration, target: 0 });
  return stages;
}

export function setupTestEntities(baseUrl, prefix = 'loadtest') {
  const timestamp = Date.now();
  const suffix = `${timestamp}_${Math.random().toString(36).substring(2, 8)}`;

  const userRes = http.post(`${baseUrl}/v1/users`, JSON.stringify({
    email: `${prefix}_${suffix}@k6.io`,
    fullName: `K6 ${prefix} ${Math.floor(Math.random() * 100000)}`,
    status: 'ACTIVE',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(userRes, { 'user created': r => r.status === 200 }) ||
    (() => { throw new Error(`Setup failed: create user (${userRes.status})`); })();
  const userId = userRes.json('id');

  const merchantRes = http.post(`${baseUrl}/v1/merchants`, JSON.stringify({
    name: `K6 ${prefix} Merchant ${timestamp}`,
    apiKey: `k6-${prefix}-${generateUUID()}`,
  }), { headers: { 'Content-Type': 'application/json' } });
  check(merchantRes, { 'merchant created': r => r.status === 200 }) ||
    (() => { throw new Error(`Setup failed: create merchant (${merchantRes.status})`); })();
  const merchantId = merchantRes.json('id');

  const walletRes = http.post(`${baseUrl}/v1/wallets`, JSON.stringify({
    userId: userId,
    balance: 999999.99,
    currency: 'USD',
  }), { headers: { 'Content-Type': 'application/json' } });
  check(walletRes, { 'wallet created': r => r.status === 200 }) ||
    (() => { throw new Error(`Setup failed: create wallet (${walletRes.status})`); })();
  const walletId = walletRes.json('id');

  const topUpRes = http.post(`${baseUrl}/v1/payments/wallets/${walletId}/topup`, JSON.stringify({
    amount: 9999999.99,
  }), { headers: { 'Content-Type': 'application/json' } });
  check(topUpRes, { 'wallet funded': r => r.status === 200 });

  console.log(`SETUP: user=${userId} wallet=${walletId} merchant=${merchantId}`);
  return { userId, merchantId, walletId };
}

export function teardownTestEntities(baseUrl, data) {
  if (!data) return;
  if (data.userId) {
    http.del(`${baseUrl}/v1/users/${data.userId}`);
  }
  if (data.merchantId) {
    http.del(`${baseUrl}/v1/merchants/${data.merchantId}`);
  }
}

export function printScalingBox(title, metrics) {
  const {
    targetVUs = 0, maxVUs = 0, totalReqs = 0, failedReqs = 0,
    avgDuration = 0, p95 = 0, p99 = 0, note = ''
  } = metrics;

  return `
╔══════════════════════════════════════════════════════════╗
║  ${title.padEnd(52)}║
╠══════════════════════════════════════════════════════════╣
║  Target VUs:        ${String(targetVUs).padStart(8)}                       ║
║  Peak VUs:          ${String(maxVUs).padStart(8)}                       ║
║  Total Requests:    ${String(totalReqs).padStart(8)}                       ║
║  Failed Requests:   ${String(failedReqs).padStart(8)}                       ║
║  Avg Duration:      ${(avgDuration * 1000).toFixed(2).padStart(8)} ms                   ║
║  P95 Duration:      ${(p95 * 1000).toFixed(2).padStart(8)} ms                   ║
║  P99 Duration:      ${(p99 * 1000).toFixed(2).padStart(8)} ms                   ║
╠══════════════════════════════════════════════════════════╣
║  GRAFANA:           http://localhost:3002                ║
║  ${note.padEnd(52)}║
╚══════════════════════════════════════════════════════════╝
`;
}
