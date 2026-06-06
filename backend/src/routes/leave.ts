import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const leaveRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SubmitLeaveSchema = z.object({
  leave_type_id: z.string().uuid(),
  start_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:        z.string().max(1000).optional(),
});

const ApproveSchema = z.object({
  note: z.string().max(500).optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(1).max(500),
});

const ChainSchema = z.object({
  leave_type_id:    z.string().uuid(),
  levels: z.array(z.object({
    level:            z.number().int().min(1).max(5),
    approver_role:    z.enum(['direct_manager', 'hr_manager', 'ceo', 'branch_manager', 'custom']),
    approver_user_id: z.string().uuid().optional(),
    min_days:         z.number().int().min(1).optional(),
    max_days:         z.number().int().min(1).optional(),
  })).min(1).max(5),
});

const HolidaySchema = z.object({
  name_en:      z.string().min(1).max(200),
  name_ar:      z.string().max(200).optional(),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type:         z.enum(['national', 'school', 'optional']).default('national'),
  branch_id:    z.string().uuid().optional(),
  is_recurring: z.boolean().default(false),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Count working days between two dates, excluding weekends and tenant holidays
async function countWorkingDays(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<number> {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end < start) return 0;

  // Fetch holidays in range
  const { data: holidays } = await supabase
    .from('holidays')
    .select('date, end_date')
    .eq('tenant_id', tenantId)
    .lte('date', endDate)
    .gte('date', startDate);  // simple: holiday.date in range

  const holidayDates = new Set<string>();
  for (const h of (holidays ?? [])) {
    const hStart = new Date(h.date);
    const hEnd   = h.end_date ? new Date(h.end_date) : hStart;
    for (let d = new Date(hStart); d <= hEnd; d.setDate(d.getDate() + 1)) {
      holidayDates.add(d.toISOString().slice(0, 10));
    }
  }

  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay(); // 0=Sun, 5=Fri, 6=Sat
    if (day === 5 || day === 6) continue; // KSA weekend: Fri + Sat
    const iso = d.toISOString().slice(0, 10);
    if (!holidayDates.has(iso)) count++;
  }
  return count;
}

// Resolve required approval levels for a leave type + day count
async function resolveApprovalChain(
  tenantId: string,
  leaveTypeId: string,
  days: number,
): Promise<Array<{ level: number; approver_role: string; approver_user_id: string | null }>> {
  const { data: chains } = await supabase
    .from('leave_approval_chains')
    .select('level, approver_role, approver_user_id, min_days, max_days')
    .eq('tenant_id', tenantId)
    .eq('leave_type_id', leaveTypeId)
    .order('level');

  if (!chains || chains.length === 0) {
    // Default: single-level HR approval
    return [{ level: 1, approver_role: 'hr_manager', approver_user_id: null }];
  }

  // Filter levels that apply to this day count
  return chains
    .filter((c: any) => {
      if (c.min_days && days < c.min_days) return false;
      if (c.max_days && days > c.max_days) return false;
      return true;
    })
    .map((c: any) => ({ level: c.level, approver_role: c.approver_role, approver_user_id: c.approver_user_id ?? null }));
}

// ─── POST /api/leave/submit ───────────────────────────────────────────────────

leaveRouter.post('/submit', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = SubmitLeaveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

    const tenant_id  = req.user!.tenant_id!;
    const employee_id = req.user!.id;
    const { leave_type_id, start_date, end_date, reason } = parsed.data;

    if (end_date < start_date) return res.status(400).json({ error: 'end_date must be on or after start_date' });

    // 1. Verify leave type belongs to tenant
    const { data: leaveType, error: ltErr } = await supabase
      .from('leave_types')
      .select('id, name, days_allowed, is_paid, gender_specific')
      .eq('id', leave_type_id)
      .eq('tenant_id', tenant_id)
      .single();
    if (ltErr || !leaveType) return res.status(404).json({ error: 'Leave type not found' });

    // 2. Count working days
    const days = await countWorkingDays(tenant_id, start_date, end_date);
    if (days === 0) return res.status(400).json({ error: 'No working days in selected range' });

    // 3. Check for overlapping pending/approved requests
    const { data: overlapping } = await supabase
      .from('leave_requests')
      .select('id, start_date, end_date, status')
      .eq('tenant_id', tenant_id)
      .eq('employee_id', employee_id)
      .in('status', ['pending', 'approved', 'manager_approved'])
      .lte('start_date', end_date)
      .gte('end_date', start_date);

    if (overlapping && overlapping.length > 0) {
      return res.status(409).json({
        error: 'Overlapping leave request exists',
        conflicts: overlapping.map((r: any) => ({ id: r.id, start_date: r.start_date, end_date: r.end_date, status: r.status })),
      });
    }

    // 4. Check balance (warn but allow — let HR decide on unpaid leave)
    const { data: balance } = await supabase
      .from('leave_balances')
      .select('remaining_days, used_days, total_days')
      .eq('tenant_id', tenant_id)
      .eq('employee_id', employee_id)
      .eq('leave_type_id', leave_type_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const remaining    = balance?.remaining_days ?? 0;
    const insufficientBalance = leaveType.is_paid && remaining < days;

    // 5. Resolve approval chain
    const chain       = await resolveApprovalChain(tenant_id, leave_type_id, days);
    const totalLevels = chain.length;

    // 6. Create the request
    const { data: request, error: insertErr } = await supabase
      .from('leave_requests')
      .insert({
        tenant_id,
        employee_id,
        leave_type_id,
        start_date,
        end_date,
        days,
        reason: reason ?? null,
        status:        'pending',
        current_level: 1,
        total_levels:  totalLevels,
        updated_at:    new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return res.status(201).json({
      request,
      days_requested: days,
      balance_before: remaining,
      insufficient_balance: insufficientBalance,
      approval_chain: chain,
    });
  } catch (err) {
    console.error('Leave submit error:', err);
    return res.status(500).json({ error: 'Failed to submit leave request' });
  }
});

// ─── GET /api/leave/requests — list requests (role-aware) ─────────────────────

leaveRouter.get('/requests', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { status, employee_id, from, to } = req.query as Record<string, string>;

  const role = req.user!.role;
  // HR and admin see all; others see only own requests
  const isPrivileged = role === 'admin' || role === 'hr' || role === 'hr_manager';

  let q = supabase
    .from('leave_requests')
    .select(`
      id, employee_id, leave_type_id, start_date, end_date, days,
      reason, status, current_level, total_levels,
      rejection_reason, manager_approved_at, hr_approved_at, final_approved_at,
      created_at, updated_at,
      leave_types(name),
      employees(name_ar, name_en, employee_number, department_name)
    `)
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false });

  if (!isPrivileged) q = q.eq('employee_id', req.user!.id);
  if (employee_id)   q = q.eq('employee_id', employee_id);
  if (status)        q = q.eq('status', status);
  if (from)          q = q.gte('start_date', from);
  if (to)            q = q.lte('end_date', to);

  const { data, error } = await q.limit(200);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ requests: data ?? [] });
});

