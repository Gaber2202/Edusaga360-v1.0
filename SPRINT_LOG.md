# EduSaga 360 — Production Readiness Sprint Log

> Standup-style log for the founder. Newest day first.
> Branch: `claude/edusaga-production-readiness-gzytpz`

---

## Day 2 — 2026-07-04 (in progress)

### Plan
Day-2 focus is the database-performance work surfaced by the live audit
(`docs/RLS_AUDIT.md`), in safest-first order: (1) covering indexes for unindexed
foreign keys, (2) duplicate-index cleanup, (3) the RLS policy rewrites
(`auth_rls_initplan` + permissive-policy consolidation) — the last of which is
higher-risk and will be checkpointed before applying.

### Done (actuals)
- **RLSPERF-02 — FK covering indexes (DONE, applied live + verified).** Added
  covering indexes for all **10** foreign keys the advisor flagged as unindexed
  (cheque_status_history, dunning_log ×2, fee_structures ×4, invoice_discounts,
  payment_plans, special_care_fees) and dropped **1** duplicate index on
  `fee_structures`. Migration `20260704_fk_covering_indexes.sql`. Re-ran the live
  performance advisor: **`unindexed_foreign_keys` 10 → 0, `duplicate_index` 1 → 0.**
  (New indexes briefly show as "unused" until first queried — expected.)

### Post-merge live changes applied this session (with founder authorization)
- Applied `20260704_revoke_anon_pii_function_execute.sql` to the live DB.
  Verified: `encrypt_*_pii()` EXECUTE now `service_role`/`postgres` only; the
  3 SECURITY DEFINER `anon`/`authenticated` advisor warnings are **cleared**.
- Merged PR #98 into `main` after all 8 CI checks passed (incl. the fixed
  gitleaks job).

- **RLSPERF-03 — RLS `auth_rls_initplan` wrap (DONE for the real cases, applied
  live + verified).** The advisor showed 54; a live audit found **only 17**
  policies still had a *bare* `auth.jwt()`/`auth.uid()` (genuine per-row
  re-evaluation). Wrapped those 17 in `(select …)` via `ALTER POLICY` (no
  drop-window), in 2 batches. Migration `20260704_rls_initplan_wrap.sql`.
  **Isolation verified identical** with an `authenticated`-role probe on
  audit_logs — tenant A = 70, tenant B = 16, platform owner = 92 — before AND
  after both batches. Advisor: **54 → 37.**
- **The remaining 37 are a false positive — NOT churned (deliberate).** Those
  policies already wrap auth in an uncorrelated `(select (auth.jwt() -> …))`.
  `EXPLAIN` on `students` proves they already run as **InitPlan** (evaluated once
  per query, not per row). Rewriting them to the linter's preferred literal shape
  would give **zero runtime benefit** while churning every core tenant-isolation
  policy — risk with no reward. Documented in `docs/RLS_AUDIT.md`; intentionally
  left as-is.

### Compliance guide set (DONE)
- Produced `docs/compliance/` — five client-facing guides grounded in the actual
  code, honest about live vs stub: **ZATCA_PHASE2**, **PDPL**, **PAYMENTS**,
  **GOVERNMENT_INTEGRATIONS**, **API_GUIDE** (+ README index). Notable honest
  flags surfaced: **data residency is Seoul, not KSA** (PDPL), gov integrations
  are UI stubs, and no `/v1`/OpenAPI surface yet.

