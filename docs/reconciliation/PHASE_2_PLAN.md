# Phase 2 — Multi-Country Branch Management & Localization

**Prepared:** 2026-08-25  
**Prerequisite:** Phase 1 tests green; founder Phase 1 gate sign-off before merge to `Prod`.

---

## Phase 1 test gate — PASSED

| Check | Result |
|-------|--------|
| Backend `npm test --run` | **688/688 passed** |
| Bulk dry-run (#186) | Pass — `estimated_total` matches actual after discount fix |
| Golden fee-resolution | Updated — `redistributed_discount_matches_discount_amount: true`, case E aligned |
| Metadata CI guard | OK |

**Phase 1 founder items still open:** reconciliation sign-off, Actions billing, #160 revoke, staging Supabase, prod metadata apply, prod RLS snapshot, decision #5.

---

## Phase 2 objective

A group CEO can request a branch in a second country, get it provisioned, switch into it, and everything re-resolves correctly (handover §Phase 2).

**Exit gate:** DEMO-AE tenant provisions UAE branch, switches server-side, sees AED / UAE tax / UAE integrations — no KSA leakage.

---

## Epic order

1. **P2-A** Admin portal security (remove in-app Super Admin)
2. **P2-B** Branch provisioning workflow + activation gate
3. **P2-C** Server-side branch context (remove `localStorage`)
4. **P2-D** Switcher UX + ADR-008 group mode completion
5. **P2-E** PaymentProvider abstraction + Moyasar adapter
6. **P2-F** Tap adapter (blocked on founder commercial terms)
7. **P2-G** Ownership vs operator model
8. **P2-H** Government capability registry

One concern per PR. First PR: `work-p2a-admin-security`.

---

## P2-A — Admin Portal consolidation (security)

**Remove:** `frontend/src/pages/SuperAdminDashboard.jsx` from school app routes/nav.

**Move to:** `admin-portal/` only — registration approval, tenant management, platform analytics.

**Auth:** `platform_admin` is not a tenant role; platform staff never carry school `tenant_id` in school-app JWT.

**Audit:** `is_platform_owner` paths in `tenantUsers.ts`, `resolveTenant.ts`, `registration.ts`.

**Tests:** extend `rf006-tenant-idor.test.ts`.

**Estimate:** 5–7 days

---

## P2-B — Branch provisioning workflow

**Tables:** `branch_provisioning_requests`, `branch_provisioning_artifacts`, `branch_activation_checks`; alter `branches` (`status`, `activated_at`, `provisioning_request_id`).

**API:** `backend/src/routes/branchProvisioning.ts` — submit, review, activate.

**Activation gate (ADR-002 named failures):**

1. Pack exists for jurisdiction  
2. Commercial addendum referenced  
3. Artifacts verified  
4. Currency/locale/weekend/calendar explicit — no `XXX`  
5. Tax matrix covers all fee categories in use  
6. Numbering series allocated  
7. CoA seeded (`seed_standard_chart_of_accounts`)

**Estimate:** 10–12 days

---

## P2-C — Server-side branch context

**Replace:** `localStorage` in `BranchContext.jsx` with `GET/PUT /api/user/branch-context`.

**Store:** `user_branch_preferences` or equivalent server record.

**On switch:** re-resolve jurisdiction, currency, tax, locale, RTL, calendar, payment gateway, compliance banners.

**Tests:** user cannot set another tenant's branch_id.

**Estimate:** 6–8 days

---

## P2-D — Switcher + ADR-008

**UI:** Top bar shows `AE · Dubai Campus · AED` or `All Branches (Group)`.

**Group mode:** Complete per-currency breakdowns in Executive Command Center; no cross-currency sums.

**Estimate:** 5–7 days

---

## P2-E — Payment provider abstraction

**Interface:** `backend/src/payments/PaymentProvider.ts`

**Implement:** `MoyasarProvider` extracted from `packs/sa/moyasarService.ts`; registry `resolvePaymentProvider(jurisdiction)`.

**Keep Infobip separate** from payments.

**Estimate:** 6–8 days

---

## P2-F — Tap adapter

Blocked on founder decision #1 (Tap commercial terms). Ship interface + Moyasar first; `TapProvider` when credentials exist.

**Estimate:** 8–10 days after unblock

---

## P2-G — Ownership vs operator

**Schema:** `school_relationships` (own | operate | franchise). Consolidated billing deferred (decision #7).

**Estimate:** 5–7 days

---

## P2-H — Government capability registry

**API:** `GET /api/jurisdiction/capabilities` — live | buildable | dormant | unavailable.

**UI:** Integrations module reads registry; dormant shows explicit 2FA fallback message.

**Estimate:** 4–6 days

---

## Total estimate

~**41–55 working days** (excluding Tap live) + 5 days buffer.

---

## Founder dependencies

| # | Blocks |
|---|--------|
| 1 | Tap terms → P2-F |
| 2 | Tabby category → BNPL |
| 3 | UAE PASS SP → UAE PASS live |
| 6 | Price books → provisioning pricing |
| 7 | Operator accounting → P2-G billing |
