# EduSaga 360 — Migration Audit

> Generated from the existing `EduSaga360/edusaga` codebase (Base44-connected).
> This document catalogs every feature, dependency, API surface, and environment
> variable that must be accounted for during the migration to a fully independent
> platform.

---

## 1. Platform Overview

**Current stack:** React 18 + Vite 6, Tailwind CSS + Radix/shadcn UI, React Router 6,
TanStack Query, react-hook-form, Zod, Sentry, Stripe, `@base44/sdk` for the entire
backend (database, auth, multi-tenancy, file storage, integrations).

**Target stack:** React 18 + Vite, Tailwind CSS + Radix/shadcn UI (unchanged),
Supabase (PostgreSQL + Auth + Storage), Express/Fastify backend on Railway/Render,
Cloudflare R2 / AWS S3 for file storage.

---

## 2. Features & Modules

### 2.1 Core Administration
| Module | Page(s) | Description |
|--------|---------|-------------|
| Dashboard | `Dashboard.jsx` | Main admin dashboard with key metrics |
| Institution Setup | `InstitutionSetup.jsx` | School/institution configuration |
| Branch Management | `Branches.jsx` | Multi-campus branch management |
| Grade Configuration | `GradeConfiguration.jsx` | Academic grade levels setup |
| Settings | `Settings.jsx` | System-wide settings |
| User Management | `UserManagement.jsx` | User accounts and access control |
| Role Management | `RoleManagement.jsx`, `RolesPermissions.jsx` | RBAC roles and permissions |
| Audit Logs | `AuditLogs.jsx` | System-wide administrative mutation logging |

### 2.2 Admissions & Student Lifecycle
| Module | Page(s) | Description |
|--------|---------|-------------|
| Admissions | `Admissions.jsx` | Student admission processing |
| CRM | `CRM.jsx` | Customer relationship management for leads |
| Student Management | `Students.jsx` | Student records and profiles |
| Student Tags | `StudentTags.jsx` | Student categorization/tagging |
| Student Attendance | `StudentAttendancePage.jsx`, `Attendance.jsx` | Student attendance tracking |
| Attendance Devices | `AttendanceDevices.jsx` | Biometric/RFID device management |
| Parent Portal | `ParentPortal.jsx` | Parent-facing portal |
| Parent Intake | `ParentIntake.jsx`, `ParentIntakeManagement.jsx` | New parent registration intake |
| Parent Contract Signing | `ParentSignContract.jsx` | Digital contract signing |
| Registration Wizard | `RegistrationWizard.jsx` | Public school registration |
| Onboarding | `Onboarding.jsx`, `OnboardingWizard.jsx` | Multi-step tenant onboarding |

### 2.3 Finance & Accounting
| Module | Page(s) | Description |
|--------|---------|-------------|
| Finance Dashboard | `FinanceDashboard.jsx` | Financial overview and KPIs |
| Chart of Accounts | `ChartOfAccounts.jsx` | GL account structure |
| General Ledger | `GeneralLedger.jsx` | Full general ledger |
| Journal Entries | `JournalEntries.jsx` | Manual journal entries (server-authoritative) |
| Fiscal Periods | `FiscalPeriods.jsx` | Fiscal year/period management |
| Trial Balance | `TrialBalance.jsx` | Trial balance report |
| Financial Statements | `FinancialStatements.jsx` | P&L, balance sheet, cash flow |
| Month-End Close | `MonthEndClose.jsx` | Period close procedures |
| Reconciliation | `Reconciliation.jsx` | Bank reconciliation |
| Fees | `Fees.jsx` | Fee structure configuration |
| Tuition Configuration | `TuitionFeesConfiguration.jsx` | Tuition fee setup |
| Collections | `Collections.jsx` | Payment collection tracking |
| Invoices | `InvoiceDetails.jsx` | Invoice generation and viewing |
| Refunds | `Refunds.jsx` | Refund processing |
| Expenses | `Expenses.jsx` | Expense management |
| AP Bills | `APBills.jsx` | Accounts payable |
| Cost Centers | `CostCenters.jsx` | Cost center management |
| Bank Management | `BankManagement.jsx` | Bank account management |
| Bank File Templates | `BankFileTemplates.jsx` | IBAN/SWIFT file templates |
| VAT Management | `VATManagement.jsx` | ZATCA-compliant VAT/tax |
| Vendors | `Vendors.jsx` | Vendor/supplier management |

