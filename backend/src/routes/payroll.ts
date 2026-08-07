import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, PAYROLL_ROLES } from '../middleware/auth.js';
import { GOSI_CAP_MONTHLY } from '../packs/sa/payroll.js';
import { resolvePack } from '../packs/registry.js';
import { buildRequestContext, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';

export const payrollRouter = Router();

// ─── Validation schemas ────────────────────────────────────────────────────

const CalculatePayrollSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  employee_ids: z.array(z.string().uuid()).optional(),
});

const GosiCalculateSchema = z.object({
  employees: z.array(
    z.object({
      id: z.string(),
      nationality: z.string(),
      basic_salary: z.number().min(0),
    }),
  ).min(1),
});

// ─── POST /api/payroll/calculate — Full payroll calculation for a period ──

payrollRouter.post('/calculate', requireRole(PAYROLL_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = CalculatePayrollSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 400,
        errors: parsed.error.flatten(),
      });
    }

    const tenant_id = req.user!.tenant_id!;
    const ctx = await buildRequestContext(supabase, tenant_id);
    const pack = resolvePack(ctx);
    if (!pack.payroll?.calculateGosi) {
      throw new NotImplementedInJurisdiction(resolvePack(ctx).code, 'PayrollService.calculateGosi');
    }
    const { period_start, period_end, employee_ids } = parsed.data;

    // Fetch employees for this tenant
    let empQuery = supabase
      .from('employees')
      .select(
        'id, employee_number, name_en, name_ar, nationality, basic_salary, ' +
        'housing_allowance, transport_allowance, other_allowances, ' +
        'bank_name, bank_iban, department_id, job_title_id',
      )
      .eq('tenant_id', tenant_id)
      .eq('status', 'active');

    if (employee_ids && employee_ids.length > 0) {
      empQuery = empQuery.in('id', employee_ids);
    }

    // Fetch attendance policy (default) and attendance records for the period — in parallel
    const [empResult, policyResult, attResult] = await Promise.all([
      empQuery,
      supabase
        .from('attendance_policies')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('is_default', true)
        .maybeSingle(),
      supabase
        .from('employee_attendance')
        .select('employee_id, status, late_minutes, is_excused')
        .eq('tenant_id', tenant_id)
        .gte('date', period_start)
        .lte('date', period_end),
    ]);

    const employees = (empResult.data ?? []) as any[];
    if (empResult.error) throw empResult.error;
    if (!employees || employees.length === 0) {
      return res.status(404).json({ error: 'No active employees found', code: 404 });
    }

    // Attendance policy — fall back to KSA defaults if not configured
    const policy = policyResult.data ?? {
      working_days_per_month:           26,
      late_grace_minutes:               15,
      late_half_day_minutes:            120,
      late_deduction_factor:            0.5,
      absent_deduction_factor:          1.0,
      half_day_deduction_factor:        0.5,
      max_late_incidents_before_absent: 3,
    };

    // Group attendance records by employee
    const attByEmp = new Map<string, any[]>();
    for (const r of (attResult.data ?? [])) {
      if (!attByEmp.has(r.employee_id)) attByEmp.set(r.employee_id, []);
      attByEmp.get(r.employee_id)!.push(r);
    }

    // Build payroll breakdown per employee
    const results = employees.map((emp) => {
      const basicSalary        = Number(emp.basic_salary ?? 0);
      const housingAllowance   = Number(emp.housing_allowance ?? 0);
      const transportAllowance = Number(emp.transport_allowance ?? 0);

      const otherAllowancesObj = emp.other_allowances ?? {};
      const otherAllowances    = Object.values(otherAllowancesObj).reduce(
        (sum: number, val) => sum + Number(val ?? 0), 0,
      );

      const grossSalary = basicSalary + housingAllowance + transportAllowance + otherAllowances;
      const gosiResult  = pack.payroll.calculateGosi!(basicSalary, emp.nationality);
      const isSaudi     = (emp.nationality ?? '').toLowerCase() === 'saudi';
      const gosi        = {
        gosi_wage:      Math.min(basicSalary, GOSI_CAP_MONTHLY),
        gosi_employee:  gosiResult.employee,
        gosi_employer:  gosiResult.employer,
        rates:          gosiResult.rates ?? { employee: 0, employer: 0 },
        is_saudi:       isSaudi,
      };

      // Attendance-based deductions
      const dailyRate = Math.round((basicSalary / policy.working_days_per_month) * 100) / 100;
      let absentDays = 0, lateIncidents = 0, halfDays = 0;
      for (const r of (attByEmp.get(emp.id) ?? [])) {
        if (r.is_excused) continue;
        if (r.status === 'absent')   { absentDays++; }
        else if (r.status === 'half_day') { halfDays++; }
        else if (r.status === 'late') {
          const mins = r.late_minutes ?? 0;
          if (mins <= policy.late_grace_minutes) continue;
          if (mins >= policy.late_half_day_minutes) { halfDays++; }
          else { lateIncidents++; }
        }
      }
      const lateConvertedAbsents = Math.floor(lateIncidents / policy.max_late_incidents_before_absent);
      const remainingLates       = lateIncidents % policy.max_late_incidents_before_absent;
      const absenceDeduction  = Math.round((absentDays + lateConvertedAbsents) * dailyRate * policy.absent_deduction_factor * 100) / 100;
      const halfDayDeduction  = Math.round(halfDays * dailyRate * policy.half_day_deduction_factor * 100) / 100;
      const lateDeduction     = Math.round(remainingLates * dailyRate * policy.late_deduction_factor * 100) / 100;
      const attendanceDeduction = absenceDeduction + halfDayDeduction + lateDeduction;

      const totalDeductions = Math.round((gosi.gosi_employee + attendanceDeduction) * 100) / 100;
      const netSalary       = Math.round((grossSalary - totalDeductions) * 100) / 100;

      return {
        employee_id:         emp.id,
        employee_number:     emp.employee_number,
        name_en:             emp.name_en,
        name_ar:             emp.name_ar,
        nationality:         emp.nationality,
        bank_name:           emp.bank_name,
        bank_iban:           emp.bank_iban,
        period_start,
        period_end,
        basic_salary:        basicSalary,
        housing_allowance:   housingAllowance,
        transport_allowance: transportAllowance,
        other_allowances:    otherAllowances,
        gross_salary:        Math.round(grossSalary * 100) / 100,
        gosi_wage:           gosi.gosi_wage,
        gosi_employee:       gosi.gosi_employee,
        gosi_employer:       gosi.gosi_employer,
        is_saudi:            gosi.is_saudi,
        gosi_rates:          gosi.rates,
        absence_deduction:   Math.round(attendanceDeduction * 100) / 100,
        attendance_detail: {
          absent_days:            absentDays,
          late_incidents:         lateIncidents,
          half_days:              halfDays,
          late_converted_absents: lateConvertedAbsents,
          daily_rate:             dailyRate,
        },
        total_deductions:    totalDeductions,
        net_salary:          netSalary,
      };
    });

    const summary = {
      period_start,
      period_end,
      employee_count:          results.length,
      total_gross:             Math.round(results.reduce((s, r) => s + r.gross_salary,       0) * 100) / 100,
      total_gosi_employee:     Math.round(results.reduce((s, r) => s + r.gosi_employee,     0) * 100) / 100,
      total_gosi_employer:     Math.round(results.reduce((s, r) => s + r.gosi_employer,     0) * 100) / 100,
      total_absence_deduction: Math.round(results.reduce((s, r) => s + (r.absence_deduction ?? 0), 0) * 100) / 100,
      total_net:               Math.round(results.reduce((s, r) => s + r.net_salary,        0) * 100) / 100,
    };

    return res.json({ summary, employees: results, policy_applied: !!policyResult.data });
  } catch (err: any) {
    console.error('Failed to calculate payroll:', err);
    if (err instanceof NotImplementedInJurisdiction || err.name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: err.message, code: 501, feature: err.feature });
    }
    return res.status(500).json({ error: 'Failed to calculate payroll', code: 500 });
  }
});

