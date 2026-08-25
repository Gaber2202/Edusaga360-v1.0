import { Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, PAYROLL_ROLES } from '../middleware/auth.js';
import { NotImplementedInJurisdiction } from '../lib/jurisdiction.js';
import { supabase } from '../lib/supabase.js';
import { deliverPayslipBothChannels, renderPayslipPdfBuffer } from '../services/payslipDelivery.js';

export const payslipPdfRouter = Router();

const PayslipPdfSchema = z.object({
  payslip_id: z.string().uuid(),
  employee_id: z.string().uuid(),
  period_month: z.number().int().min(1).max(12),
  period_year: z.number().int().min(2000).max(2100),
});

payslipPdfRouter.post('/payslip-pdf', requireRole(PAYROLL_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = PayslipPdfSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', code: 400, errors: parsed.error.flatten() });
    }

    const tenant_id = req.user!.tenant_id!;
    const { payslip_id, employee_id, period_month, period_year } = parsed.data;

    const pdfBuffer = await renderPayslipPdfBuffer(supabase, {
      tenantId: tenant_id,
      payslipId: payslip_id,
      employeeId: employee_id,
      periodMonth: period_month,
      periodYear: period_year,
    });

    const filename = `payslip_${employee_id}_${period_month}_${period_year}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; feature?: string };
    if (err instanceof NotImplementedInJurisdiction || e.name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: e.message, code: 501, feature: e.feature });
    }
    console.error('Failed to generate payslip PDF:', err);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate payslip PDF', code: 500 });
  }
});

/** SCRUM-123: Infobip WA + email with PDF attachment and 30-day secure link. */
payslipPdfRouter.post('/payslip-deliver', requireRole(PAYROLL_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = PayslipPdfSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', code: 400, errors: parsed.error.flatten() });
    }

    const tenant_id = req.user!.tenant_id!;
    const { payslip_id, employee_id, period_month, period_year } = parsed.data;

    const result = await deliverPayslipBothChannels(supabase, {
      tenantId: tenant_id,
      payslipId: payslip_id,
      employeeId: employee_id,
      periodMonth: period_month,
      periodYear: period_year,
      sentBy: req.user!.id ?? req.user!.email ?? null,
    });

    const status = result.bothSucceeded ? 200 : 207;
    return res.status(status).json(result);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; feature?: string };
    if (err instanceof NotImplementedInJurisdiction || e.name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: e.message, code: 501, feature: e.feature });
    }
    console.error('Failed to deliver payslip:', err);
    return res.status(500).json({ error: 'Failed to deliver payslip', code: 500 });
  }
});
