# RF-001b — Extract PDF rendering to a pg-boss worker (BLOCKED on infra)

**Status:** blocked — needs a direct Postgres connection string + a second Railway
service. Not end-to-end testable in the CI sandbox, so intentionally NOT shipped
with RF-001a.

**RF-001a (shipped)** already caps in-process Chromium concurrency via
`backend/src/lib/pdfConcurrency.ts` → `runPdfJob()`. That closes the OOM
red-flag. RF-001b moves the render off the request path entirely.

## Why it's blocked
- pg-boss needs a raw Postgres connection (`DATABASE_URL`). The backend today
  only holds `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (PostgREST over HTTP) —
  no direct PG string is exposed. Get Supabase → Project Settings → Database →
  **Session pooler** connection string and set it as `DATABASE_URL`.
- Requires a second Railway service (`worker`) off the same repo.

## Execution steps (when infra is provisioned)
1. `cd backend && npm i pg-boss`.
2. New `backend/src/worker.ts`: `const boss = new PgBoss(process.env.DATABASE_URL!)`,
   `await boss.work('pdf.invoice', handler)` where `handler` calls the existing
   `generateZATCAInvoicePDF`, uploads the buffer to R2, writes the signed URL to a
   `pdf_jobs` status row.
3. Add `"worker": "tsx src/worker.ts"` to `backend/package.json` scripts.
4. `runPdfJob()` interface stays; swap its body to `boss.send('pdf.invoice', …)`
   for the async paths. Keep the sync gate as the fallback for on-demand single
   downloads (`invoices.ts:275`).
5. Convert the create endpoints (`billing.ts:805`, `invoices.ts:137`) to enqueue +
   return `{ job_id }` instead of inlining `pdf_base64`. Add `GET /jobs/:id`
   status poll. NOTE: this changes the API contract — coordinate with frontend.
6. Railway: add service `worker`, start command `npm run worker`, same env group.
7. Migration: `CREATE TABLE pdf_jobs (id uuid pk, tenant_id uuid, invoice_id uuid,
   status text, url text, error text, created_at timestamptz default now())` with
   `idx_pdf_jobs_tenant_status`.

Same pg-boss instance then also backs RF-002 (bulk invoice) and RF-003 (bulk WhatsApp).
