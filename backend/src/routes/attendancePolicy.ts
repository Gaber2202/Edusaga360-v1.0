import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, HR_ROLES } from '../middleware/auth.js';

export const attendancePolicyRouter = Router();


// ─── Schemas ─────────────────────────────────────────────────────────────────

const PolicySchema = z.object({
  name:                            z.string().min(1).max(100),
  working_days_per_month:          z.number().int().min(1).max(31).default(26),
  daily_rate_basis:                z.enum(['monthly_divided', 'fixed']).default('monthly_divided'),
  late_grace_minutes:              z.number().int().min(0).max(120).default(15),
  late_half_day_minutes:           z.number().int().min(30).max(480).default(120),
  late_deduction_factor:           z.number().min(0).max(2).default(0.5),
  absent_deduction_factor:         z.number().min(0).max(3).default(1.0),
  half_day_deduction_factor:       z.number().min(0).max(2).default(0.5),
  max_late_incidents_before_absent: z.number().int().min(1).max(10).default(3),
  is_default:                      z.boolean().default(false),
});

const ApplySchema = z.object({
  period_start:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employee_ids:  z.array(z.string().uuid()).optional(),
  policy_id:     z.string().uuid().optional(),
});

const MarkAttendanceSchema = z.object({
  records: z.array(z.object({
    employee_id:  z.string().uuid(),
    date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status:       z.enum(['present', 'absent', 'late', 'half_day', 'leave', 'holiday']),
    check_in:     z.string().optional(),
    check_out:    z.string().optional(),
    late_minutes: z.number().int().min(0).max(1440).optional(),
    is_excused:   z.boolean().optional(),
    notes:        z.string().max(500).optional(),
  })).min(1).max(200),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface AttendancePolicy {
  id: string;
  working_days_per_month: number;
  daily_rate_basis: string;
  late_grace_minutes: number;
  late_half_day_minutes: number;
  late_deduction_factor: number;
  absent_deduction_factor: number;
  half_day_deduction_factor: number;
  max_late_incidents_before_absent: number;
}

interface AttendanceRecord {
  employee_id: string;
  status: string;
  late_minutes: number | null;
  is_excused: boolean | null;
}

interface EmployeeDeduction {
  employee_id: string;
  daily_rate: number;
  absent_days: number;
  late_incidents: number;
  half_days: number;
  late_converted_absents: number;
  absence_deduction: number;
  late_deduction: number;
  total_deduction: number;
  breakdown: string;
}

function calcDailyRate(basicSalary: number, policy: AttendancePolicy): number {
  return Math.round((basicSalary / policy.working_days_per_month) * 100) / 100;
}

function calcDeductions(
  records: AttendanceRecord[],
  basicSalary: number,
  policy: AttendancePolicy,
): Omit<EmployeeDeduction, 'employee_id'> {
  const dailyRate = calcDailyRate(basicSalary, policy);

  let absentDays       = 0;
  let lateIncidents    = 0;
  let halfDays         = 0;

  for (const r of records) {
    if (r.is_excused) continue; // excused — no deduction

    if (r.status === 'absent') {
      absentDays++;
    } else if (r.status === 'half_day') {
      halfDays++;
    } else if (r.status === 'late') {
      const mins = r.late_minutes ?? 0;
      if (mins <= policy.late_grace_minutes) continue; // within grace, no deduction
      if (mins >= policy.late_half_day_minutes) {
        halfDays++; // very late = half day
      } else {
        lateIncidents++;
      }
    }
  }

  // Convert accumulated late incidents to absent-equivalent
  const lateConvertedAbsents = Math.floor(lateIncidents / policy.max_late_incidents_before_absent);
  const remainingLates       = lateIncidents % policy.max_late_incidents_before_absent;

  const absenceDeduction = Math.round(
    (absentDays + lateConvertedAbsents) * dailyRate * policy.absent_deduction_factor * 100,
  ) / 100;

  const halfDayDeduction = Math.round(
    halfDays * dailyRate * policy.half_day_deduction_factor * 100,
  ) / 100;

  // Remaining individual late incidents (not yet converted to absent)
  const lateDeduction = Math.round(
    remainingLates * dailyRate * policy.late_deduction_factor * 100,
  ) / 100;

  const totalDeduction = absenceDeduction + halfDayDeduction + lateDeduction;

  const parts: string[] = [];
  if (absentDays > 0)          parts.push(`${absentDays} absent`);
  if (lateConvertedAbsents > 0) parts.push(`${lateIncidents} lates→${lateConvertedAbsents} absent`);
  if (halfDays > 0)            parts.push(`${halfDays} half-day`);
  if (remainingLates > 0)      parts.push(`${remainingLates} late`);

  return {
    daily_rate:              dailyRate,
    absent_days:             absentDays,
    late_incidents:          lateIncidents,
    half_days:               halfDays,
    late_converted_absents:  lateConvertedAbsents,
    absence_deduction:       absenceDeduction,
    late_deduction:          lateDeduction + halfDayDeduction,
    total_deduction:         Math.round(totalDeduction * 100) / 100,
    breakdown:               parts.length > 0 ? parts.join(', ') : 'no deductions',
  };
}

// ─── GET /api/attendance-policy — list policies ───────────────────────────────

attendancePolicyRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('attendance_policies')
    .select('*')
    .eq('tenant_id', tenant_id)
    .order('is_default', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ policies: data ?? [] });
});