// ─── GET /api/leave/requests/:id ─────────────────────────────────────────────

leaveRouter.get('/requests/:id', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { id } = req.params;

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`*, leave_types(*), employees(name_ar, name_en, employee_number, department_name, nationality)`)
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Leave request not found' });

  // Non-privileged users can only see their own
  const role = req.user!.role;
  const isPrivileged = role === 'admin' || role === 'hr' || role === 'hr_manager';
  if (!isPrivileged && (data as any).employee_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.json({ request: data });
});

// ─── POST /api/leave/requests/:id/approve ────────────────────────────────────

leaveRouter.post('/requests/:id/approve', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = ApproveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

    const tenant_id  = req.user!.tenant_id!;
    const approver_id = req.user!.id;
    const role        = req.user!.role;
    const { id } = req.params;

    // Only HR/admin/manager can approve
    const canApprove = role === 'admin' || role === 'hr' || role === 'hr_manager' || role === 'manager' || role === 'branch_manager';
    if (!canApprove) return res.status(403).json({ error: 'Insufficient permissions to approve leave' });

    // Fetch request
    const { data: request, error: fetchErr } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single();

    if (fetchErr || !request) return res.status(404).json({ error: 'Leave request not found' });
    if (!['pending', 'manager_approved'].includes((request as any).status)) {
      return res.status(409).json({ error: `Cannot approve a request with status: ${(request as any).status}` });
    }

    const req_data    = request as any;
    const currentLevel = req_data.current_level ?? 1;
    const totalLevels  = req_data.total_levels  ?? 1;
    const now          = new Date().toISOString();

    let newStatus: string;
    const updatePayload: Record<string, unknown> = { updated_at: now };

    if (currentLevel >= totalLevels) {
      // Final approval — deduct balance and mark approved
      newStatus = 'approved';
      updatePayload.status             = 'approved';
      updatePayload.final_approved_at  = now;
      updatePayload.hr_approved_by     = approver_id;
      updatePayload.hr_approved_at     = now;
      updatePayload.approved_by        = approver_id;

      // Deduct balance
      const { data: bal } = await supabase
        .from('leave_balances')
        .select('id, used_days, total_days')
        .eq('tenant_id', tenant_id)
        .eq('employee_id', req_data.employee_id)
        .eq('leave_type_id', req_data.leave_type_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (bal) {
        const newUsed = Math.min((bal as any).used_days + req_data.days, (bal as any).total_days);
        await supabase
          .from('leave_balances')
          .update({ used_days: newUsed })
          .eq('id', (bal as any).id);

        // Audit trail
        await supabase.from('leave_balance_audits').insert({
          tenant_id,
          leave_balance_id:  (bal as any).id,
          employee_id:       req_data.employee_id,
          leave_type_id:     req_data.leave_type_id,
          action:            'approved',
          delta_days:        -req_data.days,
          used_days_after:   newUsed,
          leave_request_id:  id,
          performed_by:      approver_id,
          note:              parsed.data.note ?? null,
        });
      }
    } else {
      // Intermediate level approval — advance to next level
      newStatus = 'manager_approved';
      updatePayload.status               = 'manager_approved';
      updatePayload.current_level        = currentLevel + 1;
      updatePayload.manager_approved_by  = approver_id;
      updatePayload.manager_approved_at  = now;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('leave_requests')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return res.json({
      request:      updated,
      new_status:   newStatus,
      final:        newStatus === 'approved',
      next_level:   newStatus === 'manager_approved' ? currentLevel + 1 : null,
    });
  } catch (err) {
    console.error('Leave approve error:', err);
    return res.status(500).json({ error: 'Failed to approve leave request' });
  }
});

