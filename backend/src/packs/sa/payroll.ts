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
import { isSaudi } from './nationality.js';

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

export function calculateGosiForEmployee(
  basic_salary: number,
  nationality: string | null | undefined,
): {
  gosi_wage: number;
  gosi_cap_applied: boolean;
  gosi_employee: number;
  gosi_employer: number;
  total_gosi: number;
  is_saudi: boolean;
  rates: { employee: number; employer: number };
} {
  const gosiWage = Math.min(basic_salary, GOSI_CAP_MONTHLY);
  const saudi = isSaudi(nationality);
  const rates = saudi ? GOSI_SAUDI : GOSI_EXPAT;
  const employee = Math.round(gosiWage * rates.employee * 100) / 100;
  const employer = Math.round(gosiWage * rates.employer * 100) / 100;

  return {
    gosi_wage: gosiWage,
    gosi_cap_applied: basic_salary > GOSI_CAP_MONTHLY,
    gosi_employee: employee,
    gosi_employer: employer,
    total_gosi: Math.round((employee + employer) * 100) / 100,
    is_saudi: saudi,
    rates,
  };
}

export function calculateGosiForEmployees(
  employees: { id: string; nationality: string | null | undefined; basic_salary: number }[],
) {
  const results = employees.map((emp) => {
    const calc = calculateGosiForEmployee(emp.basic_salary, emp.nationality);
    return {
      id: emp.id,
      nationality: emp.nationality,
      basic_salary: emp.basic_salary,
      gosi_cap_applied: calc.gosi_cap_applied,
      gosi_wage: calc.gosi_wage,
      gosi_employee: calc.gosi_employee,
      gosi_employer: calc.gosi_employer,
      total_gosi: calc.total_gosi,
      is_saudi: calc.is_saudi,
      rates: calc.rates,
    };
  });

  return {
    employees: results,
    totals: {
      total_gosi_employee: Math.round(results.reduce((s, r) => s + r.gosi_employee, 0) * 100) / 100,
      total_gosi_employer: Math.round(results.reduce((s, r) => s + r.gosi_employer, 0) * 100) / 100,
      total_gosi: Math.round(results.reduce((s, r) => s + r.total_gosi, 0) * 100) / 100,
    },
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
      total: r.total_gosi,
      cappedSalary: r.gosi_wage,
      rates: r.rates,
    };
  },

  calculateGosiForEmployees,

  calculatePayroll: async (
    supabase: SupabaseClient,
    tenantId: string,
    period: { start: string; end: string },
    employeeIds?: string[],
    branchId?: string,
  ): Promise<{ summary: unknown; employees: unknown[]; policy_applied: boolean }> => {
    const { start: period_start, end: period_end } = period;

    let empQuery = supabase
      .from('employees')
      .select(
        'id, employee_number, name_en, name_ar, nationality, basic_salary, ' +
        'housing_allowance, transport_allowance, other_allowances, ' +
        'bank_name, bank_iban, department_id, job_title_id',
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (branchId) empQuery = empQuery.eq('branch_id', branchId);
    if (employeeIds && employeeIds.length > 0) empQuery = empQuery.in('id', employeeIds);

    const [empResult, policyResult, attResult] = await Promise.all([
      empQuery,
      supabase
        .from('attendance_policies')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_default', true)
        .maybeSingle(),
      supabase
        .from('employee_attendance')
        .select('employee_id, status, late_minutes, is_excused')
        .eq('tenant_id', tenantId)
        .gte('date', period_start)
        .lte('date', period_end),
    ]);

    const employees = (empResult.data ?? []) as any[];
    if (empResult.error) throw empResult.error;
    if (!employees || employees.length === 0) {
      throw Object.assign(new Error('No active employees found'), { status: 404 });
    }

    const policy = policyResult.data ?? {
      working_days_per_month: 26,
      late_grace_minutes: 15,
      late_half_day_minutes: 120,
      late_deduction_factor: 0.5,
      absent_deduction_factor: 1.0,
      half_day_deduction_factor: 0.5,
      max_late_incidents_before_absent: 3,
    };

    const attByEmp = new Map<string, any[]>();
    for (const r of (attResult.data ?? [])) {
      if (!attByEmp.has(r.employee_id)) attByEmp.set(r.employee_id, []);
      attByEmp.get(r.employee_id)!.push(r);
    }

    const results = employees.map((emp) => {
      const basicSalary = Number(emp.basic_salary ?? 0);
      const housingAllowance = Number(emp.housing_allowance ?? 0);
      const transportAllowance = Number(emp.transport_allowance ?? 0);
      const otherAllowancesObj = emp.other_allowances ?? {};
      const otherAllowances = Object.values(otherAllowancesObj).reduce(
        (sum: number, val) => sum + Number(val ?? 0),
        0,
      );
      const grossSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances;
      const gosi = calculateGosiForEmployee(basicSalary, emp.nationality);

      const dailyRate = Math.round((basicSalary / policy.working_days_per_month) * 100) / 100;
      let absentDays = 0, lateIncidents = 0, halfDays = 0;
      for (const r of (attByEmp.get(emp.id) ?? [])) {
        if (r.is_excused) continue;
        if (r.status === 'absent') { absentDays++; }
        else if (r.status === 'half_day') { halfDays++; }
        else if (r.status === 'late') {
          const mins = r.late_minutes ?? 0;
          if (mins <= policy.late_grace_minutes) continue;
          if (mins >= policy.late_half_day_minutes) { halfDays++; }
          else { lateIncidents++; }
        }
      }
      const lateConvertedAbsents = Math.floor(lateIncidents / policy.max_late_incidents_before_absent);
      const remainingLates = lateIncidents % policy.max_late_incidents_before_absent;
      const absenceDeduction = Math.round((absentDays + lateConvertedAbsents) * dailyRate * policy.absent_deduction_factor * 100) / 100;
      const halfDayDeduction = Math.round(halfDays * dailyRate * policy.half_day_deduction_factor * 100) / 100;
      const lateDeduction = Math.round(remainingLates * dailyRate * policy.late_deduction_factor * 100) / 100;
      const attendanceDeduction = absenceDeduction + halfDayDeduction + lateDeduction;
      const totalDeductions = Math.round((gosi.gosi_employee + attendanceDeduction) * 100) / 100;
      const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;

      return {
        employee_id: emp.id,
        employee_number: emp.employee_number,
        name_en: emp.name_en,
        name_ar: emp.name_ar,
        nationality: emp.nationality,
        bank_name: emp.bank_name,
        bank_iban: emp.bank_iban,
        period_start,
        period_end,
        basic_salary: basicSalary,
        housing_allowance: housingAllowance,
        transport_allowance: transportAllowance,
        other_allowances: otherAllowances,
        gross_salary: Math.round(grossSalary * 100) / 100,
        gosi_wage: gosi.gosi_wage,
        gosi_employee: gosi.gosi_employee,
        gosi_employer: gosi.gosi_employer,
        is_saudi: gosi.is_saudi,
        gosi_rates: gosi.rates,
        absence_deduction: Math.round(attendanceDeduction * 100) / 100,
        attendance_detail: {
          absent_days: absentDays,
          late_incidents: lateIncidents,
          half_days: halfDays,
          late_converted_absents: lateConvertedAbsents,
          daily_rate: dailyRate,
        },
        total_deductions: totalDeductions,
        net_salary: netSalary,
      };
    });

    const summary = {
      period_start,
      period_end,
      employee_count: results.length,
      total_gross: Math.round(results.reduce((s, r) => s + r.gross_salary, 0) * 100) / 100,
      total_gosi_employee: Math.round(results.reduce((s, r) => s + r.gosi_employee, 0) * 100) / 100,
      total_gosi_employer: Math.round(results.reduce((s, r) => s + r.gosi_employer, 0) * 100) / 100,
      total_absence_deduction: Math.round(results.reduce((s, r) => s + (r.absence_deduction ?? 0), 0) * 100) / 100,
      total_net: Math.round(results.reduce((s, r) => s + r.net_salary, 0) * 100) / 100,
    };

    return { summary, employees: results, policy_applied: !!policyResult.data };
  },

  generateWpsFile,
};
