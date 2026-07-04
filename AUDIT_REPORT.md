# EduSaga 360 — Audit Report (Production Readiness Sprint)

**Date:** 2026-07-04
**Branch:** `claude/edusaga-production-readiness-gzytpz`
**Baseline:** backend suite green (304 tests) before changes; 311 after.

This report records findings from this sprint. It **supplements** — does not
replace — the prior `findings_log.md` (Phases 0–5) and `MIGRATION_AUDIT.md`,
which remain accurate (spot-verified below). Severity: P0 blocker · P1 high ·
P2 medium · P3 low.

---

## Findings this sprint

| ID | Sev | Area | File / location | Status |
|----|-----|------|-----------------|--------|
| PAY-01 | **P0** | Payments | `backend/src/routes/subscription.ts` — Moyasar webhook | **FIXED** |
| PAY-02 | **P0** | Payments | same handler — amount not verified | **FIXED** |
| PAY-03 | **P1** | Payments | `backend/src/index.ts:132` — webhook mounted behind auth | **FLAGGED** (needs decision) |
| ENV-02 | **P1** | DevOps | `backend/.env.example` — missing required secrets | **FIXED** |
| CI-01 | P2 | CI/CD | `.github/workflows/ci.yml` — no secret/dep scan | **FIXED** |
| DEP-01 | P2 | Deps | backend + frontend `npm audit` advisories | **PARTIAL** |
| RLS-01 | P2 | Database | no table uses `FORCE ROW LEVEL SECURITY` | **FLAGGED** |
| SEC-DEF-01 | **P1** | Database | PII-encrypt functions executable by `anon` (live advisor) | **FIXED** (migration — apply pending) |
| RLSPERF-01 | P2 | Database | 54 `auth_rls_initplan` + 258 permissive policies (live advisor) | **FLAGGED** (see RLS_AUDIT.md) |
| DRIFT-01 | P2 | Database | 3 DB functions exist in no in-repo migration | **FLAGGED** |
| AUTH-01 | P2 | Auth | leaked-password protection disabled (live advisor) | **FLAGGED** (dashboard toggle) |
| SECRETS-01 | — | Security | secret scan of tree + git history | **PASS (clean)** |

Carried-over open items from prior audits (still valid, not addressed this pass)
are listed at the bottom. Full tenant-isolation matrix + performance-advisor
detail is in **`docs/RLS_AUDIT.md`** (queried live from the database).

---

### PAY-01 — Moyasar webhook had no authenticity verification (P0, FIXED)

**Description.** `POST /api/subscription/webhook/moyasar` applied plan upgrades
and seat additions based purely on the request body (`status: 'paid'` +
`metadata.order_id`). There was no signature/secret check, so any actor able to
reach the endpoint with a known order id could grant a paid entitlement for free.
Because the route also sits behind `authMiddleware` today (see PAY-03), the
practical reach was "any authenticated tenant user could self-grant an upgrade for
their own pending order without paying" — still a financial-integrity break.

**Fix.** Added a shared-secret guard gated on `MOYASAR_WEBHOOK_SECRET`: when set,
the caller must present the token (via `secret_token` in the body — Moyasar's
echoed webhook token — or an `x-moyasar-secret` / `x-event-secret` header),
compared in constant time (`crypto.timingSafeEqual`). When the env var is unset,
the handler logs a loud warning and proceeds (so we don't break a currently
"working" flow) — production **must** set it (BLOCKERS: PAY-SECRET).

**Verification.** 4 of the 7 new tests in
`backend/src/__tests__/subscription-webhook.test.ts` cover missing/wrong/valid
secret via both body and header.

---

### PAY-02 — Paid amount was never verified server-side (P0, FIXED)

**Description.** The webhook read `amount` from the body but never compared it to
the order total. A `status:'paid'` callback with `amount: 100` (1.00 SAR) would
have applied a full enterprise-plan upgrade. "Never trust the client/callback for
money" was violated.

**Fix.** After loading the order, the handler now computes
`expectedHalala = round(order.total_amount × 100)` and rejects (HTTP 400, upgrade
**not** applied) unless the paid halalas match exactly. Also fixed a latent bug:
the `tenant_requests` fallback mapping dropped `total_amount`, which would have
made verification impossible on that path — now carried through.

**Verification.** 3 new tests: mismatched amount → 400 + no upgrade; missing
amount → 400; exact match → 200 + upgrade applied.

---

### PAY-03 — Webhook mounted behind authMiddleware (P1, FLAGGED — not changed)

**Description.** `index.ts:132` mounts `/api/subscription` with
`authMiddleware + tenantMiddleware`. A genuine Moyasar server-to-server callback
carries no Supabase JWT and would be rejected 401 — meaning the auto-apply path is
likely **non-functional** in production today (payments settle via the redirect
callback + the wire-transfer verify path instead).

**Why not fixed here.** Correctly re-routing the webhook to a public path changes
production payment routing and can only be validated against a Moyasar sandbox,
for which we have no credentials in this environment. Per the prime directive,
this is flagged rather than blind-changed. With PAY-01/PAY-02 in place, the
handler is now safe to expose publicly **once `MOYASAR_WEBHOOK_SECRET` is set**.
See BLOCKERS: PAY-ROUTING for the exact change and test steps.

---

### ENV-02 — `.env.example` missing required secrets (P1, FIXED)

