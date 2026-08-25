/**
 * Node fallback for SCRUM-121 when k6 is unavailable.
 * Runs GOSI batch + period calculate + EOS against a live backend.
 *
 * Usage:
 *   AUTH_TOKEN=... BASE_URL=http://localhost:3001 TENANT_ID=... node scripts/payrollLoadHarness.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const TOKEN = process.env.AUTH_TOKEN || '';
const ITERATIONS = Number(process.env.ITERATIONS || 20);
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);

if (!TOKEN) {
  console.error('AUTH_TOKEN required');
  process.exit(1);
}

async function timed(label, fn) {
  const t0 = performance.now();
  let ok = false;
  let status = 0;
  let err = '';
  try {
    const res = await fn();
    status = res.status;
    ok = res.status >= 200 && res.status < 500;
    if (!ok) err = await res.text().catch(() => '');
  } catch (e) {
    err = e.message;
  }
  const ms = performance.now() - t0;
  return { label, ms, ok, status, err: err.slice(0, 200) };
}

async function oneIter(i) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  };
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const gosi = await timed('gosi', () =>
    fetch(`${BASE_URL}/api/payroll/gosi-calculate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        employees: Array.from({ length: 50 }, (_, j) => ({
          id: `emp-${i}-${j}`,
          nationality: j % 3 === 0 ? 'saudi' : 'egyptian',
          basic_salary: 8000 + (j % 20) * 250,
        })),
      }),
    }),
  );

  const calc = await timed('calculate', () =>
    fetch(`${BASE_URL}/api/payroll/calculate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ period_start: start, period_end: end }),
    }),
  );

  const eos = await timed('eos', () =>
    fetch(`${BASE_URL}/api/payroll/end-of-service`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        basic_salary: 10000,
        years_of_service: 6,
        nationality: 'egyptian',
        exit_type: 'resignation',
        unpaid_leave_days: 15,
      }),
    }),
  );

  return [gosi, calc, eos];
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function main() {
  console.log(`Harness BASE_URL=${BASE_URL} iterations=${ITERATIONS} concurrency=${CONCURRENCY}`);
  const all = [];
  for (let start = 0; start < ITERATIONS; start += CONCURRENCY) {
    const batch = [];
    for (let i = start; i < Math.min(start + CONCURRENCY, ITERATIONS); i++) batch.push(oneIter(i));
    const results = await Promise.all(batch);
    for (const r of results) all.push(...r);
    process.stdout.write('.');
  }
  console.log('');

  const byLabel = {};
  for (const r of all) {
    byLabel[r.label] ||= [];
    byLabel[r.label].push(r);
  }

  const summary = {};
  for (const [label, rows] of Object.entries(byLabel)) {
    const times = rows.map((r) => r.ms).sort((a, b) => a - b);
    const fails = rows.filter((r) => !r.ok).length;
    summary[label] = {
      n: rows.length,
      p50_ms: Math.round(percentile(times, 50)),
      p95_ms: Math.round(percentile(times, 95)),
      max_ms: Math.round(times[times.length - 1] || 0),
      error_pct: Math.round((fails / rows.length) * 1000) / 10,
      sample_status: rows[0]?.status,
    };
  }

  console.log(JSON.stringify(summary, null, 2));
  const out = resolve('docs/LOAD_TEST_payroll_last_run.json');
  writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), base_url: BASE_URL, summary }, null, 2));
  console.log(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
