import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Gauge } from 'k6/metrics';
import {
  setupTestEntities,
  teardownTestEntities,
  buildRampStages,
  printScalingBox,
  refuelWalletIfNeeded,
} from './_shared.js';

const errorRate = new Rate('stress_errors');
const transferLatency = new Trend('stress_transfer', true);
const batchLatency = new Trend('stress_batch', true);
const searchLatency = new Trend('stress_search', true);
const soapLatency = new Trend('stress_soap', true);
const activeVUs = new Gauge('stress_active_vus');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const TARGET_VUS = parseInt(__ENV.TARGET_VUS) || 250;
const SCALE_STEPS = parseInt(__ENV.SCALE_STEPS) || 8;
const STEP_DURATION = __ENV.STEP_DURATION || '2m';
const COOLDOWN_DURATION = __ENV.COOLDOWN_DURATION || '2m';

let vusReached = 0;
let lastRefuel = 0;

export const options = {
  stages: buildRampStages(TARGET_VUS, SCALE_STEPS, STEP_DURATION, COOLDOWN_DURATION),
  thresholds: {
    'http_req_duration': ['p(95)<8000'],
    'stress_errors': ['rate<0.25'],
    'http_req_failed': ['rate<0.25'],
  },
  noConnectionReuse: false,
  batchPerHost: 6,
};

export function setup() {
  const data = setupTestEntities(BASE_URL, 'escalation');
  console.log(`ESCALATION TEST — ${TARGET_VUS} VUs, ${SCALE_STEPS} steps`);
  console.log(`Expected: CPU > 80%, Memory > 60% at ~step ${Math.ceil(SCALE_STEPS * 0.6)}`);
  return data;
}

export default function(data) {
  const { userId, merchantId, walletId } = data;

  if (__VU > vusReached) vusReached = __VU;
  activeVUs.add(__VU);

  if (__VU === 1 && Date.now() - lastRefuel > 15000) {
    refuelWalletIfNeeded(BASE_URL, walletId, 5000);
    lastRefuel = Date.now();
  }

  const scenario = __ITER % 8;

  switch (scenario) {
    case 0: case 1: case 2:
      walletTransfer(walletId, merchantId);
      break;
    case 3: case 4:
      batchCreate(userId, merchantId);
      break;
    case 5:
      heavySearch();
      break;
    case 6:
      soapPayment(userId, merchantId);
      break;
    case 7:
      createAndRefund(userId, merchantId);
      break;
  }

  if (__VU <= 3 && __ITER % 30 === 0) {
    const step = Math.ceil(TARGET_VUS / SCALE_STEPS);
    const currentStep = Math.ceil(__VU / step);
    console.log(`[STEP ${currentStep}/${SCALE_STEPS}] VU ${__VU}/${TARGET_VUS} | iter ${__ITER} | errors: ${errorRate.name}`);
  }
}

function walletTransfer(walletId, merchantId) {
  const amount = (Math.random() * 3 + 0.5).toFixed(2);
  const start = Date.now();
  const r = http.post(`${BASE_URL}/v1/payments/wallet-transfer`, JSON.stringify({
    walletId, merchantId, amount: parseFloat(amount)
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'escalation_transfer' }
  });
  transferLatency.add(Date.now() - start);
  errorRate.add(r.status !== 200);
  sleep(0.05 + Math.random() * 0.1);
}

function batchCreate(userId, merchantId) {
  const batch = [];
  for (let i = 0; i < 8; i++) {
    batch.push({
      user: { id: userId }, merchant: { id: merchantId },
      amount: Math.floor(Math.random() * 30) + 1,
      type: 'DEBIT', status: 'PENDING'
    });
  }
  const start = Date.now();
  const r = http.post(`${BASE_URL}/v1/payments/batch`, JSON.stringify(batch), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'escalation_batch' }
  });
  batchLatency.add(Date.now() - start);
  errorRate.add(r.status !== 202);
  sleep(0.15 + Math.random() * 0.2);
}

function heavySearch() {
  const queries = [
    'minAmount=1&maxAmount=500&status=SUCCESS&page=0&size=50',
    'minAmount=100&maxAmount=1000&type=WALLET_TRANSFER&page=0&size=50',
    'minAmount=1&maxAmount=50&status=PENDING&page=1&size=50',
  ];
  const start = Date.now();
  const r = http.get(`${BASE_URL}/v1/payments/search?${queries[Math.floor(Math.random() * queries.length)]}`, {
    tags: { name: 'escalation_search' }
  });
  searchLatency.add(Date.now() - start);
  errorRate.add(r.status !== 200);
  sleep(0.1 + Math.random() * 0.2);
}

function soapPayment(userId, merchantId) {
  const amount = (Math.random() * 20 + 1).toFixed(2);
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pay="http://enterprise.com/payment-service"><soapenv:Header/><soapenv:Body><pay:ProcessPaymentRequest><pay:userId>${userId}</pay:userId><pay:merchantId>${merchantId}</pay:merchantId><pay:amount>${amount}</pay:amount><pay:type>DEBIT</pay:type></pay:ProcessPaymentRequest></soapenv:Body></soapenv:Envelope>`;
  const start = Date.now();
  const r = http.post(`${BASE_URL}/ws`, envelope, {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    tags: { name: 'escalation_soap' }
  });
  soapLatency.add(Date.now() - start);
  errorRate.add(r.status !== 200);
  sleep(0.2 + Math.random() * 0.3);
}

function createAndRefund(userId, merchantId) {
  const amount = (Math.random() * 50 + 1).toFixed(2);
  const r = http.post(`${BASE_URL}/v1/payments`, JSON.stringify({
    userId, merchantId, amount: parseFloat(amount), type: 'DEBIT'
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'escalation_create' }
  });
  if (r.status === 201) {
    const pid = r.json().id;
    const refund = http.put(`${BASE_URL}/v1/payments/${pid}/refund`, null, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'escalation_refund' }
    });
    errorRate.add(refund.status !== 200);
  } else {
    errorRate.add(1);
  }
  sleep(0.1 + Math.random() * 0.15);
}

export function teardown(data) {
  teardownTestEntities(BASE_URL, data);
}

export function handleSummary(data) {
  const m = data.metrics;
  return {
    stdout: printScalingBox('ESCALATION STRESS TEST', {
      targetVUs: TARGET_VUS,
      maxVUs: m.vus_max?.values?.max || 0,
      totalReqs: m.http_reqs?.values?.count || 0,
      failedReqs: m.http_req_failed?.values?.passes || 0,
      avgDuration: m.http_req_duration?.values?.avg || 0,
      p95: m.http_req_duration?.values?.['p(95)'] || 0,
      p99: m.http_req_duration?.values?.['p(99)'] || 0,
      note: 'Check Grafana: CPU usage, JVM heap, Latency should escalate',
    }),
  };
}