### 2.4 HR & Payroll
| Module | Page(s) | Description |
|--------|---------|-------------|
| HR Manager Dashboard | `HRManagerDashboard.jsx` | HR overview dashboard |
| Employees | `Employees.jsx` | Employee records |
| HR Contracts | `HRContracts.jsx` | Employment contracts |
| Payroll | `Payroll.jsx` | Payroll processing |
| Payslips | `PayslipsManagementPage.jsx`, `MyPayslips.jsx` | Payslip generation/viewing |
| Leave Management | `Leaves.jsx`, `LeaveBalances.jsx` | Leave requests and balances |
| Employee Attendance | `EmployeeAttendance.jsx` | Staff attendance tracking |
| Overtime | `Overtime.jsx` | Overtime management |
| EOSB Calculator | `EOSBCalculator.jsx` | End-of-service benefits (Saudi labor law) |
| Performance Evaluation | `PerformanceEvaluation.jsx` | Employee evaluations |
| Disciplinary Cases | `DisciplinaryCases.jsx` | Disciplinary action tracking |
| Training & Development | `TrainingDevelopment.jsx` | Training programs |
| Recruitment | `RecruitmentPage.jsx` | Hiring pipeline |
| Workforce Planning | `WorkforcePlanning.jsx` | Staffing forecasting |
| HR Approvals Inbox | `HRApprovalsInbox.jsx` | HR workflow approvals |
| HR Policies | `HRPoliciesLibrary.jsx`, `PolicyEditor.jsx` | Policy management |
| Holiday Calendar | `HolidayCalendar.jsx` | Public/school holiday management |
| Companies | `Companies.jsx` | Multi-company/legal entity management |

### 2.5 Employee Self-Service (ESS)
| Module | Page(s) | Description |
|--------|---------|-------------|
| ESS Portal | `ESSPortal.jsx` | Employee self-service portal |
| ESS Settings | `ESSSettings.jsx` | ESS configuration |
| Staff Inbox | `StaffInbox.jsx` | Staff notification inbox |

### 2.6 Government Relations (Saudi-specific)
| Module | Page(s) | Description |
|--------|---------|-------------|
| Government Relations | `GovernmentRelations.jsx` | Saudi government integrations hub |
| Gov Integrations | `GovIntegrations.jsx` | GOSI, Mudad, Qiwa, etc. |
| Saudization Tracker | Component: `SaudizationTracker.jsx` | Nitaqat compliance |

### 2.7 Operations & Facilities
| Module | Page(s) | Description |
|--------|---------|-------------|
| Operations Dashboard | `OperationsDashboard.jsx` | Operational overview |
| Assets | `Assets.jsx`, `AssetAssignments.jsx`, `AssetRentals.jsx` | Fixed asset tracking |
| Depreciation | `Depreciation.jsx` | Asset depreciation |
| Facilities | `Facilities.jsx` | Building/room management |
| Fleet Management | `FleetManagement.jsx` | Vehicle fleet tracking |
| Transport Management | `TransportManagement.jsx` | Bus routes and student transport |
| IT Helpdesk | `ITHelpdesk.jsx`, `TicketDetails.jsx` | IT support ticketing |
| Canteen Management | `CanteenManagement.jsx` | School canteen POS and wallets |
| Library Management | `LibraryManagement.jsx` | Library books and loans |
| School Clinic | `SchoolClinic.jsx` | Student health records |

### 2.8 Communications & Notifications
| Module | Page(s) | Description |
|--------|---------|-------------|
| Communications | `Communications.jsx` | Messaging system |
| Admin Messaging | `AdminMessaging.jsx` | Admin broadcast messages |
| Notification Center | `NotificationCenter.jsx` | In-app notifications |
| Notification Preferences | `NotificationPreferences.jsx` | User notification settings |
| Notification Settings | `NotificationSettings.jsx` | System notification config |

### 2.9 Contracts & Procurement
| Module | Page(s) | Description |
|--------|---------|-------------|
| Contracts | `Contracts.jsx` | Student/parent contracts |
| Contract Templates | `ContractTemplates.jsx` | Contract template builder |
| Purchase Requisitions | `PurchaseRequisitions.jsx` | Purchase request workflow |
| Purchase Orders | `PurchaseOrders.jsx` | Purchase order management |

