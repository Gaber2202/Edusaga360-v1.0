# Load Testing

> Goal from the sprint plan: **graceful behaviour at 500 concurrent users per
> tenant**, across login → invoice-list → payment-init, at term-start / billing
> spikes.

## What's here

- **`load/k6-smoke.js`** — a [k6](https://k6.io) script that authenticates once,
  then ramps to **500 concurrent VUs** hitting the read hot path (`/api/health`
  + `/api/billing/invoices`), with an **opt-in, trickle** payment-init scenario.

## Why these targets

- **Invoice list** (`GET /api/billing/invoices`) + dashboards are what actually
  melt at term-start and the 8 AM billing run — they read a tenant's whole
  invoice/payment set. The FK + hot-path indexes added this sprint target exactly
  these queries.
- **Login** is intentionally done **once** (in k6 `setup`), not hammered:
  Supabase Auth is a managed dependency with its own rate limits, and it isn't
  *our* bottleneck. Load-testing it mostly tests Supabase, not EduSaga.
- **payment-init** creates a **real (sandbox) Moyasar invoice** each call, so it
  is **off by default**. Enable it (`PAYMENT_INIT=1`) only against a sandbox
  merchant, at the built-in 1 req/s trickle — never blast it.

## How to run

```bash
# Install k6: https://k6.io/docs/get-started/installation/

# Against staging, logging in with a seeded load-test user:
k6 run \
  -e BASE_URL=https://staging-api.edusaga360.com \
  -e SUPABASE_URL=https://<ref>.supabase.co \
  -e SUPABASE_ANON_KEY=<anon-key> \
  -e TEST_EMAIL=loadtest@school.sa -e TEST_PASSWORD=<pw> \
  load/k6-smoke.js

# Or skip login with a pre-fetched token:
k6 run -e BASE_URL=... -e TEST_JWT=eyJ... load/k6-smoke.js
```

**Run against staging, never production.** Use a dedicated load-test tenant so
you're not reading real school data or tripping rate limits for real users.

## Pass criteria (thresholds in the script)

| Metric | Target |
|--------|--------|
| p95 request duration | < 800 ms |
| p95 invoice-list | < 1000 ms |
| error rate | < 1% |

k6 exits non-zero if a threshold is breached, so this can gate a pipeline later.

## Results

> **Not yet run.** This environment has no staging target or seeded load-test
> tenant, so no numbers have been captured — stating otherwise would be
> fabrication. Run the script against staging and record below.

| Date | Env | Peak VUs | p95 (ms) | Error % | Notes / bottleneck |
|------|-----|---------|----------|---------|--------------------|
| _TBD_ | staging | 500 | — | — | — |

## Where to look when it's slow

1. **Supabase** → Database → slow queries + connection count (see `RUNBOOK.md`
   Scenario 3). Confirm queries use the new indexes (`EXPLAIN`).
2. **Connection pooling** — any direct Postgres client must use the **Supavisor**
   pooled endpoint (port 6543), not a direct connection per request.
3. **Backend (Railway)** — instance size / event-loop saturation; the API caps
   120 req/min/user, so sustained overload points to DB or instance sizing.
4. **PDF/ZATCA** endpoints are the heaviest (Puppeteer) and are already capped by
   `PDF_MAX_CONCURRENCY` — keep them out of the hot-path load mix.
