import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import {
  generateUUID,
  setupTestEntities,
  teardownTestEntities,
} from './_shared.js';

const errorRate = new Rate('errors');
const walletTransferLatency = new Trend('wallet_transfer_latency', true);
const paymentCreateLatency = new Trend('payment_create_latency', true);
const soapProcessPaymentLatency = new Trend('soap_process_payment_latency', true);
const topUpLatency = new Trend('top_up_latency', true);
const searchLatency = new Trend('search_latency', true);
const concurrentConnections = new Counter('concurrent_vus');

const BASE_URL = __ENV.BASE_URL || 'http://payment-service.payments.svc.cluster.local';
const SOAP_URL = __ENV.SOAP_URL || `${BASE_URL}/ws`;
const TARGET_VUS = parseInt(__ENV.TARGET_VUS) || 50;
const TEST_DURATION = __ENV.TEST_DURATION || '5m';

let userId = null;
let merchantId = null;
let walletId = null;

const SOAP_ENVELOPE_TEMPLATE = (userId, merchantId, amount, type) => `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:pay="http://enterprise.com/payment-service">
  <soapenv:Header/>
  <soapenv:Body>
    <pay:ProcessPaymentRequest>
      <pay:userId>${userId}</pay:userId>
      <pay:merchantId>${merchantId}</pay:merchantId>
      <pay:amount>${amount}</pay:amount>
      <pay:type>${type}</pay:type>
    </pay:ProcessPaymentRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

const SOAP_SEARCH_ENVELOPE = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:pay="http://enterprise.com/payment-service">
  <soapenv:Header/>
  <soapenv:Body>
    <pay:SearchPaymentsRequest>
      <pay:minAmount>1</pay:minAmount>
      <pay:maxAmount>500</pay:maxAmount>
      <pay:status>SUCCESS</pay:status>
      <pay:page>0</pay:page>
      <pay:size>10</pay:size>
    </pay:SearchPaymentsRequest>
  </soapenv:Body>
</soapenv:Envelope>`;

export const options = {
  stages: [
    { duration: '1m',  target: Math.floor(TARGET_VUS * 0.2) },
    { duration: '2m',  target: Math.floor(TARGET_VUS * 0.5) },
    { duration: '2m',  target: Math.floor(TARGET_VUS * 0.8) },
    { duration: '3m',  target: TARGET_VUS },
    { duration: '5m',  target: TARGET_VUS },
    { duration: '2m',  target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
    wallet_transfer_latency: ['p(95)<3000'],
    payment_create_latency: ['p(95)<2000'],
    soap_process_payment_latency: ['p(95)<4000'],
  },
  noConnectionReuse: false,
  batchPerHost: 20,
};

export function setup() {
  return setupTestEntities(BASE_URL, 'load');
}

export default function (data) {
  userId = data.userId;
  merchantId = data.merchantId;
  walletId = data.walletId;
  const vuId = __VU;
  const iterId = __ITER;

  const scenario = Math.random();

  if (scenario < 0.35) {
    restWalletTransfer();
  } else if (scenario < 0.55) {
    restCreatePayment();
  } else if (scenario < 0.70) {
    soapProcessPayment();
  } else if (scenario < 0.80) {
    restTopUp();
  } else if (scenario < 0.90) {
    restSearch();
  } else {
    restGetPayment();
  }
}

function restWalletTransfer() {
  const amount = (Math.random() * 190 + 10).toFixed(2);
  const payload = JSON.stringify({
    walletId: walletId,
    merchantId: merchantId,
    amount: parseFloat(amount)
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/payments/wallet-transfer`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'wallet_transfer' }
  });

  walletTransferLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  concurrentConnections.add(1, { vus: __VU });

  check(res, {
    'wallet transfer status 200': r => r.status === 200,
  });
}

function restCreatePayment() {
  const amount = (Math.random() * 100 + 1).toFixed(2);
  const payload = JSON.stringify({
    userId: userId,
    merchantId: merchantId,
    amount: parseFloat(amount),
    type: 'DEBIT'
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/payments`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'create_payment' }
  });

  paymentCreateLatency.add(Date.now() - start);
  errorRate.add(res.status !== 201);

  check(res, {
    'create payment status 201': r => r.status === 201,
  });
}

function soapProcessPayment() {
  const amount = (Math.random() * 50 + 1).toFixed(2);
  const envelope = SOAP_ENVELOPE_TEMPLATE(userId, merchantId, amount, 'DEBIT');

  const start = Date.now();
  const res = http.post(SOAP_URL, envelope, {
    headers: {
      'Content-Type': 'text/xml;charset=UTF-8',
      'SOAPAction': ''
    },
    tags: { name: 'soap_process_payment' }
  });

  soapProcessPaymentLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);

  check(res, {
    'soap payment status 200': r => r.status === 200,
  });
}

function restTopUp() {
  const amount = (Math.random() * 500 + 100).toFixed(2);

  const start = Date.now();
  const res = http.post(`${BASE_URL}/v1/payments/wallets/${walletId}/topup`, amount, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'top_up' }
  });

  topUpLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);

  check(res, {
    'top up status 200': r => r.status === 200,
  });
}

function restSearch() {
  const start = Date.now();
  const res = http.get(`${BASE_URL}/v1/payments/search?minAmount=1&maxAmount=500&status=SUCCESS&page=0&size=10`, {
    tags: { name: 'search_payments' }
  });

  searchLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);

  check(res, {
    'search status 200': r => r.status === 200,
  });
}

function restGetPayment() {
  const res = http.get(`${BASE_URL}/v1/payments/user/${userId}?status=SUCCESS&limit=10`, {
    tags: { name: 'get_user_payments' }
  });

  errorRate.add(res.status !== 200);
  check(res, {
    'get payments status 200': r => r.status === 200,
  });
}

export function teardown(data) {
  teardownTestEntities(BASE_URL, data);
}

export function handleSummary(data) {
  return {
    'benchmark/k6/results/summary.json': JSON.stringify(data, null, 2),
    'benchmark/k6/results/summary.txt': textSummary(data),
  };
}

function textSummary(data) {
  return `
============================================================
  K6 LOAD TEST RESULTS - Payment Service
============================================================
Target VUs: ${TARGET_VUS}
Duration: ${TEST_DURATION}
Base URL: ${BASE_URL}

HTTP Metrics:
  Total Requests:      ${data.metrics.http_reqs?.values?.count || 0}
  Failed Requests:     ${data.metrics.http_req_failed?.values?.passes || 0}
  Error Rate:          ${((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%
  Avg Response Time:   ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms
  P50:                 ${(data.metrics.http_req_duration?.values?.p(50) || 0).toFixed(2)}ms
  P95:                 ${(data.metrics.http_req_duration?.values?.p(95) || 0).toFixed(2)}ms
  P99:                 ${(data.metrics.http_req_duration?.values?.p(99) || 0).toFixed(2)}ms
  Max:                 ${(data.metrics.http_req_duration?.values?.max || 0).toFixed(2)}ms

Custom Metrics:
  Wallet Transfer P95: ${(data.metrics.wallet_transfer_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  Payment Create P95:  ${(data.metrics.payment_create_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  SOAP Payment P95:    ${(data.metrics.soap_process_payment_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  Top Up P95:          ${(data.metrics.top_up_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  Search P95:          ${(data.metrics.search_latency?.values?.['p(95)'] || 0).toFixed(2)}ms

Peak VUs:              ${data.metrics.vus_max?.values?.max || 0}
Peak Iterations/s:     ${(data.metrics.iterations?.values?.rate || 0).toFixed(2)}
============================================================
`;
}