// ─── POST /api/attendance-policy — create policy ──────────────────────────────

attendancePolicyRouter.post('/', requireRole(HR_ROLES), async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const parsed = PolicySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  // If setting as default, unset existing default first
  if (parsed.data.is_default) {
    await supabase.from('attendance_policies').update({ is_default: false }).eq('tenant_id', tenant_id);
  }

  const { data, error } = await supabase
    .from('attendance_policies')
    .insert({ ...parsed.data, tenant_id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ policy: data });
});

// ─── PUT /api/attendance-policy/:id — update policy ──────────────────────────

attendancePolicyRouter.put('/:id', requireRole(HR_ROLES), async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { id } = req.params;
  const parsed = PolicySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  if (parsed.data.is_default) {
    await supabase.from('attendance_policies').update({ is_default: false }).eq('tenant_id', tenant_id);
  }

  const { data, error } = await supabase
    .from('attendance_policies')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data)  return res.status(404).json({ error: 'Policy not found' });
  return res.json({ policy: data });
});

// ─── DELETE /api/attendance-policy/:id ───────────────────────────────────────

attendancePolicyRouter.delete('/:id', requireRole(HR_ROLES), async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { id } = req.params;
  const { error } = await supabase
    .from('attendance_policies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant_id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

// ─── POST /api/attendance-policy/records — bulk mark attendance ───────────────

attendancePolicyRouter.post('/records', requireRole(HR_ROLES), async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const parsed = MarkAttendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const rows = parsed.data.records.map((r) => ({
    ...r,
    tenant_id,
    source: 'manual',
    late_minutes: r.late_minutes ?? 0,
    is_excused:   r.is_excused   ?? false,
  }));

  // Upsert on (tenant_id, employee_id, date)
  const { data, error } = await supabase
    .from('employee_attendance')
    .upsert(rows, { onConflict: 'tenant_id,employee_id,date', ignoreDuplicates: false })
    .select('id, employee_id, date, status');

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ saved: data?.length ?? 0, records: data });
});

// ─── GET /api/attendance-policy/records — query attendance for a period ───────

attendancePolicyRouter.get('/records', async (req: AuthenticatedRequest, res) => {
  const tenant_id   = req.user!.tenant_id!;
  const { from, to, employee_id } = req.query as Record<string, string>;

  if (!from || !to) return res.status(400).json({ error: 'from and to query params required (YYYY-MM-DD)' });

  let q = supabase
    .from('employee_attendance')
    .select('id, employee_id, date, status, check_in, check_out, late_minutes, is_excused, notes, source')
    .eq('tenant_id', tenant_id)
    .gte('date', from)
    .lte('date', to)
    .order('date');

  if (employee_id) q = q.eq('employee_id', employee_id);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ records: data ?? [] });
});

// ─── POST /api/attendance-policy/apply — calculate deductions for a period ───
//
// This is the engine: given a pay period, it fetches attendance records,
// applies the tenant's policy, and returns per-employee deduction amounts
// ready to be merged into payslip_lines.

