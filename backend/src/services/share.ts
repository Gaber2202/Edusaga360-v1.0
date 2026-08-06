import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRequestContext, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';
import { getProvider } from './messaging/registry.js';
import { isEmailConfigured, sendEmail } from './email.js';
import { decryptSecret, isAiCryptoConfigured } from '../lib/aiCrypto.js';
import { getTenantComplianceData } from './tenant.js';
import { writeLedger } from './collections/ledgerWriter.js';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL || 'http://localhost:3000';
const LINK_SECRET = process.env.INVOICE_LINK_SECRET || process.env.JWT_SECRET || '';

export type ShareChannel = 'whatsapp' | 'email' | 'link' | 'print';

export interface ShareResult {
  channel: ShareChannel;
  success: boolean;
  token?: string;
  url?: string;
  sent_to?: string;
  error?: string;
}

interface ShareContext {
  tenant: Awaited<ReturnType<typeof getTenantComplianceData>>;
  invoice: Record<string, unknown>;
  studentNameAr: string;
  studentNameEn: string;
  guardianNameAr: string;
  guardianNameEn: string;
  phone: string;
  email: string;
  pdfBase64: string;
}

function signToken(payload: string): string {
  return crypto.createHmac('sha256', LINK_SECRET).update(payload).digest('base64url');
}

export function createShareToken(invoiceId: string, tenantId: string, expiresAt?: Date): string {
  const exp = expiresAt ? expiresAt.toISOString() : '';
  const payload = `${tenantId}|${invoiceId}|${exp}`;
  const sig = signToken(payload);
  return Buffer.from(`${tenantId}|${invoiceId}|${exp}|${sig}`).toString('base64url');
}

export function verifyShareToken(token: string): { tenant_id: string; invoice_id: string; expires_at?: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const [tenant_id, invoice_id, exp, sig] = decoded.split('|');
    if (!tenant_id || !invoice_id || !sig) return null;
    if (exp && new Date(exp) < new Date()) return null;
    const payload = `${tenant_id}|${invoice_id}|${exp}`;
    const expected = signToken(payload);
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { tenant_id, invoice_id, expires_at: exp || undefined };
  } catch {
    return null;
  }
}

export function publicViewUrl(token: string): string {
  return `${PUBLIC_BASE_URL}/api/public/billing/invoices/view?token=${encodeURIComponent(token)}`;
}

async function loadInvoice(supabase: SupabaseClient, invoiceId: string, tenantId: string) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, students(name_en, name_ar, guardian_id, guardians(name_en, name_ar, phone, email))')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (error || !data) throw new Error('Invoice not found');
  return data as Record<string, unknown>;
}

async function buildShareContext(supabase: SupabaseClient, invoice: Record<string, unknown>): Promise<ShareContext> {
  const student = (invoice.students as Record<string, unknown> | undefined) || {};
  const guardian = (student.guardians as Record<string, unknown> | undefined) || {};
  const tenant = await getTenantComplianceData(invoice.tenant_id as string);
  const invoiceId = invoice.id as string;
  const tenantId = invoice.tenant_id as string;

  const ctx = await buildRequestContext(supabase, tenantId, (invoice.branch_id as string) ?? undefined);
  const pack = resolvePack(ctx);
  if (!pack.documents?.renderInvoicePdf) {
    throw new NotImplementedInJurisdiction(ctx.tenant.jurisdictionCode, 'invoice PDF for sharing');
  }

  const pdfBuffer = await pack.documents.renderInvoicePdf(
    await loadInvoice(supabase, invoiceId, tenantId),
    tenant,
  );
  const pdfBase64 = pdfBuffer.toString('base64');

  return {
    tenant,
    invoice,
    studentNameAr: (student.name_ar as string) || (invoice.student_name as string) || 'ابنكم/ابنتكم',
    studentNameEn: (student.name_en as string) || (invoice.student_name as string) || 'your child',
    guardianNameAr: (guardian.name_ar as string) || 'ولي الأمر',
    guardianNameEn: (guardian.name_en as string) || 'Parent',
    phone: (guardian.phone as string) || '',
    email: (guardian.email as string) || '',
    pdfBase64,
  };
}

