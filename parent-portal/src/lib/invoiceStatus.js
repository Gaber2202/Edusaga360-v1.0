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

export const STATUS_STYLES = {
  paid: 'bg-green-50 text-green-700 border-green-200',
  partial: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  unpaid: 'bg-slate-50 text-slate-600 border-slate-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
};
