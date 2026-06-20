import { describe, it, expect } from 'vitest';
import { buildReport, buildInvoiceAging, buildFinancialStatement } from '../lib/reportBuilders';

describe('reportBuilders (Reports client-side generation)', () => {
  it('builds a student list with headers + rows', () => {
    const out = buildReport('student_list', { students: [{ student_id: 'S1', name_en: 'Ali', grade: 'G1', status: 'active', academic_year: '2026-2027' }] }, false);
    expect(out.headers[0]).toBe('Student ID');
    expect(out.rows).toEqual([['S1', 'Ali', 'G1', 'active', '2026-2027']]);
  });

  it('fee collection computes balance', () => {
    const out = buildReport('fee_collection', { invoices: [{ invoice_number: 'INV-1', student_name: 'Ali', total_amount: 1150, paid_amount: 400, status: 'partial' }] }, false);
    expect(out.rows[0]).toContain('INV-1');
    expect(out.rows[0]).toContain('750.00'); // balance
  });

  it('invoice aging excludes paid/cancelled and computes days overdue', () => {
    const now = new Date('2026-06-20T00:00:00Z');
    const out = buildInvoiceAging([
      { invoice_number: 'A', total_amount: 100, paid_amount: 0, due_date: '2026-06-10', status: 'issued' },
      { invoice_number: 'B', total_amount: 100, paid_amount: 100, due_date: '2026-06-01', status: 'paid' },
      { invoice_number: 'C', total_amount: 100, paid_amount: 0, due_date: '2026-06-15', status: 'cancelled' },
    ], false, now);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0][0]).toBe('A');
    expect(out.rows[0][4]).toBe(10); // days overdue
  });

  it('attendance summary aggregates per student', () => {
    const out = buildReport('attendance_summary', { attendances: [
      { student_id: 's1', student_name: 'Ali', status: 'present' },
      { student_id: 's1', student_name: 'Ali', status: 'absent' },
      { student_id: 's1', student_name: 'Ali', status: 'present' },
    ] }, false);
    expect(out.rows[0]).toEqual(['Ali', 2, 1, 0]);
  });

  it('financial statement nets revenue minus approved expenses', () => {
    const out = buildFinancialStatement(
      [{ subtotal: 1000, vat_amount: 150, total_amount: 1150, paid_amount: 1150, status: 'paid' }],
      [{ amount: 300, status: 'approved' }, { amount: 999, status: 'pending' }],
      false,
    );
    const net = out.rows.find((r) => r[0] === 'Net Income');
    expect(net[1]).toBe('700.00'); // 1000 - 300
  });

  it('unknown report returns empty', () => {
    expect(buildReport('nope', {}, false)).toEqual({ headers: [], rows: [] });
  });
});