// ─── POST /api/payroll/gosi-calculate — GOSI-only calculation ─────────────

payrollRouter.post('/gosi-calculate', requireRole(PAYROLL_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const ctx = await buildRequestContext(supabase, tenant_id);
    const pack = resolvePack(ctx);
    if (!pack.payroll?.calculateGosi) {
      throw new NotImplementedInJurisdiction(pack.code, 'PayrollService.calculateGosi');
    }
    const parsed = GosiCalculateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 400,
        errors: parsed.error.flatten(),
      });
    }

    const results = parsed.data.employees.map((emp) => {
      const gosiResult = pack.payroll.calculateGosi!(emp.basic_salary, emp.nationality);
      const isSaudi = (emp.nationality ?? '').toLowerCase() === 'saudi';
      return {
        id: emp.id,
        nationality: emp.nationality,
        basic_salary: emp.basic_salary,
        gosi_cap_applied: emp.basic_salary > GOSI_CAP_MONTHLY,
        gosi_wage: Math.min(emp.basic_salary, GOSI_CAP_MONTHLY),
        gosi_employee: gosiResult.employee,
        gosi_employer: gosiResult.employer,
        total_gosi: gosiResult.total,
        is_saudi: isSaudi,
        rates: gosiResult.rates ?? { employee: 0, employer: 0 },
      };
    });

    const totals = {
      total_gosi_employee: Math.round(results.reduce((s, r) => s + r.gosi_employee, 0) * 100) / 100,
      total_gosi_employer: Math.round(results.reduce((s, r) => s + r.gosi_employer, 0) * 100) / 100,
      total_gosi: Math.round(results.reduce((s, r) => s + r.total_gosi, 0) * 100) / 100,
    };

    return res.json({ employees: results, totals });
  } catch (err: any) {
    console.error('Failed to calculate GOSI:', err);
    if (err instanceof NotImplementedInJurisdiction || err.name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: err.message, code: 501, feature: err.feature });
    }
    return res.status(500).json({ error: 'Failed to calculate GOSI', code: 500 });
  }
});

