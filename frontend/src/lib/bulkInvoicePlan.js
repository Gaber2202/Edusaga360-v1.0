/**
 * Pure planner for bulk invoice generation (P1.2).
 *
 * Given the candidate students, their contracts, the set of students already
 * excluded by the operator, and the set already invoiced for the academic year,
 * this decides — per student — whether an invoice will be created and what it
 * will total. Both the pre-generation preview and the actual generation run use
 * this single function so the preview count/total always matches what is
 * created, and re-running stays idempotent (already-invoiced students are
 * skipped instead of silently duplicated).
 */

export const VAT_RATE = 0.15;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * @param {object} args
 * @param {Array} args.students            Candidate students (post filter).
 * @param {Array} args.contracts           Student contracts (any status).
 * @param {Array<string>} args.excludedIds Student ids the operator excluded.
 * @param {Array<string>} args.alreadyInvoicedIds Student ids that already have a
 *        non-cancelled invoice for the selected academic year.
 * @returns {{
 *   rows: Array<{student:object, contract:(object|undefined), subtotal:number,
 *     discount:number, vat:number, total:number,
 *     status:('eligible'|'excluded'|'already_invoiced'|'no_contract')}>,
 *   eligible:number, excluded:number, alreadyInvoiced:number,
 *   skippedNoContract:number, estimatedSubtotal:number, estimatedVat:number,
 *   estimatedDiscount:number, estimatedTotal:number
 * }}
 */
export function planBulkInvoices({
  students = [],
  contracts = [],
  excludedIds = [],
  alreadyInvoicedIds = [],
} = {}) {
  const excluded = new Set(excludedIds);
  const invoiced = new Set(alreadyInvoicedIds);

  const activeContractFor = (studentId) =>
    contracts.find((c) => c.student_id === studentId && c.status === 'active');

  const rows = students.map((student) => {
    const contract = activeContractFor(student.id);
    const subtotal = round2(contract?.total_fees);
    const discount = round2(contract?.discount_amount);
    const vat = round2(subtotal * VAT_RATE);
    const total = round2(subtotal + vat - discount);

    // Order matters: an explicit exclusion wins, then idempotency, then the
    // missing-contract guard (a student with no active contract can't be billed).
    let status;
    if (excluded.has(student.id)) status = 'excluded';
    else if (invoiced.has(student.id)) status = 'already_invoiced';
    else if (!contract) status = 'no_contract';
    else status = 'eligible';

    return { student, contract, subtotal, discount, vat, total, status };
  });

  const eligibleRows = rows.filter((r) => r.status === 'eligible');
  const sum = (key) => round2(eligibleRows.reduce((s, r) => s + r[key], 0));

  return {
    rows,
    eligible: eligibleRows.length,
    excluded: rows.filter((r) => r.status === 'excluded').length,
    alreadyInvoiced: rows.filter((r) => r.status === 'already_invoiced').length,
    skippedNoContract: rows.filter((r) => r.status === 'no_contract').length,
    estimatedSubtotal: sum('subtotal'),
    estimatedVat: sum('vat'),
    estimatedDiscount: sum('discount'),
    estimatedTotal: sum('total'),
  };
}

export default planBulkInvoices;
