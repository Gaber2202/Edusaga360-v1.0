import { describe, it, expect } from 'vitest';
import { applyInvoiceFilters, invoiceBreakdown, canPayInvoice, isFeeInvoice } from '../lib/invoiceFilters';

const FUTURE = '2999-01-01';
const PAST = '2020-01-01';

const invoices = [
  { id: '1', document_type: 'invoice', total_amount: 1000, paid_amount: 1000, due_date: PAST, status: 'paid' },
  { id: '2', document_type: 'invoice', total_amount: 4000, paid_amount: 1000, due_date: FUTURE },
  { id: '3', document_type: 'invoice', total_amount: 2000, paid_amount: 0, due_date: FUTURE },
  { id: '4', document_type: 'invoice', total_amount: 500, paid_amount: 0, due_date: PAST },
  { id: '5', document_type: 'receipt', total_amount: 1000, paid_amount: 1000, due_date: PAST, status: 'paid' },
];

describe('isFeeInvoice', () => {
  it('hides payment receipts from the fees list', () => {
    expect(isFeeInvoice({ document_type: 'receipt' })).toBe(false);
    expect(isFeeInvoice({ document_type: 'invoice' })).toBe(true);
    expect(isFeeInvoice({})).toBe(true);
  });
});

describe('applyInvoiceFilters', () => {
  it('drops receipts even when status is all', () => {
    expect(applyInvoiceFilters(invoices, { status: 'all' }).map((row) => row.id)).toEqual(['1', '2', '3', '4']);
  });

  it('filters by display status', () => {
    expect(applyInvoiceFilters(invoices, { status: 'overdue' }).map((row) => row.id)).toEqual(['4']);
    expect(applyInvoiceFilters(invoices, { status: 'partial' }).map((row) => row.id)).toEqual(['2']);
  });

  it('filters by due-date range', () => {
    expect(applyInvoiceFilters(invoices, { from: '2025-01-01', to: '2999-12-31' }).map((row) => row.id)).toEqual(['2', '3']);
  });
});

describe('invoiceBreakdown', () => {
  it('counts statuses and outstanding on the filtered set', () => {
    const bills = applyInvoiceFilters(invoices, { status: 'all' });
    expect(invoiceBreakdown(bills)).toEqual({
      unpaid: 1,
      partial: 1,
      paid: 1,
      overdue: 1,
      cancelled: 0,
      outstanding: 5500,
    });
  });
});

describe('canPayInvoice', () => {
  it('is true for unpaid, overdue, and partial balances', () => {
    expect(canPayInvoice(invoices[0])).toBe(false);
    expect(canPayInvoice(invoices[1])).toBe(true);
    expect(canPayInvoice(invoices[2])).toBe(true);
    expect(canPayInvoice(invoices[3])).toBe(true);
  });
});