### 2.10 Platform Administration (Super-Admin)
| Module | Page(s) | Description |
|--------|---------|-------------|
| Super Admin Dashboard | `SuperAdminDashboard.jsx` | Cross-tenant platform overview |
| Platform Console | `PlatformConsole.jsx` | Platform-level management |
| Subscription Management | `SubscriptionManagement.jsx` | Tenant subscription plans |
| Client Subscription | `ClientSubscription.jsx` | Client-facing subscription portal |
| Trial Users | `TrialUsers.jsx` | Trial user management |
| Demo Data Seed | `DemoDataSeed.jsx` | Demo data generation |
| System Health | `SystemHealth.jsx` | System monitoring |
| System Error Log | `SystemErrorLog.jsx` | Error tracking |
| System Smoke Test | `SystemSmokeTest.jsx` | Health check tests |
| Fixed Issues Log | `FixedIssuesLog.jsx` | Resolved issue tracking |

### 2.11 AI Features
| Module | Page(s) | Description |
|--------|---------|-------------|
| Yamen AI | `YamenAI.jsx` | LLM-powered HR insights, candidate scoring |
| Yamen Admin Controls | `YamenAdminControls.jsx` | AI feature admin settings |

### 2.12 Reports & Analytics
| Module | Page(s) | Description |
|--------|---------|-------------|
| Reports | `Reports.jsx` | Report hub |
| Report Builder | Component: `ReportBuilder.jsx` | Custom report builder |
| Executive Dashboard | Component: `ExecutiveDashboard.jsx` | C-level dashboard |
| Financial Reports | Component: `FinancialReports.jsx` | Finance-specific reports |
| Scheduled Reports | Component: `ScheduledReports.jsx` | Auto-generated reports |

### 2.13 Content & Workflows
| Module | Page(s) | Description |
|--------|---------|-------------|
| CMS | `CMS.jsx` | Content management system |
| Workflow Engine | `WorkflowEngine.jsx` | Custom workflow builder |
| Integration Hub | `IntegrationHub.jsx` | Third-party integrations |

---

## 3. Base44 SDK Dependencies to Remove

### 3.1 NPM Packages
```
@base44/sdk          ^0.8.29    — Core SDK (auth, DB, entities, functions, storage)
@base44/vite-plugin  ^1.0.17    — Vite plugin (HMR, navigation, visual-edit agent)
```

### 3.2 SDK Import Locations (3 files import `@base44/sdk` directly)
| File | Import | Purpose |
|------|--------|---------|
| `src/api/base44Client.js` | `createClient` from `@base44/sdk` | Creates the tenant-scoped proxy client |
| `src/api/base44Client.test.js` | Test file for above | Unit tests |
| `src/lib/AuthContext.jsx` | `createAxiosClient` from `@base44/sdk/dist/utils/axios-client` | HTTP client for public settings |

### 3.3 Files Importing from `@/api/base44Client` (≈216 files)
Every page and most components import `base44` from `@/api/base44Client` to access:
- `base44.entities.<EntityName>.filter()` / `.list()` / `.create()` / `.update()` / `.delete()` / `.get()`
- `base44.auth.me()` / `.logout()` / `.redirectToLogin()`
- `base44.functions.<functionName>()`
- `base44.storage.uploadFile()` / `.getFileUrl()`
- `base44.asPlatform.entities.*` (super-admin cross-tenant access)

### 3.4 Vite Plugin (`@base44/vite-plugin`)
Used in `vite.config.js` with these features:
- `legacySDKImports` — path alias support
- `hmrNotifier` — HMR notification to Base44 Builder
- `navigationNotifier` — route tracking for Base44 Builder
- `visualEditAgent` — visual editing overlay

**Action:** Remove the plugin entirely. Replace with standard Vite path aliases.

---

## 4. Base44 API Calls to Replace

### 4.1 Authentication
| Current (Base44) | Replacement (Supabase Auth) |
|-----------------|---------------------------|
| `base44.auth.me()` | `supabase.auth.getUser()` |
| `base44.auth.logout()` | `supabase.auth.signOut()` |
| `base44.auth.redirectToLogin()` | Custom login page with `supabase.auth.signInWithPassword()` |
| `createAxiosClient` for public settings | Direct Supabase client or fetch |

