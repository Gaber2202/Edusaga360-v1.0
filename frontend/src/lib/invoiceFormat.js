/**
 * Invoice rendering helpers — null-safe.
 *
 * Why this exists: invoice amounts come back from Supabase as numeric *strings*
 * ("23.00") and line items use ZATCA fields (total / unit_amount / subtotal),
 * NOT `amount`. Rendering `item.amount.toLocaleString()` therefore threw
 * (undefined.toLocaleString) and crashed the whole invoice page — so the user
 * "couldn't view or download invoices at all". These helpers guarantee a string
 * is always produced, whatever the shape of the data.
 */
import { format } from 'date-fns';

/** Format any numeric value (number, numeric string, null) as a decimal amount. */
export const money = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Resolve a line item's amount across the field names invoices use. */
export const itemAmount = (it) =>
  Number(it?.total ?? it?.unit_amount ?? it?.amount ?? it?.subtotal ?? 0);

/** Bilingual line-item description with graceful fallback. */
export const itemDesc = (it, isRTL) =>
  (isRTL
    ? (it?.description_ar || it?.description_en || it?.description)
    : (it?.description_en || it?.description_ar || it?.description)) || '';

/** Format a date, returning an em-dash for null/invalid instead of crashing. */
export const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : format(dt, 'dd/MM/yyyy');
};
