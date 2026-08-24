# P1-A-3 / P1-A-5 — Dry-run results

**Date:** 2026-08-25  
**Mode:** `DRY_RUN=true` (read-only)  
**Project:** `mhbfvewkjlfmkqdhxpyg` (production — reads only; no writes performed)  
**Script:** `backend/src/scripts/syncAuthMetadata.ts`

> Note: Local `backend/.env` currently points at production. Non-dry-run is blocked unless founder sets `ALLOW_PROD_WRITE=true`. Prefer pointing agents at a **development** project for apply rehearsal.

## Summary

| Metric | Count |
|--------|------:|
| users_with_auth_id | 14 |
| already_clean | 9 |
| would_update_app_metadata | 3 |
| would_strip_user_metadata (linked) | 3 |
| auth_fetch_failures | 0 |
| ghosts (users.tenant_id set, app_metadata.tenant_id null) | **0** |
| orphans_privileged_user_meta (auth users not in public.users) | 6 |
| updated / failed | 0 / 0 (dry-run) |

## P1-A-5 ghost accounts

**None found** on this project for linked `public.users` rows. Remaining risk is privileged keys still sitting on **orphan** auth users (task13c-* test accounts) — dry-run would strip those on apply.

## Founder next step

Follow [SYNC_AUTH_METADATA_RUNBOOK.md](./SYNC_AUTH_METADATA_RUNBOOK.md) Step 3–4 after reviewing this report. Prefer running apply against a dedicated **dev** project first if available.
