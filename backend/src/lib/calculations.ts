/**
 * Pure calculation helpers for VAT and GOSI.
 * Saudi Arabia specifics:
 *   - VAT: 15% (since Jul 2020)
 *   - GOSI Saudi: employee 9%, employer 11.75%; capped at 45,000 SAR
 *   - GOSI Expat:  employee 1.5%, employer 2% (aligned with packs/sa/payroll.ts + golden snapshots)
 *
 * NOTE: Prefer packs/sa/payroll.ts for production GOSI. This helper stays for
 * legacy unit tests; rates must stay in sync with the SA pack.
 *
 * These statutory rates are subject to change by royal decree (e.g. the 2024
 * reform introduced phased increases for new entrants). They are hardcoded here
 * for now; a future pass should move them to an effective-dated rates table.
 */

export interface VATResult {
  amount: number;
  vatAmount: number;
  total: number;
  rate: number;
}

export function calculateVAT(amount: number, rate = 0.15): VATResult {
  const vatAmount = amount * rate;
  return {
    amount,
    vatAmount,
    total: amount + vatAmount,
    rate,
  };
}

export interface GOSIResult {
  basicSalary: number;
  cappedSalary: number;
  employeeContribution: number;
  employerContribution: number;
  totalContribution: number;
}

const GOSI_SAUDI_CAP = 45_000;
const GOSI_SAUDI_EMPLOYEE_RATE = 0.09;
const GOSI_SAUDI_EMPLOYER_RATE = 0.1175;

const GOSI_EXPAT_EMPLOYEE_RATE = 0.015; // aligned with packs/sa/payroll.ts
const GOSI_EXPAT_EMPLOYER_RATE = 0.02;

export function calculateGOSI(
  basicSalary: number,
  nationality: 'saudi' | 'expat',
): GOSIResult {
  let cappedSalary: number;
  let employeeRate: number;
  let employerRate: number;

  if (nationality === 'saudi') {
    cappedSalary = Math.min(basicSalary, GOSI_SAUDI_CAP);
    employeeRate = GOSI_SAUDI_EMPLOYEE_RATE;
    employerRate = GOSI_SAUDI_EMPLOYER_RATE;
  } else {
    // Same wage base cap as packs/sa/payroll.ts (GOSI_CAP_MONTHLY)
    cappedSalary = Math.min(basicSalary, GOSI_SAUDI_CAP);
    employeeRate = GOSI_EXPAT_EMPLOYEE_RATE;
    employerRate = GOSI_EXPAT_EMPLOYER_RATE;
  }

  const employeeContribution = cappedSalary * employeeRate;
  const employerContribution = cappedSalary * employerRate;

  return {
    basicSalary,
    cappedSalary,
    employeeContribution,
    employerContribution,
    totalContribution: employeeContribution + employerContribution,
  };
}
