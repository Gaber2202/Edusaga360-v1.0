import { Router, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import {
  verifyPayslipShareToken,
  renderPayslipPdfBuffer,
} from '../services/payslipDelivery.js';

export const payrollPublicRouter = Router();

/**
 * GET /api/public/payroll/payslips/view?token=...
 * Unauthenticated secure payslip PDF download (SCRUM-123, 30-day expiry).
 */
payrollPublicRouter.get('/payslips/view', async (req, res: Response) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).json({ error: 'missing_token' });

    const verified = verifyPayslipShareToken(token);
    if (!verified) {
      return res.status(410).json({ error: 'invalid_or_expired_token' });
    }

    const { data: row } = await supabase
      .from('payslip_share_tokens')
      .select('id, period_month, period_year, expires_at, view_count')
      .eq('token', token)
      .eq('tenant_id', verified.tenant_id)
      .maybeSingle();

    if (row?.expires_at && new Date(String(row.expires_at)) < new Date()) {
      return res.status(410).json({ error: 'token_expired' });
    }

    const periodMonth = Number((row as { period_month?: number } | null)?.period_month ?? 0);
    const periodYear = Number((row as { period_year?: number } | null)?.period_year ?? 0);

    // Fallback period from token row only; if missing, reject
    if (!periodMonth || !periodYear) {
      return res.status(404).json({ error: 'share_record_not_found' });
    }

    const pdf = await renderPayslipPdfBuffer(supabase, {
      tenantId: verified.tenant_id,
      payslipId: verified.payslip_id,
      employeeId: verified.employee_id,
      periodMonth,
      periodYear,
    });

    if (row?.id) {
      await Promise.resolve(
        supabase
          .from('payslip_share_tokens')
          .update({
            view_count: Number((row as { view_count?: number }).view_count ?? 0) + 1,
            viewed_at: new Date().toISOString(),
          })
          .eq('id', row.id),
      ).catch(() => {});
    }

    const filename = `payslip_${verified.employee_id}_${periodMonth}_${periodYear}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    return res.send(pdf);
  } catch (err) {
    console.error('[public/payroll/payslips/view]', err);
    return res.status(500).json({ error: 'failed_to_render_payslip' });
  }
});
