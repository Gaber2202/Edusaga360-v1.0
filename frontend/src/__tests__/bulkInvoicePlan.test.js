import { describe, it, expect } from 'vitest';
import { planBulkInvoices, VAT_RATE } from '../lib/bulkInvoicePlan';

const student = (id, extra = {}) => ({ id, name_en: `S${id}`, grade: 'Grade1', ...extra });
const contract = (studentId, total_fees, extra = {}) => ({
  student_id: studentId,
  status: 'active',
  total_fees,
  ...extra,
});

describe('planBulkInvoices — P1.2 preview/generation parity', () => {
  it('marks a student with an active contract as eligible and computes 15% VAT', () => {
    const plan = planBulkInvoices({
      students: [student('a')],
      contracts: [contract('a', 1000)],
    });
    expect(plan.eligible).toBe(1);
    const row = plan.rows[0];
    expect(row.status).toBe('eligible');
    expect(row.subtotal).toBe(1000);
    expect(row.vat).toBe(round(1000 * VAT_RATE));
    expect(row.total).toBe(1150);
    expect(plan.estimatedTotal).toBe(1150);
    expect(plan.estimatedVat).toBe(150);
  });

  it('subtracts the contract discount from the gross total', () => {
    const plan = planBulkInvoices({
      students: [student('a')],
      contracts: [contract('a', 1000, { discount_amount: 200 })],
    });
    // 1000 + 150 VAT - 200 discount
    expect(plan.rows[0].total).toBe(950);
    expect(plan.estimatedDiscount).toBe(200);
    expect(plan.estimatedTotal).toBe(950);
  });

  it('is idempotent — students already invoiced for the year are skipped, not duplicated', () => {
    const plan = planBulkInvoices({
      students: [student('a'), student('b')],
      contracts: [contract('a', 1000), contract('b', 1000)],
      alreadyInvoicedIds: ['a'],
    });
    expect(plan.alreadyInvoiced).toBe(1);
    expect(plan.eligible).toBe(1);
    expect(plan.rows.find((r) => r.student.id === 'a').status).toBe('already_invoiced');
    // Only the not-yet-invoiced student contributes to the run total.
    expect(plan.estimatedTotal).toBe(1150);
  });

  it('honours operator exclusions (exclusion wins over eligibility)', () => {
    const plan = planBulkInvoices({
      students: [student('a'), student('b')],
      contracts: [contract('a', 1000), contract('b', 1000)],
      excludedIds: ['b'],
    });
    expect(plan.excluded).toBe(1);
    expect(plan.eligible).toBe(1);
    expect(plan.rows.find((r) => r.student.id === 'b').status).toBe('excluded');
    expect(plan.estimatedTotal).toBe(1150);
  });

  it('skips students with no active contract (cannot be billed)', () => {
    const plan = planBulkInvoices({
      students: [student('a'), student('b')],
      contracts: [contract('a', 1000), { student_id: 'b', status: 'draft', total_fees: 999 }],
    });
    expect(plan.skippedNoContract).toBe(1);
    expect(plan.eligible).toBe(1);
    expect(plan.rows.find((r) => r.student.id === 'b').status).toBe('no_contract');
  });

  it('classifies a mixed cohort and the counts reconcile with the input size', () => {
    const students = [student('a'), student('b'), student('c'), student('d')];
    const contracts = [contract('a', 1000), contract('b', 500), contract('c', 700)];
    const plan = planBulkInvoices({
      students,
      contracts,
      excludedIds: ['b'],
      alreadyInvoicedIds: ['c'],
    });
    expect(plan.eligible).toBe(1); // a
    expect(plan.excluded).toBe(1); // b
    expect(plan.alreadyInvoiced).toBe(1); // c
    expect(plan.skippedNoContract).toBe(1); // d
    expect(
      plan.eligible + plan.excluded + plan.alreadyInvoiced + plan.skippedNoContract
    ).toBe(students.length);
    expect(plan.estimatedTotal).toBe(1150); // only 'a'
  });

  it('returns a zero/empty plan for no students', () => {
    const plan = planBulkInvoices({ students: [], contracts: [] });
    expect(plan.eligible).toBe(0);
    expect(plan.estimatedTotal).toBe(0);
    expect(plan.rows).toEqual([]);
  });
});

function round(n) {
  return Math.round(n * 100) / 100;
}