`ADMIN_LINK_SECRET` is enforced at startup (`index.ts:43` — process exits if
unset/default), yet it was absent from `.env.example`; likewise `MOYASAR_API_KEY`
(used in the payment-link route) and the new `MOYASAR_WEBHOOK_SECRET`. A fresh
deploy from the example would have crash-looped. All three added and documented.

---

### CI-01 — No secret or dependency scan in CI (P2, FIXED)

The pipeline lint/typecheck/build/tests both apps but had no supply-chain gate.
Added `secret-scan` (gitleaks, **blocking**) and `dependency-audit` (npm audit
high+, **advisory**) jobs.

---

### DEP-01 — Dependency advisories (P2, PARTIAL)

`npm audit` at sprint start: **backend 7** (1 critical, 3 high, 3 moderate),
**frontend 17** (4 critical, 2 high, 10 moderate, 1 low). Applied non-breaking
`npm audit fix` on backend → **5 remaining** (`form-data` high and `js-yaml`
moderate resolved; suite re-verified green). The rest require breaking major
bumps (`vitest`/`esbuild`/`vite` — dev-only; `nodemailer` — runtime) and were
**not** force-applied without a regression budget. Most criticals are in the
**dev/build** dependency tree (esbuild via vite/vitest), not the shipped runtime.
Tracked for the 30-day plan.

---

### RLS-01 — No `FORCE ROW LEVEL SECURITY` (P2, FLAGGED)

43 tables `ENABLE` RLS, but none `FORCE` it. RLS is bypassed by the table owner
role; `FORCE` closes that for defense-in-depth. In practice the app connects as
`authenticated`/`anon` (subject to RLS) and the backend uses the service-role key
(intentionally bypasses RLS, isolation enforced in code), so this is not an active
breach — but `FORCE` is recommended before the client engagement. A reversible
migration (`ALTER TABLE … FORCE ROW LEVEL SECURITY` per tenant-scoped table) is
the fix; deferred because it needs a full-table sweep + verification against live
policies, out of scope for this pass.

---

### SEC-DEF-01 — PII-encryption functions callable by `anon` (P1, FIXED via migration)

The live security advisor flagged `encrypt_employee_pii()`,
`encrypt_guardian_pii()`, and `encrypt_student_pii()` (all `SECURITY DEFINER`) as
executable by the `anon` (unauthenticated) and `authenticated` roles via
`/rest/v1/rpc/…`. A repo-wide search confirms **no application code calls them** —
they are internal (trigger/definer) helpers. Migration
`shared/database/migrations/20260704_revoke_anon_pii_function_execute.sql` revokes
EXECUTE from `anon`/`authenticated`/`PUBLIC` (service_role and triggers keep
working). Non-destructive, reversible. **Must be applied to the database** — see
the PR checklist.

### RLSPERF-01 — RLS performance at scale (P2, FLAGGED)

Live performance advisor: **54 `auth_rls_initplan`** (policies calling `auth.*()`
per-row instead of `(select auth.*())`), **258 `multiple_permissive_policies`**,
10 unindexed foreign keys, 98 unused indexes, 1 duplicate index. These are the
core Day-2/Day-3 database-performance items. Fix patterns and a prioritized order
are in `docs/RLS_AUDIT.md`. Not auto-fixed — each rewrites live tenant-security
objects and needs per-policy review against the isolation tests.

### DRIFT-01 / AUTH-01 — schema drift + auth setting (P2, FLAGGED)

The three `encrypt_*_pii` functions exist in the DB but in no in-repo migration
(capture them for reproducibility). Supabase Auth **leaked-password protection is
disabled** — enable the HaveIBeenPwned check in Auth settings (2-minute dashboard
toggle).

### SECRETS-01 — secret scan (PASS)

Scanned the working tree and full git history (107 commits) for JWTs, private
keys, and provider keys (`sk_live`, `AIza…`, `ghp_…`, `xoxb-…`). **Clean** — the
only JWT-shaped string is an explicit `.placeholder` anon key in a skill doc.
`.env`, `.env.local`, `.env.*.local` are gitignored. gitleaks now runs in CI to
keep it that way.

## Spot-verification of prior findings (still accurate)

- `USING (TRUE)` policies on `benchmark_snapshots` / `marketplace_vendors` /
  `marketplace_reviews` (flagged 1C-08/09/10 as FIXED) — **confirmed** superseded
  by `20260610_security_hardening.sql` (drops the permissive policies, adds
  tenant-scoped ones).
- Auth middleware correctly reads role/tenant from `app_metadata` only, not the
  user-writable `user_metadata` — **confirmed** (`middleware/auth.ts:42-48`),
  closing the self-escalation path (prior 2B-3 / 2A-3).

## Carried-over open items (from `findings_log.md`, not addressed this pass)

- **2B-2 / 3B-1 (P1):** backend route-level RBAC is uneven — some routers rely on
  frontend gating. `requireRole()` exists and is used in places (e.g. finance
  routes) but is not applied uniformly. Recommend a coverage sweep.
- **2A-1 (P2):** JWT forwarded as a URL query parameter on some paths.
- **1B-01 (P2):** `users.tenant_id` still nullable (no NOT NULL constraint).
- **INT-01:** government integrations (GOSI/Qiwa/Nafath/Noor) remain UI stubs —
  honestly disclosed; activation needs signed agreements + credentials.
