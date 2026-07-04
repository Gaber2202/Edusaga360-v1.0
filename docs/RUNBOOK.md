# Incident Runbook — EduSaga 360

> One page to reach for when something is on fire. Keep it current. Times are
> targets, not guarantees. First rule: **check `GET /api/health` and the provider
> status pages before changing anything.**

## Severity & who

- **SEV1** — payments failing, data exposure, or platform down for a tenant.
  Notify the founder immediately.
- **SEV2** — a module degraded, one integration down. Fix within the day.

## Quick reference

| Component | Where | Health check |
|-----------|-------|--------------|
| Backend API | Railway | `GET /api/health` (public) |
| Frontend | Vercel (3 projects) | load the app |
| Database / Auth / Storage | Supabase `mhbfvewkjlfmkqdhxpyg` (Seoul) | Supabase dashboard → Database health |
| Payments | Moyasar | status.moyasar.com |
| AI (Yamen) | provider (Groq/Gemini/…) | `GET /api/ai/diagnostics` (auth) |

---

## Scenario 1 — Payment gateway (Moyasar) down or rejecting

**Symptoms:** payment links fail to create (502 from `/orders/:id/payment-link`),
or webhooks stop arriving; parents report checkout errors.

1. Confirm it's Moyasar, not us: check status.moyasar.com and try creating a link
   — a 502 with a Moyasar error body means it's upstream.
2. **Do not disable the webhook guards.** The secret + amount verification are
   what keep forged "paid" callbacks out.
3. **Fall back to the wire-transfer path** — it's independent of Moyasar. Direct
   affected tenants to bank transfer + receipt upload (finance verifies → applies).
4. When Moyasar recovers, verify a test payment end-to-end (sandbox) before
   announcing recovery.
5. If webhooks were missed during the outage: the flow is **idempotent** and
   verifies amount — safe to have Moyasar resend, or reconcile the order manually
   against the Moyasar dashboard.

## Scenario 2 — ZATCA rejecting invoices

**Symptoms:** `/zatca-submit` returns errors; `zatca_submissions.zatca_status`
stuck at `error`/`pending`.

1. **Invoices still issue** — ZATCA submission is decoupled from invoice creation.
   Fee collection is **not** blocked; do not halt billing.
2. Read the rejection reason on the `zatca_submissions` row / API response.
   Common causes: **CSID not installed / expired** (signatures are placeholder),
   wrong clearance-vs-reporting routing, or a malformed field.
3. If it's the certificate: re-onboard the school's CSID (see
   `compliance/ZATCA_PHASE2.md`). Submissions can be **retried** once fixed — the
   PIH chain and ICV counter persist on the submission records.
4. If it's ZATCA-side downtime: queue and resubmit later; reporting invoices have
   a 24h window.
5. Escalate a persistent field-level rejection to whoever owns the ZATCA config;
   don't guess at UBL changes under pressure.

## Scenario 3 — Database connection exhaustion / slow DB

**Symptoms:** API timeouts, `too many connections`, dashboards spinning,
Supabase showing high connection count.

1. Check the Supabase dashboard → Database → connection count and slow queries.
2. **Use the pooler.** App reads go through supabase-js/PostgREST, but any direct
   Postgres client (migrations, scripts, a new service) must use the **Supavisor
   pooled connection** (port 6543, transaction mode) — never a direct 5432
   connection per request.
3. Kill runaway queries from the dashboard (SQL: `pg_terminate_backend`) if one
   query is holding connections.
4. If a burst (term start / 8 AM billing) is the cause: the FK + hot-path indexes
   added this sprint reduce load; consider temporarily rate-limiting the heaviest
   endpoints (the API already caps 120 req/min/user).
5. Longer term: upsize the Supabase instance and confirm pooling limits fit the
   concurrency target (see `LOAD_TEST.md`).

---

## Backups & Disaster Recovery

> ⚠️ **Verify these settings in the Supabase dashboard** (Project → Database →
> Backups) — I could not read the plan/PITR status programmatically, so confirm
> rather than assume.

- **Daily backups** are provided on Supabase paid plans. Confirm they are enabled
  and note the retention window.
- **Point-in-Time Recovery (PITR)** is a paid add-on. For a system holding
  financial + children's data, **enable PITR** so you can restore to any second,
  not just the last nightly snapshot.
- **Test a restore at least once** — a backup you've never restored is a hope, not
  a plan. Restore into a scratch project and confirm the data + auth users come
  back.
- **Schema is reproducible from zero** via `shared/database/migrations/` — so a
  worst-case rebuild is: fresh project → run migrations in order → restore data
  from the latest backup.
- **What's NOT in a Postgres backup:** Supabase **Auth users**, **Storage bucket
  objects**, project **secrets/config**, and **Edge Functions**. Document these
  separately; they must be re-created / re-imported on a full DR rebuild.

### DR recovery order (worst case: project lost)
1. New Supabase project (ideally same or in-Kingdom region — see `compliance/PDPL.md`).
2. Run all migrations from zero.
3. Restore Postgres data from backup/PITR.
4. Re-import Auth users, Storage objects, secrets, Edge Functions.
5. Repoint backend env (`SUPABASE_URL`, keys) → redeploy → run `RUNBOOK` health
   checks + a payment + an invoice test before reopening to tenants.

## After any incident
Write 3 lines: what broke, how it was fixed, one change to prevent recurrence.
Append to this file or a linked incident log.
