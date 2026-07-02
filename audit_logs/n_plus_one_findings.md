# Query Performance Audit — `backend/src/routes/*.ts` & `backend/src/services/*.ts`

Static scan for N+1 loops, sequential awaits in loops, missing pagination, unbounded
selects, likely-unindexed hot filters, and redundant round-trips. Filter columns were
cross-referenced against every `CREATE INDEX` in `shared/database/**.sql`.

_Generated: 2026-07-02. No source code was modified._

## Summary (counts by severity)

| Severity | Count |
|----------|-------|
| High     | 4     |
| Medium   | 15    |
| Low      | 13    |
| **Total**| **32**|

### Category breakdown
| Category | Count |
|----------|-------|
| N+1 loop (query fan-out) | 5 |
| sequential-await-in-loop | 4 |
| unbounded select | 9 |
| likely-unindexed filter | 10 |
| redundant round-trip | 4 |

### Indexes available for cross-reference (key tables)
- `students`: tenant_id, branch_id, grade_id, fee_structure_id, payment_plan_id — **no index on `status` or `academic_year`**
- `invoices`: tenant_id, student_id, branch_id, status — **no index on `date`, `due_date`, `academic_year`**
- `employees`: tenant_id, branch_id, (tenant_id,status) — **no index on `iqama_expiry`**
- `payments`: tenant_id, branch_id — **no index on `date` or `invoice_id`**
- `employee_attendance`: (tenant_id,date), (employee_id,date)
- `zatca_submissions`: (tenant_id,invoice_number), (tenant_id,zatca_status) — **no index on `invoice_id`**
- `expenses`: **no CREATE INDEX found anywhere** (tenant_id/status/date all unindexed)
- `payment_plan_installments`: (plan_id), (tenant_id,due_date,status)
- `users`: (email,tenant_id,user_role); `guardians`: (email,tenant_id)
- No index found for: `discount_rules`, `marketplace_reviews`, `subscription_orders`, `tenant_requests`, `registration_requests`, `chart_of_accounts`

---

## backend/src/routes/billing.ts

### [HIGH] `billing.ts:1193` — sequential-await-in-loop (N+1 writes)
```ts
for (const student of students) {
  ...
  await createInvoiceForStudent(tenant_id, req.user!.id, student.id, academic_year, feeLines, due_date, student.branch_id ?? null);
```
Bulk invoice generation calls `createInvoiceForStudent` once per student, sequentially. Each
call itself runs several queries (student lookup, fee categories, invoice insert, zatca insert).
For a full-school run this is hundreds of serial round-trips.
**Fix:** batch inserts (build all invoice rows and `insert()` once), or run with bounded concurrency (`p-limit` + `Promise.all`) instead of a serial `await` loop.

### [HIGH] `billing.ts:1247` — sequential-await-in-loop (2 writes per row)
```ts
for (const inv of overdueInvoices) {
  ...
  await supabase.from('dunning_log').insert({...});               // 1265
  await supabase.from('invoices').update({ status: 'overdue' })... // 1278
```
Two serial round-trips per overdue invoice.
**Fix:** collect rows and do one bulk `dunning_log.insert([...])`; bulk-update statuses via a single `.in('id', ids)` update.

### [HIGH] `billing.ts:982` — unbounded select + missing filter (hot payment path)
```ts
const { data: planInst } = await supabase.from('payment_plan_installments')
  .select('plan_id, status').eq('tenant_id', tenant_id);
const planId = planInst?.find((i) => i.plan_id)?.plan_id;
```
On every payment with an `installment_id`, this pulls **all** installment rows for the entire tenant just to check whether one plan is fully paid (and then picks an arbitrary `plan_id`). Grows with tenant size.
**Fix:** filter by the actual `plan_id` (`.eq('plan_id', planId)`), which is indexed (`idx_ppi_plan`); derive `planId` from the updated installment, not a table scan.

### [MED] `billing.ts:1232` — likely-unindexed filter (`due_date`)
```ts
.in('status', [...]).lt('due_date', today)
```
`invoices.due_date` has no index; a `< today` range on it will scan the tenant's issued/partial invoices.
**Fix:** add `CREATE INDEX ON invoices(tenant_id, due_date)`.

### [MED] `billing.ts:328` — unbounded-ish select guarded only by app-level `rowLimit`
`.limit(rowLimit)` where `rowLimit` is caller-supplied; verify it is capped server-side.

