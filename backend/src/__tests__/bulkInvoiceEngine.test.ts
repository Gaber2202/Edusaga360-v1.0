/**
 * Unit tests for SCRUM-128 bulk invoice engine helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  assignSiblingRanks,
  dayCountInclusive,
  enterpriseSiblingDiscountAmount,
  prorateMidTermFee,
  siblingDiscountPercent,
} from '../services/bulkInvoiceEngine.js';

describe('bulkInvoiceEngine — proration', () => {
  it('charges full fee when enrollment is on/before term start', () => {
    expect(prorateMidTermFee(10000, '2026-09-01', '2027-06-30', '2026-08-15')).toEqual({
      amount: 10000,
      factor: 1,
      prorated: false,
    });
    expect(prorateMidTermFee(10000, '2026-09-01', '2027-06-30', null).prorated).toBe(false);
  });

  it('prorates mid-term join as remainingDays/totalDays × fee', () => {
    const total = dayCountInclusive('2026-09-01', '2027-06-30');
    const remaining = dayCountInclusive('2027-01-01', '2027-06-30');
    const result = prorateMidTermFee(10000, '2026-09-01', '2027-06-30', '2027-01-01');
    expect(result.prorated).toBe(true);
    expect(result.factor).toBeCloseTo(remaining / total, 6);
    expect(result.amount).toBe(Math.round(10000 * (remaining / total) * 100) / 100);
  });

  it('returns zero when join is after term end', () => {
    expect(prorateMidTermFee(10000, '2026-09-01', '2027-06-30', '2027-07-01').amount).toBe(0);
  });
});

describe('bulkInvoiceEngine — sibling discounts', () => {
  it('applies 0% / 5% / 10% by rank', () => {
    expect(siblingDiscountPercent(1)).toBe(0);
    expect(siblingDiscountPercent(2)).toBe(5);
    expect(siblingDiscountPercent(3)).toBe(10);
    expect(siblingDiscountPercent(4)).toBe(10);
    expect(enterpriseSiblingDiscountAmount(1000, 2)).toBe(50);
    expect(enterpriseSiblingDiscountAmount(1000, 3)).toBe(100);
  });

  it('ranks siblings by enrollment_date within a guardian family', () => {
    const ranks = assignSiblingRanks([
      { id: 'c', guardian_id: 'g1', enrollment_date: '2026-10-01' },
      { id: 'a', guardian_id: 'g1', enrollment_date: '2026-09-01' },
      { id: 'b', guardian_id: 'g1', enrollment_date: '2026-09-15' },
      { id: 'solo', guardian_id: null, enrollment_date: '2026-09-01' },
    ]);
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(2);
    expect(ranks.get('c')).toBe(3);
    expect(ranks.get('solo')).toBe(1);
  });
});
