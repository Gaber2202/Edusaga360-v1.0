# P1-A-3 / P1-A-5 — Sync Auth Metadata Runbook (Founder)

**Handover:** Phase 1 §1.2  
**Script:** `backend/src/scripts/syncAuthMetadata.ts`  
**Owner of production write:** Muhammed Hassan (founder) only  

---

## Purpose

Consolidate privileged claims onto `app_metadata` and strip them from `user_metadata`:

| Key | Allowed location |
|-----|------------------|
| `tenant_id`, `role`, `user_role`, `is_platform_owner` | `app_metadata` only |
| Display names | `user_metadata` |

Also reports **ghost accounts** (P1-A-5): `public.users.tenant_id` set but `app_metadata.tenant_id` null — causes `??` / `XXX` currency / intermittent 403s.

---

## Safety

1. Agent sessions must never set `ALLOW_PROD_WRITE=true`.
2. Production project ref `mhbfvewkjlfmkqdhxpyg` refuses non-dry-run unless founder sets `ALLOW_PROD_WRITE=true`.
3. Always dry-run first; review the SUMMARY JSON before any write.

---

## Step 1 — Dev dry-run

```bash
cd backend
# Point SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY at the DEVELOPMENT project
DRY_RUN=true npx tsx src/scripts/syncAuthMetadata.ts | tee /tmp/sync-auth-metadata-dev.json
```

Confirm SUMMARY fields:

- `would_update_app_metadata`
- `would_strip_user_metadata`
- `ghosts[]`
- `orphans_privileged_user_meta`
- `auth_fetch_failures` == 0 (investigate if not)

---

## Step 2 — Dev apply (optional rehearsal)

```bash
cd backend
# Still DEVELOPMENT project only
DRY_RUN=false npx tsx src/scripts/syncAuthMetadata.ts | tee /tmp/sync-auth-metadata-dev-apply.json
```

Spot-check 2–3 users in Supabase Auth: `app_metadata.tenant_id` present; privileged keys absent from `user_metadata`.

---

## Step 3 — Production dry-run (read-only)

```bash
cd backend
# Production credentials — read-only dry-run
DRY_RUN=true npx tsx src/scripts/syncAuthMetadata.ts | tee /tmp/sync-auth-metadata-prod-dry.json
```

Attach SUMMARY to Jira (P1-A-3 / SCRUM metadata story). Escalate if `ghosts` is unexpectedly large.

---

## Step 4 — Production apply (founder only)

```bash
cd backend
DRY_RUN=false ALLOW_PROD_WRITE=true npx tsx src/scripts/syncAuthMetadata.ts | tee /tmp/sync-auth-metadata-prod-apply.json
```

Record in Jira:

- Timestamp
- Counts from SUMMARY (`updated`, `ghosts` length, `failed`)
- Confirmation that demo tenants still log in

---

## Rollback

There is no automatic rollback. If a user is broken:

1. Re-run the script (idempotent for already-clean users), or
2. Manually set `app_metadata` from the matching `public.users` row via Auth Admin API / dashboard.

Do **not** put `tenant_id` back into `user_metadata`.

---

## Related

- Write-path audit: `docs/reconciliation/TENANT_ID_WRITE_PATHS.md`
- CI guard: `.github/scripts/guard_user_metadata_tenant_id.py`
- Credential revoke: `docs/reconciliation/REVOKE_160_FOUNDER_RUNBOOK.md`
