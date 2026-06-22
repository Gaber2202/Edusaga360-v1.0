# Known Issues — EduSaga 360

> Last updated: 2026-05-18

## Critical

_None_

## High

### 1. Yamen AI requires a working LLM API key
**Impact**: Yamen AI chat returns a "not configured" message when no provider key is set  
**Workaround**: Add `GOOGLE_AI_API_KEY` (or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY`) to Railway environment variables  
**Effort**: 5 min — get a free key from https://aistudio.google.com/apikey  

**If the key is already set and chat still fails:** the key is configured but the
provider call is failing. Yamen now returns the *actual* cause (it no longer
masks this as "not configured"). Hit **`GET /api/ai/diagnostics`** (authenticated)
to see which key is detected and Google's verbatim error from a live probe.
Common causes:
- **Unsupported server region** — the free Gemini API (`generativelanguage.googleapis.com`)
  is not available in every region; a Railway region Google doesn't serve returns
  `User location is not supported for the API use`. Fix: set `ANTHROPIC_API_KEY`
  or `OPENAI_API_KEY` as a fallback (both are already wired in), or route Gemini
  through a supported region/Vertex AI.
- **Invalid/restricted key** — `API_KEY_INVALID`; regenerate at https://aistudio.google.com/apikey
  and ensure the Generative Language API is enabled with no referrer/IP restriction.
- **Wrong model** — set `GOOGLE_AI_MODEL` to a model your key can access (default `gemini-2.0-flash`).
- **Quota exhausted** — `RESOURCE_EXHAUSTED` / HTTP 429; wait or raise the quota.  

### 2. Custom domains need DNS CNAME records
**Impact**: `admin.edusaga360.com` and `parentportal.edusaga360.com` not resolving  
**Workaround**: Use Vercel URLs directly (`edusaga-360-admin-portal.vercel.app`, `edusaga-360-parent-portal.vercel.app`)  
**Fix**: Add CNAME records pointing to `cname.vercel-dns.com` in DNS provider  
**Effort**: 10 min  

## Medium

### 3. Modules show empty states without seed data
**Impact**: New tenants see "No data" in all modules until they add records  
**Workaround**: Each empty state has an "Add" button or instructions  
**Note**: This is expected behavior — schools populate data after onboarding  

### 4. Email deliverability not verified for all providers
**Impact**: Registration emails may land in spam for some email providers  
**Workaround**: Use Resend domain verification + SPF/DKIM records  
**Fix**: Verify `edusaga360.com` domain in Resend dashboard and add DNS records  
**Effort**: 30 min  

### 5. Large bundle size (frontend ~3.8MB gzipped ~992KB)
**Impact**: Initial load time ~3-4s on slow connections  
**Workaround**: Vite's code splitting handles most of it  
**Fix**: Add lazy loading for heavy modules (recharts, jspdf, html2canvas)  
**Effort**: 2-3 hours  

## Low

### 6. Some bilingual translations are approximate
**Impact**: A few Arabic labels may not be perfectly localized  
**Workaround**: Functional — all modules display in both languages  
**Fix**: Have a native Arabic speaker review LanguageContext translations  
**Effort**: 4-8 hours  

### 7. Mobile responsive design incomplete for some modules
**Impact**: Complex table views (payroll, finance) may need horizontal scroll on mobile  
**Workaround**: Scrollable — all data is accessible  
**Fix**: Add responsive breakpoints for table-heavy pages  
**Effort**: 4-6 hours  

## Resolved Issues

### Dashboard blank for creator role
**Resolved in**: Phase 1 (commit d07e68a)  
Creator role was excluded from isHR/isFinance/isSchoolAdmin checks.

### f.map is not a function crash on all pages
**Resolved in**: PR #15  
212+ queries returning Supabase `{ data, error }` object instead of data array.

### Duplicate logos in sidebar
**Resolved in**: Production Readiness PR  
SVG file had embedded text duplicating component-level text labels. Fixed to icon-only SVG.

### 43 duplicate key build warnings
**Resolved in**: PR #11/12  
Duplicate object properties in LanguageContext.jsx and Employees.jsx.

### Admin & Parent portals not deployed
**Resolved in**: Post-merge deployment  
Both portals now live on Vercel with custom domain configuration.

### Vercel 404 on client-side routes
**Resolved in**: PR #9/10  
Added `vercel.json` with SPA rewrite rules.