### [LOW] `billing.ts:1140` — likely-unindexed filter (`invoices.academic_year`)
`.eq('academic_year', academic_year)` — no index on `invoices.academic_year`.

### [LOW] `billing.ts:1126` — likely-unindexed filter (`students.status`)
`.eq('status','active')` — no index on `students.status` (only tenant/branch/grade).

### [LOW] `billing.ts:775` — likely-unindexed filter (`zatca_submissions.invoice_id`)
`zatca_submissions` is indexed on `invoice_number`, not `invoice_id`.

---

## backend/src/routes/exec.ts

### [MED] `exec.ts:386` — N+1 loop (per-branch invoice fan-out)
```ts
const campusVitality = await Promise.all(
  branches.map(async (b) => {
    const { data: invs } = await supabase.from('invoices')
      .select('total_amount, paid_amount').eq('tenant_id', tenant_id).eq('branch_id', b.id);
```
One invoice scan per branch on the CEO dashboard. Parallelized, but still N separate full-branch scans.
**Fix:** one query filtered by `tenant_id`, select `branch_id`, and aggregate per-branch in memory (or a grouped SQL view).

### [MED] `exec.ts:552` — N+1 loop (per-branch invoice fan-out)
Same pattern for capacity-to-cash (`.select('paid_amount').eq('branch_id', b.id)` per branch).
**Fix:** single `paid_amount, branch_id` query grouped in memory.

### [MED] `exec.ts:199` — unbounded select
`supabase.from('invoices').select('total_amount, paid_amount, status, due_date, branch_id').eq('tenant_id', tenant_id)` — pulls every invoice for the tenant for in-memory aggregation.
**Fix:** push aggregation into SQL (RPC/view) or a `count`/grouped query.

### [MED] `exec.ts:168 / :217 / :476` — likely-unindexed filter (`invoices.date`)
`.gte('date', since)` on invoices — no index on `invoices.date`.
**Fix:** `CREATE INDEX ON invoices(tenant_id, date)`.

### [MED] `exec.ts:169 / :218 / :477` — likely-unindexed filter (`expenses` table has NO indexes)
`.eq('tenant_id', ...).eq('status','approved').gte('date', ...)` — the `expenses` table has no `CREATE INDEX` anywhere in `shared/database`. Every dashboard call full-scans it.
**Fix:** add `CREATE INDEX ON expenses(tenant_id, status, date)`.

### [MED] `exec.ts:445` — likely-unindexed filter (`payments.date`)
`.gte('date', since30)` — `payments` indexed on tenant/branch only, not `date`.

### [MED] `exec.ts:272` — likely-unindexed filter (`invoices.due_date`)
`.neq('status','paid').lte('due_date', today)` — `due_date` unindexed.

### [LOW] `exec.ts:187 / :188` — likely-unindexed filter (`students.academic_year`)
Two near-identical `count` queries on `students.eq('academic_year', ...)` (unindexed); also a redundant round-trip pair (current vs previous) that could be one grouped query.

### [LOW] `exec.ts:530` — unbounded select + unindexed `students.status`
`.select('id, branch_id').eq('status','active')` full-scan of active students.

---

## backend/src/routes/admin.ts

### [MED] `admin.ts:63` — sequential-await-in-loop / unbounded fetch
```ts
for (let page = 1; page <= 10; page++) {
  const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
```
`getAuthMap()` serially pages through **all** auth users (up to 10×1000) on every admin user-list request to build an in-memory map.
**Fix:** fetch only the auth ids actually needed for the current page, or cache the map.

### [MED] `admin.ts:198` — unbounded select (platform-wide)
```ts
const { data: counts } = await supabase.from('users').select('tenant_id');
```
Selects `tenant_id` for **every user across every tenant** to count per-tenant in memory.
**Fix:** grouped/aggregate query (`select tenant_id, count(*) group by tenant_id`) via RPC/view.

### [MED] `admin.ts:659 / :663 / :666` — sequential-await-in-loop (external auth API)
```ts
for (const r of targets) if (r.auth_id) await patchAuthMetadata(...);   // 659
for (const r of targets) if (r.auth_id) await supabase.auth.admin.updateUserById(...); // 663/666
```
Up to 500 serial auth-API calls per bulk action.
**Fix:** `Promise.all` with bounded concurrency.

### [MED] `admin.ts:140 / :141` — unbounded select (platform overview)
`from('tenants').select(...)` and `from('users').select('id, status, created_at')` with no filter/limit — grows with the whole platform.

