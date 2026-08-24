# P1-C — RLS remediation rollback notes

**Migration:** `shared/database/migrations/20260825_01_rls_legacy_claim_remediation.sql`

## Before applying on any environment

1. Export live policy inventory:

```sql
COPY (
  SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname
) TO STDOUT WITH CSV HEADER;
```

2. Store the CSV / JSON as `shared/database/rollbacks/YYYYMMDD_rls_snapshot.json` for that environment.

## Rollback approach

The 2026-08-10 branch rollback is **stale** relative to Prod (missing parent-portal / canteen tables). Do **not** reuse it.

To roll back this migration:

1. Re-apply policies from the snapshot taken immediately before apply.
2. Or restore from Supabase PITR to the pre-migration timestamp.

## Isolation verification (after apply on DEV)

Create two tenants A/B. With an authenticated JWT for A, confirm SELECT on remediated tables returns zero rows for B's `tenant_id`.