### Not done (documented, deliberately deferred)
- **multiple_permissive_policies (258)**: each table having both `tenant_isolation`
  and `platform_owner_access` as permissive policies for the same command. Minor
  cost (two InitPlan checks OR'd) vs. real risk of consolidating core isolation
  policies — deferred to a dedicated, carefully-reviewed effort rather than
  rushed live.
- Founder dashboard actions still pending: set `MOYASAR_WEBHOOK_SECRET`, enable
  Auth leaked-password protection.

---

## Scope note (read first)

EduSaga 360 has already been through several prior hardening passes (see
`findings_log.md`, `P0_FIX_SUMMARY.md`, `MIGRATION_AUDIT.md`,
`SCHEMA_DRIFT_REPORT.md`, and existing `docs/`). This is a **mature codebase**,
not a greenfield one: it ships CI (`.github/workflows/`), 300+ backend tests,
RLS across 43 tables, Sentry wiring, and structured migrations.

This sprint is therefore **incremental hardening on top of prior work**, not a
rebuild. The full master-prompt scope (a 3-day, whole-team plan) exceeds what one
pass can genuinely complete and verify. The guiding rule has been the prime
directive: **verifiable fixes over volume; honest gaps over fake green.** Items
not completed are logged explicitly in `AUDIT_REPORT.md` and `BLOCKERS.md` rather
than papered over.

---

## Day 1 — 2026-07-04

### Plan
- Recon the monorepo; establish a verifiable test baseline.
- Security pass focused on the two highest-risk surfaces: **tenant isolation**
  and **payment integrity**.
- Fix any P0 found immediately; document everything.

### Done (actuals)
- **Baseline captured:** backend suite green at **304 tests / 33 files** before
  any change. This is the anchor for every "no regressions" claim below.
- **Recon:** monorepo mapped — `frontend/` (main ERP, React 18 + Vite + TanStack
  Query), `admin-portal/`, `parent-portal/`, `backend/` (Express + TS on Railway),
  `shared/database/migrations/` (27 migrations). Service-role Supabase client;
  tenant isolation enforced in app code via explicit `.eq('tenant_id', …)`
  (`tenantQuery()` on the client, per-route filters on the server).
- **P0 found + FIXED — payment integrity (PAY-01/PAY-02):** the Moyasar
  subscription webhook (`backend/src/routes/subscription.ts`) applied plan/seat
  **upgrades from the request body with no authenticity check and no server-side
  amount verification** — the `amount` field was read but never compared to the
  order total. Added (a) shared-secret verification gated on
  `MOYASAR_WEBHOOK_SECRET` (constant-time), and (b) mandatory amount verification
  (paid halalas must equal `order.total_amount × 100`, else reject without
  applying). Covered by **7 new unit tests**; full suite now **311 / 34** green.
- **RLS spot-audit:** confirmed the `USING (TRUE)` policies flagged in the prior
  audit (benchmarks/marketplace) are genuinely superseded by
  `20260610_security_hardening.sql`. Noted a defense-in-depth gap: **0 tables use
  `FORCE ROW LEVEL SECURITY`** (P2 — see AUDIT_REPORT).
- **CI hardened:** added `secret-scan` (gitleaks, blocking) and
  `dependency-audit` (npm audit, advisory) jobs to `ci.yml` — the one real gap in
  an otherwise complete pipeline.
- **Dependency hygiene:** `npm audit fix` (non-breaking) on backend took it from
  7 → 5 advisories (fixed `form-data` high + `js-yaml` moderate). Remaining
  advisories need breaking upgrades; logged, not force-applied. Tests re-verified
  green after the bump.
- **Env hygiene:** `.env.example` was missing `ADMIN_LINK_SECRET` (server
  refuses to boot without it), `MOYASAR_API_KEY`, and `MOYASAR_WEBHOOK_SECRET`.
  Added all three with documentation — a real fresh-deploy blocker closed.

### Risks / open
- The Moyasar webhook is currently **mounted behind `authMiddleware`** in
  `index.ts`, so a real (JWT-less) Moyasar callback would be rejected. This needs
  a product decision + sandbox test before re-routing — flagged as **PAY-03** in
  AUDIT_REPORT and BLOCKERS, not silently changed.
- Full frontend/E2E audit, ZATCA golden-file expansion, load testing, and the
  compliance doc set are **not** completed this pass — see READINESS_REPORT for
  the honest status and 30-day plan.

### Day 1 completion — live-database audit (added)
- **Queried the live database read-only** (Supabase advisors + table list) — the
  authoritative source. Result: **all 69 public tables have RLS enabled.** Full
  table-by-table matrix in `docs/RLS_AUDIT.md`.
- **SEC-DEF-01 (P1) found + fixed:** three `SECURITY DEFINER` PII-encryption
  functions were callable by unauthenticated (`anon`) users via RPC. No app code
  calls them — added reversible migration
  `20260704_revoke_anon_pii_function_execute.sql` to lock them down. (Needs to be
  applied to the DB — see PR.)
- **RLS performance (RLSPERF-01) documented:** 54 per-row `auth_rls_initplan`
  policies + 258 permissive-policy overlaps + 10 unindexed FKs — the core Day-2/3
  DB work, with exact fix patterns in `docs/RLS_AUDIT.md`.
- **Secret scan (SECRETS-01): PASS** — tree + 107-commit history clean; only a
  labelled placeholder key exists. `.env*` gitignored.
- **Auth:** leaked-password protection is off — flagged as a 2-minute dashboard
  toggle.

Day 1 deep-audit deliverables are now complete.

### Deliverables produced
`SPRINT_LOG.md`, `AUDIT_REPORT.md`, `BLOCKERS.md`, `docs/READINESS_REPORT.md`,
`docs/RLS_AUDIT.md`, payment webhook fix + 7 tests, PII-function lockdown
migration, CI security jobs, `.env.example` completion.
