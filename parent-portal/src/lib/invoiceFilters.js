import { displayStatus, invoiceBalance } from './invoiceStatus';

export function isFeeInvoice(invoice) {
  const type = invoice?.document_type;
  return type == null || type === 'invoice';
}

export function invoiceDate(invoice) {
  return invoice?.due_date || invoice?.issue_date || invoice?.date
    ? String(invoice.due_date || invoice.issue_date || invoice.date).slice(0, 10)
    : '';
}

export function applyInvoiceFilters(invoices, { status = 'all', from = '', to = '' } = {}) {
  return (invoices || []).filter((invoice) => {
    if (!isFeeInvoice(invoice)) return false;
    const display = displayStatus(invoice);
    if (status && status !== 'all' && display !== status) return false;
    const date = invoiceDate(invoice);
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    return true;
  });
}

export function invoiceBreakdown(invoices) {
  const counts = { unpaid: 0, partial: 0, paid: 0, overdue: 0, cancelled: 0 };
  let outstanding = 0;
  for (const invoice of invoices || []) {
    const status = displayStatus(invoice);
    if (counts[status] != null) counts[status] += 1;
    if (status !== 'paid' && status !== 'cancelled') outstanding += invoiceBalance(invoice);
  }
  return { ...counts, outstanding: Math.round(outstanding * 100) / 100 };
}

export function canPayInvoice(invoice) {
  const status = displayStatus(invoice);
  return status === 'unpaid' || status === 'overdue' || status === 'partial';
}