### 4.2 Database / Entity Operations
| Current (Base44) | Replacement (Supabase) |
|-----------------|----------------------|
| `base44.entities.X.filter(query)` | `supabase.from('x').select().match(query)` |
| `base44.entities.X.list(sort, limit)` | `supabase.from('x').select().order().limit()` |
| `base44.entities.X.create(data)` | `supabase.from('x').insert(data)` |
| `base44.entities.X.update(id, data)` | `supabase.from('x').update(data).eq('id', id)` |
| `base44.entities.X.delete(id)` | `supabase.from('x').delete().eq('id', id)` |
| `base44.entities.X.get(id)` | `supabase.from('x').select().eq('id', id).single()` |

### 4.3 Edge Functions (30 server-side functions)
| Function | Purpose | Migration Strategy |
|----------|---------|-------------------|
| `approveTenantRequest` | Approve new tenant registrations | Express API endpoint |
| `assignTenantToUser` | Link user to tenant | Express API endpoint |
| `autoProvisionNewUser` | Auto-provision user on first login | Supabase Auth hook or Express |
| `completeOnboarding` | Finalize tenant onboarding | Express API endpoint |
| `completeSetupFromToken` | Token-based account setup | Express API endpoint |
| `createContractTemplate` | Create contract templates | Express API endpoint |
| `createJournalEntry` | Server-authoritative journal creation | Express API (validates debit=credit) |
| `createNotificationEvent` | Trigger notification events | Express API endpoint |
| `createStudentProfileOnEnrollment` | Auto-create student on enrollment | Express API endpoint |
| `deduplicateAcademicYears` | Remove duplicate academic years | Express migration endpoint |
| `detectDuplicateAcademicYears` | Find duplicate academic years | Express API endpoint |
| `generateReport` | Generate reports | Express API endpoint |
| `integrationEventReplay` | Replay failed integration events | Express API endpoint |
| `listSubscriptionRequests` | List subscription change requests | Express API endpoint |
| `migrateStudentFeeIds` | Data migration utility | Express migration endpoint |
| `migrateTenantsData` | Tenant data migration | Express migration endpoint |
| `notificationTriggers` | Notification event processing | Express API endpoint |
| `processRegistrationRequest` | Process school registration | Express API endpoint |
| `provisionUnlinkedUsers` | Provision users without tenant | Express API endpoint |
| `resendSetupFromPublicToken` | Resend setup email | Express API endpoint |
| `seedDemoData` | Generate demo/test data | Express API endpoint |
| `selfRegisterTenant` | Self-service tenant registration | Express API endpoint |
| `setCreatorRole` | Set initial admin role | Supabase Auth hook or Express |
| `submitClientTenantRequest` | Client-side tenant request | Express API (with validation) |
| `submitRegistrationRequest` | Public registration submission | Express API (with validation) |
| `submitTenantRequest` | Internal tenant request | Express API endpoint |
| `updateMyName` | Update user display name | Express API endpoint |
| `updateTenantCounters` | Update tenant usage stats | Express API endpoint |
| `upgradeExistingTenants` | Tenant upgrade migration | Express migration endpoint |
| `validateSetupToken` | Validate setup/invite tokens | Express API endpoint |

### 4.4 File Storage
| Current (Base44) | Replacement |
|-----------------|------------|
| `base44.storage.uploadFile()` | Supabase Storage or Cloudflare R2/AWS S3 |
| `base44.storage.getFileUrl()` | Signed URLs from Supabase Storage or R2/S3 |

---

## 5. Database Entities (139 total)

### 5.1 Complete Entity List (from `base44/entities/*.jsonc`)

**Academic & Student (19)**
- AcademicYear, Applicant, Application, Attendance, AttendanceDevice, AttendanceViolation
- Grade, Guardian, Section, Student, StudentAttendance, StudentBusAssignment
- StudentContract, StudentGrade, StudentHealthRecord, StudentTag, BusRoute, CMSContent, LibraryBook

**Finance & Accounting (27)**
- APBill, APPayment, BankExport, BankExportProfile, BankFileTemplate, BankTemplate
- ChartOfAccounts, CostCenter, Currency, Customer, Expense, FeeService, FeeStructure
- FeeType, FiscalPeriod, Invoice, InvoiceBatch, InvoicePaymentLog, JournalEntry
- Payment, PaymentReconciliation, RefundRequest, SchoolBankAccount, SpecialCareFee
- VATReturn, Vendor, ZATCAInvoice

