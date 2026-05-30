import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import {
  SEED_USER_ID,
  SEED_MERCHANT_ID,
  setupTestEntities,
  teardownTestEntities,
  printScalingBox,
} from './_shared.js';

const errorRate = new Rate('errors');
const soapWalletTransferLatency = new Trend('cpu_stress_wallet_transfer_duration', true);
const soapSearchLatency = new Trend('cpu_stress_search_duration', true);
const soapSummaryLatency = new Trend('cpu_stress_summary_duration', true);
const soapProcessPaymentLatency = new Trend('cpu_stress_payment_create_duration', true);
const soapRefundLatency = new Trend('cpu_stress_refund_duration', true);

const BASE_URL = __ENV.BASE_URL || 'http://payment-service.payments.svc.cluster.local';
const SOAP_URL = __ENV.SOAP_URL || `${BASE_URL}/ws`;
const TARGET_VUS = parseInt(__ENV.TARGET_VUS) || 300;

const NAMESPACE = 'http://enterprise.com/payment-service';

function soapEnvelope(bodyContent) {
  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pay="${NAMESPACE}">
  <soapenv:Header/>
  <soapenv:Body>
    ${bodyContent}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function sendSoap(bodyContent, tags) {
  return http.post(SOAP_URL, soapEnvelope(bodyContent), {
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': '' },
    tags,
  });
}

export const options = {
  stages: [
    { duration: '1m', target: Math.floor(TARGET_VUS * 0.2) },
    { duration: '2m', target: Math.floor(TARGET_VUS * 0.5) },
    { duration: '3m', target: TARGET_VUS },
    { duration: '5m', target: TARGET_VUS },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<8000', 'p(99)<20000'],
    http_req_failed: ['rate<0.10'],
  },
  noConnectionReuse: false,
  batchPerHost: 20,
};

export function setup() {
  return setupTestEntities(BASE_URL, 'cpu');
}

let lastPaymentId = null;

function extractPaymentId(xml) {
  const match = xml.match(/<pay:id[^>]*>([^<]+)<\/pay:id>/);
  return match ? match[1] : null;
}

export default function (data) {
  const { userId, merchantId } = data;
  const scenario = Math.random();

  if (scenario < 0.30) {
    const start = Date.now();
    for (let i = 0; i < 3; i++) {
      soapProcessPayment(userId, merchantId);
    }
    soapWalletTransferLatency.add(Date.now() - start);

  } else if (scenario < 0.55) {
    soapProcessPayment(userId, merchantId);

  } else if (scenario < 0.75) {
    soapSearchPayments();

  } else if (scenario < 0.90) {
    soapGetPaymentSummary();

  } else {
    soapRefundPayment();
  }
}

function soapProcessPayment(userId, merchantId) {
  const amount = (Math.random() * 100 + 0.01).toFixed(2);
  const body = `<pay:ProcessPaymentRequest>
    <pay:userId>${userId}</pay:userId>
    <pay:merchantId>${merchantId}</pay:merchantId>
    <pay:amount>${amount}</pay:amount>
    <pay:type>DEBIT</pay:type>
  </pay:ProcessPaymentRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_process_payment' });
  soapProcessPaymentLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap process payment ok': r => r.status === 200 });

  const pid = extractPaymentId(res.body);
  if (pid) lastPaymentId = pid;
}

function soapSearchPayments() {
  const body = `<pay:SearchPaymentsRequest>
    <pay:minAmount>1</pay:minAmount>
    <pay:maxAmount>500</pay:maxAmount>
    <pay:status>SUCCESS</pay:status>
    <pay:page>0</pay:page>
    <pay:size>10</pay:size>
  </pay:SearchPaymentsRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_search' });
  soapSearchLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap search ok': r => r.status === 200 });
}

function soapGetPaymentSummary() {
  const body = `<pay:GetPaymentSummaryRequest>
    <pay:startDate>2020-01-01T00:00:00Z</pay:startDate>
    <pay:endDate>2030-12-31T23:59:59Z</pay:endDate>
  </pay:GetPaymentSummaryRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_summary' });
  soapSummaryLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap summary ok': r => r.status === 200 });
}

function soapRefundPayment() {
  if (!lastPaymentId) {
    soapProcessPayment(SEED_USER_ID, SEED_MERCHANT_ID);
    return;
  }

  const body = `<pay:RefundPaymentRequest>
    <pay:id>${lastPaymentId}</pay:id>
  </pay:RefundPaymentRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_refund' });
  soapRefundLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap refund ok': r => r.status === 200 });
}

export function teardown(data) {
  teardownTestEntities(BASE_URL, data);
}

export function handleSummary(data) {
  return {
    'benchmark/k6/results/soap-cpu-stress-summary.json': JSON.stringify(data, null, 2),
  };
}
