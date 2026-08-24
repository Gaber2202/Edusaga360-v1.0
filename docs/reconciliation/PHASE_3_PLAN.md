# Phase 3 — School Lifecycle QA & Payment Gateways

**Prepared:** 2026-08-25  
**Prerequisite:** Phase 1 tests green (688/688). Phase 2 ideally complete before Tap/UAE gateway; Moyasar KSA can proceed in parallel.

---

## Test gate — PASSED

| Check | Result |
|-------|--------|
| Backend `npm test --run` | **688/688 passed** (pre-Phase 3 starter) |
| Phase 1 money path | Green |
| Golden fee-resolution | Updated |

**Founder items still open:** reconciliation sign-off, staging Supabase, prod migrations, Tap commercial terms (#1).

---

## Phase 3 objective

Documented zero-defect pass across the full school journey in **KSA, UAE, and Qatar**, plus live payment gateways with GL posting (handover §Phase 3 gate).

---

## Epic order

### P3-A — School lifecycle journey (highest priority)

**Handover steps 1–10** tested as a real school, not as a developer.

| Step | Assertion | Status |
|------|-----------|--------|
| 1–3 | Registration form submits for SA/AE/QA | API tests ✅ |
| 2 | Country → `jurisdiction_code` (no IP/locale) | `countryJurisdiction.ts` + tests ✅ |
| 4–5 | Approval-only tenant creation | `schoolLifecycle.test.ts` ✅ |
| 6 | Onboarding wizard | Existing `registration-onboarding.test.ts` ✅ |
| 7 | Branch count server-side | DB trigger migration + `branchLimits.ts` ✅ (apply on staging) |
| 8–9 | Users + roles + RLS | Manual QA + `rf006-tenant-idor.test.ts` extend |
| 10 | Dashboard currency/tax/calendar/locale | Manual QA per jurisdiction |

**Deliverables:**
- `backend/src/__tests__/schoolLifecycle.test.ts` — API contract tests
- Playwright/manual runbook (TODO: `docs/reconciliation/SCHOOL_LIFECYCLE_RUNBOOK.md`)
- One tenant per jurisdiction on staging: `DEMO-SA`, `DEMO-AE`, `DEMO-QA`

**Estimate:** 5–7 days (API done; UI E2E + RLS proof remaining)

---

### P3-B — Module QA matrix (sweep first, fix later)

**Modules:** Dashboard · Executive Command Center · Admissions · Students · Contacts · HR · Self Service · Fees & Billing · Finance · Procurement · Fixed Assets · Reports · Integrations · Fleet · Clinic · Library · Canteen · CRM · Help Desk · Facilities · Operations · Settings · Subscriptions · Admin Portal.

**Per module × jurisdiction:** load · CRUD · RLS · jurisdiction correctness · Arabic RTL · mobile · empty/error states.

**Deliverable:** `docs/reconciliation/QA_MATRIX.md` (from template) — pass/fail + linked issue per failure. **Do not fix on first pass.**

**Estimate:** 8–12 days (parallel QA engineer)

---

### P3-C — Payment gateways

#### KSA — Moyasar (in progress)

| Item | Status |
|------|--------|
| Public webhook `/api/public/billing/moyasar/webhook` | ✅ Exists |
| HMAC + idempotency | ✅ Tested |
| Reconciliation sweep (15 min cron) | ✅ `backend/src/index.ts` |
| **GL journal on webhook payment** | ✅ Added Phase 3 starter |
| Marketplace / sub-merchant model | Founder/commercial |
| Bulk Create for term runs | Partial — verify on staging |

**Test:** `collections-moyasar-webhook.test.ts` asserts `post_journal` RPC with acct 11/12.

#### UAE — Tap

**Blocked on:** Phase 2 `PaymentProvider` abstraction (P2-E) + founder Tap terms (#1).

Adapter must not be a second bespoke integration — wrap Tap behind the same interface as Moyasar.

#### E2E payment path (both gateways)

```
invoice → parent payment → webhook → payment record → post_journal → reconciliation sweep
```

**Estimate:** KSA 3–5 days after staging; UAE blocked on P2-F

---

## Migrations (Phase 3 starter)

| File | Purpose |
|------|---------|
| `20260825_04_branch_limit_enforcement.sql` | `BEFORE INSERT` trigger on `branches` |

Apply via `scripts/applyMigrations.mjs` on **staging only** until founder sign-off.

---

## Environment

| Variable | Purpose |
|----------|---------|
| `MOYASAR_WEBHOOK_SECRET` | Webhook HMAC |
| `MOYASAR_WEBHOOK_ACTOR_ID` | UUID for `post_journal` created_by (optional; defaults to system sentinel) |

---

## Sequencing note

Handover formally gates Phase 3 after Phase 2. **Tap/UAE** requires P2-E/F. **School lifecycle + Moyasar GL** can proceed now on staging while Phase 2 branch provisioning ships.

---

## First PRs

1. `work-p3a-lifecycle` — country/jurisdiction, branch limit trigger, lifecycle tests, Moyasar GL posting
2. `work-p3b-qa-matrix` — filled matrix from staging sweep (docs only)
3. `work-p3c-moyasar-staging` — staging credentials + live webhook smoke (founder)

---

## Exit gate

- [ ] School lifecycle documented pass: SA, AE, QA
- [ ] QA matrix complete with triaged failures
- [ ] Moyasar live on staging with journal posting verified
- [ ] Tap live on staging (after P2-F + founder terms)
- [ ] Reconciliation sweep shows zero drift for test payments
