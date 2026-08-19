# EduSaga 360

Enterprise school management platform — multi-tenant SaaS built with React, Express, Supabase, and TypeScript.

## Architecture

```
edusaga-360/
├── frontend/          # School staff app (React + Vite)
├── admin-portal/      # Super Admin portal (React + Vite)
├── parent-portal/     # Parent portal (React + Vite)
├── parent-mobile/     # Parent mobile app (Flutter, iOS + Android)
├── backend/           # API server (Express + TypeScript)
├── shared/            # Database schema & migrations
└── docs/              # Deployment & known issues
```

### Frontends

| App | Domain / package | Purpose |
|-----|------------------|---------|
| `frontend/` | edusaga360.com | School staff — admissions, HR, finance, etc. |
| `admin-portal/` | admin.edusaga360.com | EduSaga internal team — tenant management, analytics |
| `parent-portal/` | parentportal.edusaga360.com | Parents on the web |
| `parent-mobile/` | `com.edusaga360.parent` | Parents on iOS/Android |

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

# Parent mobile (Flutter)
cd parent-mobile && flutter pub get && flutter run

# Backend
cd backend && npm install && npm run dev
```

### Parent Portal demo seed

Seeds a login-ready parent family (students, invoices, attendance, grades, homework, announcements, messages) on an existing `is_demo` tenant. Never run against production.

```bash
cd backend
DEMO_SEED_ALLOWED_PROJECT_REFS=<supabase-ref> \
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
npm run seed:parent-portal
```

| Account | Password | What you can test |
|---|---|---|
| `parent.demo@edusaga.local` | `ParentPass123!` | Two children with fees, grades, attendance, homework, messages |
| `parent.empty@edusaga.local` | `ParentPass123!` | One child, empty module states |

Apply these migrations before the first seed:

- `shared/database/migrations/20260817_parent_portal_academic_tables.sql`
- `shared/database/migrations/20260818_parent_portal_commerce.sql`

### Parent mobile API

The parent web app and the Flutter app in `parent-mobile/` share `/api/parent`. Look up a school with the tenant code, then authenticate with `POST /api/parent/auth/login`.

```bash
# Catalog (no auth)
curl http://localhost:3001/api/parent

# School branding (no auth)
curl http://localhost:3001/api/public/schools/by-code/T-DEMO

# Login (tenant_code or slug is required)
curl -X POST http://localhost:3001/api/parent/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"parent.demo@edusaga.local","password":"ParentPass123!","tenant_code":"T-DEMO"}'

# Linked children
curl http://localhost:3001/api/parent/children \
  -H "Authorization: Bearer $TOKEN"
```

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/parent` | Endpoint catalog |
| GET | `/api/public/schools/by-code/:tenant_code` | School branding (slug required or 404) |
| POST | `/api/parent/auth/login` | Email/password + `tenant_code` or `slug` → tokens |
| POST | `/api/parent/auth/refresh` | Rotate tokens |
| GET | `/api/parent/me` | Parent profile + linked student ids |
| GET | `/api/parent/summary` | Home-screen KPIs |
| GET | `/api/parent/children` | Linked students |
| GET | `/api/parent/attendance` | Attendance (`?student_id=`) |
| GET | `/api/parent/invoices` | Fee invoices (`?student_id=`) |
| GET | `/api/parent/grades` | Grades |
| GET | `/api/parent/homework` | Homework |
| GET | `/api/parent/announcements` | School announcements |
| GET | `/api/parent/messages` | Inbox |
| POST | `/api/parent/messages` | Send a note to the school office |
| GET | `/api/parent/notifications` | In-app notifications |
| GET | `/api/parent/payments` | Payment history (`?student_id=`) |
| GET | `/api/parent/contracts` | Enrollment contracts (`?student_id=`) |
| GET | `/api/parent/applications` | Admission docs checklist (`?student_id=`) |
| GET | `/api/parent/documents/sign` | Signed URL for an admission document |
| GET | `/api/parent/canteen/wallet` | Canteen wallet balance |
| GET | `/api/parent/canteen/transactions` | Canteen spend history |
| POST | `/api/parent/canteen/topup` | Create canteen top-up invoice |
| GET | `/api/parent/store/products` | School store catalog |
| GET | `/api/parent/store/categories` | Staff-defined store categories |
| GET | `/api/parent/store/products/:id/slots` | Open booking slots for a date |
| GET | `/api/parent/store/orders` | Store order history |
| POST | `/api/parent/store/orders` | Checkout (creates invoice + order) |
| GET | `/api/invoices/:id/payment-link` | Moyasar checkout URL |
| GET | `/api/invoices/:id/download-pdf` | Invoice PDF |
| GET | `/api/invoices/:id/receipt-pdf` | Payment receipt PDF |

All list routes are scoped to the parent’s linked children. Passing another family’s `student_id` returns 403.

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
