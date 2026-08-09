import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, PAYROLL_ROLES } from '../middleware/auth.js';
import { resolvePack } from '../packs/registry.js';
import { buildRequestContext, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';

export const payrollRouter = Router();

// ─── Validation schemas ────────────────────────────────────────────────────

const CalculatePayrollSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  employee_ids: z.array(z.string().uuid()).optional(),
  branch_id: z.string().uuid().optional(),
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
    const branch_id = parsed.data.branch_id ?? (req.query.branch_id as string | undefined);
    const ctx = await buildRequestContext(supabase, tenant_id, branch_id);
    const pack = resolvePack(ctx);
    const payroll = pack.payroll;
    if (!payroll || !payroll.calculatePayroll) {
      throw new NotImplementedInJurisdiction(pack.code, 'PayrollService.calculatePayroll');
    }
    const { period_start, period_end, employee_ids } = parsed.data;

    const result = await payroll.calculatePayroll(
      supabase,
      tenant_id,
      { start: period_start, end: period_end },
      employee_ids,
      branch_id,
    );

    return res.json(result);
  } catch (err: any) {
    console.error('Failed to calculate payroll:', err);
    if (err instanceof NotImplementedInJurisdiction || err.name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: err.message, code: 501, feature: err.feature });
    }
    if (err.status === 404) {
      return res.status(404).json({ error: err.message, code: 404 });
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
    const payroll = pack.payroll;
    if (!payroll || !payroll.calculateGosiForEmployees) {
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

    const { employees, totals } = payroll.calculateGosiForEmployees(parsed.data.employees);
    return res.json({ employees, totals });
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
    const payroll = pack.payroll;
    if (!payroll || !payroll.generateWpsFile) {
      throw new NotImplementedInJurisdiction(pack.code, 'PayrollService.generateWpsFile');
    }
    const generateWpsFile = payroll.generateWpsFile;

    const { filename, content } = await generateWpsFile(supabase, tenant_id, {
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
