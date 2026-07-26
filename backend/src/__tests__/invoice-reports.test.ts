import { describe, it, expect } from 'vitest';
import { getAgingReport, getExpectedCollections } from '../services/reports.js';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

describe('getAgingReport', () => {
  it('buckets invoices into current and overdue ranges', async () => {
    const db = createSupabaseStub();
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'select') {
        const future = new Date();
        future.setDate(future.getDate() + 10);
        const past20 = new Date();
        past20.setDate(past20.getDate() - 20);
        return {
          data: [
            { id: 'i1', invoice_number: 'INV-1', due_date: future.toISOString().split('T')[0], total_amount: 100, paid_amount: 0, status: 'issued' },
            { id: 'i2', invoice_number: 'INV-2', due_date: past20.toISOString().split('T')[0], total_amount: 200, paid_amount: 0, status: 'overdue' },
          ],
        };
      }
      return { data: null };
    });

    const report = await getAgingReport(db.client as any, 'tenant-1');
    expect(report.buckets.current).toBe(100);
    expect(report.buckets['1_30']).toBe(200);
    expect(report.total_outstanding).toBe(300);
    expect(report.items.length).toBe(2);
  });
});

describe('getExpectedCollections', () => {
  it('sums unpaid invoices and installments in a date range', async () => {
    const db = createSupabaseStub();
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'invoices' && ctx.op === 'select') {
        return { data: [{ due_date: '2026-08-01', total_amount: 500, paid_amount: 0, status: 'issued' }] };
      }
      if (ctx.table === 'payment_plan_installments' && ctx.op === 'select') {
        return { data: [{ due_date: '2026-08-02', amount: 100, paid_amount: 0, status: 'pending' }] };
      }
      return { data: null };
    });

    const report = await getExpectedCollections(db.client as any, 'tenant-1', '2026-08-01', '2026-08-31');
    expect(report.total_expected).toBe(600);
    expect(report.by_date['2026-08-01']).toBe(500);
    expect(report.by_date['2026-08-02']).toBe(100);
  });
});
