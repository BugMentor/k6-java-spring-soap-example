import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Gauge } from 'k6/metrics';
import {
  setupTestEntities,
  teardownTestEntities,
  buildRampStages,
  printScalingBox,
} from './_shared.js';

const errorRate = new Rate('scaling_errors');
const combinedLatency = new Trend('scaling_combined_duration', true);
const activeVUs = new Gauge('scaling_active_vus');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const TARGET_VUS = parseInt(__ENV.TARGET_VUS) || 300;
const SCALE_STEPS = parseInt(__ENV.SCALE_STEPS) || 8;
const STEP_DURATION = __ENV.STEP_DURATION || '2m';
const COOLDOWN_DURATION = __ENV.COOLDOWN_DURATION || '3m';

let vusReached = 0;

export const options = {
  stages: buildRampStages(TARGET_VUS, SCALE_STEPS, STEP_DURATION, COOLDOWN_DURATION),
  thresholds: {
    'http_req_duration': ['p(95)<8000'],
    'scaling_errors': ['rate<0.15'],
    'http_req_failed': ['rate<0.15'],
  },
  noConnectionReuse: false,
  batchPerHost: 8,
};

export function setup() {
  const data = setupTestEntities(BASE_URL, 'combined');
  console.log(`COMBINED STRESS: VUs=${TARGET_VUS} Steps=${SCALE_STEPS}`);
  console.log(`BOTH CPU > 80% AND MEM > 60% should trigger simultaneously`);
  return data;
}

export default function(data) {
  const { userId, merchantId, walletId } = data;
  activeVUs.add(__VU);
  if (__VU > vusReached) vusReached = __VU;

  const scenario = __ITER % 12;

  switch (scenario) {
    case 0: case 1:
      cpuOp(walletId, merchantId);
      break;
    case 2:
      memOp(userId, merchantId, walletId);
      break;
    case 3: case 4:
      cpuBatchOp(userId, merchantId);
      break;
    case 5:
      memHoldOp(walletId, merchantId);
      break;
    case 6: case 7:
      cpuSearchOp();
      break;
    case 8:
      cpuReportOp();
      break;
    case 9:
      cpuSoapOp(userId, merchantId);
      break;
    case 10:
      memLargeListOp(userId);
      break;
    case 11:
      memTopUpOp(walletId);
      break;
  }

  if (__ITER % 200 === 0) {
    console.log(`[BOTH VU ${__VU}] iter=${__ITER} peak=${vusReached} pressure=${((__VU/TARGET_VUS)*100).toFixed(0)}%`);
  }
}

function cpuOp(walletId, merchantId) {
  const amount = (Math.random() * 5 + 1).toFixed(2);
  const payloads = [
    { m: 'POST', u: `${BASE_URL}/v1/payments/wallet-transfer`, b: JSON.stringify({ walletId, merchantId, amount: parseFloat(amount) }), p: { h: { 'Content-Type': 'application/json' }, t: { name: 'combined_cpu_tx' } } },
    { m: 'POST', u: `${BASE_URL}/v1/payments/wallet-transfer`, b: JSON.stringify({ walletId, merchantId, amount: parseFloat(amount) }), p: { h: { 'Content-Type': 'application/json' }, t: { name: 'combined_cpu_tx' } } },
    { m: 'POST', u: `${BASE_URL}/v1/payments/wallet-transfer`, b: JSON.stringify({ walletId, merchantId, amount: parseFloat(amount) }), p: { h: { 'Content-Type': 'application/json' }, t: { name: 'combined_cpu_tx' } } },
  ];
  const payloads2 = payloads.map(p => ({ method: p.m, url: p.u, body: p.b, params: p.p }));
  const start = Date.now();
  http.batch(payloads2);
  combinedLatency.add(Date.now() - start);
  sleep(0.05);
}

function memOp(userId, merchantId, walletId) {
  const batch = [];
  for (let i = 0; i < 15; i++) {
    batch.push({ user: { id: userId }, merchant: { id: merchantId }, amount: Math.floor(Math.random() * 100) + 1, type: 'DEBIT', status: 'PENDING' });
  }
  const start = Date.now();
  const r = http.post(`${BASE_URL}/v1/payments/batch`, JSON.stringify(batch), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'combined_mem_batch' } });
  combinedLatency.add(Date.now() - start);
  errorRate.add(r.status !== 202);
  sleep(0.3);
}

