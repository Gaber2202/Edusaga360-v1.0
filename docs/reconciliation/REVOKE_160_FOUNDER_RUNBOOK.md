# P1-G-3 — Revoke Prior Agent Production Credentials (#160)

**Story:** SCRUM-41  
**GitHub issue:** #160  
**Severity:** Blocker (security)  
**Owner:** Muhammed Hassan (Founder) — **cannot be executed by engineering lead**  
**Prepared:** 2026-08-23  
**Production ref (read-only):** `mhbfvewkjlfmkqdhxpyg`

---

## Why this matters

A prior AI agent was granted production write credentials and breached the production safety boundary three times (handover §1.1). Until credentials are revoked and rotated, any leaked key remains a live production write risk.

Engineering has **no production write access** and must not request it. This document is the handoff script for the founder.

---

## Pre-requisites

- [ ] Confirm current production baseline counts (handover §2) before any auth changes
- [ ] Have Railway, Vercel, Supabase dashboard admin access
- [ ] Schedule a 30-minute window; notify Ahmed if prod deploys are in flight

---

## Step 1 — Supabase production (`mhbfvewkjlfmkqdhxpyg`)

### 1a. Audit active keys and roles

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → project `mhbfvewkjlfmkqdhxpyg`
2. **Settings → API** — note which anon/service keys exist
3. **Settings → Database** — review database passwords and connection pooler credentials
4. **Authentication → Users** — search for any service/bot accounts created for the prior agent

### 1b. Rotate service role key

1. **Settings → API → Reset service role key**
2. Update the new key in:
   - Railway backend production environment (`SUPABASE_SERVICE_ROLE_KEY`)
   - Supabase Vault entries referencing the old key
   - GitHub Actions secrets (if any)
   - **Do NOT** commit the key to the repo

### 1c. Revoke personal / PAT access

1. **Organization Settings → Team** — remove or downgrade any accounts belonging to the prior agent vendor
2. **Account → Access Tokens** — revoke Supabase PATs not belonging to active team members
3. Confirm Ahmed Gaber has **dev project full access** and **prod read-only** (SQL editor read, no service role in local `.env` for prod)

### 1d. Verify revocation

```sql
-- Run in prod SQL editor (read-only check — no writes)
SELECT count(*) AS tenants FROM tenants;
SELECT count(*) AS invoices FROM invoices;
-- Baseline: 10 tenants, 59 invoices (2026-08-18 handover)
```

Attempt to use the **old** service role key against the REST API — must return `401`/`403`.

---

## Step 2 — Railway (backend production)

1. Open Railway project for EduSaga 360 backend production
2. **Settings → Members** — remove prior agent accounts
3. **Variables** — after Supabase key rotation, update `SUPABASE_SERVICE_ROLE_KEY`
4. **Settings → Tokens** — revoke deploy/API tokens not owned by active team
5. Redeploy backend after env update; smoke-test health endpoint

---

## Step 3 — Vercel (frontend production)

1. Open Vercel team/project for EduSaga 360 frontend
2. **Settings → Members** — remove prior agent accounts
3. **Settings → Environment Variables** — rotate any secrets the agent had visibility to
4. **Settings → Tokens** — revoke personal access tokens from departed accounts

---

## Step 4 — GitHub (`EduSaga360/edusaga-360`)

1. **Settings → Collaborators** — remove prior agent GitHub users
2. **Settings → Secrets and variables → Actions** — rotate:
   - `SUPABASE_*` production secrets
   - Railway/Vercel deploy tokens
   - Any Moyasar/Infobip keys the agent may have seen
3. **Settings → Deploy keys / Apps** — revoke OAuth apps and deploy keys not in use
4. Restore **GitHub Actions billing** (P1-G-1) so CI guards execute on PRs

---

## Step 5 — Third-party dashboards

| Service | Action |
|---------|--------|
| **Moyasar** | Rotate API keys; revoke dashboard users for prior agent |
| **Infobip** | Rotate API keys; revoke sub-accounts |
| **Sentry** | Remove prior agent from org; rotate DSN if exposed |

---

## Step 6 — Audit trail (close #160 / SCRUM-41)

Record in Jira SCRUM-41 comment:

- Date/time of key rotation
- Which keys were rotated (names only, not values)
- Which accounts were removed
- Post-rotation baseline counts (tenants, invoices, payments)
- Confirmation old service role key fails

**Acceptance:** Old credentials cannot read or write production. Ahmed has dev full + prod read-only.

---

## Engineering verification (after founder completes)

Ahmed will:

1. Confirm `backend/.env` points to **dev** Supabase only
2. Confirm CI guard suite passes on next PR
3. Mark SCRUM-41 Done with link to this runbook and founder sign-off comment

---

## Escalation

If production counts change during rotation without a deploy, **stop immediately** and investigate before proceeding (handover §2 escalation rule).
