# Changelog

All notable changes to the EduSaga 360 programme are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [v0.1.0-phase0-reconciliation] - 2026-08-23

### Added

- Phase 0 reconciliation documentation under `docs/reconciliation/` (access checklist, state ledger, branch assessment, Phase 1 estimate, tenant ID audit, #160 revoke runbook, test results)
- CI guard `guard_user_metadata_tenant_id.py` blocking privileged auth claims in `user_metadata` (SCRUM-45)
- Release notes at `docs/releases/RELEASE_NOTES_v0.1.0-phase0-reconciliation.md`

### Changed

- Documented corrections to handover state ledger (ADR-008 progress, metadata write consolidation status, branch naming)

### Security

- Founder runbook for revoking prior agent production credentials (#160) — execution pending

[Unreleased]: https://github.com/EduSaga360/edusaga-360/compare/v0.1.0-phase0-reconciliation...HEAD
[v0.1.0-phase0-reconciliation]: https://github.com/EduSaga360/edusaga-360/releases/tag/v0.1.0-phase0-reconciliation
