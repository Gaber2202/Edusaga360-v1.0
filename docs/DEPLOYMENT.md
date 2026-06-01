# Deployment Guide — EduSaga 360

## Architecture Overview

EduSaga 360 consists of three frontend applications, one backend API, and a Supabase database — all deployed independently:

| Component | Platform | Domain | Auto-deploy Branch |
|-----------|----------|--------|--------------------|
| School Staff App | Vercel | edusaga360.com | `main` |
| Super Admin Portal | Vercel | admin.edusaga360.com | `main` (root: `admin-portal/`) |
| Parent Portal | Vercel | parentportal.edusaga360.com | `main` (root: `parent-portal/`) |
| Backend API | Railway | api.edusaga360.com | `main` (root: `backend/`) |
| Database | Supabase | mhbfvewkjlfmkqdhxpyg.supabase.co | N/A |

## Prerequisites

1. **Supabase project** — https://supabase.com/dashboard/project/mhbfvewkjlfmkqdhxpyg
2. **Vercel account** — For all three frontend apps
3. **Railway account** — For backend API
4. **Resend account** — For transactional emails (optional, logs to console without)
5. **Domain** — edusaga360.com with DNS access

## Step 1: Database Setup (Supabase)

1. Go to SQL Editor: https://supabase.com/dashboard/project/mhbfvewkjlfmkqdhxpyg/sql
2. Run `shared/database/schema.sql` (creates all tables with RLS)
3. Run `shared/database/migrations/001_registration_onboarding.sql` (adds onboarding fields)

## Step 2: Backend Deployment (Railway)

Already deployed at: https://edusaga-360-production.up.railway.app

Environment variables required:
```
SUPABASE_URL=https://mhbfvewkjlfmkqdhxpyg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from Supabase Settings → API>
FRONTEND_URL=https://edusaga-360-production.vercel.app
API_BASE_URL=https://edusaga-360-production.up.railway.app
RESEND_API_KEY=<from resend.com/api-keys>
PORT=3001
NODE_ENV=production
```

## Step 3: School Staff App (Vercel)

Already deployed at: https://edusaga-360-production.vercel.app

Vercel project settings:
- Root directory: `frontend`
- Framework: Vite
- Build command: `npm run build`

Environment variables:
```
VITE_SUPABASE_URL=https://mhbfvewkjlfmkqdhxpyg.supabase.co
VITE_SUPABASE_ANON_KEY=<from Supabase Settings → API>
VITE_API_BASE_URL=https://edusaga-360-production.up.railway.app
```

## Step 4: Super Admin Portal (Vercel — separate project)

Create a **new Vercel project** connected to the same repo:

1. Go to Vercel → New Project → Import `edusaga-360`
2. Root directory: `admin-portal`
3. Framework: Vite
4. Same env vars as Step 3
5. Custom domain: `admin.edusaga360.com`

## Step 5: Parent Portal (Vercel — separate project)

Create a **new Vercel project** connected to the same repo:

1. Go to Vercel → New Project → Import `edusaga-360`
2. Root directory: `parent-portal`
3. Framework: Vite
4. Same env vars as Step 3
5. Custom domain: `parentportal.edusaga360.com`

## Step 6: DNS Configuration

Add these DNS records to your domain registrar:

| Record | Type | Name | Value |
|--------|------|------|-------|
| School Staff App | CNAME | `@` or `www` | `cname.vercel-dns.com` |
| Super Admin Portal | CNAME | `admin` | `cname.vercel-dns.com` |
| Parent Portal | CNAME | `parentportal` | `cname.vercel-dns.com` |
| Backend API | CNAME | `api` | Railway-provided domain |

## Step 7: Email Configuration (Resend)

1. Go to https://resend.com → Sign up
2. Add domain `edusaga360.com` and verify DNS records
3. Create API key → copy to Railway `RESEND_API_KEY`
4. All emails send from `info@edusaga360.com`

## Go-Live Checklist

- [ ] Database schema applied (schema.sql + migrations)
- [ ] Backend deployed and health check passing (`GET /api/health`)
- [ ] School staff app deployed and login working
- [ ] Super Admin portal deployed as separate Vercel project
- [ ] Parent portal deployed as separate Vercel project
- [ ] DNS records configured for all three subdomains
- [ ] SSL certificates active (auto-provisioned by Vercel)
- [ ] Supabase Auth redirect URLs configured
- [ ] Resend API key configured (for registration emails)
- [ ] All environment variables set in production
- [ ] Test registration flow end-to-end
- [ ] Test login with Muhammed@edusaga360.com

## What to Cancel on Base44

After confirming production is stable:
1. Cancel Base44 subscription
2. Remove GitHub integration from Base44
3. Archive the old `EduSaga360/edusaga` repo (keep for reference)
