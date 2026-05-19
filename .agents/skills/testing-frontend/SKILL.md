---
name: testing-edusaga360-frontend
description: Test the EduSaga 360 frontend locally. Use when verifying UI rendering, public routes, client-side validation, or Base44→Supabase migration quality.
---

# Testing EduSaga 360 Frontend

## Prerequisites

1. Clone the repo and checkout the branch to test (usually `staging` or a feature branch)
2. Install dependencies: `cd frontend && npm install`
3. Create a `.env` file in `frontend/` with placeholder Supabase values:
   ```
   VITE_SUPABASE_URL=https://placeholder-project.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTkwMDAwMDAwMH0.placeholder
   VITE_API_BASE_URL=
   ```
   This allows the Supabase client to initialize without crashing, even without a real backend.

## Devin Secrets Needed

- `VITE_SUPABASE_URL` — Real Supabase project URL (for full end-to-end testing)
- `VITE_SUPABASE_ANON_KEY` — Real Supabase anon key (for full end-to-end testing)
- Without these, only public routes can be tested (see below)

## Starting the Dev Server

```bash
cd frontend && npx vite --host 0.0.0.0 --port 5173
```

The server starts in ~120ms. Navigate to `http://localhost:5173/`.

## Public Routes (No Auth Required)

These routes render without a Supabase backend:

| Route | What it shows |
|-------|---------------|
| `/school-login` | Login form with Arabic/English toggle |
| `/register` | School registration form (8+ fields) |
| `/RegistrationWizard` | Multi-step registration wizard |
| `/OnboardingWizard` | Tenant onboarding wizard |
| `/setup` | Account setup page |

## Auth Redirect Behavior

- `/` (root) → redirects to `/school-login` when unauthenticated
- `/login` → redirects to `/school-login`
- `/client/login` → redirects to `/school-login`
- Any authenticated route → redirects to `/school-login`

## Key Test Flows

### SchoolLogin Page
1. Verify Arabic RTL layout renders (default language is Arabic)
2. Click submit with empty fields → expect validation errors:
   - "البريد الإلكتروني غير صحيح" (invalid email)
   - "كلمة المرور مطلوبة" (password required)
3. Click "English" toggle → all labels switch to English, layout switches to LTR
4. "Register a new school" link navigates to `/register`

### Register Page
1. Verify all form fields render: first name, last name, school name, email, phone (with country code), city, school type, estimated students, how heard
2. Click submit empty → expect 8 validation errors in Arabic
3. Country code dropdown has 8 Gulf/MENA options
4. City dropdown has 11 Saudi cities
5. School type: 3 button options (government/private/international)
6. Student count: 5 range options

## Console Error Audit

After navigating through routes, check browser console for:
- Zero errors containing "base44", "Base44", or "base44Client"
- Zero uncaught exceptions
- Expected warnings: React Router v7 future flag deprecation notices (non-breaking)

## Build Verification

```bash
cd frontend && npm run build
```

Expected: ~3,700+ modules transformed, no errors.

```bash
cd frontend && npx eslint .
```

Expected: 0 errors.

## What Requires Supabase Backend

- Login/authentication flow
- Dashboard and all 113 authenticated pages
- Role-based navigation (admin/teacher/parent)
- Tenant isolation (multi-tenant data filtering)
- CRUD operations on entities
- Backend API calls (journalEntry, tenantRequest, registrationRequest)

## Notes

- The app is bilingual Arabic/English with RTL support. Default language is Arabic.
- The Supabase client initializes with `createClient()` on module load — if env vars are missing it logs an error but may crash. Always provide at least placeholder values.
- The `AuthContext` handles auth errors gracefully for public routes — `authError.type === 'auth_required'` on public paths renders the public component directly.
- Language preference is stored in `localStorage` as `erp_language`.