async function sendWhatsAppShare(
  supabase: SupabaseClient,
  tenantId: string,
  to: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: connectors } = await supabase
    .from('messaging_connectors')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('channel', ['whatsapp']);

  // Prefer Infobip if configured, otherwise Meta WhatsApp Cloud.
  const connector = (connectors ?? []).find((c) => (c.provider as string) === 'infobip')
    || (connectors ?? []).find((c) => (c.provider as string) === 'meta-whatsapp')
    || (connectors ?? [])[0];

  if (!connector) return { success: false, error: 'No active WhatsApp connector configured' };
  const provider = getProvider(connector.provider as string);
  if (!provider) return { success: false, error: `Unknown provider ${connector.provider}` };

  let credentials: Record<string, string> = {};
  if (isAiCryptoConfigured() && connector.credentials) {
    try {
      credentials = JSON.parse(decryptSecret(connector.credentials as string)) as Record<string, string>;
    } catch { /* ignore */ }
  }

  try {
    await provider.send(
      { config: (connector.config as Record<string, unknown>) || {}, credentials },
      { to, text, channel: 'whatsapp' },
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function shareInvoice(
  supabase: SupabaseClient,
  tenantId: string,
  invoiceId: string,
  channels: ShareChannel[],
  options?: { phone?: string; email?: string; createdBy?: string; expiresInHours?: number },
): Promise<ShareResult[]> {
  const invoice = await loadInvoice(supabase, invoiceId, tenantId);
  const ctx = await buildShareContext(supabase, invoice);
  const results: ShareResult[] = [];

  for (const channel of channels) {
    if (channel === 'print') {
      results.push({ channel, success: true, url: `data:application/pdf;base64,${ctx.pdfBase64}` });
      continue;
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (options?.expiresInHours || 168)); // 7 days default
    const token = createShareToken(invoiceId, tenantId, expiresAt);
    const url = publicViewUrl(token);

    let sentTo: string | undefined;
    let success = true;
    let error: string | undefined;

    if (channel === 'link') {
      // No outbound send; the link is the deliverable.
      sentTo = options?.email || options?.phone || ctx.email || ctx.phone;
    } else if (channel === 'email') {
      sentTo = options?.email || ctx.email;
      if (!sentTo) {
        success = false;
        error = 'No email destination available';
      } else if (!isEmailConfigured()) {
        success = false;
        error = 'Email provider not configured';
      } else {
        try {
          const invoiceNumber = ctx.invoice.invoice_number as string;
          const html = `
            <div dir="rtl" style="text-align:right;font-family:Arial,Noto Naskh Arabic,sans-serif;">
              <p>مرحباً ${ctx.guardianNameAr}،</p>
              <p>تمت مشاركة فاتورة ${invoiceNumber} لـ ${ctx.studentNameAr}.</p>
              <p><a href="${url}">عرض الفاتورة / View invoice</a></p>
              <hr/>
              <p dir="ltr" style="text-align:left;">Dear ${ctx.guardianNameEn}،</p>
              <p dir="ltr" style="text-align:left;">Invoice ${invoiceNumber} for ${ctx.studentNameEn} has been shared with you.</p>
              <p dir="ltr" style="text-align:left;"><a href="${url}">View invoice</a></p>
            </div>`;
          await sendEmail({ to: sentTo, subject: `فاتورة ${invoiceNumber} / Invoice ${invoiceNumber}`, html });
        } catch (err) {
          success = false;
          error = (err as Error).message;
        }
      }
    } else if (channel === 'whatsapp') {
      sentTo = options?.phone || ctx.phone;
      if (!sentTo) {
        success = false;
        error = 'No WhatsApp destination available';
      } else {
        const invoiceNumber = ctx.invoice.invoice_number as string;
        const text = `مرحباً ${ctx.guardianNameAr}،\nفاتورة ${invoiceNumber} (${ctx.studentNameAr}): ${url}\n----\nDear ${ctx.guardianNameEn},\nInvoice ${invoiceNumber} for ${ctx.studentNameEn}: ${url}`;
        const whatsapp = await sendWhatsAppShare(supabase, tenantId, sentTo, text);
        success = whatsapp.success;
        error = whatsapp.error;
      }
    }

    if (success) {
      const { error: insertErr } = await supabase.from('invoice_share_tokens').insert({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        token,
        channel,
        expires_at: expiresAt.toISOString(),
        sent_to: sentTo,
        created_by: options?.createdBy,
      });
      if (insertErr) {
        success = false;
        error = insertErr.message;
      }
    }

    results.push({ channel, success, token, url, sent_to: sentTo, error });

    await writeLedger(supabase, {
      tenant_id: tenantId,
      action_type: 'document_shared',
      actor: options?.createdBy || 'system',
      reference_table: 'invoices',
      reference_id: invoiceId,
      input_snapshot: { channel, sent_to: sentTo, token },
      decision: success ? 'shared' : 'failed',
      outcome: { success, error },
    });
  }

  return results;
}

export async function recordInvoiceView(
  supabase: SupabaseClient,
  tenantId: string,
  invoiceId: string,
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();

  const { data: current } = await supabase
    .from('invoices')
    .select('view_count, status')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();

  const updates: Record<string, unknown> = {
    viewed_at: now,
    view_count: ((current?.view_count as number) || 0) + 1,
  };
  if ((current?.status as string) === 'issued') {
    updates.status = 'viewed';
  }

  const { data: updated, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error || !updated) throw new Error('Invoice not found');

  await writeLedger(supabase, {
    tenant_id: tenantId,
    action_type: 'document_viewed',
    actor: 'public_link',
    reference_table: 'invoices',
    reference_id: invoiceId,
    input_snapshot: { viewed_at: now },
    decision: 'viewed',
    outcome: { status: updated.status },
  });

  return updated as Record<string, unknown>;
}

export async function renderInvoicePdf(supabase: SupabaseClient, tenantId: string, invoiceId: string): Promise<Buffer> {
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (error || !invoice) throw new Error('Invoice not found');

  const tenant = await getTenantComplianceData(tenantId);
  const ctx = await buildRequestContext(supabase, tenantId, (invoice.branch_id as string) ?? undefined);
  const pack = resolvePack(ctx);
  if (!pack.documents?.renderInvoicePdf) {
    throw new NotImplementedInJurisdiction(ctx.tenant.jurisdictionCode, 'invoice PDF');
  }
  return pack.documents.renderInvoicePdf(invoice as Record<string, unknown>, tenant);
}