function cpuBatchOp(userId, merchantId) {
  const batch = [];
  for (let i = 0; i < 8; i++) {
    batch.push({ user: { id: userId }, merchant: { id: merchantId }, amount: Math.floor(Math.random() * 50) + 1, type: 'DEBIT', status: 'PENDING' });
  }
  const r = http.post(`${BASE_URL}/v1/payments/batch`, JSON.stringify(batch), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'combined_cpu_batch' } });
  errorRate.add(r.status !== 202);
  sleep(0.15);
}

function memHoldOp(walletId, merchantId) {
  const responses = [];
  for (let i = 0; i < 6; i++) {
    const r = http.post(`${BASE_URL}/v1/payments/wallet-transfer`, JSON.stringify({ walletId, merchantId, amount: parseFloat((Math.random() * 5 + 1).toFixed(2)) }), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'combined_mem_hold' } });
    responses.push(r);
  }
  for (const r of responses) errorRate.add(r.status !== 200);
  sleep(0.4);
}

function cpuSearchOp() {
  const r = http.get(`${BASE_URL}/v1/payments/search?minAmount=1&maxAmount=500&status=SUCCESS&page=0&size=50`, { tags: { name: 'combined_search' } });
  errorRate.add(r.status !== 200);
  sleep(0.2);
}

function cpuReportOp() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86400000);
  const r = http.get(`${BASE_URL}/v1/payments/reports/summary?startDate=${start.toISOString()}&endDate=${end.toISOString()}`, { tags: { name: 'combined_report' } });
  errorRate.add(r.status !== 200);
  sleep(0.3);
}

function cpuSoapOp(userId, merchantId) {
  const amount = (Math.random() * 50 + 1).toFixed(2);
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pay="http://enterprise.com/payment-service"><soapenv:Header/><soapenv:Body><pay:ProcessPaymentRequest><pay:userId>${userId}</pay:userId><pay:merchantId>${merchantId}</pay:merchantId><pay:amount>${amount}</pay:amount><pay:type>DEBIT</pay:type></pay:ProcessPaymentRequest></soapenv:Body></soapenv:Envelope>`;
  const r = http.post(`${BASE_URL}/ws`, envelope, { headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' }, tags: { name: 'combined_soap' } });
  errorRate.add(r.status !== 200);
  sleep(0.3);
}

function memLargeListOp(userId) {
  const urls = [`/v1/users`, `/v1/merchants`, `/v1/wallets`, `/v1/payments/user/${userId}?status=SUCCESS&limit=100`];
  for (const url of urls) {
    const r = http.get(`${BASE_URL}${url}`, { tags: { name: 'combined_list' } });
    errorRate.add(r.status !== 200);
  }
  sleep(0.3);
}

function memTopUpOp(walletId) {
  const amounts = ['100.00', '500.00', '1000.00', '5000.00'];
  for (const amount of amounts) {
    const r = http.post(`${BASE_URL}/v1/payments/wallets/${walletId}/topup`, amount, { headers: { 'Content-Type': 'application/json' }, tags: { name: 'combined_topup' } });
    errorRate.add(r.status !== 200);
  }
  sleep(0.3);
}

export function teardown(data) {
  teardownTestEntities(BASE_URL, data);
  console.log(`COMBINED STRESS COMPLETE. Peak VUs: ${vusReached}`);
}

export function handleSummary(data) {
  const m = data.metrics;
  return {
    'benchmark/k6/results/combined-stress-summary.json': JSON.stringify(data, null, 2),
    stdout: printScalingBox('COMBINED CPU+MEM STRESS — SCALING RESULTS', {
      targetVUs: TARGET_VUS,
      maxVUs: m.vus_max?.values?.max || 0,
      totalReqs: m.http_reqs?.values?.count || 0,
      failedReqs: m.http_req_failed?.values?.passes || 0,
      avgDuration: m.http_req_duration?.values?.avg || 0,
      p95: m.http_req_duration?.values?.['p(95)'] || 0,
      p99: m.http_req_duration?.values?.['p(99)'] || 0,
      note: 'CPU > 80% AND Memory > 60% should trigger HPA',
    }),
  };
}
