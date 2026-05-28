import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SEED_USER_ID, SEED_MERCHANT_ID } from './_shared.js';

const errorRate = new Rate('errors');
const soapProcessPaymentLatency = new Trend('soap_process_payment_latency', true);
const soapGetPaymentLatency = new Trend('soap_get_payment_latency', true);
const soapListPaymentsLatency = new Trend('soap_list_payments_latency', true);
const soapSearchLatency = new Trend('soap_search_latency', true);
const soapSummaryLatency = new Trend('soap_summary_latency', true);
const soapRefundLatency = new Trend('soap_refund_latency', true);

const BASE_URL = __ENV.BASE_URL || 'http://payment-service.payments.svc.cluster.local';
const SOAP_URL = __ENV.SOAP_URL || `${BASE_URL}/ws`;
const TARGET_VUS = parseInt(__ENV.TARGET_VUS) || 50;
const TEST_DURATION = __ENV.TEST_DURATION || '5m';

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
    soap_process_payment_latency: ['p(95)<4000'],
  },
  noConnectionReuse: false,
  batchPerHost: 20,
};

export function setup() {
  return { userId: SEED_USER_ID, merchantId: SEED_MERCHANT_ID };
}

export default function (data) {
  const { userId, merchantId } = data;
  const scenario = Math.random();

  if (scenario < 0.35) {
    soapProcessPayment(userId, merchantId);
  } else if (scenario < 0.55) {
    soapListUserPayments(userId);
  } else if (scenario < 0.70) {
    soapSearchPayments();
  } else if (scenario < 0.80) {
    soapGetPaymentSummary();
  } else if (scenario < 0.90) {
    soapGetPaymentById();
  } else {
    soapRefundPayment();
  }
}

function extractPaymentId(xml) {
  const match = xml.match(/<pay:id[^>]*>([^<]+)<\/pay:id>/);
  return match ? match[1] : null;
}

let lastPaymentId = null;

function soapProcessPayment(userId, merchantId) {
  const amount = (Math.random() * 50 + 1).toFixed(2);
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

function soapGetPaymentById() {
  if (!lastPaymentId) return soapProcessPayment(SEED_USER_ID, SEED_MERCHANT_ID);

  const body = `<pay:GetPaymentByIdRequest>
    <pay:id>${lastPaymentId}</pay:id>
  </pay:GetPaymentByIdRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_get_payment' });
  soapGetPaymentLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap get payment ok': r => r.status === 200 });
}

function soapListUserPayments(userId) {
  const body = `<pay:ListUserPaymentsRequest>
    <pay:userId>${userId}</pay:userId>
    <pay:status>SUCCESS</pay:status>
    <pay:limit>10</pay:limit>
  </pay:ListUserPaymentsRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_list_payments' });
  soapListPaymentsLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap list payments ok': r => r.status === 200 });
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
  if (!lastPaymentId) return soapProcessPayment(SEED_USER_ID, SEED_MERCHANT_ID);

  const body = `<pay:RefundPaymentRequest>
    <pay:id>${lastPaymentId}</pay:id>
  </pay:RefundPaymentRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_refund' });
  soapRefundLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap refund ok': r => r.status === 200 });
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
  K6 LOAD TEST RESULTS - Payment Service (SOAP Only)
============================================================
Target VUs: ${TARGET_VUS}
Duration: ${TEST_DURATION}
SOAP URL: ${SOAP_URL}

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
  Process Payment P95: ${(data.metrics.soap_process_payment_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  Get Payment P95:     ${(data.metrics.soap_get_payment_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  List Payments P95:   ${(data.metrics.soap_list_payments_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  Search P95:          ${(data.metrics.soap_search_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  Summary P95:         ${(data.metrics.soap_summary_latency?.values?.['p(95)'] || 0).toFixed(2)}ms
  Refund P95:          ${(data.metrics.soap_refund_latency?.values?.['p(95)'] || 0).toFixed(2)}ms

Peak VUs:              ${data.metrics.vus_max?.values?.max || 0}
Peak Iterations/s:     ${(data.metrics.iterations?.values?.rate || 0).toFixed(2)}
============================================================
`;
}