**HR & Payroll (24)**
- Company, Contractor, Department, DisciplinaryCase, DisciplinaryWarning
- Employee, EmployeeAttendance, EmployeeCompanyTransfer, EmployeeContract
- EmployeeDocument, EmployeeLoan, ESSRequest, ESSSettings, EvalCriteriaTemplate
- GOSIRecord, HRPolicy, Holiday, JobTitle, LeaveBalance, LeaveBalanceAudit
- LeaveRequest, LeaveType, OvertimeRequest, Training

**Payroll Processing (10)**
- LoanInstallment, MudadSubmission, PayRun, PayrollInput, PayslipDelivery
- PayslipLine, PayslipSettings, SalaryComponent, TuitionAdvance, PunchLog

**Government Relations (4)**
- GovDocument, GoviViolation, IqamaRecord, VisaRecord

**Asset & Facility Management (7)**
- AssetAssignment, AssetDepreciation, AssetRental, FacilityAsset, FixedAsset
- FuelRecord, ITAsset

**Operations (7)**
- CanteenMenuItem, CanteenTransaction, CanteenWallet, ClinicVisit
- LibraryLoan, MaintenanceRecord, SparePart

**Fleet & Transport (3)**
- Vehicle, TripLog, WorkOrder

**Procurement (2)**
- PurchaseOrder, PurchaseRequisition

**Communications & Notifications (7)**
- Communication, ContractDeliveryLog, IntakeCommLog, Message
- Notification, NotificationPreferences, NotificationRecipient, NotificationSettings

**Contracts (2)**
- ContractTemplate, StudentContract

**Platform & System (17)**
- AppSetting, AppVersion, AuditLog, Branch, Country, FixedIssue
- IntegrationConnector, IntegrationLog, Onboarding, ParentIntakeLink
- PolicyVersion, PublicSettings, RegistrationRequest, Role, SubscriptionPlan
- SystemDefect, SystemError

**Tenant & Multi-tenancy (4)**
- Tenant, TenantRequest, TCVersion, User

**Workflow (2)**
- WorkflowInstance, WorkflowTemplate

**Recruitment (1)**
- Recruitment

**Performance (1)**
- PerformanceEvaluation

---

## 6. Frontend Components

### 6.1 Component Domains (36 domain directories under `src/components/`)
```
admissions/     applications/   attendance/    canteen/
clinic/         communications/ contracts/     dashboard/
depreciation/   employees/      ess/           fees/
fleet/          gov/            hr/            intake/
leaves/         library/        notifications/ onboarding/
parent/         payroll/        platform/      policies/
procurement/    recruitment/    reports/       students/
subscription/   superadmin/     tenant/        transport/
ui/             users/          yamen/
```

### 6.2 UI Primitives (`src/components/ui/` — shadcn)
Accordion, Alert, AlertDialog, AspectRatio, Avatar, Badge, Breadcrumb,
Button, Calendar, Card, Carousel, Chart, Checkbox, Collapsible, Command,
ContextMenu, DataTable, Dialog, Drawer, DropdownMenu, Form, HoverCard,
Input, InputOTP, Label, Menubar, NavigationMenu, Pagination, Popover,
Progress, RadioGroup, ResizablePanel, ScrollArea, Select, Separator,
Sheet, Sidebar, Skeleton, Slider, Sonner (toast), Switch, Table, Tabs,
Textarea, Toast, Toggle, ToggleGroup, Tooltip

### 6.3 Key Shared Components
| Component | Purpose |
|-----------|---------|
| `LoginGate.jsx` | Authentication gate wrapper |
| `ErrorLogger.jsx` | Error boundary with logging |
| `AuditService.jsx` | System-wide audit logging |
| `TenantContextSyncer.jsx` | React Query cache reset on tenant switch |
| `UserNotRegisteredError.jsx` | Error state for unregistered users |

### 6.4 Total File Count
- **207** component files (`.jsx`)
- **113** page files (`.jsx`)
- **363** total source files (`.js`, `.jsx`, `.ts`, `.tsx`)

---

## 7. Backend Logic & API Endpoints

### 7.1 API Wrapper Files (`src/api/`)
| File | Purpose |
|------|---------|
| `base44Client.js` | Tenant-scoped proxy around Base44 SDK |
| `journalEntry.js` | Server-authoritative journal entry creation |
| `registrationRequest.js` | Registration request API wrapper |
| `tenantRequest.js` | Tenant request API wrapper |