// ─── POST /api/leave/requests/:id/reject ─────────────────────────────────────

leaveRouter.post('/requests/:id/reject', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = RejectSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

    const tenant_id   = req.user!.tenant_id!;
    const approver_id = req.user!.id;
    const role        = req.user!.role;
    const { id } = req.params;

    const canReject = role === 'admin' || role === 'hr' || role === 'hr_manager' || role === 'manager' || role === 'branch_manager';
    if (!canReject) return res.status(403).json({ error: 'Insufficient permissions' });

    const { data: request, error: fetchErr } = await supabase
      .from('leave_requests')
      .select('status')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single();

    if (fetchErr || !request) return res.status(404).json({ error: 'Leave request not found' });
    if (['rejected', 'cancelled', 'approved'].includes((request as any).status)) {
      return res.status(409).json({ error: `Cannot reject a request with status: ${(request as any).status}` });
    }

    const { data: updated, error: updateErr } = await supabase
      .from('leave_requests')
      .update({
        status:           'rejected',
        rejection_reason: parsed.data.reason,
        approved_by:      approver_id,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    await supabase.from('leave_balance_audits').insert({
      tenant_id,
      employee_id:      (updated as any).employee_id,
      leave_type_id:    (updated as any).leave_type_id,
      action:           'rejected',
      delta_days:       0,
      leave_request_id: id,
      performed_by:     approver_id,
      note:             parsed.data.reason,
    });

    return res.json({ request: updated });
  } catch (err) {
    console.error('Leave reject error:', err);
    return res.status(500).json({ error: 'Failed to reject leave request' });
  }
});

// ─── POST /api/leave/requests/:id/cancel ─────────────────────────────────────

leaveRouter.post('/requests/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id   = req.user!.tenant_id!;
    const employee_id = req.user!.id;
    const { id } = req.params;

    const { data: request, error: fetchErr } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single();

    if (fetchErr || !request) return res.status(404).json({ error: 'Leave request not found' });
    const r = request as any;

    // Only the employee themselves or admin/HR can cancel
    const role = req.user!.role;
    const isPrivileged = role === 'admin' || role === 'hr' || role === 'hr_manager';
    if (r.employee_id !== employee_id && !isPrivileged) return res.status(403).json({ error: 'Forbidden' });
    if (['rejected', 'cancelled'].includes(r.status)) return res.status(409).json({ error: `Already ${r.status}` });

    const now = new Date().toISOString();
    await supabase
      .from('leave_requests')
      .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
      .eq('id', id)
      .eq('tenant_id', tenant_id);

    // If was approved, restore balance
    if (r.status === 'approved') {
      const { data: bal } = await supabase
        .from('leave_balances')
        .select('id, used_days')
        .eq('tenant_id', tenant_id)
        .eq('employee_id', r.employee_id)
        .eq('leave_type_id', r.leave_type_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (bal) {
        const restored = Math.max(0, (bal as any).used_days - r.days);
        await supabase.from('leave_balances').update({ used_days: restored }).eq('id', (bal as any).id);
        await supabase.from('leave_balance_audits').insert({
          tenant_id,
          leave_balance_id:  (bal as any).id,
          employee_id:       r.employee_id,
          leave_type_id:     r.leave_type_id,
          action:            'cancelled',
          delta_days:        r.days,
          used_days_after:   restored,
          leave_request_id:  id,
          performed_by:      employee_id,
        });
      }
    }

    return res.json({ success: true, balance_restored: r.status === 'approved' });
  } catch (err) {
    console.error('Leave cancel error:', err);
    return res.status(500).json({ error: 'Failed to cancel leave request' });
  }
});