attendancePolicyRouter.post('/apply', requireRole(HR_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = ApplySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

    const tenant_id = req.user!.tenant_id!;
    const { period_start, period_end, employee_ids, policy_id } = parsed.data;

    // 1. Fetch policy (specific or default)
    let policyQuery = supabase
      .from('attendance_policies')
      .select('*')
      .eq('tenant_id', tenant_id);

    if (policy_id) {
      policyQuery = policyQuery.eq('id', policy_id);
    } else {
      policyQuery = policyQuery.eq('is_default', true);
    }

    const { data: policyData } = await policyQuery.single();

    // Fall back to sensible KSA defaults if no policy configured
    const policy: AttendancePolicy = policyData ?? {
      id: 'default',
      working_days_per_month:           26,
      daily_rate_basis:                 'monthly_divided',
      late_grace_minutes:               15,
      late_half_day_minutes:            120,
      late_deduction_factor:            0.5,
      absent_deduction_factor:          1.0,
      half_day_deduction_factor:        0.5,
      max_late_incidents_before_absent: 3,
    };

    // 2. Fetch employees
    let empQuery = supabase
      .from('employees')
      .select('id, name_en, name_ar, basic_salary, nationality')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active');

    if (employee_ids && employee_ids.length > 0) {
      empQuery = empQuery.in('id', employee_ids);
    }

    const { data: empData, error: empError } = await empQuery;
    if (empError) throw empError;
    const employees = (empData ?? []) as any[];

    if (employees.length === 0) {
      return res.status(404).json({ error: 'No active employees found' });
    }

    // 3. Fetch attendance records for period
    let attQuery = supabase
      .from('employee_attendance')
      .select('employee_id, date, status, late_minutes, is_excused')
      .eq('tenant_id', tenant_id)
      .gte('date', period_start)
      .lte('date', period_end);

    if (employee_ids && employee_ids.length > 0) {
      attQuery = attQuery.in('employee_id', employee_ids);
    }

    const { data: attData, error: attError } = await attQuery;
    if (attError) throw attError;

    // Group by employee
    const recordsByEmployee = new Map<string, AttendanceRecord[]>();
    for (const r of (attData ?? [])) {
      if (!recordsByEmployee.has(r.employee_id)) recordsByEmployee.set(r.employee_id, []);
      recordsByEmployee.get(r.employee_id)!.push(r as AttendanceRecord);
    }

    // 4. Calculate deductions per employee
    const results: EmployeeDeduction[] = employees.map((emp) => {
      const records  = recordsByEmployee.get(emp.id) ?? [];
      const deductions = calcDeductions(records, Number(emp.basic_salary ?? 0), policy);
      return { employee_id: emp.id, ...deductions };
    });

    return res.json({
      policy_used: policy.id,
      period_start,
      period_end,
      results,
    });
  } catch (err) {
    console.error('Attendance policy apply error:', err);
    return res.status(500).json({ error: 'Failed to apply attendance policy' });
  }
});

// ─── GET /api/attendance-policy/summary/:employee_id — monthly summary ────────

attendancePolicyRouter.get('/summary/:employee_id', async (req: AuthenticatedRequest, res) => {
  const tenant_id    = req.user!.tenant_id!;
  const { employee_id } = req.params;
  const { from, to } = req.query as Record<string, string>;

  if (!from || !to) return res.status(400).json({ error: 'from and to query params required' });

  const { data, error } = await supabase
    .from('employee_attendance')
    .select('date, status, late_minutes, is_excused')
    .eq('tenant_id', tenant_id)
    .eq('employee_id', employee_id)
    .gte('date', from)
    .lte('date', to)
    .order('date');

  if (error) return res.status(500).json({ error: error.message });

  const records = (data ?? []) as any[];
  const summary = {
    total_days:    records.length,
    present:       records.filter(r => r.status === 'present').length,
    absent:        records.filter(r => r.status === 'absent' && !r.is_excused).length,
    absent_excused: records.filter(r => r.status === 'absent' && r.is_excused).length,
    late:          records.filter(r => r.status === 'late').length,
    half_day:      records.filter(r => r.status === 'half_day').length,
    leave:         records.filter(r => r.status === 'leave').length,
    records,
  };

  return res.json(summary);
});
