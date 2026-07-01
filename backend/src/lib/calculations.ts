/**
 * Pure calculation helpers for VAT and GOSI.
 * Saudi Arabia specifics:
 *   - VAT: 15% (since Jul 2020)
 *   - GOSI Saudi: employee 9%, employer 11.75%; capped at 45,000 SAR
 *   - GOSI Expat:  employee 0%, employer 2% (Occupational Hazards only); no cap
 *
 * NOTE: Expatriates are NOT enrolled in the GOSI Annuities (pension) branch —
 * they are covered only under Occupational Hazards, which is 2% paid entirely
 * by the employer. Expat employees have no salary deduction.
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

const GOSI_EXPAT_EMPLOYEE_RATE = 0; // expats have no employee GOSI deduction
const GOSI_EXPAT_EMPLOYER_RATE = 0.02; // Occupational Hazards branch, employer only

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
    // No cap for expats
    cappedSalary = basicSalary;
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
