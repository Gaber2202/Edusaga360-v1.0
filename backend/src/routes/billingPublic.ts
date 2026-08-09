import { Router, Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.js';
import { buildRequestContext, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';
import { verifyShareToken, recordInvoiceView, renderInvoicePdf } from '../services/share.js';

export const billingPublicRouter = Router();

// ─── POST /api/public/billing/moyasar/webhook ───────────────────────────────
// Public, unauthenticated endpoint for Moyasar server-to-server callbacks.
// Secured by shared-secret verification, idempotency, and event handling.
// The route resolves the invoice's tenant and branch, then delegates to the
// jurisdiction pack's processWebhook so non-Moyasar jurisdictions reject
// before any write.
billingPublicRouter.post('/moyasar/webhook', async (req, res) => {
  try {
    const startMs = Date.now();
    const secret = (req.body?.secret_token as string | undefined) ||
      (req.headers['x-moyasar-secret'] as string | undefined) ||
      (req.headers['x-event-secret'] as string | undefined);

    const bodyData = (req.body?.data as Record<string, unknown>) || req.body;
    const metadata = (bodyData?.metadata as Record<string, string>) || {};

    // Tenant/invoice MUST be derived from our own moyasar_invoices row, keyed by
    // the external Moyasar invoice id. Payload metadata is attacker-controllable.
    const moyasarInvoiceId = bodyData?.invoice_id as string | undefined;
    if (!moyasarInvoiceId) {
      console.warn('[public/billing/moyasar/webhook] rejected: missing moyasar invoice id');
      return res.status(400).json({ error: 'missing_moyasar_invoice_id' });
    }

    const { data: moyasarInvoice } = await supabase
      .from('moyasar_invoices')
      .select('edusaga_invoice_id, tenant_id')
      .eq('moyasar_id', moyasarInvoiceId)
      .maybeSingle();

    if (!moyasarInvoice) {
      console.warn('[public/billing/moyasar/webhook] rejected: moyasar invoice not found');
      return res.status(404).json({ error: 'moyasar_invoice_not_found' });
    }

    const tenantId = (moyasarInvoice.tenant_id as string) || '';
    const invoiceId = (moyasarInvoice.edusaga_invoice_id as string) || '';

    // Defensive: if the payload metadata claims a different tenant/invoice, reject.
    if (metadata.tenant_id && metadata.tenant_id !== tenantId) {
      console.warn('[public/billing/moyasar/webhook] rejected: metadata tenant mismatch');
      return res.status(400).json({ error: 'metadata_tenant_mismatch' });
    }
    const metaInvoiceId = metadata.edusaga_invoice_id || metadata.invoice_id;
    if (metaInvoiceId && invoiceId && metaInvoiceId !== invoiceId) {
      console.warn('[public/billing/moyasar/webhook] rejected: metadata invoice mismatch');
      return res.status(400).json({ error: 'metadata_invoice_mismatch' });
    }

    if (!tenantId) {
      console.warn('[public/billing/moyasar/webhook] rejected: missing tenant_id');
      return res.status(400).json({ error: 'missing_tenant_id' });
    }

    // Resolve the pack for the invoice's branch if we can find it; otherwise
    // fall back to the tenant-level jurisdiction. A non-Moyasar jurisdiction
    // must reject before any payment write.
    const { data: invoice } = await supabase
      .from('invoices')
      .select('branch_id')
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const branchId = (invoice?.branch_id as string) || undefined;

    const ctx = await buildRequestContext(supabase, tenantId, branchId);
    const pack = resolvePack(ctx);

    if (!pack.payments?.processWebhook) {
      console.warn(`[public/billing/moyasar/webhook] rejected for jurisdiction ${pack.code}: not a Moyasar-enabled jurisdiction`);
      return res.status(501).json({
        error: 'payment_webhook_not_supported_for_jurisdiction',
        jurisdiction: pack.code,
      });
    }

    const payload = {
      id: (req.body?.id as string) || `moyasar-${Date.now()}`,
      type: (req.body?.type as string) || `payment_${(req.body?.status as string) || 'unknown'}`,
      data: bodyData,
      secret_token: secret,
    };

    const result = await pack.payments.processWebhook(supabase, payload, secret) as { received?: boolean; error?: string };
    if (!result?.received) {
      return res.status(401).json({ error: result?.error || 'invalid_signature' });
    }

    console.log(`[public/billing/moyasar/webhook] processed in ${Date.now() - startMs}ms`);
    return res.json(result);
  } catch (err) {
    if (err instanceof NotImplementedInJurisdiction || (err as any).name === 'NotImplementedInJurisdiction') {
      return res.status(501).json({ error: (err as Error).message, code: 501, feature: (err as any).feature });
    }
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
