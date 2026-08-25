/**
 * SCRUM-122 EOS gratuity — resignation + 15 unpaid leave days across SA/AE/QA.
 */
import { describe, it, expect } from 'vitest';
import { adjustServiceYearsForUnpaidLeave } from '../lib/payroll.js';
import { saPayroll } from '../packs/sa/payroll.js';
import { aePayroll } from '../packs/ae/payroll.js';
import { qaPayroll } from '../packs/qa/payroll.js';

describe('SCRUM-122 unpaid leave tenure adjustment', () => {
  it('subtracts 15 unpaid days from years of service', () => {
    const adjusted = adjustServiceYearsForUnpaidLeave(5, 15);
    expect(adjusted).toBeCloseTo(5 - 15 / 365, 5);
  });
});

describe('SCRUM-122 EOS resignation + 15 unpaid leave', () => {
  it('SA: resignation with Art.85 factor and unpaid leave', () => {
    const full = saPayroll.calculateEndOfServiceBenefit!(10000, 6, 'egyptian', {
      exitType: 'resignation',
      unpaidLeaveDays: 0,
    });
    const withLeave = saPayroll.calculateEndOfServiceBenefit!(10000, 6, 'egyptian', {
      exitType: 'resignation',
      unpaidLeaveDays: 15,
    });
    expect(withLeave.amount).toBeLessThan(full.amount);
    expect(withLeave.unpaid_leave_days).toBe(15);
    expect(withLeave.exit_type).toBe('resignation');
    // 6 years resignation → 2/3 factor; under 2 years → 0
    const short = saPayroll.calculateEndOfServiceBenefit!(10000, 1.5, 'egyptian', {
      exitType: 'resignation',
      unpaidLeaveDays: 0,
    });
    expect(short.amount).toBe(0);
  });

  it('AE: unpaid leave reduces amount; Emirati exempt', () => {
    const base = aePayroll.calculateEndOfServiceBenefit!(12000, 3, 'indian', {
      exitType: 'resignation',
      unpaidLeaveDays: 0,
    });
    const leave = aePayroll.calculateEndOfServiceBenefit!(12000, 3, 'indian', {
      exitType: 'resignation',
      unpaidLeaveDays: 15,
    });
    expect(leave.amount).toBeLessThan(base.amount);
    expect(base.amount).toBeGreaterThan(0);
    const local = aePayroll.calculateEndOfServiceBenefit!(12000, 5, 'emirati', {
      exitType: 'resignation',
      unpaidLeaveDays: 15,
    });
    expect(local.amount).toBe(0);
  });

  it('QA: resignation with 15 unpaid leave days', () => {
    const result = qaPayroll.calculateEndOfServiceBenefit!(8000, 4, 'filipino', {
      exitType: 'resignation',
      unpaidLeaveDays: 15,
    });
    expect(result.amount).toBeGreaterThan(0);
    expect(result.unpaid_leave_days).toBe(15);
  });
});
