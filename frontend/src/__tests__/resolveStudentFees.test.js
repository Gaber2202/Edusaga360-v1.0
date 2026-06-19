import { describe, it, expect } from 'vitest';
import { resolveStudentFees } from '../lib/resolveStudentFees';

const FEES = [
  { grade: 'Grade1', academic_year: '2026-2027', amount: 1000, fee_type_id: 'tuition', description_ar: 'رسوم', description_en: 'Tuition' },
  { grade: 'Grade1', academic_year: '2025-2026', amount: 900, fee_type_id: 'tuition', description_ar: 'رسوم', description_en: 'Tuition' },
  { grade: 'all', academic_year: '2026-2027', amount: 50, fee_type_id: 'activity', description_ar: 'نشاط', description_en: 'Activity' },
  { grade: 'Grade2', academic_year: '2026-2027', amount: 1, fee_type_id: 'tuition', description_ar: 'رسوم', description_en: 'Tuition' },
  { grade: 'Grade1', academic_year: '', amount: 25, fee_type_id: 'global', description_ar: 'عام', description_en: 'Global' },
];

const student = { id: 's1', grade: 'Grade1' };

describe('resolveStudentFees — P1.3 fee automation', () => {
  it('matches the student grade AND the selected academic year', () => {
    const items = resolveStudentFees({ feeStructures: FEES, student, academicYear: '2026-2027' });
    const amounts = items.map((i) => i.amount).sort((a, b) => a - b);
    // Grade1/2026 (1000), all/2026 (50), Grade1/<no year> (25); NOT Grade1/2025, NOT Grade2.
    expect(amounts).toEqual([25, 50, 1000]);
  });

  it('changes the resolved fees when the academic year changes', () => {
    const items = resolveStudentFees({ feeStructures: FEES, student, academicYear: '2025-2026' });
    const amounts = items.map((i) => i.amount).sort((a, b) => a - b);
    // Grade1/2025 (900) + Grade1/<no year> (25). Different from the 2026 result.
    expect(amounts).toEqual([25, 900]);
  });

  it('excludes other grades', () => {
    const items = resolveStudentFees({ feeStructures: FEES, student, academicYear: '2026-2027' });
    expect(items.every((i) => i.amount !== 1)).toBe(true); // the Grade2 fee
  });

  it('includes year-agnostic fees (blank academic_year) for any year', () => {
    const items2026 = resolveStudentFees({ feeStructures: FEES, student, academicYear: '2026-2027' });
    const items2025 = resolveStudentFees({ feeStructures: FEES, student, academicYear: '2025-2026' });
    expect(items2026.some((i) => i.fee_type_id === 'global')).toBe(true);
    expect(items2025.some((i) => i.fee_type_id === 'global')).toBe(true);
  });

  it('maps fee structures to invoice line items with description + fee type', () => {
    const items = resolveStudentFees({ feeStructures: FEES, student, academicYear: '2026-2027' });
    const tuition = items.find((i) => i.fee_type_id === 'tuition');
    expect(tuition).toMatchObject({ amount: 1000, description_ar: 'رسوم', fee_type_id: 'tuition' });
  });

  it('returns [] when no student is selected', () => {
    expect(resolveStudentFees({ feeStructures: FEES, student: null, academicYear: '2026-2027' })).toEqual([]);
  });

  it('falls back to all matching grade fees when no academic year is given', () => {
    const items = resolveStudentFees({ feeStructures: FEES, student }); // no academicYear
    // All Grade1 + all-grade rows regardless of year.
    const amounts = items.map((i) => i.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([25, 50, 900, 1000]);
  });
});
