/**
 * Resolve the invoice line items that apply to a student for a given academic
 * year (P1.3 — fee automation on invoice creation).
 *
 * Fees are matched on the student's grade (or an 'all'-grade structure) AND the
 * selected academic year. A fee structure with no academic_year set is treated
 * as year-agnostic, so legacy/global fee rows still apply and we never silently
 * drop a fee just because the year column is blank.
 *
 * Pure function so it can be unit-tested and shared by the student- and
 * academic-year change handlers (they must resolve to the same lines).
 */
export function resolveStudentFees({ feeStructures = [], student, academicYear } = {}) {
  if (!student) return [];
  const grade = student.grade;

  return feeStructures
    .filter((f) => {
      const gradeOk = f.grade === grade || f.grade === 'all';
      const yearOk =
        !academicYear || !f.academic_year || f.academic_year === 'all' || f.academic_year === academicYear;
      return gradeOk && yearOk;
    })
    .map((fee) => ({
      description: fee.description_ar || fee.description_en || '',
      description_ar: fee.description_ar || '',
      amount: fee.amount,
      fee_type_id: fee.fee_type_id,
      fee_type_name_ar: fee.fee_type_name_ar,
      fee_type_name_en: fee.fee_type_name_en,
    }));
}

export default resolveStudentFees;
