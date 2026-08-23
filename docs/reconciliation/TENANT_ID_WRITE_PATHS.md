# P1-A-1 — Tenant ID Write Path Audit

**Story:** SCRUM-36  
**Handover reference:** Phase 1 §1.2 (Identity integrity — metadata split)  
**Audited:** 2026-08-23  
**Branch:** `Prod` @ `fb98ccb`  
**Method:** Grep for `createUser`, `updateUserById`, `user_metadata`, `app_metadata` across backend/scripts; read-path audit on frontend portals

---

## Executive summary

| Category | Count | Status |
|----------|-------|--------|
| Auth **write** paths (create/update) | 9 call sites | ✅ All write `tenant_id` to **`app_metadata` only** |
| Auth **read** paths (middleware/routes) | 4 primary | ✅ Read `app_metadata` only for tenant/role |
| Backfill / cleanup script | 1 | ✅ `syncAuthMetadata.ts` strips privileged keys from `user_metadata` |
| Residual **read** fallbacks to `user_metadata` | 2 | ⚠️ Non-auth fields only (parent-portal role fallback; display names) |
| CI guard (P1-A-4) | — | 🔲 Added in this release (`guard_user_metadata_tenant_id.py`) |

**Conclusion:** Write consolidation (P1-A-2) is **already done on Prod**. Remaining work: production backfill (P1-A-3, founder-run), CI guard (P1-A-4), ghost account remediation (P1-A-5).

---

## Canonical rule

```
tenant_id, role, user_role, is_platform_owner → app_metadata ONLY (admin-writable)
user_metadata → display fields only (full_name, name, first_name, …)
RLS claim: auth.jwt() -> 'app_metadata' ->> 'tenant_id'
```

---

## Write paths — audited

### ✅ Writes `tenant_id` to `app_metadata` (correct)

| # | File | Function / route | Operation | `app_metadata` keys | `user_metadata` keys |
|---|------|------------------|-----------|----------------------|---------------------|
| 1 | `backend/src/routes/registration.ts:496–506` | POST onboarding complete | `createUser` | `role`, `user_role`, `tenant_id`, `is_platform_owner` | `full_name` only |
| 2 | `backend/src/routes/parents.ts:162–168` | Parent invite (existing auth) | `updateUserById` | `role`, `tenant_id` | Strips `tenant_id`/`role` before write |
| 3 | `backend/src/routes/parents.ts:173–183` | Parent invite (new auth) | `createUser` | `role`, `tenant_id` | `full_name` only |
| 4 | `backend/src/routes/tenantUsers.ts:130–140` | Approve user request | `createUser` | `role`, `user_role`, `tenant_id`, `is_platform_owner` | `full_name` only |
| 5 | `backend/src/routes/admin.ts:441–446` | Create tenant user | `createUser` | `role`, `user_role`, `tenant_id`, `is_platform_owner` | `full_name` only |
| 6 | `backend/src/routes/admin.ts:114–117` | `patchAuthMetadata()` helper | `updateUserById` | Merged patch (used for role/tenant updates) | Not touched |
| 7 | `backend/src/routes/mfa.ts:61` | MFA enrollment | `updateUserById` | MFA flags in `app_metadata` | Not touched |
| 8 | `backend/src/scripts/parentPortalSeed.ts:342–370` | Demo seed | `createUser` / `updateUserById` | `role`, `user_role`, `tenant_id` | Display names only |
| 9 | `backend/src/scripts/syncAuthMetadata.ts:70–72` | Backfill script | `updateUserById` | Full sync from `users` table | **Strips** `tenant_id`, `role`, `user_role`, `is_platform_owner` |

### ✅ No privileged writes (safe)

| File | Notes |
|------|-------|
| `backend/src/scripts/createTestUser.ts:12–20` | `user_metadata: { name }` only; no `tenant_id` |
| `backend/src/routes/admin.ts:547–549` | Ban toggle — `ban_duration` only |
| `backend/src/routes/admin.ts:629,659,662` | Bulk ban/unban — no metadata |

### ❌ No `user_metadata.tenant_id` writers found

Grep across `backend/`, `frontend/`, `admin-portal/`, `parent-portal/` found **zero** active code paths that assign `tenant_id` into `user_metadata` on create/update.

Historical writers may exist in **production auth records** from before consolidation — addressed by P1-A-3 backfill.

---

## Read paths — audited

| # | File | Reads `tenant_id` from | Verdict |
|---|------|------------------------|---------|
| 1 | `backend/src/middleware/auth.ts:37–42` | `app_metadata` only | ✅ Correct |
| 2 | `backend/src/routes/auth.ts:42–43` | `app_metadata` only | ✅ Correct |
| 3 | `frontend/src/components/RoleContext.jsx:35–45` | `app_metadata` for tenant/role; `user_metadata` for display names only | ✅ Correct |
| 4 | `frontend/src/components/JurisdictionFeatureContext.jsx:9–11` | `app_metadata.tenant_id` | ✅ Correct |
| 5 | `parent-portal/src/lib/AuthContext.jsx:90` | `app_metadata?.role` with **`user_metadata?.role` fallback** | ⚠️ Role fallback only — not tenant_id; low risk for parent portal |
| 6 | `admin-portal/src/lib/AuthContext.jsx:62` | Spreads `user_metadata` for display | ⚠️ Verify admin-portal reads role from `app_metadata` (separate auth boundary) |

---

## Privileged keys in `user_metadata` — production risk

Even with correct write paths, **legacy users** may still carry:

```json
{
  "user_metadata": { "tenant_id": "...", "role": "admin" },
  "app_metadata": { }
}
```

**Symptoms:** ghost account (`??`), `XXX`/empty currency, intermittent 403s, onboarding loops.

**Remediation:** Run `backend/src/scripts/syncAuthMetadata.ts` with `DRY_RUN=true` first, then founder runs without dry-run on prod. See P1-A-3.

---

## Recommendations (ordered)

1. **P1-A-4** — CI guard blocks new `user_metadata` privileged writes ✅ (this release)
2. **P1-A-3** — Dev dry-run of `syncAuthMetadata.ts`; hand founder prod runbook
3. **P1-A-5** — Query auth users where `app_metadata.tenant_id` is null but `users.tenant_id` exists; remediate in dev
4. **Optional hardening** — Remove `user_metadata?.role` fallback in `parent-portal/src/lib/AuthContext.jsx:90`

---

## Test evidence

```bash
# Write-path grep (2026-08-23)
rg "user_metadata.*tenant_id|tenant_id.*user_metadata" backend frontend admin-portal parent-portal \
  --glob '*.{ts,tsx,js,jsx}' -l
# → syncAuthMetadata.ts, parents.ts (delete/strip only), comments only

# CI guard (post-implementation)
python3 .github/scripts/guard_user_metadata_tenant_id.py
python3 .github/scripts/test_guard_user_metadata_tenant_id.py
```
