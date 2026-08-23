# Release Notes — v0.1.0-phase0-reconciliation

**Version:** v0.1.0-phase0-reconciliation  
**Date:** 2026-08-23  
**Type:** Documentation + CI guard (no application runtime changes)  
**Branch baseline:** `Prod` @ `fb98ccb`

---

## Summary

First structured release of the EduSaga 360 Phase 0 reconciliation programme. Delivers the 72-hour handover deliverables (access checklist, state ledger audit, work-257/239 assessment, Phase 1 estimate), completes the tenant_id write-path audit (P1-A-1), documents founder-run credential revocation (#160), and adds a CI guard blocking privileged auth claims in `user_metadata`.

No package version bumps — application packages remain at `1.0.0`. This is a programme milestone, not a production deploy.

---

## Added

- **Phase 0 reconciliation docs** (`docs/reconciliation/`)
  - `ACCESS_CHECKLIST.md` — SCRUM-4 / P0-1
  - `STATE_LEDGER_RECONCILIATION.md` — SCRUM-33 / P0-2
  - `WORK_257_239_ASSESSMENT.md` — SCRUM-34 / P0-3
  - `PHASE_1_ESTIMATE.md` — SCRUM-35 / P0-4
  - `TENANT_ID_WRITE_PATHS.md` — SCRUM-36 / P1-A-1
  - `REVOKE_160_FOUNDER_RUNBOOK.md` — SCRUM-41 / P1-G-3 (founder action)
  - `TEST_RESULTS.md` — test evidence for this release
- **CI guard:** `guard_user_metadata_tenant_id.py` + fixture tests — SCRUM-45 / P1-A-4
- **CI workflow job:** `guard-user-metadata-tenant-id` in `.github/workflows/ci.yml`
- **Release notes:** this file
- **CHANGELOG.md** at repo root

---

## Changed

- State ledger corrections documented (see `STATE_LEDGER_RECONCILIATION.md`):
  - ADR-008 Executive Dashboard more complete than handover stated
  - Metadata write paths largely consolidated; backfill still required
  - `work-257`/`work-239` mapped to `devin/gl-single-invoice` and `devin/rls-remediation` — **not merge-ready as-is**

---

## Fixed

- None (runtime). P1-A-2 write consolidation was already present on `Prod`; audit confirms no active `user_metadata.tenant_id` writers.

---

## Security

- CI guard prevents regression: new code cannot write `tenant_id`, `role`, `user_role`, or `is_platform_owner` to `user_metadata`
- Founder runbook prepared for #160 credential revocation (not yet executed)

---

## Known blockers (founder actions)

| Blocker | Jira | Owner |
|---------|------|-------|
| Dev Supabase full access + prod read-only snapshot | SCRUM-4 | Founder |
| GitHub Actions billing restore | SCRUM-38 / P1-G-1 | Founder |
| Revoke prior agent prod credentials (#160) | SCRUM-41 | Founder |
| Run `syncAuthMetadata.ts` on production | P1-A-3 | Founder |
| Prod baseline count verification | SCRUM-4 | Founder |
| KSA national-student VAT decision (#5) | P1-E | Founder |

---

## Jira references

| Key | Story | Status after release |
|-----|-------|---------------------|
| SCRUM-3 | EDU-P0: Programme Kickoff | Done (Phase 0 docs complete) |
| SCRUM-4 | P0-1: Access checklist | Done |
| SCRUM-33 | P0-2: State ledger reconciliation | Done |
| SCRUM-34 | P0-3: work-257/239 assessment | Done |
| SCRUM-35 | P0-4: Phase 1 estimate | Done |
| SCRUM-36 | P1-A-1: Tenant ID audit | Done |
| SCRUM-37 | P1-A-2: Consolidate writes | Done (pre-existing on Prod) |
| SCRUM-45 | P1-A-4: CI guard | Done |
| SCRUM-41 | P1-G-3: Revoke #160 | In Progress (runbook ready; founder must execute) |
| SCRUM-7 | EDU-P1-A epic | In Progress |

---

## Upgrade / migration notes

**None.** No database migrations, no deploy required. To activate the CI guard, merge to a branch that triggers GitHub Actions (requires billing restore).

**Recommended next steps after merge:**

1. Founder executes `REVOKE_160_FOUNDER_RUNBOOK.md`
2. P1-A-3: `DRY_RUN=true` syncAuthMetadata on dev, then founder prod run
3. P1-B-1: Fresh `work-257` cherry-pick from `devin/gl-single-invoice` onto current `Prod`

---

## Test evidence

See `docs/reconciliation/TEST_RESULTS.md`.

- Backend: 31/31 tests pass (auth + billing focused)
- Guards: all local guard scripts pass
- CI: not verified remotely (billing blocked)
