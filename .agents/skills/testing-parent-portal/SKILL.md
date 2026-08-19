---
name: testing-parent-portal
description: How to seed and end-to-end test the EduSaga 360 parent portal locally — login, linked children, fees, attendance, grades, homework, announcements, and messages.
---

# Testing the EduSaga 360 Parent Portal

Use this skill when verifying parent login, linked students, or parent-facing modules on the local stack.

## Prerequisites

1. An `is_demo` tenant already exists (this seed never creates tenants).
2. Migrations applied:
   - `shared/database/migrations/20260817_parent_portal_academic_tables.sql`
   - `shared/database/migrations/20260818_parent_portal_commerce.sql`
3. Env in `parent-portal/.env.local`:
   ```
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-jwt>
   VITE_API_BASE_URL=
   ```
4. Backend env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Seed

```bash
cd backend
DEMO_SEED_ALLOWED_PROJECT_REFS=<project-ref> \
SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> \
npm run seed:parent-portal
```

Optional: `PARENT_SEED_TENANT_ID=<uuid>` to pin a demo tenant. `PARENT_DEMO_PASSWORD` overrides the default password.

The script is idempotent and refuses to run without `--confirm-demo-target` (included in the npm script) and an allowlisted project ref.

## Test accounts

| Email | Password | Purpose |
|---|---|---|
| `parent.demo@edusaga.local` | `ParentPass123!` | Full data — Sara (Grade 3) and Omar (Grade 1) |
| `parent.empty@edusaga.local` | `ParentPass123!` | Empty states — Layla (Grade 1) only |
| `staff.demo@edusaga.local` | `ParentPass123!` | Staff admin on the **same demo tenant** — Canteen Management |

Staff app (same tenant/data as parent canteen): `cd frontend && npm run dev -- --port 5175` → `/school-login` → **Canteen Management**.
Staff store: **School store** (catalog) and **Store orders** (fulfillment + booking calendar).

A non-parent staff user must see Access Denied.

## Start the portal

```bash
cd parent-portal && npm install && npm run dev
```

Default: `http://localhost:5173`. For invoice PDF download, also run `cd backend && npm run dev` (proxied `/api`).

## Checklist

### Login
- [ ] Login page renders with EduSaga logo and language toggle
- [ ] Wrong password shows an error and stays on login
- [ ] `parent.demo@edusaga.local` lands on the dashboard (not Access Denied)
- [ ] Display name is **Abdullah Al-Farsi**
- [ ] Staff / admin credentials show Access Denied

### Dashboard (full account)
- [ ] Two children: Sara Al-Farsi (Grade 3), Omar Al-Farsi (Grade 1)
- [ ] Attendance rate is a percentage, not `—`
- [ ] Outstanding fees is a SAR amount greater than 0
- [ ] Unread notifications is 2

### Student Progress
- [ ] Child pills filter Sara vs Omar vs all
- [ ] Sara has five subjects including Mathematics 92/100
- [ ] Omar has four subjects

### Attendance
- [ ] ~20 weekday rows per child
- [ ] Mix of present / late / absent / excused
- [ ] Rate matches dashboard

### Fees & Billing
- [ ] Four invoices: paid, partial, unpaid, overdue
- [ ] Total outstanding = partial remainder + unpaid + overdue (4600-2000 + 4025 + 1725 = 8350.00 SAR)
- [ ] PDF download button is present (needs backend)
- [ ] **Payments** tab shows at least one completed payment for the paid invoice
- [ ] **Contracts** tab shows Sara's signed enrollment agreement
- [ ] **Admission docs** tab shows checklist with birth cert, passport, vaccination uploaded

### Canteen
- [ ] `/canteen` shows wallet balance for Sara (~62.50 SAR) and Omar (~14 SAR)
- [ ] Allergy chips let a parent set types (Sara is seeded with dairy + gluten)
- [ ] Spend history lists top-up and purchase rows
- [ ] Top-up opens Moyasar payment link (backend required)

### Staff Canteen Management (`http://localhost:5175/CanteenManagement`)
- [ ] Quick POS shows **all menu items** as large tap tiles (iPad-friendly)
- [ ] Selecting Sara shows **dairy + gluten** allergy chips
- [ ] Tapping beef burger or chocolate muffin shows an **allergy alert**
- [ ] Menu tab lists every item with **available stock**
- [ ] Add qty / Adjust stock updates the number and writes a row in **Stock log**
- [ ] Sidebar **POS orders** lists purchases with type/date/student filters

### School store
- [ ] `/store` lists winter uniform, pool pass, football pitch rental
- [ ] Pitch rental opens a date/time slot picker (Sat–Thu 16:00–21:00)
- [ ] Cart checkout creates an order and opens payment link
- [ ] Orders tab shows one ready-to-collect uniform and one pending pitch booking

### Staff School Store (`http://localhost:5175/StoreManagement`)
- [ ] Catalog lists seeded items with category, sell vs rent, and stock
- [ ] Add/edit item supports image, category, sell/rent/both, and bookable hours
- [ ] Categories tab can add a custom category
- [ ] Sidebar **Store orders** lists orders; mark uniform order collected
- [ ] Calendar tab shows the confirmed Saturday 16:00 pitch booking

### Announcements
- [ ] Three published items, including a high-priority parent–teacher meeting

### Homework
- [ ] Three assignments; Arabic summary is past-due (overdue), others assigned/submitted

### Messages
- [ ] Three inbound messages (academic, attendance, invoice)
- [ ] Compose + send creates a new row and shows a success toast

### Empty account
- [ ] Login as `parent.empty@edusaga.local`
- [ ] Dashboard shows Layla only
- [ ] Progress / attendance / fees / homework / messages show empty states
- [ ] Announcements still appear (school-wide)

### i18n
- [ ] Globe toggle switches Arabic RTL / English LTR on every page above

## Parent mobile (Flutter)

```bash
cd parent-mobile && flutter run
```

Enter the demo tenant code (`T-DEMO` once the seed has set it), then the same accounts as above. The app calls `/api/parent` and `/api/public/schools/by-code/:code` only.
