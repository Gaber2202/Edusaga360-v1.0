# P0-4 — Phase 1 Estimate

**Story:** SCRUM-142 (Phase 1 estimate)  
**Handover reference:** §8 (What I need in first 72 hours, item 4)  
**Prepared:** 2026-08-23  
**Depends on:** P0-2 reconciliation report sign-off

---

## Estimate summary

| Metric | Value |
|--------|-------|
| **Duration** | **35–40 working days** (~7–8 weeks at 1 engineer) |
| **Story points** | ~85–100 |
| **Sprints** | 4 × 2-week sprints (with founder gate at end) |
| **Start condition** | Founder sign-off on `STATE_LEDGER_RECONCILIATION.md` + CI billing restored |

---

## Work breakdown

| Epic | Days | Notes |
|------|------|-------|
| P1-A Metadata consolidation + backfill + CI guard | 5–7 | Backfill script exists; prod run is founder-owned |
| P1-B GL posting #257 (cherry-pick + ZATCA lock + post_journal raise) | 8–10 | Highest technical risk |
| P1-C RLS #239 (re-verify + standalone migration) | 8–10 | Must not bundle with #257 |
| P1-D Money blockers (#185, #186, #187, #190, credit note VAT) | 7–9 | Each needs regression test |
| P1-E Tax treatment matrix (UAE category rates) | 5–7 | Blocked partially by founder decision #5 |
| P1-F Jurisdiction leak sweep + ADR-008 completion | 5–7 | 7+ frontend leaks + executive dashboard gaps |
| P1-G Pipeline restoration (CI billing, migration pipeline, #160) | 3–5 | Founder decisions on GitHub/Vercel plans |

**Buffer:** 5 days for founder sign-off cycles, snapshot access delays, and re-verification.

---

## Top 3 risks

### 1. #257 merged without CoA seeding or on stale branch base

**Impact:** Every invoice creation returns 422; demo tenant broken.  
**Mitigation:** Cherry-pick from `devin/gl-single-invoice` onto fresh `work-257` from current `Prod`; keep seeding + function in same PR; E2E test on demo tenant before merge.

### 2. #239 applied from stale snapshot (pre-#254)

**Impact:** RLS gaps remain or policies break newly added tables.  
**Mitigation:** Export current prod policy inventory; fresh `work-239` branch; standalone PR with tested rollback; tenant A/B isolation suite.

### 3. Metadata split — production backfill not run

**Impact:** `XXX` currency, ghost accounts, intermittent 403s persist despite code fixes.  
**Mitigation:** Run `syncAuthMetadata.ts` in dev first; founder runs prod script; CI guard blocks new `user_metadata.tenant_id` writes.

---

## Blockers before Phase 1 starts

| Blocker | Owner |
|---------|-------|
| GitHub Actions billing restored | Founder (#10) |
| Prod read-only snapshot for RLS re-verify | Founder |
| Revoke prior agent prod credentials (#160) | Founder |
| Sign-off on reconciliation report | Founder |
| KSA national student VAT position (#5) | Founder — before commercial tax matrix reliance |

---

## Gate to Phase 2

All §4.2 blockers closed · CI green · GL posts balanced journal in SA/AE/QA · conformance suite passes · founder sign-off.
