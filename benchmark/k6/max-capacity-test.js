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
const soapProcessPaymentLatency = new Trend('wallet_transfer_latency', true);
const soapSearchLatency = new Trend('top_up_latency', true);
const soapListPaymentsLatency = new Trend('rest_get_latency', true);

const BASE_URL = __ENV.BASE_URL || 'http://payment-service.payments.svc.cluster.local';
const SOAP_URL = __ENV.SOAP_URL || `${BASE_URL}/ws`;
const TARGET_VUS = parseInt(__ENV.TARGET_VUS) || 500;

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
    { duration: '30s', target: Math.floor(TARGET_VUS * 0.1) },
    { duration: '30s', target: Math.floor(TARGET_VUS * 0.3) },
    { duration: '1m', target: Math.floor(TARGET_VUS * 0.5) },
    { duration: '1m', target: Math.floor(TARGET_VUS * 0.7) },
    { duration: '2m', target: TARGET_VUS },
    { duration: '5m', target: TARGET_VUS },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<15000', 'p(99)<30000'],
    http_req_failed: ['rate<0.15'],
  },
  noConnectionReuse: false,
  batchPerHost: 20,
};

export function setup() {
  return setupTestEntities(BASE_URL, 'capacity');
}

export default function (data) {
  const { userId, merchantId } = data;
  const scenario = Math.random();

  if (scenario < 0.35) {
    soapProcessPayment(userId, merchantId);

  } else if (scenario < 0.55) {
    soapProcessPayment(userId, merchantId);

  } else if (scenario < 0.70) {
    soapProcessPayment(userId, merchantId);

  } else if (scenario < 0.85) {
    soapProcessPayment(userId, merchantId);

  } else {
    soapListUserPayments(userId);
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
}

function soapListUserPayments(userId) {
  const body = `<pay:ListUserPaymentsRequest>
    <pay:userId>${userId}</pay:userId>
    <pay:limit>5</pay:limit>
  </pay:ListUserPaymentsRequest>`;

  const start = Date.now();
  const res = sendSoap(body, { name: 'soap_list_payments' });
  soapListPaymentsLatency.add(Date.now() - start);
  errorRate.add(res.status !== 200);
  check(res, { 'soap list payments ok': r => r.status === 200 });
}

export function teardown(data) {
  teardownTestEntities(BASE_URL, data);
}

export function handleSummary(data) {
  return {
    'benchmark/k6/results/soap-max-capacity-summary.json': JSON.stringify(data, null, 2),
  };
}
