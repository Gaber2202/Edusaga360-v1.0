/**
 * k6 payroll load scenario (SCRUM-121) — GOSI + calculate against a large cohort.
 *
 * Prerequisites:
 *   - Backend at BASE_URL with auth token
 *   - Prefer a tenant with many employees (seed separately for 10k)
 *
 * Usage:
 *   BASE_URL=http://localhost:3001 AUTH_TOKEN=... k6 run load/k6-payroll.js
 *
 * Record results in docs/LOAD_TEST.md after a real 10k run.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  scenarios: {
    payroll_ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    // Full 10k calculate returns multi-MB JSON; p95 under 15s is the gate for 1 VU.
    http_req_duration: ['p(95)<15000'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

export default function payrollLoad() {
  const gosiBody = JSON.stringify({
    employees: Array.from({ length: 50 }, (_, i) => ({
      id: `emp-${i}`,
      nationality: i % 3 === 0 ? 'saudi' : 'egyptian',
      basic_salary: 8000 + (i % 20) * 250,
    })),
  });

  const gosiRes = http.post(`${BASE_URL}/api/payroll/gosi-calculate`, gosiBody, { headers });
  check(gosiRes, {
    'gosi status 200': (r) => r.status === 200,
  });

  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const calcRes = http.post(
    `${BASE_URL}/api/payroll/calculate`,
    JSON.stringify({ period_start: start, period_end: end }),
    { headers },
  );
  check(calcRes, {
    'calculate not 5xx': (r) => r.status < 500,
  });

  const eosRes = http.post(
    `${BASE_URL}/api/payroll/end-of-service`,
    JSON.stringify({
      basic_salary: 10000,
      years_of_service: 6,
      nationality: 'egyptian',
      exit_type: 'resignation',
      unpaid_leave_days: 15,
    }),
    { headers },
  );
  check(eosRes, {
    'eos status 200': (r) => r.status === 200,
  });

  sleep(0.5);
}
