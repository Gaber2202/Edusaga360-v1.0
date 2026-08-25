import { describe, it, expect } from 'vitest';
import { calculateVAT, calculateGOSI } from '../lib/calculations.js';

// ── VAT tests ─────────────────────────────────────────────────────────────────

describe('calculateVAT', () => {
  it('calculates 15% VAT on a standard amount', () => {
    const result = calculateVAT(1000);
    expect(result.vatAmount).toBeCloseTo(150);
    expect(result.total).toBeCloseTo(1150);
    expect(result.rate).toBe(0.15);
  });

  it('VAT = amount × rate, total = amount + VAT', () => {
    const amount = 2500;
    const result = calculateVAT(amount);
    expect(result.vatAmount).toBeCloseTo(amount * 0.15);
    expect(result.total).toBeCloseTo(amount * 1.15);
  });

  it('invoice with discount: VAT applied to (amount - discount)', () => {
    const grossAmount = 1000;
    const discount = 200;
    const taxableAmount = grossAmount - discount;
    const result = calculateVAT(taxableAmount);
    expect(result.vatAmount).toBeCloseTo(120); // 800 * 0.15
    expect(result.total).toBeCloseTo(920);
  });

  it('zero amount: VAT = 0, no divide-by-zero', () => {
    const result = calculateVAT(0);
    expect(result.vatAmount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.rate).toBe(0.15);
  });

  it('supports a custom rate (e.g. 5% historical rate)', () => {
    const result = calculateVAT(1000, 0.05);
    expect(result.vatAmount).toBeCloseTo(50);
    expect(result.total).toBeCloseTo(1050);
    expect(result.rate).toBe(0.05);
  });

  it('returns the original amount unchanged', () => {
    const result = calculateVAT(3000);
    expect(result.amount).toBe(3000);
  });
});

// ── GOSI tests ────────────────────────────────────────────────────────────────

describe('calculateGOSI — Saudi national', () => {
  it('basic 10,000 SAR: employee 900, employer 1,175', () => {
    const result = calculateGOSI(10_000, 'saudi');
    expect(result.employeeContribution).toBeCloseTo(900);   // 10000 * 9%
    expect(result.employerContribution).toBeCloseTo(1175);  // 10000 * 11.75%
  });

  it('cappedSalary equals basicSalary when under 45k cap', () => {
    const result = calculateGOSI(20_000, 'saudi');
    expect(result.cappedSalary).toBe(20_000);
  });

  it('applies 45,000 SAR cap: basic 50,000 → calculated on 45,000', () => {
    const result = calculateGOSI(50_000, 'saudi');
    expect(result.cappedSalary).toBe(45_000);
    expect(result.employeeContribution).toBeCloseTo(45_000 * 0.09);
    expect(result.employerContribution).toBeCloseTo(45_000 * 0.1175);
  });

  it('basic exactly at cap (45,000) uses full amount', () => {
    const result = calculateGOSI(45_000, 'saudi');
    expect(result.cappedSalary).toBe(45_000);
  });

  it('totalContribution = employee + employer', () => {
    const result = calculateGOSI(10_000, 'saudi');
    expect(result.totalContribution).toBeCloseTo(
      result.employeeContribution + result.employerContribution,
    );
  });
});

describe('calculateGOSI — expat', () => {
  it('basic 10,000 SAR: employee 150 (1.5%), employer 200 (2%) — aligned with SA pack', () => {
    const result = calculateGOSI(10_000, 'expat');
    expect(result.employeeContribution).toBeCloseTo(150);
    expect(result.employerContribution).toBeCloseTo(200);
  });

  it('applies 45k wage cap like SA pack', () => {
    const result = calculateGOSI(50_000, 'expat');
    expect(result.cappedSalary).toBe(45_000);
    expect(result.employeeContribution).toBeCloseTo(45_000 * 0.015);
    expect(result.employerContribution).toBeCloseTo(45_000 * 0.02);
  });

  it('totalContribution = employee + employer', () => {
    const result = calculateGOSI(10_000, 'expat');
    expect(result.totalContribution).toBeCloseTo(
      result.employeeContribution + result.employerContribution,
    );
  });

  it('records the original basicSalary', () => {
    const result = calculateGOSI(80_000, 'expat');
    expect(result.basicSalary).toBe(80_000);
    expect(result.cappedSalary).toBe(45_000);
  });
});
