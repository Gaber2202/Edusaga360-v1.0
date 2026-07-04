// EduSaga 360 — k6 load script.
//
// Exercises the read-heavy hot paths that actually bottleneck at term-start and
// the 8 AM billing window: authenticate once, then hammer the invoice list +
// health under a ramping load toward the 500-concurrent-per-tenant target.
//
// WHY payment-init is NOT hammered by default: creating a Moyasar payment link
// mints a REAL (sandbox) gateway invoice. Load-testing it would spam the gateway
// and pollute data. It is included as an OPT-IN, low-rate scenario only
// (PAYMENT_INIT=1) and should run against a sandbox merchant with tiny volume.
//
// Usage:
//   k6 run \
//     -e BASE_URL=https://staging-api.edusaga360.com \
//     -e SUPABASE_URL=https://<ref>.supabase.co \
//     -e SUPABASE_ANON_KEY=... \
//     -e TEST_EMAIL=loadtest@school.sa -e TEST_PASSWORD=... \
//     load/k6-smoke.js
//
// Or skip login by supplying a token directly:
//   k6 run -e BASE_URL=... -e TEST_JWT=eyJ... load/k6-smoke.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const errorRate = new Rate('errors');
const invoiceListLatency = new Trend('invoice_list_ms', true);

export const options = {
  scenarios: {
    // Read path — ramp toward 500 concurrent users, hold, ramp down.
    read_path: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 200 },
        { duration: '3m', target: 500 },
        { duration: '3m', target: 500 }, // sustained peak
        { duration: '1m', target: 0 },
      ],
      exec: 'readPath',
    },
    // Opt-in only: payment-init at a trickle against a sandbox merchant.
    ...(__ENV.PAYMENT_INIT === '1'
      ? {
          payment_init: {
            executor: 'constant-arrival-rate',
            rate: 1, timeUnit: '1s', duration: '2m',
            preAllocatedVUs: 5, maxVUs: 10,
            exec: 'paymentInit',
          },
        }
      : {}),
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],   // 95% of requests under 800ms
    errors: ['rate<0.01'],              // <1% errors
    invoice_list_ms: ['p(95)<1000'],
  },
};

// Authenticate once per VU init (setup runs once, shared token) — we are load
// testing OUR API, not Supabase Auth's rate limiter.
export function setup() {
  if (__ENV.TEST_JWT) return { token: __ENV.TEST_JWT };
  const res = http.post(
    `${__ENV.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: __ENV.TEST_EMAIL, password: __ENV.TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json', apikey: __ENV.SUPABASE_ANON_KEY } },
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  return { token: res.json('access_token') };
}

function authHeaders(data) {
  return { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' } };
}

export function readPath(data) {
  // 1. Health (public, cheap) — baseline liveness under load.
  const h = http.get(`${BASE_URL}/api/health`);
  check(h, { 'health 200': (r) => r.status === 200 }) || errorRate.add(1);

  // 2. Invoice list — the real hot path (billing/dashboards).
  const inv = http.get(`${BASE_URL}/api/billing/invoices?page=1&limit=20`, authHeaders(data));
  invoiceListLatency.add(inv.timings.duration);
  const ok = check(inv, { 'invoices 200': (r) => r.status === 200 });
  if (!ok) errorRate.add(1);

  sleep(1); // model think-time between user actions
}

export function paymentInit(data) {
  const orderId = __ENV.TEST_ORDER_ID;
  if (!orderId) return;
  const res = http.post(
    `${BASE_URL}/api/subscription/orders/${orderId}/payment-link`,
    JSON.stringify({ callback_url: `${BASE_URL}/return` }),
    authHeaders(data),
  );
  check(res, { 'payment-link non-5xx': (r) => r.status < 500 }) || errorRate.add(1);
}