// ─── GET /api/leave/balance/:employee_id ─────────────────────────────────────

leaveRouter.get('/balance/:employee_id', async (req: AuthenticatedRequest, res) => {
  const tenant_id   = req.user!.tenant_id!;
  const { employee_id } = req.params;

  // Non-privileged can only see their own balance
  const role = req.user!.role;
  const isPrivileged = role === 'admin' || role === 'hr' || role === 'hr_manager';
  if (!isPrivileged && req.user!.id !== employee_id) return res.status(403).json({ error: 'Forbidden' });

  const { data, error } = await supabase
    .from('leave_balances')
    .select('*, leave_types(name, days_allowed, is_paid)')
    .eq('tenant_id', tenant_id)
    .eq('employee_id', employee_id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ balances: data ?? [] });
});

// ─── GET /api/leave/pending — requests awaiting my approval ──────────────────

leaveRouter.get('/pending', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const role      = req.user!.role;

  const isApprover = role === 'admin' || role === 'hr' || role === 'hr_manager' || role === 'manager' || role === 'branch_manager';
  if (!isApprover) return res.json({ requests: [] });

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      id, employee_id, start_date, end_date, days, reason,
      status, current_level, total_levels, created_at,
      leave_types(name, is_paid),
      employees(name_ar, name_en, employee_number, department_name)
    `)
    .eq('tenant_id', tenant_id)
    .in('status', ['pending', 'manager_approved'])
    .order('created_at');

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ requests: data ?? [], count: (data ?? []).length });
});

// ─── Approval chain CRUD ──────────────────────────────────────────────────────

leaveRouter.get('/chains', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('leave_approval_chains')
    .select('*, leave_types(name)')
    .eq('tenant_id', tenant_id)
    .order('leave_type_id')
    .order('level');
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ chains: data ?? [] });
});

leaveRouter.post('/chains', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const role      = req.user!.role;
  if (role !== 'admin' && role !== 'hr_manager') return res.status(403).json({ error: 'Admin or HR Manager role required' });

  const parsed = ChainSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const { leave_type_id, levels } = parsed.data;

  // Replace all existing levels for this leave type
  await supabase.from('leave_approval_chains').delete().eq('tenant_id', tenant_id).eq('leave_type_id', leave_type_id);

  const rows = levels.map((l) => ({ ...l, tenant_id, leave_type_id, approver_user_id: l.approver_user_id ?? null }));
  const { data, error } = await supabase.from('leave_approval_chains').insert(rows).select();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ chains: data });
});

// ─── Holiday CRUD ─────────────────────────────────────────────────────────────

leaveRouter.get('/holidays', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { year } = req.query as Record<string, string>;

  let q = supabase.from('holidays').select('*').eq('tenant_id', tenant_id).order('date');
  if (year) q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ holidays: data ?? [] });
});

leaveRouter.post('/holidays', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const role      = req.user!.role;
  if (role !== 'admin' && role !== 'hr_manager' && role !== 'hr') return res.status(403).json({ error: 'Insufficient permissions' });

  const parsed = HolidaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const { data, error } = await supabase.from('holidays').insert({ ...parsed.data, tenant_id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ holiday: data });
});

leaveRouter.delete('/holidays/:id', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const role      = req.user!.role;
  if (role !== 'admin' && role !== 'hr_manager' && role !== 'hr') return res.status(403).json({ error: 'Insufficient permissions' });

  const { error } = await supabase.from('holidays').delete().eq('id', req.params.id).eq('tenant_id', tenant_id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});
