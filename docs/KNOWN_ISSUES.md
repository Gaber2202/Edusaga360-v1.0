# Known Issues

> Track known issues, workarounds, and blockers during the migration.

## Open Issues

### 1. Dashboard not accessible — test user has no tenant data
**Severity**: Medium  
**Impact**: Cannot test Dashboard, Layout sidebar, or any authenticated pages  
After successful Supabase Auth login, the app correctly identifies the user as "not registered" (no matching `registration_requests` record) and redirects to `/register` via `UserNotRegisteredError`. Dashboard testing requires seed data in the Supabase DB (a `registration_requests` row with matching email and an associated tenant).

### 2. Deploy to Staging CI job failing — missing Vercel credentials
**Severity**: Low (code CI passes)  
**Impact**: No auto-deploy to Vercel staging environment  
The `deploy-staging.yml` workflow fails because `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets are not configured in GitHub. Code CI (lint, build, typecheck, tests) all pass. To fix: create a Vercel project, link it to the repo, and add the three secrets in GitHub Settings → Secrets.

### 3. Backend API endpoints are stubs
**Severity**: Medium  
**Impact**: Frontend `callApi()` calls to `/api/...` will fail without a running backend  
The Express backend routes exist as framework stubs. Individual route implementations for all 30 edge functions need to be completed. Frontend pages that use `callApi()` (journal entries, tenant requests, registration requests, LLM/email/file integrations) will show errors until the backend is deployed and connected.

## Resolved Issues

### SchoolLogin.jsx — Base44 SSO redirect replaced with Supabase Auth
**Resolved in**: commit `840c616` on `staging`  
`handleSignIn()` was still calling `window.location.href = '/login'` (Base44 SSO). Fixed to call `useAuth().login(email, password)` → `supabase.auth.signInWithPassword()`. Inline error handling added via `authFailure` state.
