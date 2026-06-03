# EduSaga 360 — Client Onboarding Flow

This document describes the full flow from a new school signing up to landing on an isolated dashboard. Each step lists the exact files and endpoints involved.

---

## Step 1: School Signup Form

**File:** `frontend/src/pages/Register.jsx`
**API helper:** `frontend/src/api/registrationRequest.js` → `callApi('/api/registration/request', payload)`
**Backend endpoint:** `POST /api/registration/request` (`backend/src/routes/registration.ts`)

### What happens:
1. School admin fills in: first name, last name, school name (AR + EN via the `school_name` field which maps to `school_name_en`), email, phone, city, school type, estimated student count, optional "how heard".
2. On submit, `submitRegistrationRequest()` calls `POST /api/registration/request`.
3. Backend validates with Zod, checks for duplicate email, generates a 64-char hex `onboarding_token` with a 48-hour expiry, and inserts a row into `registration_requests` with `status = 'pending'`.
4. A notification email is sent to `info@edusaga360.com` with Approve / Deny links pointing to the backend.
5. The frontend shows a success screen: "Your registration has been submitted. You will receive an email once approved."

### Key notes:
- `callApi` must use paths starting with `/api/` — the `API_BASE_URL` default is `''` (not `/api`) so paths must be fully qualified from the root.
- On duplicate email, the backend returns `409 DUPLICATE`; the frontend shows a toast.

---

## Step 2: Platform Owner Receives & Reviews Request

**File:** `frontend/src/components/superadmin/RegistrationRequestsTab.jsx`
**Parent page:** `frontend/src/pages/SuperAdminDashboard.jsx`
**Backend endpoints:**
- `GET /api/registration/approve/:id` — approve and create tenant
- `GET /api/registration/deny/:id` — deny and send denial email
- `GET /api/registration/resend/:id` — regenerate token and resend setup link

### What happens:
1. The platform owner logs in and navigates to `SuperAdminDashboard` > Registration Requests tab.
2. The tab fetches `registration_requests` via `tenantQuery('registration_requests').select('*')`. Because `registration_requests` is listed in `PLATFORM_ONLY_ENTITIES` in `supabaseClient.js`, no `tenant_id` filter is applied — the platform owner sees all requests.
3. Pending requests show **Approve** and **Reject** buttons. Approved-but-not-completed requests show a **Resend** button.
4. The `handleAction` function in `RegistrationRequestsTab` calls the correct REST endpoints (not Supabase functions).

### On Approve (`GET /api/registration/approve/:id`):
1. Updates `registration_requests.status = 'approved'`, sets `approved_at`.
2. Creates a row in `tenants` with `status = 'trial'`, `plan = 'trial'`, 14-day `trial_end_date`.
3. Links `registration_requests.tenant_id` to the new tenant.
4. Sends welcome email to the applicant (see Step 3).

### On Deny (`GET /api/registration/deny/:id`):
1. Updates status to `'denied'`, sets `denied_at`.
2. Sends a denial notification email.

---

## Step 3: Applicant Receives Welcome Email with Onboarding Link

**Sending function:** `sendWelcomeEmail()` in `backend/src/routes/registration.ts`
**Email provider:** Resend (`RESEND_API_KEY` env var required; if absent, logs to console only)

### Link format:
```
${FRONTEND_URL}/onboarding/${onboarding_token}
```
e.g. `https://edusaga-360-production.vercel.app/onboarding/abc123...`

The token is valid for **48 hours** (`token_expires_at` column).

The email (Arabic, RTL) includes:
- Greeting with the admin's name
- School approval confirmation
- A green "إعداد الحساب" button linking to the onboarding wizard
- Expiry warning

---

## Step 4: Onboarding Wizard

**File:** `frontend/src/pages/OnboardingWizard.jsx`
**Route:** `/onboarding/:token` (registered in `frontend/src/App.jsx`)

The wizard is publicly accessible (no auth required). The `isPublicPath` check in `App.jsx` covers `pathname.startsWith('/onboarding/')` so unauthenticated visitors are served the page correctly.

### Wizard steps:

| Step | Label | What happens |
|------|-------|--------------|
| 0 | Welcome | Displays school name and admin name fetched from token validation |
| 1 | Set Password | Admin chooses a password (≥8 chars) |
| 2 | School Settings | Logo URL, academic year start date, number of grades, default language |
| 3 | Confirm & Complete | Summary review → calls completion endpoint |

### Token validation (`GET /api/registration/onboarding/:token`):
- Returns `{ success, request: { id, school_name, contact_name, contact_email, tenant_id } }`.
- Returns `TOKEN_EXPIRED` (410) if past `token_expires_at`.
- Returns `400` if status is not `'approved'`.

### Completion (`POST /api/registration/onboarding/:token/complete`):
Body: `{ password, school_logo, academic_year_start, num_grades, default_language }`

1. Creates Supabase Auth user (`supabase.auth.admin.createUser`) with `email_confirm: true`.
2. Inserts row into `users` table with `role = 'admin'` and `tenant_id` linked to the new tenant.
3. Updates `tenants` row: sets `logo_url`, `academic_year_start`, `num_grades`, `default_language`, `status = 'active'`.
4. Updates `registration_requests`: `status = 'completed'`, clears `onboarding_token`.
5. Returns `{ success: true, redirect_url }`.

