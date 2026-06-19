# P0 Stability Audit — Fix Summary

**Date:** 2026-06-19
**Branch:** `claude/serene-pasteur-hz91et`
**Scope:** P0 — Stability Audit & Fixes (continuation of Devin's triage report)

---

## Root cause (single bug class)

A Supabase query built through `tenantQuery(table).select(...)` resolves to a
**`{ data, error }` object — not a bare array**. Dozens of call sites consumed
the resolved value directly as an array:

```js
// BROKEN — `result` is { data, error }
const result = await tenantQuery('invoices').select('*').match(tenantFilter());
return result.find(inv => inv.id === id);   // TypeError: result.find is not a function
```

Two failure modes:
1. **Hard crash** — `X.find/.filter/.map/.sort is not a function`, `X[0] is undefined`.
2. **Silent logic bug** — `X.length` is `undefined` (falsy), so duplicate-checks
   and "exists?" guards always take the wrong branch (e.g. duplicate pay runs,
   non-idempotent enrollment creating duplicate students).

### The fix (minimal, consistent with existing working pages)

Extract `.data`, matching the convention already used by Dashboard / CRM /
ITHelpdesk / OperationsDashboard:

```js
const { data: result = [] } = await tenantQuery('invoices').select('*').match(tenantFilter());
return result.find(inv => inv.id === id);
```

or via the existing `fetchData()` helper for one-liners.

---

## Triage issues → resolution (all 22 from the triage report)

| # | Module | Severity | Resolution |
|---|--------|----------|------------|
| 1 | `pages/InvoiceDetails.jsx` (Fees) | Critical | Destructured `{ data }` on 4 queries (invoices, payments, payment logs, guardians) |
| 2 | `pages/Contracts.jsx` | Critical | Destructured `{ data }` on grades / fee_structures / students lookups (3 sites) |
| 3 | `components/payroll/PayRunsList.jsx` | High | Destructured `existingForTarget` — duplicate pay-run check now works |
| 4 | `components/payroll/GOSISubmissions.jsx` | High | Destructured both payroll_inputs queries |
| 5 | `components/payroll/PayslipSettings.jsx` | High | Destructured `{ data: all }` before `all[0]` |
| 6 | `components/payroll/PayslipViewer.jsx` | High | Destructured `{ data: all }` before `all[0]` |
| 7 | `components/payroll/PayslipsManagement.jsx` | High | Destructured `{ data: all }` before `filterByBranch(all)` |
| 8 | `pages/MyPayslips.jsx` | High | Destructured employees + payslip_settings (2 sites) |
| 9 | `pages/AuditLogs.jsx` | High | Rebuilt queryFn to await one query and return `data` |
| 10 | `pages/AdminMessaging.jsx` | High | Destructured students + guardians (2 sites) |
| 11 | `pages/TicketDetails.jsx` | High | Destructured `{ data: tickets }` before `tickets[0]` |
| 12 | `pages/StaffInbox.jsx` | High | Destructured `{ data }` before `data.sort(...)` |
| 13 | `pages/GradeConfiguration.jsx` | High | Destructured `{ data }` before `data.sort(...)` |
| 14 | `pages/TuitionFeesConfiguration.jsx` | High | Destructured `{ data }` before `data.sort(...)` |
| 15 | `pages/ESSPortal.jsx` | Med | Destructured `{ data: settings }` before `settings[0]` |
| 16 | `pages/ESSSettings.jsx` | Med | Destructured `{ data: settings }` before `settings[0]` |
| 17 | `pages/NotificationPreferences.jsx` | Med | Destructured `{ data: prefs }` before `prefs.length` |
| 18 | `pages/NotificationSettings.jsx` | Med | Destructured `allSettings` in both fetch + save paths |
| 19 | `pages/PolicyEditor.jsx` | Med | Awaited query, returned `data` array |
| 20 | `pages/SystemSmokeTest.jsx` | Med | Destructured all 4 smoke-test queries (Array.isArray now true) |
| 21 | `pages/TrialUsers.jsx` | Med | Destructured queryFn return + lookup (2 sites) |
| 22 | `pages/AttendanceDevices.jsx` | Med | Destructured `existingAttendance` — duplicate guard now works |

## Additional sites found with the same bug class (not in the original triage)

A repo-wide sweep surfaced 13 more files with the identical defect; all fixed:

| Module | Impact |
|--------|--------|
| `components/parent/PaymentPortal.jsx` | **Parent portal** invoice list crashed (`.then(data => ...)` received `{ data, error }`) |
| `components/parent/ChildSelector.jsx` | Parent portal child list never populated / auto-select broken |
| `components/parent/AcademicRecords.jsx` | Parent portal attendance + grades (2 sites) |
| `components/parent/SecureMessaging.jsx` | Parent portal messages didn't load |
| `components/students/StudentFeesSection.jsx` | Grade list + fee-structure resolution (2 sites) |
| `components/students/StudentForm.jsx` | Grade dropdown |
| `components/subscription/AdminRequestsTab.jsx` | Request list + tenant lookups; approvals silently no-op'd (3 sites) |
| `components/superadmin/TenantDetailDialog.jsx` | Invite-user tenant stamping silently skipped |
| `components/superadmin/PlatformUsersTab.jsx` | Invite-user tenant stamping silently skipped |
| `components/platform/TenantFormDialog.jsx` | New-tenant admin invite stamping silently skipped |
| `components/recruitment/OnboardingEngine.jsx` | HR policy auto-assignment crashed |
| `components/UserNotRegisteredError.jsx` | Registration-status check crashed |
| `lib/integrationHandlers.js` | 7 sites — broke idempotency (duplicate students/pay-runs), invoice creation, and a non-iterable `for…of` (see note below) |

---

## Verification

| Check | Result |
|-------|--------|
| `npm run test` | **34 passed** (25 existing + 9 new regression) |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run build` | succeeds |

### Regression test

`frontend/src/__tests__/tenantQueryResponse.test.js` pins the root-cause
contract against the **real** `tenantQuery` / `fetchData` implementations:
`select()` always resolves to `{ data, error }`; destructuring / `fetchData`
yield a usable array; `.single()` yields a single record under `data`;
platform-owner and missing-tenant fallback paths both keep the `{ data, error }`
shape so array consumers never crash.

---

## Findings flagged for follow-up (out of P0 crash scope)

1. **`lib/integrationHandlers.js` is dead code.** It is never imported anywhere,
   and it imports `namedHandler` from `lib/integrationBus.js`, which does **not
   export** that symbol. So the cross-module event handlers are never registered
   — `fireEvent(...)` calls in `SchoolClinic.jsx` / `Leaves.jsx` currently run
   **zero** handlers. The `{ data, error }` fixes here are correct but inert
   until the module is wired up. Wiring it up would activate ~40 side-effect
   handlers at once (notifications, auto-invoices, journal entries, etc.) — a
   large behavior change that needs product sign-off, so it was intentionally
   left as additive-safe rather than enabled in this pass.
2. **Bundle size** — main chunk ~3.9 MB (≈1 MB gzip). Code-splitting recommended
   (already noted in the triage; non-crash).

These map to the non-crash items in the triage report and are not part of the
P0 crash fixes.
