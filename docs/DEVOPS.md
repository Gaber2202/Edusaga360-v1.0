# DevOps — Environments, Pipelines & Branch Protection

> Grounded in the actual workflows under `.github/workflows/`. Flags the real gaps
> found during the readiness sprint and gives concrete recommendations.

## Environments

| Env | Frontend | Backend | Database |
|-----|----------|---------|----------|
| **local** | Vite dev (`npm run dev`) | `tsx watch` (`npm run dev`) | Supabase (shared hosted project) |
| **staging** | Vercel preview | Railway (see gap DEP-1) | Supabase (recommend a *separate* staging project) |
| **production** | Vercel production (3 projects: main, admin-portal, parent-portal) | Railway | Supabase `mhbfvewkjlfmkqdhxpyg` (region ap-northeast-2 / Seoul) |

All required env vars are enumerated in `backend/.env.example` and each app's
`.env.example`. No real values are committed (`.env*` is gitignored; gitleaks
runs in CI).

## Pipelines (current state)

### `ci.yml` — on every PR to `main`/`staging`/`dev` (+ push to `dev`)
Blocks merge unless green: **lint** (FE+BE), **typecheck** (BE), **build** (FE),
**test** (FE+BE), **secret scan** (gitleaks, blocking). **dependency-audit** runs
advisory (non-blocking). This is solid.

### `deploy-staging.yml` — on push to `staging`
Deploys the frontend to Vercel (preview). **Backend deploy is a no-op** (the
Railway step is commented out) — see DEP-1.

### `deploy-production.yml` — on push to `main`
Deploys the frontend to Vercel (production). **Backend deploy is a no-op** (DEP-1).

## Gaps found (and how to close them)

| ID | Gap | Recommendation |
|----|-----|----------------|
| **DEP-1** | Backend deploy step is **commented out** in both deploy workflows. | Either wire the Railway deploy (`railway up` with `RAILWAY_TOKEN`) or, if Railway already auto-deploys from the connected repo, **delete the dead job** so the pipeline reflects reality. Don't leave a job that pretends to deploy. |
| **DEP-2** | **Production has no manual approval gate** — every push to `main` auto-deploys the frontend. | Create a GitHub **`production` Environment** with *required reviewers*, and add `environment: production` to the prod deploy jobs. Deploys then pause for a human click. |
| **DEP-3** | Deploy workflows **run no database migrations**. Schema changes are applied by hand. | Add a migration step: staging applies `shared/database/migrations/` automatically; production shows the **SQL diff first** (dry-run) and applies only after the DEP-2 approval. Until then, follow the manual discipline below. |
| **DEP-4** | **No post-deploy smoke test.** | After deploy, hit `GET /api/health` and one authenticated read; fail the job if either is not 200. |
| **DEP-5** | Staging appears to share the **production Supabase project**. | Stand up a **separate staging Supabase project** so staging migrations/tests never touch production data. |

## Branch protection (recommended — configure in GitHub repo settings)

For `main` (and `staging`):
- ✅ **Require a pull request before merging** (no direct pushes to `main`).
- ✅ **Require status checks to pass**: `Lint (Frontend)`, `Lint (Backend)`,
  `Typecheck (Backend)`, `Build (Frontend)`, `Test (Frontend)`, `Test (Backend)`,
  `Secret Scan (gitleaks)`.
- ✅ **Require branches to be up to date** before merging.
- ✅ **Require at least 1 approving review** (the founder) for `main`.
- ✅ **Restrict who can push** to `main`.
- ✅ Include administrators (so the rules actually bind).

> These are the settings that make "CI blocks bad merges" true. Today CI *runs* on
> PRs, but without the required-checks + no-direct-push rules a red PR can still be
> merged.

## Migration discipline (until DEP-3 is automated)

1. Every schema change is a **versioned file** in `shared/database/migrations/`
   (date-prefixed, ordered, reproducible from zero). ✅ already the practice.
2. Apply to **staging first**, verify (app works, advisors clean), then production.
3. For production: **review the SQL** before applying. Prefer additive/idempotent
   changes; run anything that takes locks in a low-traffic window.
4. Every migration in this sprint carries an inline **rollback** note.

## Rollback

- **Frontend (Vercel):** promote the previous deployment in the Vercel dashboard,
  or `vercel rollback`. Near-instant.
- **Backend (Railway):** redeploy the previous commit/image from the Railway
  dashboard.
- **Database:** run the migration's documented reverse statements. For a
  data-affecting change, restore from backup / point-in-time recovery
  (see `RUNBOOK.md`). **Never** hand-edit production data to "undo" a migration.
