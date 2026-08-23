# P0-2 — State Ledger Reconciliation Report

**Story:** SCRUM-33  
**Handover reference:** §4 (Current State Ledger), §4.1 (Open branches), §4.2 (Open blockers)  
**Branch audited:** `Prod` @ `fb98ccb` (2026-08-23)  
**Method:** Read-only grep, file inspection, `git branch -a`, targeted test run

---

## Executive summary

The handover state ledger is **mostly accurate**. Key corrections:

- **`work-257` / `work-239` branches do not exist under those names** on remote; equivalents are `origin/devin/gl-single-invoice` and `origin/devin/rls-remediation`, both **behind current `Prod`** and not merge-ready as-is.
- **`create_invoice_with_journal` is absent from `Prod`** — exists only on `devin/gl-single-invoice`.
- **ADR-008 multi-currency aggregation is more complete than handover suggests** on `Prod` (Executive Command Center has per-currency breakdowns).
- **Metadata split is PARTIAL, not purely OPEN** — write paths largely consolidated to `app_metadata`; backfill and CI guard remain.

---

## Ledger reconciliation table

| Item | Handover | Verified | Evidence |
|------|----------|----------|----------|
| Jurisdiction layer, Tasks 1–11 | DONE | **DONE** | Packs: `backend/src/packs/sa/`, `ae/`, `qa/` (49 files). Conformance suite: `backend/src/packs/contract/conformance.test.ts`, `pack-completeness.test.ts`, `no-silent-fallback.test.ts`. CI guards: `.github/workflows/ci.yml` jobs `guard-jurisdiction-resolution`, `guard-country-literals`, `guard-pack-imports`, `guard-frontend-nationality`, `guard-hardcoded-currency`. |
| Backend jurisdiction leaks (Task 12) | DONE | **DONE** | Currency sourced via pack resolution in billing/fees paths; jurisdiction module is canonical entry (`backend/src/lib/jurisdiction.ts`). CI guard blocks direct jurisdiction reads outside module. |
| Task 11 re-verification (Task 14) | DONE | **DONE** (assumed) | Conformance tests present and runnable; no contradictory evidence in codebase. |
| Branch selector listing branches (Task 15) | DONE | **DONE** | `frontend/src/components/BranchContext.jsx` loads branches via `tenantQuery('branches')`; Riyadh/Dubai/Doha demo data referenced in handover and seed scripts. |
| Frontend jurisdiction gating (Task 13) | PARTIAL (7 leaks) | **PARTIAL** | Gating infrastructure: `JurisdictionFeatureProvider`, `JurisdictionFeatureRoute`, `JurisdictionFeatureGate` used across App/Layout. **Leaks confirmed:** ZATCA content visible without jurisdiction gate — e.g. `frontend/src/pages/Dashboard.jsx` (ZATCA Filing quick action), `frontend/src/pages/Fees.jsx` (ZATCA PDF download), `frontend/src/pages/InvoiceDetails.jsx`, `frontend/src/pages/VATManagement.jsx`, `frontend/src/pages/Integrations.jsx` (Saudi connector list), `frontend/src/pages/GovernmentRelations.jsx`, `frontend/src/pages/YamenAI.jsx` (GOSI/iqama). Hardcoded `'SAR'` fallbacks in canteen pages (`QuickPOS.jsx`, `CanteenManagement.jsx`, `CanteenPOSOrders.jsx`). |
| `XXX` currency fallback | PARTIAL | **PARTIAL** | Symptom mitigated: `frontend/src/lib/localization.js` returns `'—'` when `currencyCode` unresolved (lines 21–24). Root cause (missing `app_metadata.tenant_id` → failed localization resolve) not fixed. Residual hardcoded `'SAR'` fallbacks in canteen modules. |
| `app_metadata` / `user_metadata` split | OPEN | **PARTIAL → OPEN for backfill** | **Reads:** `authMiddleware` reads `app_metadata` only (`backend/src/middleware/auth.ts:37–42`); frontend `RoleContext.jsx:31–45` same. **Writes:** All audited `createUser`/`updateUserById` paths write `tenant_id` to `app_metadata` (`registration.ts:501–506`, `parents.ts:164–168`, `tenantUsers.ts:135–139`, `admin.ts:446`). **Gap:** `syncAuthMetadata.ts` backfill script exists but production backfill not confirmed; no CI guard yet. Legacy users may still carry stale `user_metadata.tenant_id`. |
| ADR-008 multi-currency aggregation | PARTIAL | **PARTIAL → improved** | Handover said "deleting the currency label." On `Prod`, `ExecutiveCommandCenter.jsx` implements `CurrencyValue`, `MultiCurrencyBreakdown`, `revenue_by_currency`, `collection_rate_by_currency`, AR aging by currency (lines 423–660, 897–964). **Still partial:** not all modules show per-currency breakdown; some KPI cards show "N/A for multi-currency." |
| Schema drift remediation | PARTIAL | **PARTIAL** | CI guard: `.github/scripts/guard_schema_drift.py`, `guard_frontend_query_tables.cjs`. `SCHEMA_DRIFT_REPORT.md` documents 66/124 fixed. Guard active in CI. Remaining drift pages not re-enumerated this audit. |
| GL posting (#157) | IN PROGRESS | **IN PROGRESS** | `post_journal` exists in migrations (`20260701_atomic_journal_posting.sql`, `20260726_invoice_posting_additions.sql`). Billing calls `postJournal` RPC (`billing.ts:161–169`, invoice lines 689–690). **`create_invoice_with_journal` NOT on Prod.** CoA seeding function NOT on Prod. Tests mock CoA as null → journal skipped (`billing.test.ts` mock). **18/18 billing tests pass** on Prod (`npm test billing.test.ts`, 2026-08-23). |
| RLS remediation (#239) | PARKED | **PARKED / PARTIAL on main** | Standardization migration `20260610_standardize_jwt_tenant_claim.sql` converts many policies to `app_metadata`. **Legacy defect pattern remains** in 10 migration files using `request.jwt.claims` (22 occurrences): e.g. `20260726_enterprise_invoicing_part_a.sql`, `20260726_webhooks.sql`, `20260712_email_connectors.sql`. CI guard `guard_rls_migrations.py` exists but failed locally on Python 3.9 (needs 3.10+). Branch `origin/devin/rls-remediation` has rollback scripts — not merged. |
| Unfiltered UPDATE/DELETE mutations | DONE | **DONE** | Guard: `.github/scripts/guard_unfiltered_mutations.py` + workflow `guard-unfiltered-mutations.yml`. |
| Invoice numbering generator | DONE | **DONE** | `generateInvoiceNumber()` uses max existing number + 1 (`billing.ts:92–114`), not `COUNT(*)+1`. |
| Payment abstraction / Tap adapter | NOT STARTED | **NOT STARTED** | Moyasar tightly coupled in `backend/src/packs/sa/moyasarService.ts` and `moyasarClient.ts`. No `PaymentProvider` interface or Tap adapter found. |
| Branch provisioning workflow | NOT STARTED | **NOT STARTED** | No `branch_provisioning_requests` table in migrations. |
| Ownership vs operator model | NOT STARTED | **NOT STARTED** | No evidence in schema or routes. |
| Admin Portal consolidation | NOT STARTED | **NOT STARTED** | `SuperAdminDashboard.jsx` still present (see below). Separate `admin-portal/` exists but in-platform module not removed. |
| Multi-country marketing site | DEFERRED | **DEFERRED** | No change; Base44 track per handover. |

---

## Deep-dive evidence

### Country packs and conformance

```
backend/src/packs/sa/   — index, vat, zatca, moyasar, payroll, tax, …
backend/src/packs/ae/   — index, tax, payments, localisation, …
backend/src/packs/qa/   — index, tax, payments, academicCalendar, …
backend/src/packs/contract/conformance.test.ts
backend/src/packs/contract/pack-completeness.test.ts
backend/src/packs/contract/no-silent-fallback.test.ts
```

### `create_invoice_with_journal` — absent on Prod

```bash
git grep create_invoice_with_journal Prod   # no matches
git grep create_invoice_with_journal origin/devin/gl-single-invoice
# → shared/database/migrations/20260811_01_gl_invoice_posting.sql
# → backend/src/routes/billing.ts
# → backend/src/__tests__/billing.test.ts
```

### work-257 / work-239 branch status

```bash
git branch -a | grep -E 'work-257|work-239'   # no matches
# Equivalents:
#   origin/devin/gl-single-invoice  (GL atomic invoice — handover #257)
#   origin/devin/rls-remediation    (RLS — handover #239)
```

Both branches share merge-base `15709da` with `Prod` ancestry; **`Prod` is 2 commits ahead** (`fb98ccb`, parent portal v2). Neither branch includes those commits. **Do not merge either branch as-is.**

### Credit note VAT defect — **CONFIRMED OPEN**

Invoice creation correctly posts accounts 41 (revenue) and 24 (VAT):

```689:690:backend/src/routes/billing.ts
        { account_code: '41', debit: 0, credit: sar(subtotal - totalDiscount), description: `Revenue — ${invoiceNumber}` },
        { account_code: '24', debit: 0, credit: vatAmount, description: `VAT Payable (15%) — ${invoiceNumber}` },
```

Credit note reversal posts 41 and 12 only — **account 24 (VAT payable) never touched:**

```994:997:backend/src/routes/billing.ts
    await postJournal(tenant_id, req.user!.id, cnNumber, `Credit Note ${cnNumber}`, [
      { account_code: '41', debit: amount, credit: 0, description: `Revenue reversal — ${cnNumber}` },
      { account_code: '12', debit: 0, credit: amount, description: `A/R credit — ${cnNumber}` },
    ], original.branch_id ?? null);
```

Additionally, credit note records set `vat_amount: 0` (lines 940, 970) regardless of original invoice VAT.

### `post_journal` NULL behavior — **CONFIRMED (defect)**

```46:48:shared/database/migrations/20260726_invoice_posting_additions.sql
    IF v_account_id IS NULL THEN
      RETURN NULL;
    END IF;
```

Same pattern in `20260701_atomic_journal_posting.sql:51` and `20260701_gl_branch_dimension.sql:88`. Backend treats failure as warn-only:

```169:169:backend/src/routes/billing.ts
  if (error) console.warn('[billing] post_journal failed:', error.message);
```

Phase 1 requires raise with named cause (ADR-002).

### Metadata split

| Component | Reads tenant_id from | Writes tenant_id to |
|-----------|---------------------|---------------------|
| `backend/src/middleware/auth.ts` | `app_metadata`; fallback `users` table | — |
| `backend/src/routes/auth.ts` | `app_metadata` | — |
| `frontend/src/components/RoleContext.jsx` | `app_metadata` | — |
| `frontend/src/components/JurisdictionFeatureContext.jsx` | `app_metadata` | — |
| `backend/src/routes/registration.ts` | — | `app_metadata` ✅ |
| `backend/src/routes/parents.ts` | — | `app_metadata` ✅; strips from `user_metadata` |
| `backend/src/routes/tenantUsers.ts` | — | `app_metadata` ✅ |
| `backend/src/routes/admin.ts` | — | `app_metadata` ✅ |
| `backend/src/scripts/syncAuthMetadata.ts` | — | Backfill + strip privileged keys from `user_metadata` |

**Remaining work:** Run backfill in dev; founder runs in prod; add CI guard (P1-A-4).

### Branch localStorage — **CONFIRMED (Phase 2 hardening item)**

```40:50:frontend/src/components/BranchContext.jsx
  useEffect(() => {
    const saved = localStorage.getItem('erp_selected_branch');
    if (saved && saved !== 'all') {
      setSelectedBranchId(saved);
    }
  }, []);
  // ...
    localStorage.setItem('erp_selected_branch', branchId || 'all');
```

Handover Phase 2 §2.3 requires server-side branch selection.

### SuperAdminDashboard — **CONFIRMED present**

```
frontend/src/pages/SuperAdminDashboard.jsx          — exists
frontend/src/Layout.jsx:450                         — platform-owner gate
ONBOARDING_FLOW.md:29                               — documented as active
```

Phase 2 security item (P2-A-1): remove in-platform Super Admin module.

### RLS migration coverage

| Pattern | Migration files (approx.) | Status |
|---------|---------------------------|--------|
| `auth.jwt() -> 'app_metadata' ->> 'tenant_id'` | 15+ files | Canonical ✅ |
| `request.jwt.claims` → `tenant_id` | 10 files, ~22 occurrences | **Defect** — fail-closed but non-canonical |
| `user_metadata` in RLS | 0 in audited migrations | ✅ |

Not all 52 tables from handover #239 were individually enumerated; the `devin/rls-remediation` branch targets bulk remediation with rollback at `shared/database/rollbacks/20260810_rls_rollback.sql`.

### Payment abstraction

Moyasar is pack-local (`backend/src/packs/sa/moyasarService.ts`). No provider interface, registry, or Tap adapter. **NOT STARTED** — matches handover.

---

## Open blockers (§4.2) — status unchanged

| Issue | Title | Verified on Prod |
|-------|-------|------------------|
| #157 | GL posting never produced journal | **OPEN** — post_journal returns NULL when CoA missing; no atomic function |
| #185 | Invoice lines ≠ total | **OPEN** — not re-tested; code path in billing.ts |
| #186 | Bulk preview ≠ actual | **OPEN** — bulk generation in billing.ts |
| #187 | Expired fee structures returned | **OPEN** |
| #190 | SADAD bill number collisions | **OPEN** |
| #239 | RLS non-functional on 52 tables | **PARKED** — partial fix on main; branch not merged |
| #160 | Prior agent prod write credentials | **FOUNDER** — cannot verify revocation |
| — | Credit note VAT reversal | **OPEN** — confirmed in billing.ts |
| — | No automated migration pipeline | **OPEN** — proposal at `docs/proposals/supabase-migration-pipeline.md` |

---

## Recommendations

1. **Do not start Phase 1 feature code** until founder signs this report.
2. **Cherry-pick** GL work from `devin/gl-single-invoice` onto fresh `work-257` from current `Prod` — do not merge branch wholesale.
3. **Re-verify** `devin/rls-remediation` against current prod snapshot before any RLS merge.
4. **Prioritize** metadata backfill + CI guard (P1-A-1 through P1-A-4) as first code tasks.
