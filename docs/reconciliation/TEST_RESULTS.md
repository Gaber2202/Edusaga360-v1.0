# Test Results — Phase 0 Reconciliation Release

**Date:** 2026-08-23  
**Branch:** `Prod` (local, uncommitted)  
**Release:** v0.1.0-phase0-reconciliation  
**Runner:** Ahmed Gaber (local)

---

## Summary

| Suite | Result | Pass | Fail | Skip | Notes |
|-------|--------|------|------|------|-------|
| Backend auth + billing (vitest) | ✅ PASS | 31 | 0 | 0 | `auth.test`, `registration-admin-auth.test`, `billing.test` |
| Guard: user_metadata tenant_id | ✅ PASS | — | — | — | Main scan + 6 fixture tests |
| Guard: invoices.balance | ✅ PASS | — | — | — | |
| Guard: jurisdiction resolution | ✅ PASS | — | — | — | |
| Guard: jurisdiction fixtures | ✅ PASS | — | — | — | `test_guard_jurisdiction_resolution.py` |
| Full backend suite | ⏭️ NOT RUN | — | — | — | Focused suites only (full suite ~70s+ per file) |
| Frontend tests | ⏭️ NOT RUN | — | — | — | No frontend code changed |
| GitHub Actions CI | ⏭️ BLOCKED | — | — | — | Billing blocked per handover; guards verified locally |

---

## Backend tests (focused)

```bash
cd backend && npm test -- auth.test billing.test
```

```
Test Files  3 passed (3)
     Tests  31 passed (31)
  Duration  69.42s
```

**billing.test.ts:** 18/18 pass (invoice creation, ZATCA submit, credit notes mocked)  
**auth.test.ts:** 7/7 pass (app_metadata reads, platform owner)  
**registration-admin-auth.test.ts:** 6/6 pass

---

## CI guard scripts (local)

```bash
python3 .github/scripts/guard_user_metadata_tenant_id.py          # OK
python3 .github/scripts/test_guard_user_metadata_tenant_id.py     # OK (3 catch + 3 allow)
python3 .github/scripts/guard_invoices_balance.py                 # OK
python3 .github/scripts/guard_jurisdiction_resolution.py            # OK
python3 .github/scripts/test_guard_jurisdiction_resolution.py       # OK
```

**Note:** `guard_rls_migrations.py` requires Python 3.10+ (local 3.9 fails on union syntax). CI uses ubuntu-latest with Python 3.10+.

---

## Manual verification (docs)

| Deliverable | Verified |
|-------------|----------|
| ACCESS_CHECKLIST.md | ✅ Repo scan + workflow inventory |
| STATE_LEDGER_RECONCILIATION.md | ✅ Grep + file inspection on Prod @ fb98ccb |
| WORK_257_239_ASSESSMENT.md | ✅ Branch diff vs origin/devin/* |
| PHASE_1_ESTIMATE.md | ✅ Derived from reconciliation |
| TENANT_ID_WRITE_PATHS.md | ✅ All createUser/updateUserById paths audited |
| REVOKE_160_FOUNDER_RUNBOOK.md | ✅ Document only — founder execution pending |

---

## Not tested (out of scope / blocked)

- Production Supabase queries (read-only access not granted)
- `syncAuthMetadata.ts` DRY_RUN against live dev (requires dev credentials)
- Flutter parent-mobile (not in scope)
- Full multicountry E2E (Phase 1-F, not started)
