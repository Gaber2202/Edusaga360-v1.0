/**
 * src/packs/sa/payroll.ts
 *
 * Saudi payroll adapter: GOSI rates, nationality checks, and WPS/Mudad
 * bank-file generation. The full-period payroll run remains a TODO pending the
 * Task 8b / ADR-006 migration.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NotImplementedInJurisdiction } from '../../lib/jurisdiction.js';
import type { PayrollService, GosiResult } from '../contract/CountryPack.js';

// ─── GOSI Rates (Saudi Labour Law / GOSI regulations) ─────────────────────

export const GOSI_CAP_MONTHLY = 45_000;

const GOSI_SAUDI = {
  employee: 0.09,
  employer: 0.1175,
} as const;

const GOSI_EXPAT = {
  employee: 0.015,
  employer: 0.02,
} as const;

export function isSaudi(nationality: string | null | undefined): boolean {
  if (!nationality) return false;
  const n = nationality.toLowerCase().trim();
  return n === 'saudi' || n === 'saudi arabia' || n === 'sa' || n === 'سعودي';
}

export function calculateGosiForEmployee(
  basic_salary: number,
  nationality: string | null | undefined,
): {
  gosi_wage: number;
  gosi_employee: number;
  gosi_employer: number;
  is_saudi: boolean;
  rates: { employee: number; employer: number };
} {
  const gosiWage = Math.min(basic_salary, GOSI_CAP_MONTHLY);
  const saudi = isSaudi(nationality);
  const rates = saudi ? GOSI_SAUDI : GOSI_EXPAT;

  return {
    gosi_wage: gosiWage,
    gosi_employee: Math.round(gosiWage * rates.employee * 100) / 100,
    gosi_employer: Math.round(gosiWage * rates.employer * 100) / 100,
    is_saudi: saudi,
    rates,
  };
}

interface WpsRow {
  employee_id: string;
  employee_number: string;
  bank_iban: string;
  bank_name: string;
  net_salary: number;
}

/**
 * Generate a WPS/Mudad bank file for the given period.
 * Format per line: EmployerID|EmployeeID|BankCode|IBAN|Amount|Currency
 */
export async function generateWpsFile(
  supabase: SupabaseClient,
  tenantId: string,
  period: { start: string; end: string },
): Promise<{ filename: string; content: string }> {
  const { start: period_start, end: period_end } = period;

  // Fetch tenant info (employer ID / slug)
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug, name_en')
    .eq('id', tenantId)
    .single();

  if (tenantError || !tenant) throw tenantError ?? new Error('Tenant not found');

  // The employer ID used in WPS is the tenant slug or first 10 chars of tenant UUID
  const employerId = (tenant.slug ?? tenantId.replace(/-/g, '').slice(0, 10)).toUpperCase();

  // Try to find finalized payslips for the period first
  const { data: rawPayslips, error: payslipError } = await supabase
    .from('payslip_lines')
    .select(
      'employee_id, net_salary, ' +
      'employees(employee_number, bank_name, bank_iban, nationality, basic_salary)',
    )
    .eq('tenant_id', tenantId)
    .gte('created_at', period_start)
    .lte('created_at', period_end + 'T23:59:59Z');

  let wpsRows: WpsRow[] = [];

  const payslips = (rawPayslips ?? []) as any[];
  if (!payslipError && payslips.length > 0) {
    wpsRows = payslips.map((p) => {
      const emp = p.employees as {
        employee_number: string;
        bank_name: string;
        bank_iban: string;
        nationality: string;
        basic_salary: number;
      } | null;
      return {
        employee_id: p.employee_id,
        employee_number: emp?.employee_number ?? p.employee_id.slice(0, 8),
        bank_iban: emp?.bank_iban ?? '',
        bank_name: emp?.bank_name ?? '',
        net_salary: Number(p.net_salary ?? 0),
      };
    });
  } else {
    // Live calculation from employees table
    const { data: rawEmp2, error: empError } = await supabase
      .from('employees')
      .select(
        'id, employee_number, nationality, basic_salary, ' +
        'housing_allowance, transport_allowance, other_allowances, ' +
        'bank_name, bank_iban',
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    if (empError) throw empError;
    const employees = (rawEmp2 ?? []) as any[];

    wpsRows = (employees ?? []).map((emp) => {
      const basicSalary = Number(emp.basic_salary ?? 0);
      const grossSalary =
        basicSalary +
        Number(emp.housing_allowance ?? 0) +
        Number(emp.transport_allowance ?? 0) +
        Object.values(emp.other_allowances ?? {}).reduce(
          (s: number, v) => s + Number(v ?? 0),
          0,
        );

      const gosi = calculateGosiForEmployee(basicSalary, emp.nationality);
      const netSalary = Math.round((grossSalary - gosi.gosi_employee) * 100) / 100;

      return {
        employee_id: emp.id,
        employee_number: emp.employee_number ?? emp.id.slice(0, 8),
        bank_iban: emp.bank_iban ?? '',
        bank_name: emp.bank_name ?? '',
        net_salary: netSalary,
      };
    });
  }

  if (wpsRows.length === 0) {
    throw Object.assign(new Error('No employee data found for the specified period'), { status: 404 });
  }

  // Build WPS file content
  // Format: EmployerID|EmployeeID|BankCode|IBAN|Amount|Currency
  const lines = wpsRows.map((row) => {
    // Derive a short bank code from bank name (first 4 chars, padded)
    const bankCode = (row.bank_name ?? '')
      .replace(/\s+/g, '')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(4, 'X');

    const iban = (row.bank_iban ?? '').replace(/\s+/g, '').toUpperCase();
    const amount = row.net_salary.toFixed(2);

    return [employerId, row.employee_number, bankCode, iban, amount, 'SAR'].join('|');
  });

  const safeSlug = (tenant.slug ?? tenantId.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `WPS_${safeSlug}_${period_start}_${period_end}.txt`;

  return { filename, content: lines.join('\n') };
}

export const saPayroll: PayrollService = {
  calculateGosi: (basicSalary: number, nationality: string): GosiResult => {
    const r = calculateGosiForEmployee(basicSalary, nationality);
    return {
      employee: r.gosi_employee,
      employer: r.gosi_employer,
      total: Math.round((r.gosi_employee + r.gosi_employer) * 100) / 100,
      rates: r.rates,
    };
  },

  calculatePayroll: async () => {
    throw new NotImplementedInJurisdiction('SA', 'PayrollService.calculatePayroll — see ADR-006 / Task 8b');
  },

  generateWpsFile,
};