### 7.2 Library / Utilities (`src/lib/`)
| File | Purpose | Migration Impact |
|------|---------|-----------------|
| `AuthContext.jsx` | Auth provider (uses Base44 SDK) | **REPLACE** with Supabase Auth |
| `integrationBus.ts` | Event pub/sub system | Keep (no Base44 dep) |
| `integrationHandlers.js` | Cross-module event handlers | Update entity calls |
| `NavigationTracker.jsx` | Route tracking | Keep |
| `PageNotFound.jsx` | 404 page | Keep |
| `app-params.js` | App config from env vars | **REPLACE** |
| `authHelpers.js` | Auth utility functions | Update for Supabase |
| `csv.js` | CSV export utility | Keep |
| `dateCompare.js` | Date comparison helpers | Keep |
| `errorReporter.js` | Error reporting | Keep |
| `logger.ts` | Structured logging | Keep |
| `planDefinitions.js` | Subscription plan definitions | Keep |
| `query-client.js` | TanStack Query client | Keep |
| `rolePermissions.js` | RBAC permission definitions | Keep |
| `sanitize.js` | Input sanitization | Keep |
| `sentry.ts` | Sentry error tracking | Keep |
| `utils.ts` | General utilities | Keep |
| `vatRate.js` | Saudi VAT rate constants | Keep |

### 7.3 Hooks (`src/hooks/`)
| Hook | Purpose | Migration Impact |
|------|---------|-----------------|
| `use-mobile.jsx` | Mobile breakpoint detection | Keep |
| `useModuleAccess.js` | Module-level RBAC access | Update entity calls |
| `useTenantFilter.js` | Tenant-scoped query filters | **REPLACE** with Supabase RLS |
| `useTenantQuery.js` | Tenant-scoped TanStack Query | **REPLACE** |

---

## 8. Environment Variables & Secrets

### 8.1 Current Variables
```env
# Required (Base44 — will be REMOVED)
VITE_BASE44_APP_ID=<app-id>
VITE_BASE44_APP_BASE_URL=<base44-backend-url>

# Optional (Sentry — KEEP)
VITE_SENTRY_DSN=<sentry-dsn>
VITE_SENTRY_ENVIRONMENT=<environment>
VITE_SENTRY_RELEASE=<release-hash>
VITE_SENTRY_TRACES_SAMPLE_RATE=<0.0-1.0>

# Feature flags
VITE_TENANT_ISOLATION_STRICT=<true|false>
```

### 8.2 New Variables Needed
```env
# Supabase
VITE_SUPABASE_URL=<supabase-project-url>
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # Backend only, never exposed to client

# Backend API
VITE_API_BASE_URL=<backend-api-url>

# File Storage
R2_ACCOUNT_ID=<cloudflare-account-id>          # Or AWS credentials
R2_ACCESS_KEY_ID=<access-key>
R2_SECRET_ACCESS_KEY=<secret-key>
R2_BUCKET_NAME=<bucket-name>

# Stripe
STRIPE_SECRET_KEY=<stripe-secret>
STRIPE_WEBHOOK_SECRET=<webhook-secret>
VITE_STRIPE_PUBLISHABLE_KEY=<publishable-key>

# Sentry (unchanged)
VITE_SENTRY_DSN=<sentry-dsn>
VITE_SENTRY_ENVIRONMENT=<environment>
VITE_SENTRY_RELEASE=<release-hash>
VITE_SENTRY_TRACES_SAMPLE_RATE=<0.0-1.0>

# JWT
JWT_SECRET=<jwt-secret>

# SMTP (for notifications)
SMTP_HOST=<smtp-host>
SMTP_PORT=<smtp-port>
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
```

---

## 9. Third-Party Integrations

| Integration | Current Usage | Migration Notes |
|-------------|--------------|-----------------|
| **Stripe** | `@stripe/react-stripe-js`, `@stripe/stripe-js` | Keep — connect directly to Stripe API |
| **Sentry** | `@sentry/react` v10 | Keep — already independent |
| **Leaflet** | `react-leaflet` | Keep — maps for transport/fleet |
| **ExcelJS** | `exceljs` | Keep — Excel export |
| **jsPDF** | `jspdf` | Keep — PDF generation |
| **html2canvas** | `html2canvas` | Keep — screenshot/PDF utility |
| **React Quill** | `react-quill` | Keep — rich text editor |
| **React Markdown** | `react-markdown` | Keep — markdown rendering |
| **Recharts** | `recharts` | Keep — charts/dashboards |

