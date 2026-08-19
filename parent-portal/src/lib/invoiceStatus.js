/**
 * Parent-facing invoice payment-status helpers (P1.4).
 *
 * Derives the outstanding balance and a normalised display status from an
 * invoice row so the parent portal shows the same payment state the school
 * sees. Pure functions — unit-tested.
 */

export function invoiceBalance(invoice) {
  const total = Number(invoice?.total_amount) || 0;
  const paid = Number(invoice?.paid_amount) || 0;
  return Math.round((total - paid) * 100) / 100;
}

/**
 * Normalised status for display. Honours an explicit 'cancelled' status and an
 * 'overdue' due date, otherwise derives paid / partial / unpaid from amounts.
 */
export function displayStatus(invoice, today = new Date()) {
  if (!invoice) return 'unpaid';
  if (invoice.status === 'cancelled') return 'cancelled';

  const total = Number(invoice.total_amount) || 0;
  const balance = invoiceBalance(invoice);

  if (total > 0 && balance <= 0.01) return 'paid';

  const due = invoice.due_date ? new Date(invoice.due_date) : null;
  if (balance > 0.01 && due && due < today) return 'overdue';

  if ((Number(invoice.paid_amount) || 0) > 0.01) return 'partial';
  return 'unpaid';
}

export const STATUS_LABELS = {
  paid: { en: 'Paid', ar: 'مدفوعة' },
  partial: { en: 'Partially Paid', ar: 'مدفوعة جزئياً' },
  unpaid: { en: 'Unpaid', ar: 'غير مدفوعة' },
  overdue: { en: 'Overdue', ar: 'متأخرة' },
  cancelled: { en: 'Cancelled', ar: 'ملغاة' },
};

export const STATUS_TONES = {
  paid: 'success',
  partial: 'warn',
  unpaid: 'muted',
  overdue: 'danger',
  cancelled: 'muted',
};

export const STATUS_STYLES = {
  paid: 'bg-forest-100 text-forest-700',
  partial: 'bg-[#F8EEDF] text-[#D08A24]',
  unpaid: 'bg-sand-alt text-muted-foreground',
  overdue: 'bg-[#F8E8E6] text-[#A8443A]',
  cancelled: 'bg-sand-alt text-muted-foreground',
};