// ─── GET /api/payroll/wps-file — Generate WPS-compatible download ──────────
//
// WPS (Wage Protection System) format — one line per employee:
//   EmployerID|EmployeeID|BankCode|IBAN|Amount|Currency

payrollRouter.get('/wps-file', async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const period_start = req.query.period_start as string | undefined;
    const period_end = req.query.period_end as string | undefined;

    if (!period_start || !period_end) {
      return res.status(400).json({
        error: 'period_start and period_end query parameters are required',
        code: 400,
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
      return res.status(400).json({
        error: 'period_start and period_end must be in YYYY-MM-DD format',
        code: 400,
      });
    }

    const ctx = await buildRequestContext(supabase, tenant_id);
    const pack = resolvePack(ctx);
    if (!pack.payroll?.generateWpsFile) {
      throw new NotImplementedInJurisdiction(pack.code, 'PayrollService.generateWpsFile');
    }

    const { filename, content } = await pack.payroll.generateWpsFile!(supabase, tenant_id, {
      start: period_start,
      end: period_end,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  } catch (err: any) {
    console.error('Failed to generate WPS file:', err);
    if (err.status === 404) {
      return res.status(404).json({ error: err.message, code: 404 });
    }
    if (err instanceof NotImplementedInJurisdiction || err.name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: err.message, code: 501, feature: err.feature });
    }
    return res.status(500).json({ error: 'Failed to generate WPS file', code: 500 });
  }
});
