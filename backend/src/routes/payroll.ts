import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const payrollRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── GOSI Rates (Saudi Labour Law / GOSI regulations) ─────────────────────
//
// Saudi nationals:
//   Employee: 9%  | Employer: 11.75%  on basic salary, capped at 45,000 SAR/month
//   (Pension 9%+9% + Work Hazard 2.75% employer-only)
//
// Expatriates (non-Saudi):
//   Employee: 1.5% | Employer: 2%  on basic salary, capped at 45,000 SAR/month
//   (Work Hazard insurance only — no pension contribution)

const GOSI_CAP_MONTHLY = 45_000;

const GOSI_SAUDI = {
  employee: 0.09,
  employer: 0.1175,
} as const;

const GOSI_EXPAT = {
  employee: 0.015,
  employer: 0.02,
} as const;

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

// ─── Helper: is this employee considered Saudi for GOSI? ──────────────────

function isSaudi(nationality: string | null | undefined): boolean {
  if (!nationality) return false;
  const n = nationality.toLowerCase().trim();
  return n === 'saudi' || n === 'saudi arabia' || n === 'sa' || n === 'سعودي';
}

// ─── Helper: calculate GOSI contributions for one employee ────────────────

function calculateGosiForEmployee(
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

// ─── POST /api/payroll/calculate — Full payroll calculation for a period ──

payrollRouter.post('/calculate', async (req: AuthenticatedRequest, res) => {
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

    const { data: rawEmployees, error: empError } = await empQuery;
    const employees = (rawEmployees ?? []) as any[];
    if (empError) throw empError;

    if (!employees || employees.length === 0) {
      return res.status(404).json({ error: 'No active employees found', code: 404 });
    }

    // Build payroll breakdown per employee
    const results = employees.map((emp) => {
      const basicSalary = Number(emp.basic_salary ?? 0);
      const housingAllowance = Number(emp.housing_allowance ?? 0);
      const transportAllowance = Number(emp.transport_allowance ?? 0);

      // Sum other_allowances JSONB object values
      const otherAllowancesObj = emp.other_allowances ?? {};
      const otherAllowances = Object.values(otherAllowancesObj).reduce(
        (sum: number, val) => sum + Number(val ?? 0),
        0,
      );

      const grossSalary =
        basicSalary + housingAllowance + transportAllowance + otherAllowances;

      const gosi = calculateGosiForEmployee(basicSalary, emp.nationality);

      // Net = gross - employee GOSI deduction
      // (Other deductions like loans would come from a deductions table in a full implementation)
      const totalDeductions = gosi.gosi_employee;
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
        total_deductions: Math.round(totalDeductions * 100) / 100,
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
      total_net: Math.round(results.reduce((s, r) => s + r.net_salary, 0) * 100) / 100,
    };

    return res.json({ summary, employees: results });
  } catch (err) {
    console.error('Failed to calculate payroll:', err);
    return res.status(500).json({ error: 'Failed to calculate payroll', code: 500 });
  }
});

// ─── POST /api/payroll/gosi-calculate — GOSI-only calculation ─────────────

payrollRouter.post('/gosi-calculate', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = GosiCalculateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        code: 400,
        errors: parsed.error.flatten(),
      });
    }

    const results = parsed.data.employees.map((emp) => {
      const gosi = calculateGosiForEmployee(emp.basic_salary, emp.nationality);
      return {
        id: emp.id,
        nationality: emp.nationality,
        basic_salary: emp.basic_salary,
        gosi_cap_applied: emp.basic_salary > GOSI_CAP_MONTHLY,
        gosi_wage: gosi.gosi_wage,
        gosi_employee: gosi.gosi_employee,
        gosi_employer: gosi.gosi_employer,
        total_gosi: Math.round((gosi.gosi_employee + gosi.gosi_employer) * 100) / 100,
        is_saudi: gosi.is_saudi,
        rates: gosi.rates,
      };
    });

    const totals = {
      total_gosi_employee: Math.round(results.reduce((s, r) => s + r.gosi_employee, 0) * 100) / 100,
      total_gosi_employer: Math.round(results.reduce((s, r) => s + r.gosi_employer, 0) * 100) / 100,
      total_gosi: Math.round(results.reduce((s, r) => s + r.total_gosi, 0) * 100) / 100,
    };

    return res.json({ employees: results, totals });
  } catch (err) {
    console.error('Failed to calculate GOSI:', err);
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

    // Fetch tenant info (employer ID / slug)
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, slug, name_en')
      .eq('id', tenant_id)
      .single();

    if (tenantError || !tenant) throw tenantError ?? new Error('Tenant not found');

    // The employer ID used in WPS is the tenant slug or first 10 chars of tenant UUID
    const employerId = (tenant.slug ?? tenant_id.replace(/-/g, '').slice(0, 10)).toUpperCase();

    // Try to find finalized payslips for the period first
    const { data: rawPayslips, error: payslipError } = await supabase
      .from('payslip_lines')
      .select(
        'employee_id, net_salary, ' +
        'employees(employee_number, bank_name, bank_iban, nationality, basic_salary)',
      )
      .eq('tenant_id', tenant_id)
      .gte('created_at', period_start)
      .lte('created_at', period_end + 'T23:59:59Z');

    // Fall back to a live payroll calculation if no payslips exist for the period
    let wpsRows: Array<{
      employee_id: string;
      employee_number: string;
      bank_iban: string;
      bank_name: string;
      net_salary: number;
    }> = [];

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
        .eq('tenant_id', tenant_id)
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
      return res.status(404).json({
        error: 'No employee data found for the specified period',
        code: 404,
      });
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

    const safeSlug = (tenant.slug ?? tenant_id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `WPS_${safeSlug}_${period_start}_${period_end}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('Failed to generate WPS file:', err);
    return res.status(500).json({ error: 'Failed to generate WPS file', code: 500 });
  }
});
