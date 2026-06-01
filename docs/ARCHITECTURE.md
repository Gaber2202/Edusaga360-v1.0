# EduSaga 360 — Architecture

## High-Level Architecture

```
                          ┌─────────────────────────────────────────┐
                          │           DNS / CDN (Vercel Edge)       │
                          └───┬──────────────┬──────────────┬───────┘
                              │              │              │
                    edusaga360.com   admin.edusaga360.com  parentportal.edusaga360.com
                              │              │              │
                    ┌─────────┴──┐  ┌────────┴──┐   ┌──────┴─────┐
                    │  frontend/ │  │admin-portal│   │parent-portal│
                    │  (Vite+    │  │ (Vite+    │   │ (Vite+     │
                    │  React)    │  │  React)   │   │  React)    │
                    └─────┬──────┘  └────┬──────┘   └─────┬──────┘
                          │              │                │
              ┌───────────┴──────────────┴────────────────┴───────┐
              │              Supabase (Auth + Database + RLS)      │
              │          mhbfvewkjlfmkqdhxpyg.supabase.co          │
              └──────────────────────┬────────────────────────────┘
                                     │
              ┌──────────────────────┴────────────────────────────┐
              │            Railway Backend (Express + TS)          │
              │         edusaga-360-production.up.railway.app      │
              │  Routes: /api/registration, /api/ai, /api/health  │
              │  Email: Resend (info@edusaga360.com)               │
              └───────────────────────────────────────────────────┘
```

## Three Applications

| Application | Directory | Purpose | Users |
|---|---|---|---|
| **School Staff App** | `frontend/` | Full school management platform | school_admin, teacher, staff, creator |
| **Super Admin Portal** | `admin-portal/` | EduSaga internal operations | edusaga_superadmin, edusaga_staff |
| **Parent Portal** | `parent-portal/` | Parent-facing read-only portal | parent |

## Backend Stack

| Component | Technology | Purpose |
|---|---|---|
| Frontend Runtime | React 18 + Vite 6 | SPA rendering, client-side routing |
| State Management | TanStack React Query | Server-state caching, mutations |
| Database | Supabase (PostgreSQL) | Relational data, RLS, auth |
| Auth | Supabase Auth | JWT-based, per-portal session |
| Backend API | Express 4 + TypeScript | Registration, AI, journal entries |
| Email | Resend | Transactional emails |
| AI | Google Gemini / OpenAI / Groq | Yamen AI HR companion |
| Hosting (Frontend) | Vercel | 3 separate projects |
| Hosting (Backend) | Railway | Auto-deploy from `main` |

## Authentication Flow

Each portal has **independent** Supabase Auth sessions:

1. **School Staff App**: User authenticates via `/school-login` → `supabase.auth.signInWithPassword()` → JWT stored in localStorage → `AuthProvider` wraps all routes → `RoleContext` loads role from `users` table → sidebar modules filtered by role.

2. **Super Admin Portal**: User authenticates via admin `/login` → same Supabase Auth instance but different browser origin → `AuthContext` checks `platform_roles` table for `edusaga_superadmin` or `edusaga_staff` role → non-authorized users see `AccessDenied` page.

3. **Parent Portal**: User authenticates via parent `/login` → `AuthContext` checks `parent_profiles` table → only `parent` role has access → data scoped to parent's linked students.

## Database Schema Overview

### Core Tables

| Table | Purpose |
|---|---|
| `tenants` | Multi-tenant schools — name, plan, status, limits |
| `users` | User profiles linked to `auth.users` — role, tenant_id |
| `branches` | School branches (campuses) |
| `academic_years` | Academic year config per tenant |
| `platform_roles` | Super admin / EduSaga staff role assignments |
| `parent_profiles` | Parent-to-student links |

### HR / Payroll

`employees`, `employee_attendances`, `leave_requests`, `leave_balances`, `pay_runs`, `payroll_inputs`, `salary_structures`, `gosi_records`, `iqama_records`, `govi_violations`

### Academic

`students`, `student_attendances`, `classes`, `sections`, `grades`, `subjects`, `student_grades`, `student_enrollments`

### Finance

`invoices`, `invoice_items`, `payments`, `fees_structures`, `journal_entries`, `budget_items`, `expense_reports`

### Operations

`assets`, `asset_categories`, `purchase_orders`, `purchase_requisitions`, `vendors`, `fleet_vehicles`, `fleet_trips`, `maintenance_requests`

### Platform

`registration_requests`, `tenant_requests`, `audit_logs`, `announcements`, `messages`, `email_templates`

## Multi-Tenant Isolation (RLS)

All tenant-scoped tables have Row-Level Security policies:

```sql
CREATE POLICY "tenant_isolation" ON employees
  USING (tenant_id = auth.jwt()->>'tenant_id');
```

This ensures:
- School A cannot see School B's data
- Each authenticated user's JWT includes their `tenant_id`
- Supabase enforces isolation at the database level
- The `service_role` key (used by backend) bypasses RLS for admin operations

## Email Flow

### Registration → Approval → Onboarding

```
School Admin                  Backend (Railway)           Resend              Super Admin
    │                              │                        │                     │
    ├─── POST /register ──────────►│                        │                     │
    │                              ├─── Send notification ─►│──── Email ─────────►│
    │                              │    (to info@edusaga)    │                     │
    │                              │                        │                     │
    │                              │◄───── Approve click ───┼─────────────────────┤
    │                              ├─── Update tenant ──────┤                     │
    │◄──── Welcome email ─────────┤    status → trial       │                     │
    │     (with onboarding link)   │                        │                     │
    │                              │                        │                     │
    ├─── Onboarding wizard ───────►│                        │                     │
    │    (password, logo, config)  ├─── Activate tenant ────┤                     │
    │◄──── Redirect to dashboard ──┤                        │                     │
```

## Subscription & Billing Flow

```
Tenant Admin                  Frontend                 Supabase              Super Admin Portal
    │                           │                        │                        │
    ├── View current plan ─────►│── Query tenants ──────►│                        │
    │                           │◄── plan_code, limits ──┤                        │
    │                           │                        │                        │
    ├── Request upgrade ───────►│── Insert request ─────►│── tenant_requests ────►│
    │                           │                        │                        │
    │                           │                        │     Review & Approve ──┤
    │                           │                        │◄── Update tenant plan ─┤
    │◄── Plan updated ─────────┤◄── Refetch tenant ─────┤                        │
```

All plan changes (upgrade & downgrade) require super admin approval. Trial clients receive the full enterprise package during their trial period.
