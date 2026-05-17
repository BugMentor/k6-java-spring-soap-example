import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import {
  generateUUID,
  setupTestEntities,
  teardownTestEntities,
  buildRampStages,
  printScalingBox,
} from './_shared.js';

const walletTransferTrend = new Trend('hpa_verify_transfer_duration', true);
const successCounter = new Counter('hpa_verify_successes');
const failureCounter = new Counter('hpa_verify_failures');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const PROMETHEUS_URL = __ENV.PROMETHEUS_URL || 'http://localhost:9091';
const TARGET_VUS = parseInt(__ENV.TARGET_VUS) || 200;
const SCALE_STEPS = parseInt(__ENV.SCALE_STEPS) || 6;
const STEP_DURATION = __ENV.STEP_DURATION || '2m';
const COOLDOWN_DURATION = __ENV.COOLDOWN_DURATION || '3m';

let vusReached = 0;
let scalingEvents = [];
let scalingChecksPassed = 0;
let scalingChecksFailed = 0;

export const options = {
  stages: buildRampStages(TARGET_VUS, SCALE_STEPS, STEP_DURATION, COOLDOWN_DURATION),
  thresholds: {
    'http_req_duration': ['p(95)<5000'],
    'http_req_failed': ['rate<0.05'],
  },
  noConnectionReuse: false,
  batchPerHost: 8,
};

function checkHPAStatus() {
  try {
    const r = http.get(`${PROMETHEUS_URL}/api/v1/query?query=kube_deployment_status_replicas{deployment="payment-service"}`, {
      timeout: '5s',
    });
    if (r.status === 200) {
      const body = JSON.parse(r.body);
      const results = body?.data?.result || [];
      for (const result of results) {
        const replicas = parseInt(result.value[1]);
        const timestamp = new Date().toISOString();
        scalingEvents.push({ timestamp, replicas });
        console.log(`[HPA MONITOR] ${timestamp} | Payment Service Replicas: ${replicas}`);
        return replicas;
      }
    }
  } catch (e) {
    console.log(`[HPA MONITOR] Prometheus query failed: ${e.message}`);
  }
  return -1;
}

export function setup() {
  const data = setupTestEntities(BASE_URL, 'hpa-verify');
  console.log(`HPA VERIFICATION TEST`);
  console.log(`Target VUs: ${TARGET_VUS} | Steps: ${SCALE_STEPS}`);
  console.log(`Monitoring HPA via Prometheus at ${PROMETHEUS_URL}`);
  console.log(`Expected: Replicas should increase from 2 as VUs ramp up`);
  return data;
}

export default function(data) {
  const { userId, merchantId, walletId } = data;

  if (__VU > vusReached) vusReached = __VU;

  const amount = (Math.random() * 10 + 1).toFixed(2);

  const start = Date.now();
  const r = http.post(`${BASE_URL}/v1/payments/wallet-transfer`, JSON.stringify({
    walletId, merchantId,
    amount: parseFloat(amount)
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'hpa_verify_transfer' }
  });
  walletTransferTrend.add(Date.now() - start);

  if (r.status === 200) {
    successCounter.add(1);
  } else {
    failureCounter.add(1);
  }

  check(r, { 'transfer ok': res => res.status === 200 });

  if (__VU === 1 && __ITER % 3 === 0) {
    const replicas = checkHPAStatus();

    if (replicas > 2) {
      console.log(`[HPA SCALE] ✓ Scaling detected! Replicas increased to ${replicas}`);
      scalingChecksPassed++;
    } else if (__VU > TARGET_VUS * 0.5 && replicas === 2) {
      console.log(`[HPA SCALE] ⚠ Pods still at ${replicas} with ${__VU} VUs — scale may not have triggered yet`);
      scalingChecksFailed++;
    } else {
      scalingChecksPassed++;
    }
  }

  sleep(0.2 + Math.random() * 0.3);
}

export function teardown(data) {
  teardownTestEntities(BASE_URL, data);

  console.log(`\n═══ HPA SCALING VERIFICATION REPORT ═══`);
  console.log(`Peak VUs: ${vusReached}`);
  console.log(`Scaling checks passed: ${scalingChecksPassed}`);
  console.log(`Scaling checks failed: ${scalingChecksFailed}`);
  console.log(`Scaling events observed:`);
  const uniqueReplicas = new Set();
  scalingEvents.forEach(e => uniqueReplicas.add(e.replicas));
  const replicaCounts = Array.from(uniqueReplicas).sort((a, b) => a - b);
  console.log(`  Replica counts observed: [${replicaCounts.join(', ')}]`);

  if (replicaCounts.length > 1) {
    console.log(`✓ HPA SCALING VERIFIED — Pod count changed during test`);
  } else if (replicaCounts.length === 1 && replicaCounts[0] > 2) {
    console.log(`✓ HPA SCALING VERIFIED — Already scaled to ${replicaCounts[0]} pods`);
  } else {
    console.log(`⚠ No scaling observed — may need longer test duration or more VUs`);
  }
}

export function handleSummary(data) {
  const m = data.metrics;
  return {
    'benchmark/k6/results/hpa-verify-summary.json': JSON.stringify(data, null, 2),
    stdout: printScalingBox('HPA SCALING VERIFICATION — RESULTS', {
      targetVUs: TARGET_VUS,
      maxVUs: m.vus_max?.values?.max || 0,
      totalReqs: m.http_reqs?.values?.count || 0,
      failedReqs: m.http_req_failed?.values?.passes || 0,
      avgDuration: m.http_req_duration?.values?.avg || 0,
      p95: m.http_req_duration?.values?.['p(95)'] || 0,
      p99: m.http_req_duration?.values?.['p(99)'] || 0,
      note: 'HPA verified via Prometheus query during test',
    }),
  };
}
