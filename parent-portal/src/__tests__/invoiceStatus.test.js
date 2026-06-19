import { describe, it, expect } from 'vitest';
import { invoiceBalance, displayStatus } from '../lib/invoiceStatus';

const PAST = '2020-01-01';
const FUTURE = '2999-01-01';

describe('invoiceBalance', () => {
  it('is total minus paid', () => {
    expect(invoiceBalance({ total_amount: 1000, paid_amount: 300 })).toBe(700);
  });
  it('handles missing fields as 0', () => {
    expect(invoiceBalance({})).toBe(0);
    expect(invoiceBalance(null)).toBe(0);
  });
});

describe('displayStatus (P1.4 — parent-facing payment status)', () => {
  it('returns paid when fully settled', () => {
    expect(displayStatus({ total_amount: 1000, paid_amount: 1000 })).toBe('paid');
  });
  it('returns partial when some paid and not past due', () => {
    expect(displayStatus({ total_amount: 1000, paid_amount: 400, due_date: FUTURE })).toBe('partial');
  });
  it('returns unpaid when nothing paid and not past due', () => {
    expect(displayStatus({ total_amount: 1000, paid_amount: 0, due_date: FUTURE })).toBe('unpaid');
  });
  it('returns overdue when a balance remains past the due date', () => {
    expect(displayStatus({ total_amount: 1000, paid_amount: 0, due_date: PAST })).toBe('overdue');
    expect(displayStatus({ total_amount: 1000, paid_amount: 400, due_date: PAST })).toBe('overdue');
  });
  it('honours an explicit cancelled status', () => {
    expect(displayStatus({ status: 'cancelled', total_amount: 1000, paid_amount: 0 })).toBe('cancelled');
  });
  it('a fully paid invoice is never overdue even if past due', () => {
    expect(displayStatus({ total_amount: 1000, paid_amount: 1000, due_date: PAST })).toBe('paid');
  });
});
