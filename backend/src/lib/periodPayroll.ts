/**
 * Shared period payroll calculation used by SA/AE/QA packs.
 * Social-security contribution is injected per jurisdiction (GOSI / none / etc.).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PeriodPayrollSocialSecurity {
  employee: number;
  employer: number;
  wage?: number;
  is_national?: boolean;
  rates?: unknown;
}

export async function calculatePeriodPayroll(
  supabase: SupabaseClient,
  tenantId: string,
  period: { start: string; end: string },
  opts: {
    employeeIds?: string[];
    branchId?: string;
    currencyCode: string;
    jurisdictionCode: string;
    socialSecurity: (basicSalary: number, nationality: string | null | undefined) => PeriodPayrollSocialSecurity;
  },
): Promise<{ summary: unknown; employees: unknown[]; policy_applied: boolean }> {
  const { start: period_start, end: period_end } = period;

  // Supabase/PostgREST defaults to max 1000 rows — page through for 10k+ cohorts.
  const pageSize = 1000;
  const employees: Record<string, unknown>[] = [];
  for (let from = 0; ; from += pageSize) {
    let pageQuery = supabase
      .from('employees')
      .select(
        'id, employee_number, name_en, name_ar, nationality, basic_salary, ' +
          'housing_allowance, transport_allowance, other_allowances, ' +
          'bank_name, bank_iban, department_id, job_title_id',
      )
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    if (opts.branchId) pageQuery = pageQuery.eq('branch_id', opts.branchId);
    if (opts.employeeIds?.length) pageQuery = pageQuery.in('id', opts.employeeIds);
    const { data, error } = await pageQuery.range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = ((data ?? []) as unknown) as Record<string, unknown>[];
    employees.push(...batch);
    if (batch.length < pageSize) break;
  }

  const [policyResult, attResult] = await Promise.all([
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

  if (!employees.length) {
    throw Object.assign(new Error('No active employees found'), { status: 404 });
  }

  const policy = (policyResult.data ?? {
    working_days_per_month: 26,
    late_grace_minutes: 15,
    late_half_day_minutes: 120,
    late_deduction_factor: 0.5,
    absent_deduction_factor: 1.0,
    half_day_deduction_factor: 0.5,
    max_late_incidents_before_absent: 3,
  }) as Record<string, number>;

  const attByEmp = new Map<string, Record<string, unknown>[]>();
  for (const r of ((attResult.data ?? []) as unknown) as Record<string, unknown>[]) {
    const eid = String(r.employee_id);
    if (!attByEmp.has(eid)) attByEmp.set(eid, []);
    attByEmp.get(eid)!.push(r);
  }

  const results = employees.map((emp) => {
    const basicSalary = Number(emp.basic_salary ?? 0);
    const housingAllowance = Number(emp.housing_allowance ?? 0);
    const transportAllowance = Number(emp.transport_allowance ?? 0);
    const otherAllowancesObj = (emp.other_allowances as Record<string, unknown>) ?? {};
    const otherAllowances = Object.values(otherAllowancesObj).reduce(
      (sum: number, val) => sum + Number(val ?? 0),
      0,
    );
    const grossSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances;
    const ss = opts.socialSecurity(basicSalary, emp.nationality as string | undefined);

    const dailyRate = Math.round((basicSalary / Number(policy.working_days_per_month)) * 100) / 100;
    let absentDays = 0;
    let lateIncidents = 0;
    let halfDays = 0;
    for (const r of attByEmp.get(String(emp.id)) ?? []) {
      if (r.is_excused) continue;
      if (r.status === 'absent') absentDays++;
      else if (r.status === 'half_day') halfDays++;
      else if (r.status === 'late') {
        const mins = Number(r.late_minutes ?? 0);
        if (mins <= Number(policy.late_grace_minutes)) continue;
        if (mins >= Number(policy.late_half_day_minutes)) halfDays++;
        else lateIncidents++;
      }
    }
    const lateConvertedAbsents = Math.floor(lateIncidents / Number(policy.max_late_incidents_before_absent));
    const remainingLates = lateIncidents % Number(policy.max_late_incidents_before_absent);
    const absenceDeduction =
      Math.round((absentDays + lateConvertedAbsents) * dailyRate * Number(policy.absent_deduction_factor) * 100) / 100;
    const halfDayDeduction =
      Math.round(halfDays * dailyRate * Number(policy.half_day_deduction_factor) * 100) / 100;
    const lateDeduction =
      Math.round(remainingLates * dailyRate * Number(policy.late_deduction_factor) * 100) / 100;
    const attendanceDeduction = absenceDeduction + halfDayDeduction + lateDeduction;
    const totalDeductions = Math.round((ss.employee + attendanceDeduction) * 100) / 100;
    const netSalary = Math.round((grossSalary - totalDeductions) * 100) / 100;

    return {
      employee_id: emp.id,
      employee_number: emp.employee_number,
      name_en: emp.name_en,
      name_ar: emp.name_ar,
      nationality: emp.nationality,
      bank_name: emp.bank_name,
      bank_iban: emp.bank_iban,
      currency_code: opts.currencyCode,
      jurisdiction_code: opts.jurisdictionCode,
      period_start,
      period_end,
      basic_salary: basicSalary,
      housing_allowance: housingAllowance,
      transport_allowance: transportAllowance,
      other_allowances: otherAllowances,
      gross_salary: Math.round(grossSalary * 100) / 100,
      gosi_wage: ss.wage ?? 0,
      gosi_employee: ss.employee,
      gosi_employer: ss.employer,
      is_saudi: ss.is_national ?? false,
      gosi_rates: ss.rates ?? null,
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
    currency_code: opts.currencyCode,
    jurisdiction_code: opts.jurisdictionCode,
    employee_count: results.length,
    total_gross: Math.round(results.reduce((s, r) => s + r.gross_salary, 0) * 100) / 100,
    total_gosi_employee: Math.round(results.reduce((s, r) => s + r.gosi_employee, 0) * 100) / 100,
    total_gosi_employer: Math.round(results.reduce((s, r) => s + r.gosi_employer, 0) * 100) / 100,
    total_absence_deduction: Math.round(results.reduce((s, r) => s + (r.absence_deduction ?? 0), 0) * 100) / 100,
    total_net: Math.round(results.reduce((s, r) => s + r.net_salary, 0) * 100) / 100,
  };

  return { summary, employees: results, policy_applied: !!policyResult.data };
}
