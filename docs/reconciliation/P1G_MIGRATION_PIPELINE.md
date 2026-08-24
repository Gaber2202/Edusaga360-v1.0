# P1-G — Migration pipeline status

**Scripts:**
- [`scripts/applyMigrations.mjs`](../../scripts/applyMigrations.mjs) — apply pending repo migrations (staging; prod requires `ALLOW_PROD_MIGRATE=true`)
- [`scripts/verifyMigrations.mjs`](../../scripts/verifyMigrations.mjs) — list pending migrations vs `schema_migrations`

**CI:** staging workflow job `verify-and-apply-migrations` in [`.github/workflows/deploy-staging.yml`](../../.github/workflows/deploy-staging.yml) (requires secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_STAGING_PROJECT_REF`).

**Founder remaining:**
1. Restore GitHub Actions billing so CI/deploy jobs run
2. Create dedicated **staging** Supabase project (DEP-5) and set `SUPABASE_STAGING_PROJECT_REF`
3. Execute [#160 revoke](./REVOKE_160_FOUNDER_RUNBOOK.md)
4. Production migration apply remains founder-gated SQL review / `ALLOW_PROD_MIGRATE`

**Proposal:** [docs/proposals/supabase-migration-pipeline.md](../proposals/supabase-migration-pipeline.md)
