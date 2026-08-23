# P0-1 — Access Confirmation Checklist

**Story:** SCRUM-4  
**Handover reference:** §2 (Day-1 Access and Environment Checklist)  
**Audited:** 2026-08-23  
**Auditor:** Ahmed Gaber (local repo + environment verification)

---

## Summary

| Verified locally | Flagged — founder action required |
|------------------|-----------------------------------|
| 5 items | 8 items |

---

## Checklist

| # | Item | Status | Evidence / Notes |
|---|------|--------|------------------|
| 1 | **GitHub repo — write access, branch protection** | ✅ **Verified (partial)** | Remote `git@github.com:EduSaga360/edusaga-360.git` configured with push URL. Local clone on branch `Prod` (tracking `origin/Prod`). Branch naming convention `work-<issue-number>` documented in handover §2; repo also uses `devin/*`, `claude/*` legacy names. **Branch protection rules not verifiable locally** — founder to confirm in GitHub Settings. |
| 2 | **Supabase development project — full access** | 🚩 **Founder** | `backend/.env` exists locally (credentials not inspected). Cannot confirm project ref, role, or Vault access without founder-provided dev project details. **Do not use production ref `mhbfvewkjlfmkqdhxpyg` for writes.** |
| 3 | **Supabase production — read-only** | 🚩 **Founder** | Production ref documented: `mhbfvewkjlfmkqdhxpyg`. Read-only snapshot access for migration testing requires founder to grant scoped credentials or run snapshot exports. Baseline counts (below) are from handover, not re-verified live. |
| 4 | **Railway — backend deploy access (dev)** | 🚩 **Founder** | No Railway CLI config or deploy tokens found in repo. Backend stack confirmed as Node/TS/Express in `backend/`. |
| 5 | **Vercel — frontend deploy access** | 🚩 **Founder** | Frontend at `frontend/` (React/Vite). Handover §2 notes **free-tier deployment limit hit repeatedly** — flag to founder for plan upgrade (open decision #10). No Vercel project link in local env. |
| 6 | **GitHub Actions — CI running** | ⚠️ **Partial** | CI workflow exists: `.github/workflows/ci.yml` (lint, typecheck, build, test, 9 guard jobs, secret scan). Handover states **billing currently blocked — CI not running**. Cannot verify Actions billing status locally; founder must restore billing before Phase 1 gate. |
| 7 | **Secrets in Supabase Vault (not committed)** | ✅ **Verified (repo scan)** | `.gitleaks.toml` present; CI runs `gitleaks-action`. No `.env` committed (`.gitignore` excludes). Local `backend/.env` exists — not in git. |
| 8 | **Sentry — EU, PII scrub, tags** | 🚩 **Founder** | Sentry DSN and dashboard access not verifiable locally. Code may reference Sentry — config requires founder dashboard access. |
| 9 | **Moyasar dashboard (KSA)** | 🚩 **Founder** | Moyasar integration in `backend/src/packs/sa/moyasarService.ts`. Test keys referenced via env vars (`MOYASAR_SECRET_KEY_TEST`). Live dashboard access required for gateway config. |
| 10 | **Infobip account (WhatsApp/SMS/Email/Voice)** | 🚩 **Founder** | Messaging connectors in migrations (`20260713_messaging_connectors.sql`). Dashboard/API credentials not in repo. |

---

## Demo tenant (do not delete or reseed)

| Field | Value | Verified |
|-------|-------|----------|
| Label | DEMO-AE | 📋 Documented |
| Tenant ID | `83a3dc43-b2b9-4fc2-8f0b-b1fde6d646e8` | 📋 Documented (handover §2) |
| Login | `muhammed.ae.demo@edusaga360.com` | 📋 Documented — **live login not tested** (requires dev/prod read access) |

---

## Production baseline (handover §2 — not re-verified live)

| Metric | Baseline (2026-08-18) | Live check |
|--------|----------------------|------------|
| Tenants | 10 | 🚩 Founder — read-only query on prod |
| Invoices | 59 | 🚩 Founder |
| Payments | 16 | 🚩 Founder |
| Students | 13 | 🚩 Founder |
| moyasar_invoices | 10 | 🚩 Founder |

**Escalation rule:** If these counts move without a deploy, something wrote to production.

---

## Repo structure verified locally

| Path | Purpose | Present |
|------|---------|---------|
| `backend/` | Node.js / TypeScript / Express API | ✅ |
| `frontend/` | React / Vite SPA | ✅ |
| `shared/database/migrations/` | Supabase migrations (71 files) | ✅ |
| `admin-portal/` | Separate admin portal scaffold | ✅ |
| `parent-portal/` | Parent portal (out of Phase 1 scope) | ✅ |
| `.github/workflows/ci.yml` | CI pipeline | ✅ |
| `.github/workflows/deploy-staging.yml` | Staging deploy | ✅ |
| `.github/workflows/deploy-production.yml` | Production deploy | ✅ |
| `.github/workflows/guard-unfiltered-mutations.yml` | Mutation guard workflow | ✅ |

---

## CI workflow jobs (`.github/workflows/ci.yml`)

Lint (frontend/backend) · Typecheck (backend) · Build (frontend) · Test (frontend/backend/parent-mobile) · Secret scan · Guard: invoices.balance · jurisdiction resolution · country literals · pack imports · frontend nationality · hardcoded currency · schema drift · RLS migrations · frontend query tables · Dependency audit (advisory)

---

## Actions required from founder

1. Confirm GitHub branch protection on `main` / `Prod` / `staging`.
2. Provide dev Supabase project access (full) and prod read-only snapshot path.
3. Grant Railway dev deploy access and Vercel project access; address Vercel deploy limit.
4. Restore GitHub Actions billing.
5. Grant Moyasar, Infobip, and Sentry dashboard access.
6. Run or share prod baseline count query for reconciliation sign-off.
