import { Router, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { verifyShareToken, recordInvoiceView, renderInvoicePdf } from '../services/share.js';
import { processMoyasarWebhook } from '../packs/sa/moyasarService.js';

export const billingPublicRouter = Router();

// ─── POST /api/public/billing/moyasar/webhook ───────────────────────────────
// Public, unauthenticated endpoint for Moyasar server-to-server callbacks.
// Secured by shared-secret verification, idempotency, and event handling.
billingPublicRouter.post('/moyasar/webhook', async (req, res) => {
  try {
    const startMs = Date.now();
    const secret = (req.body?.secret_token as string | undefined) ||
      (req.headers['x-moyasar-secret'] as string | undefined) ||
      (req.headers['x-event-secret'] as string | undefined);

    const result = await processMoyasarWebhook(
      supabase,
      {
        id: (req.body?.id as string) || `moyasar-${Date.now()}`,
        type: (req.body?.type as string) || `payment_${(req.body?.status as string) || 'unknown'}`,
        data: (req.body?.data as Record<string, unknown>) || req.body,
        secret_token: secret,
      },
    );

    if (!result.received) {
      return res.status(401).json({ error: result.error || 'invalid_signature' });
    }

    console.log(`[public/billing/moyasar/webhook] processed in ${Date.now() - startMs}ms`);
    return res.json(result);
  } catch (err) {
    console.error('[public/billing/moyasar/webhook] error:', err);
    return res.status(500).json({ error: 'webhook_processing_failed', message: (err as Error).message });
  }
});

// ─── GET /api/public/billing/invoices/view — secure public invoice view ──────
// A tokenized, shareable link that renders the invoice PDF and flips the
// document status to "viewed" with an audit ledger entry.
billingPublicRouter.get('/invoices/view', async (req, res) => {
  try {
    const token = req.query.token as string;
    if (!token) return res.status(400).json({ error: 'missing_token' });

    const payload = verifyShareToken(token);
    if (!payload) return res.status(403).json({ error: 'invalid_or_expired_token' });

    const { tenant_id, invoice_id } = payload;

    await recordInvoiceView(supabase, tenant_id, invoice_id);

    const pdfBuffer = await renderInvoicePdf(supabase, tenant_id, invoice_id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="invoice.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[public/billing/invoices/view] error:', err);
    return res.status(500).json({ error: 'failed_to_render_invoice' });
  }
});

async function studentGuardian(tenantId: string, studentId: string, supabaseClient: SupabaseClient): Promise<string | null> {
  const { data } = await supabaseClient
    .from('students')
    .select('guardian_id')
    .eq('tenant_id', tenantId)
    .eq('id', studentId)
    .maybeSingle();
  return (data as { guardian_id?: string } | null)?.guardian_id ?? null;
}