After completion, the wizard redirects to `/school-login` after a 3-second delay.

---

## Step 5: Isolated Dashboard

### Authentication and tenant resolution:

1. Admin logs in at `/school-login` (`frontend/src/pages/SchoolLogin.jsx`).
2. `AuthContext` (`frontend/src/lib/AuthContext.jsx`) loads the Supabase session.
3. `TenantContextSyncer` (`frontend/src/components/TenantContextSyncer.jsx`) calls `setTenantContext({ tenantId, isPlatformOwner })` once both `RoleContext` and `TenantContext` have loaded.
4. `TenantContext` (`frontend/src/components/TenantContext.jsx`) fetches the tenant record from `tenants` using the `tenant_id` from the user's profile.
5. `setTenantContext` stores the resolved `tenantId` in a module-level variable inside `supabaseClient.js`.

### Tenant isolation in queries:

All data queries use `tenantQuery(tableName)` from `frontend/src/api/supabaseClient.js`:
- For tables NOT in `PLATFORM_ONLY_ENTITIES`, every `.select()` call automatically appends `.eq('tenant_id', tenantId)`.
- Every `.insert()` automatically injects `tenant_id` into the payload.
- If `tenantId` is null (context not yet loaded), queries return an empty result rather than fetching unfiltered data.

### Row-Level Security (RLS) — database layer:

**File:** `shared/database/schema.sql`

RLS is enabled on all tenant-scoped tables. The policy for each table:

```sql
CREATE POLICY "tenant_isolation" ON <table>
  FOR ALL
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
```

This ensures the Supabase JWT claim `tenant_id` must match the row's `tenant_id` — even if a client bypasses the frontend filter, the database rejects cross-tenant reads/writes.

Tables covered: `branches`, `students`, `employees`, `invoices`, `journal_entries`, `guardians`, `academic_years`, `grades`, `sections`, `applicants`, `applications`, `chart_of_accounts`, `fiscal_periods`, `journal_entry_lines`, `cost_centers`, `fee_types`, `fee_structures`, `payments`, `expenses`, `vendors`, `departments`, `job_titles`, `employee_contracts`, `leave_types`, `leave_requests`, `leave_balances`, `pay_runs`, `payslip_lines`, `employee_attendance`, `overtime_requests`, `fixed_assets`, `vehicles`, `bus_routes`, `service_tickets`, `communications`, `notifications`, `contract_templates`, `student_contracts`, `purchase_requisitions`, `purchase_orders`, `student_tags`, `audit_logs`.

Platform-level tables (`tenants`, `registration_requests`, `tenant_requests`, `roles`, `countries`, `currencies`, `public_settings`, `app_settings`) do NOT have tenant-scoped RLS — they are managed by the service-role key on the backend.

### React-Query cache isolation:

`TenantContextSyncer` calls `queryClient.clear()` whenever the effective `tenantId` changes (e.g., platform owner switching between tenants). This prevents stale cross-tenant rows from being served from the in-memory cache.

---

## Environment Variables Required

### Backend (`backend/.env`):
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `FRONTEND_URL` | Frontend origin for onboarding links |
| `API_BASE_URL` | Backend own origin for approve/deny links in admin email |
| `RESEND_API_KEY` | Resend API key for sending emails (optional — emails logged if absent) |

### Frontend (`frontend/.env.local`):
| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_BASE_URL` | Backend origin (e.g. `https://edusaga-360-production.up.railway.app`). Leave blank to use same-origin proxy. |

---

## Bugs Fixed in This Audit

1. **`callApi` double `/api` prefix** — `API_BASE_URL` default changed from `'/api'` to `''`; endpoint paths like `/api/registration/request` are correct as-is.
2. **`registration_requests` not in `PLATFORM_ONLY_ENTITIES`** — added so the admin panel fetches all requests without a spurious `tenant_id` filter.
3. **`tenantQuery` with null `tenantId`** — now returns empty results instead of `.eq('tenant_id', null)` which silently leaked no data.
4. **`RegistrationRequestsTab` wrong endpoint** — was calling `/api/functions/processRegistrationRequest` (non-existent); now calls the real REST endpoints (`/api/registration/approve/:id`, `/api/registration/deny/:id`, `/api/registration/resend/:id`).
5. **`/api/registration/resend/:id` missing** — added to `backend/src/routes/registration.ts`.
6. **`isPublicPath` missing `/onboarding/:token`** — unauthenticated users landing on the wizard were redirected to login; fixed in `App.jsx`.
7. **`onboarding/:token` route missing from error-state Routes** — added to both `user_not_registered` and `auth_required` fallback route lists.
8. **`users` insert used wrong columns** — schema has `name` (not `first_name`/`last_name`); fixed in onboarding completion endpoint.
9. **`tenants` table missing columns** — added `tenant_code`, `admin_email`, `city`, `school_type`, `trial_end_date`, `onboarding_completed`, `logo_url`, `academic_year_start`, `num_grades`, `default_language`, usage counters, and `created_date` to schema.
10. **RLS only on 5 of 40+ tables** — added `tenant_isolation` policy for all remaining tables via a DO block in schema.sql.
