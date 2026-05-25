# Known Issues

> Track known issues, workarounds, and blockers.

## Open Issues

### 1. Admin & Parent portals need separate Vercel deployments
**Severity**: Low (apps are built and ready)  
**Impact**: admin.edusaga360.com and parentportal.edusaga360.com not yet live  
The `admin-portal/` and `parent-portal/` directories need to be deployed as separate Vercel projects with their own custom domains. Code is complete and builds pass.

### 2. Email integration requires Resend API key
**Severity**: Medium  
**Impact**: Registration approval/denial emails log to console instead of sending  
The backend registration flow sends bilingual emails (admin notification, welcome, denial) via Resend API. Without `RESEND_API_KEY` in Railway env vars, emails are logged to console but not sent. To fix: sign up at resend.com, verify edusaga360.com domain, add API key to Railway.

### 3. Database migration needed for onboarding
**Severity**: Medium  
**Impact**: Registration onboarding flow won't work without new columns  
Run `shared/database/migrations/001_registration_onboarding.sql` in Supabase SQL Editor to add onboarding_token, token_expires_at, and other required columns to registration_requests and tenants tables.

## Resolved Issues

### Dashboard blank for creator role
**Resolved in**: Phase 1 (commit d07e68a)  
Creator role was excluded from isHR/isFinance/isSchoolAdmin checks. Fixed by adding isCreator flag.

### f.map is not a function crash on all pages
**Resolved in**: PR #15  
212+ queries returning Supabase `{ data, error }` object instead of data array. Fixed with fetchData() wrapper.

### 404 on client-side routes
**Resolved in**: PR #10  
Added vercel.json with SPA rewrites.

### 43 duplicate key build errors
**Resolved in**: PR #12  
Removed duplicate properties in LanguageContext.jsx and Employees.jsx.

### SchoolLogin Base44 SSO redirect
**Resolved in**: commit 840c616  
handleSignIn() called window.location.href = '/login' (Base44 SSO). Fixed to use Supabase Auth.

### Base44 references in codebase
**Resolved in**: Phase 8  
All remaining Base44 references in comments, image URLs, and code removed. Zero Base44 references remaining.
