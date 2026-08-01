# ADR-005: Invoice Balance Clamp

## Status

**Accepted** — 26 July 2026.

## Context

`invoices.balance` is being converted from a manually-updated column to a PostgreSQL generated column. The expression under review is:

```sql
CASE
  WHEN total_amount < 0 THEN total_amount - COALESCE(paid_amount, 0)
  ELSE GREATEST(total_amount - COALESCE(paid_amount, 0), 0)
END
```

The second branch clamps regular invoices to a non-negative balance. Two use cases could produce a "negative" balance for a regular invoice:

1. **Overpayment** — a parent pays more than the invoice total (payment-system rounding, duplicate clicks, or consolidated sibling payments that apply excess to one invoice).
2. **Advance / consolidated sibling payment** — a lump sum is collected before specific invoices exist, then applied to later invoices, leaving a parent credit.

A negative balance on a regular invoice is conceptually a parent credit. It is not the same as a `credit_note` (a posted document with a negative `total_amount` and `document_type='invoice'`, `invoice_type='credit_note'`).

## Decision

**Keep the clamp for regular invoices.** `invoices.balance` will remain `GREATEST(total_amount - paid_amount, 0)` unless the invoice is a credit note (`total_amount < 0`).

## Why

1. **Public parent invoice link** (`backend/src/routes/external/invoices.ts`) returns `balance`. A negative value would display as an amount the school owes the parent, which is not how credits are intended to be surfaced and would be confusing in a payment portal.
2. **Payment form** (`frontend/src/components/fees/PaymentLogForm.jsx`) uses `invoice?.balance` as the default and maximum payment amount. A negative balance would make the default input negative and the max validator invalid, blocking the form.
3. **Collection messages** (`backend/src/services/collections/messenger.ts`) derive `amount_due` from `invoice.balance`. A negative amount would ask a parent to "pay" a negative value in an automated reminder.
4. **Aging and dashboard reports** (`backend/src/services/reports.ts:getAgingReport`, `getExpectedCollections`) already compute `total - paid` and skip `balance <= 0`, so negative `invoices.balance` would not add useful information there.
5. **The parent-credit concept is not modelled yet.** There is no `parent_credits` table, no credit-application ledger, and no UI for a parent to choose how a credit is applied. Until that feature is designed, exposing a negative balance only creates misleading UI and messages.

## Consequences

- Overpayments must continue to be represented by `paid_amount > total_amount` and `status = 'paid'` on the overpaid invoice, not by a negative `balance`.
- `collection_profiles.outstanding_balance` and the reports in `reports.ts` still compute `totalInvoiced - totalCollected` directly and can show a household-level negative outstanding balance. This is acceptable because those are internal views, not a per-invoice amount used as a payment default.
- The generated column makes it impossible for any payment path to forget to update `balance`; the only correctness question is the clamp.

## Revisit trigger

Revisit this ADR when a real parent-credit / advance-payment / consolidated-sibling-payment feature is planned. The trigger is the introduction of:

- a `parent_credits` or `guardian_credits` table,
- a UI that lets a parent view and apply credits, or
- consolidated payment splitting that intentionally allows one invoice to be overpaid and the excess to be tracked as credit.

At that point the clamp should be removed and the balance expression should become `total_amount - paid_amount` for all invoices, with credit notes remaining negative. The UI, collection messages, and payment form must all be updated to handle negative `invoices.balance` before the clamp is removed.

## Notes

- Credits are deliberately not modelled yet.
- For credit notes, `total_amount < 0`, the clamp is bypassed and `balance` is `total_amount - paid_amount`, which is negative until fully refunded/applied.
