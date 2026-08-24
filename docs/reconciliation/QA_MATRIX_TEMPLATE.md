# QA Matrix — Phase 3 Module Sweep

**Instructions:** Sweep first; do not fix during the first pass. Record pass/fail and link a GitHub issue for every failure. Test each module in **KSA (SA)**, **UAE (AE)**, and **Qatar (QA)** unless the module is jurisdiction-gated.

**Tester:** _______________  
**Date:** _______________  
**Environment:** staging / production (circle one)  
**Tenant IDs:** DEMO-SA `________` · DEMO-AE `________` · DEMO-QA `________`

---

## Criteria key

| Code | Meaning |
|------|---------|
| L | Loads without console error |
| C | Create |
| R | Read / list |
| U | Update |
| D | Delete (or soft-delete where applicable) |
| RLS | Second tenant cannot see data |
| JUR | Correct currency, tax, calendar, locale |
| RTL | Arabic RTL layout acceptable |
| MOB | Mobile viewport usable |
| EMP | Empty state shown |
| ERR | Error state shown (not blank/crash) |

**Result:** ✅ pass · ❌ fail · ⏭ skip (not applicable) · — not tested

---

## Summary

| Module | SA | AE | QA | Blockers |
|--------|----|----|-----|----------|
| Dashboard | | | | |
| Executive Command Center | | | | |
| Admissions | | | | |
| Students | | | | |
| Contacts | | | | |
| Human Resources | | | | |
| Self Service | | | | |
| Fees & Billing | | | | |
| Finance | | | | |
| Procurement | | | | |
| Fixed Assets | | | | |
| Reports | | | | |
| Integrations | | | | |
| Fleet Management | | | | |
| School Clinic | | | | |
| Library | | | | |
| Canteen | | | | |
| CRM | | | | |
| Help Desk | | | | |
| Facilities | | | | |
| Operations | | | | |
| Settings | | | | |
| Subscriptions | | | | |
| Admin Portal | | | | |

---

## Detail rows

Copy this block per module. Replace `{Module}` with the module name.

### {Module}

| Criterion | SA | AE | QA | Notes / Issue |
|-----------|----|----|-----|---------------|
| L | | | | |
| C | | | | |
| R | | | | |
| U | | | | |
| D | | | | |
| RLS | | | | |
| JUR | | | | |
| RTL | | | | |
| MOB | | | | |
| EMP | | | | |
| ERR | | | | |

---

## School lifecycle checklist (handover §3.1)

| Step | SA | AE | QA | Notes |
|------|----|----|-----|-------|
| 1. Registration page opens | | | | |
| 2. Country sets jurisdiction | | | | |
| 3. Submit registration | | | | |
| 4. Admin approves | | | | |
| 5. Tenant provisioned | | | | |
| 6. Onboarding wizard | | | | |
| 7. Branches (subscription limit) | | | | |
| 8. Users added | | | | |
| 9. Roles + permissions | | | | |
| 10. Dashboard correct locale/tax | | | | |

---

## Payment gateway checklist (handover §3.3)

| Step | Moyasar (SA) | Tap (AE) | Notes |
|------|--------------|----------|-------|
| Invoice generated | | | |
| Parent payment link | | | |
| Webhook received | | | |
| Payment record created | | | |
| `post_journal` entry | | | |
| Reconciliation sweep clean | | | |

---

## Severity triage (fill after sweep)

| Issue | Module | Jurisdiction | Severity | GitHub |
|-------|--------|--------------|----------|--------|
| | | | P0 / P1 / P2 | # |
