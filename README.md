# EduSaga 360

Enterprise school management platform — multi-tenant SaaS built with React, Express, Supabase, and TypeScript.

## Architecture

```
edusaga-360/
├── frontend/          # School staff app (React + Vite)
├── admin-portal/      # Super Admin portal (React + Vite)
├── parent-portal/     # Parent portal (React + Vite)
├── backend/           # API server (Express + TypeScript)
├── shared/            # Database schema & migrations
└── docs/              # Deployment & known issues
```

### Three Separate Frontends

| App | Domain | Purpose |
|-----|--------|---------|
| `frontend/` | edusaga360.com | School staff — admissions, HR, finance, etc. |
| `admin-portal/` | admin.edusaga360.com | EduSaga internal team — tenant management, analytics |
| `parent-portal/` | parentportal.edusaga360.com | Parents — student progress, fees, messaging |

### Tech Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Express + TypeScript
- **Database:** Supabase (PostgreSQL + Row Level Security)
- **Auth:** Supabase Auth
- **Hosting:** Vercel (frontends) + Railway (backend)
- **Email:** Resend (transactional emails)

## Quick Start

```bash
# Frontend
cd frontend && npm install && npm run dev

# Admin Portal
cd admin-portal && npm install && npm run dev

# Parent Portal
cd parent-portal && npm install && npm run dev

# Backend
cd backend && npm install && npm run dev
```

### Environment Variables

Copy `.env.example` in each directory. Required:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous key
- `VITE_API_BASE_URL` — Backend API URL (for frontend)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (for backend only)

## Multi-Tenant Architecture

- Each school (tenant) has its own data isolated via Supabase Row Level Security
- Users are scoped to a tenant via `tenant_id` on all tables
- Platform owner (`creator` role) can see all tenants
- Role-based access: creator, admin, teacher, staff, parent, hr_admin, finance, etc.

## Registration Flow

1. School admin fills registration form at `/register`
2. Backend creates `pending` registration request
3. Admin notification email sent to `info@edusaga360.com` with Approve/Deny buttons
4. On approval: tenant created with `trial` status, welcome email with onboarding link sent
5. School admin completes onboarding wizard: set password, school settings, language
6. Tenant activated, user redirected to dashboard

## Modules

Admissions, Students, HR, Payroll, Fees & Finance, Procurement, Assets, Fleet, IT Helpdesk, Facilities, CRM, Communications, Reports, Clinic, Library, Canteen, Transport, AI Assistant (Yamen), and more.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment instructions.

## License

Private — EduSaga360
