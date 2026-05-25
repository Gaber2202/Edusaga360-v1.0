---
name: testing-edusaga360
description: Test EduSaga 360 end-to-end on Vercel production. Use when verifying UI, navigation, module access, or Supabase query fixes.
---

# Testing EduSaga 360

## Devin Secrets Needed
- `SUPABASE_URL` — Supabase project URL (https://mhbfvewkjlfmkqdhxpyg.supabase.co)
- `SUPABASE_ANON_KEY` — Supabase anon public key (eyJ... JWT)

## Environments
- **Production:** https://edusaga-360.vercel.app (deploys from `main` branch)
- **Staging preview:** Vercel generates preview URLs for PRs targeting `staging`
- **Backend:** https://edusaga-360-production.up.railway.app (health: `/health`)
- **Supabase Dashboard:** https://supabase.com/dashboard/project/mhbfvewkjlfmkqdhxpyg

## Test Credentials
- Email: `Muhammed@edusaga360.com`
- Password: `Muhammed*1993#`
- Role: `creator` (platform owner — sees all modules)

## Login Flow
1. Navigate to `{base_url}/school-login`
2. Enter email and password
3. Click "تسجيل الدخول" (Sign In)
4. Successful login redirects to Dashboard (`/Dashboard`) with full sidebar

## Key Things to Test

### Sidebar Navigation (Layout.jsx)
- Creator/admin roles should see ALL 25+ sidebar modules
- The `isCreatorRole` flag at Layout.jsx:345 bypasses role filtering
- If sidebar only shows "Security" and "Settings", the role filtering is broken
- Expand collapsible sections (HR, Finance, Fees, etc.) to verify children render

### Module Pages (queryFn pattern)
- All pages use `useQuery` with `queryFn: () => fetchData(tenantQuery(...))` 
- If `fetchData()` wrapper is missing, pages crash with `TypeError: f.map is not a function` (minified) or `c.find is not a function`
- The root cause: Supabase queries return `{ data, error }` objects, not arrays
- Test by clicking into modules: Students, Employees, Fees, Finance Dashboard, Super Admin
- Pages should show empty states (e.g., "لا يوجد طلاب") NOT error overlays

### Common Errors
- `f.map is not a function` → queryFn returning Supabase response object instead of data array
- `c.find is not a function` → same issue, different minified variable name
- `setSentryContext is not defined` → removed in PR #13, should not reappear
- `UserNotRegisteredError` → user has no tenant_id in users table; check Supabase seed data

## Architecture Notes
- **Frontend:** React 18 + Vite + React Query + Supabase JS client
- **Multi-tenant:** `tenantQuery()` adds tenant_id filter via RLS
- **RTL/LTR:** App defaults to Arabic (RTL); toggle available in header
- **Routing:** React Router with `vercel.json` SPA rewrites
- **State:** React Query for server state, React Context for auth/tenant/branch/role

## Supabase Database
- Schema at `shared/database/schema.sql` (839 lines)
- Key tables: `tenants`, `users`, `branches`, `students`, `employees`, `invoices`
- RLS policies filter by `tenant_id` from JWT claims
- SQL Editor: https://supabase.com/dashboard/project/mhbfvewkjlfmkqdhxpyg/sql

## CI/CD
- GitHub Actions: lint, typecheck, build, tests (frontend + backend), Vercel deploy
- Vercel auto-deploys: `staging` branch → preview, `main` branch → production
- Railway auto-deploys backend from `main`
