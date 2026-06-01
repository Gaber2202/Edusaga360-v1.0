# EduSaga 360 — Platform Overview

## What is EduSaga 360?

EduSaga 360 is a multi-tenant SaaS school management platform built for the Saudi Arabian education market. It provides a comprehensive suite of modules covering HR, payroll, student management, finance, procurement, and more — all with full Arabic/English bilingual support.

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React | 18.x |
| Build Tool | Vite | 6.x |
| UI Components | shadcn/ui + Tailwind CSS | 4.x |
| Charts | Recharts | 2.x |
| State | TanStack React Query | 5.x |
| Routing | React Router | 7.x |
| Backend | Express.js + TypeScript | 4.x / 5.x |
| Database | Supabase (PostgreSQL) | — |
| Auth | Supabase Auth (JWT) | — |
| Email | Resend | — |
| AI | Google Gemini / OpenAI / Groq | Configurable |
| Hosting (Frontend) | Vercel | — |
| Hosting (Backend) | Railway | — |

## Module Status

### School Staff App (`frontend/`)

| Module | Status | Notes |
|---|---|---|
| Dashboard | Working | KPIs, charts, activity feed |
| Admissions | Working | Applications, enrollment workflow |
| Students | Working | Student profiles, grades, attendance |
| Student Attendance | Working | Daily attendance tracking |
| HR & Employees | Working | Employee profiles, documents |
| Payroll | Working | Pay runs, salary structures, GOSI |
| Leave Management | Working | Request/approve workflow |
| Fees & Invoices | Working | Fee structures, invoice generation |
| Finance | Working | Journal entries, budget, expenses |
| Procurement | Working | Purchase orders, requisitions, vendors |
| Assets | Working | Asset tracking, depreciation |
| CRM | Working | Leads, communications |
| Fleet Management | Working | Vehicles, trips, maintenance |
| Facilities | Working | Maintenance requests |
| Communications | Working | Announcements, messaging |
| Reports | Working | Executive dashboard, financial reports |
| Integrations | Working | Third-party connectors |
| Subscription | Working | View plan, request upgrade/downgrade |
| Yamen AI | Working | HR chat, risk monitor, insights |
| Settings | Working | Users, permissions, audit logs |
| Onboarding Wizard | Working | Post-registration setup flow |
| Registration | Working | School registration form |

### Super Admin Portal (`admin-portal/`)

| Module | Status | Notes |
|---|---|---|
| Dashboard | Working | Platform-wide metrics |
| Tenant Management | Working | View/activate/suspend schools |
| Subscription Management | Working | Plan approval, upgrade/downgrade review |
| Platform Analytics | Working | Usage metrics, charts |
| Platform Users | Working | Manage EduSaga team access |
| Audit Logs | Working | Cross-tenant activity logs |
| Email Templates | Working | Template management |
| Feature Flags | Working | Per-tenant feature toggles |
| Settings | Working | Portal configuration |

### Parent Portal (`parent-portal/`)

| Module | Status | Notes |
|---|---|---|
| Dashboard | Working | Overview with student cards |
| Student Progress | Working | Grades, academic performance |
| Attendance | Working | Student attendance records |
| Fees | Working | Payment history, pending fees |
| Announcements | Working | School announcements |
| Messaging | Working | Communication with teachers |

## Feature Matrix by Role

| Feature | Creator | School Admin | Teacher | Staff | Parent | Super Admin |
|---|---|---|---|---|---|---|
| Dashboard (full) | ✓ | ✓ | — | — | — | ✓ |
| Dashboard (limited) | — | — | ✓ | ✓ | ✓ | — |
| All Sidebar Modules | ✓ | ✓ | — | — | — | — |
| Teaching Modules | ✓ | ✓ | ✓ | — | — | — |
| HR/Payroll | ✓ | ✓ | — | — | — | — |
| Finance | ✓ | ✓ | — | ✓ | — | — |
| Settings & Users | ✓ | ✓ | — | — | — | — |
| Audit Logs | ✓ | ✓ | — | — | — | ✓ |
| Subscription Mgmt | ✓ | ✓ | — | — | — | ✓ |
| Yamen AI (HR mode) | ✓ | ✓ | — | — | — | — |
| Yamen AI (self-service) | — | — | ✓ | ✓ | — | — |
| Student Progress (own) | — | — | — | — | ✓ | — |
| Attendance (own kids) | — | — | — | — | ✓ | — |
| Fees (own kids) | — | — | — | — | ✓ | — |
| Tenant Management | — | — | — | — | — | ✓ |
| Platform Analytics | — | — | — | — | — | ✓ |

## Third-Party Services

| Service | Purpose | Config Key |
|---|---|---|
| Supabase | Database, auth, RLS | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Resend | Transactional email | `RESEND_API_KEY` |
| Railway | Backend API hosting | — |
| Vercel | Frontend hosting (×3 projects) | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| Google AI | Yamen AI LLM (primary) | `GOOGLE_AI_API_KEY` |
| OpenAI | Yamen AI LLM (fallback) | `OPENAI_API_KEY` |
| Groq | Yamen AI LLM (fallback) | `GROQ_API_KEY` |

## Subscription Plans

| Plan | Users | Employees | Students | Branches | AI | Monthly (SAR) |
|---|---|---|---|---|---|---|
| Trial (Enterprise) | 999 | 9,999 | 99,999 | 99 | ✓ | Free (30 days) |
| Starter | 25 | 100 | 1,000 | 2 | — | 1,499 |
| Professional | 100 | 500 | 5,000 | 5 | ✓ | 3,999 |
| Enterprise | 999 | 9,999 | 99,999 | 99 | ✓ | 7,999 |
| Government | Unlimited | Unlimited | Unlimited | Unlimited | ✓ | Custom |

Trial clients receive the **full enterprise package** during the 30-day trial period. All plan changes (upgrade/downgrade) require super admin approval.