---

## 10. Integration Event Bus

The app uses a custom pub/sub event bus (`integrationBus.ts`) for cross-module communication.

### Registered Events
| Event | Handlers |
|-------|----------|
| `enrollment_confirmed` | SIS (create student), Fees (assign fee structure), Communications (welcome), Contracts (issue contract) |
| Various HR events | Payroll triggers, leave balance updates, attendance violations |
| Financial events | Journal entries, invoice generation, payment reconciliation |

**Migration:** The event bus is standalone (no Base44 dependency). Entity calls within handlers must be updated to use Supabase client.

---

## 11. Multi-Tenancy Architecture

### Current Implementation
- **Tenant isolation proxy** in `base44Client.js` — auto-stamps `tenant_id` on all entity operations
- **Platform-only entities** bypass tenant scoping: `Tenant`, `TenantRequest`, `Role`, `Country`, `Currency`, `PublicSettings`, `AppSetting`, `AppVersion`
- **Super-admin** (`asPlatform`) escape hatch for cross-tenant queries
- **CI guard** (`check-tenant-isolation.mjs`) enforces import rules

### Migration Strategy
- Implement **Supabase Row Level Security (RLS)** policies on all tenant-scoped tables
- Add `tenant_id` column to all relevant tables with foreign key to `tenants` table
- RLS policy: `auth.jwt() ->> 'tenant_id' = tenant_id`
- Super-admin queries use `supabase.rpc()` with service role key
- Keep the CI guard script adapted for the new import patterns

---

## 12. File Structure for New Repo

```
edusaga-360/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/              # Supabase client + API wrappers
│   │   ├── components/       # All UI components (migrated)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utilities, context providers
│   │   ├── pages/            # All page components (migrated)
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── eslint.config.js
├── backend/
│   ├── src/
│   │   ├── routes/           # Express/Fastify route handlers
│   │   ├── middleware/       # Auth, tenant-scoping, validation
│   │   ├── services/        # Business logic (migrated from edge functions)
│   │   ├── validators/      # Zod schemas (migrated from validate.ts)
│   │   └── index.ts         # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   ├── types/                # Shared TypeScript types
│   ├── constants/            # Shared constants (VAT rates, etc.)
│   └── validators/           # Shared validation schemas
├── docs/
│   ├── MIGRATION_AUDIT.md
│   ├── DEPLOYMENT.md
│   └── KNOWN_ISSUES.md
├── .github/
│   └── workflows/
│       ├── ci.yml            # Lint, typecheck, test on PR
│       ├── deploy-staging.yml
│       └── deploy-production.yml
├── .gitignore
└── README.md
```

---

## 13. Migration Priority Order

1. **Auth** — Replace Base44 auth with Supabase Auth (blocks everything)
2. **Database schema** — Create all 139 entity tables in Supabase with RLS
3. **API client** — Replace `base44Client.js` with Supabase client + tenant proxy
4. **Server functions** — Port 30 edge functions to Express endpoints
5. **File storage** — Replace Base44 storage with R2/S3
6. **Frontend pages** — Update all 113 pages to use new API client
7. **Frontend components** — Update all 207 components
8. **Integration bus handlers** — Update entity calls in all handlers
9. **CI/CD** — GitHub Actions for staging/production deploys
10. **Testing** — Verify all modules end-to-end

---

## 14. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data migration from Base44 DB | High | Export/import scripts needed; coordinate with Base44 |
| Multi-tenancy RLS misconfiguration | Critical | Comprehensive RLS tests; keep CI guard |
| Auth token format change | High | Plan user re-authentication; communicate downtime |
| 139 entity schemas to define | Medium | Auto-generate from `.jsonc` entity definitions |
| 216 files with Base44 imports | Medium | Search-and-replace + manual review |
| Stripe webhook endpoint change | Medium | Update Stripe dashboard; test with CLI |
| Saudi government integrations | Medium | Verify API endpoints still accessible |
| File storage migration | Medium | Batch copy existing files to R2/S3 |