### [LOW] `admin.ts:670` — sequential-await-in-loop
`for (const tid of tenantIds) await syncSeatCount(tid);` — each `syncSeatCount` runs a count query serially.
**Fix:** `Promise.all`.

---

## backend/src/routes/parents.ts

### [MED] `parents.ts:122` — unbounded fetch to find one row
```ts
const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
const existingAuth = existingAuthUsers?.users?.find(u => u.email === ...);
```
Fetches the auth user list (default first page only) and scans it in memory to find one email — both expensive and **incorrect beyond the first page** (misses users past the default page size).
**Fix:** look the user up directly by email via an admin lookup / `users` table (`idx_users_email_tenant_role` exists), not a list scan.

---

## backend/src/routes/ai.ts

### [MED] `ai.ts:406` — unbounded select + unindexed filter
`from('invoices').select(...).eq('tenant_id', tenantId)` (optionally `.eq('academic_year', ...)`, unindexed) with no limit — full tenant invoice pull for the AI tool.

### [LOW] `ai.ts:495` — dynamic-column select on `students`
`.select(\`${col}, id\`)` — confirm `col` is whitelisted and the query is bounded/filtered.

### [LOW] `ai.ts:354` — `employee_attendance` scan
`.select('employee_id, status, late_minutes, is_excused, date')` — ensure a `date` range is applied so it uses `(tenant_id,date)`; otherwise it scans all attendance.

---

## backend/src/routes/benchmarks.ts

### [LOW] `benchmarks.ts:35 / :36` — unbounded select (aggregation)
`invoices` (all) and `students` (all active) pulled for in-memory ratios. Acceptable for an on-demand report but scales with tenant size; prefer aggregate queries. `students.status` filter is unindexed.

---

## backend/src/routes/subscription.ts

### [MED] `subscription.ts:216` — unbounded select (no filter)
`supabase.from('subscription_orders').select('*')` with no `.eq`/`.limit` — full-table read.
**Fix:** filter by tenant/status and paginate; `subscription_orders` also has no index.

### [LOW] `subscription.ts:225` — likely-unindexed filter
`from('tenant_requests').select('*').eq('type','billing')` — `tenant_requests` has no index.

---

## backend/src/routes/tenantUsers.ts

### [LOW] `tenantUsers.ts:126 & :163` — redundant round-trip
The active-seat count for the same `tenant_id` is queried twice within the approval handler (before insert and again after).
**Fix:** compute once (or derive the post-insert count as `count + 1`).

---

## backend/src/routes/marketplace.ts

### [LOW] `marketplace.ts:101` — redundant round-trip + unindexed filter
After inserting a review, it re-selects all `marketplace_reviews.eq('vendor_id', ...)` to recompute the vendor average (`vendor_id` unindexed), then updates the vendor.
**Fix:** maintain a running avg/count on the vendor row, or add `CREATE INDEX ON marketplace_reviews(vendor_id)`.

---

## backend/src/routes/leave.ts

### [LOW] `leave.ts:475 → :486 → :487` — sequential round-trips per approval
Reject/cancel path does select-balance → update-balance → insert-audit serially. Volume is 1 request at a time, so low impact; noted for completeness.

---

## backend/src/services/ledger.ts

### [LOW] `ledger.ts:31` — likely-unindexed filter
```ts
.from('chart_of_accounts').select('id').eq('tenant_id', tenant_id).ilike('code', `${codePrefix}%`)
```
`chart_of_accounts` has no index; `ilike 'prefix%'` on `code`. `.limit(1)` bounds the result but the scan is per tenant.
**Fix:** `CREATE INDEX ON chart_of_accounts(tenant_id, code)` (prefix `LIKE` can use a btree/text_pattern_ops index).

---

## Clean files (no findings)
`services/chequeLifecycle.ts` (pure logic), `services/email.ts` and `services/zatca.ts` (no DB
selects), `routes/health.ts`, `routes/auth.ts`, `routes/files.ts` (loops are in-memory byte/type
checks), `routes/journalEntries.ts`, `routes/payroll.ts` and `routes/attendancePolicy.ts`
(queries are batched with `Promise.all` and grouped in memory), `routes/payslipPdf.ts`,
`routes/cheques.ts`, `routes/notifications.ts` (bulk send is external-API `Promise.allSettled`),
`routes/tenantRequests.ts`, `routes/registration.ts` (single-row by PK), `routes/intake.ts`.
