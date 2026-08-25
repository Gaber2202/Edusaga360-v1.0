/**
 * SCRUM-118: Share enrollment contract — BOTH email AND WhatsApp must succeed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailConfigured, sendEmail } from './email.js';
import { getProvider } from './messaging/registry.js';
import { decryptSecret, isAiCryptoConfigured } from '../lib/aiCrypto.js';
import { normalizePhone } from '../lib/phone.js';
import { renderEnrollmentContractPdf } from './contractPdf.js';

export interface ContractShareResult {
  email: { success: boolean; error?: string };
  whatsapp: { success: boolean; error?: string };
  bothSucceeded: boolean;
  signingUrl: string;
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL || 'http://localhost:5173';

async function sendWhatsApp(
  supabase: SupabaseClient,
  tenantId: string,
  to: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const { data: connectors } = await supabase
    .from('messaging_connectors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('channel', ['whatsapp']);

  const connector = (connectors ?? []).find((c) => (c.provider as string) === 'infobip')
    || (connectors ?? []).find((c) => String(c.provider).includes('meta'))
    || (connectors ?? [])[0];

  if (connector) {
    const provider = getProvider(String(connector.provider));
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
        { channel: 'whatsapp', to: normalizePhone(to), text },
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  // Fallback: platform Infobip env
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = (process.env.INFOBIP_BASE_URL ?? '').replace(/\/+$/, '');
  const sender = process.env.INFOBIP_WHATSAPP_SENDER ?? '447860088970';
  if (!apiKey || !baseUrl) {
    return { success: false, error: 'No WhatsApp connector and INFOBIP_* env not set' };
  }

  try {
    const res = await fetch(`${baseUrl}/whatsapp/1/message/text`, {
      method: 'POST',
      headers: {
        Authorization: `App ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: normalizePhone(to),
        content: { text },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { requestError?: { serviceException?: { text?: string } } };
      return { success: false, error: body?.requestError?.serviceException?.text || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function shareContractBothChannels(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    contract: Record<string, unknown>;
    tenant?: { name_en?: string | null; name_ar?: string | null; logo_url?: string | null; jurisdiction_code?: string | null };
    sentBy?: string | null;
  },
): Promise<ContractShareResult> {
  const { tenantId, contract, tenant, sentBy } = opts;
  const email = String(contract.guardian_email || '').trim();
  const phone = String(contract.guardian_phone || '').trim();
  const signingUrl = `${PUBLIC_BASE_URL}/ParentSignContract?id=${contract.id}`;

  if (!email) {
    return {
      email: { success: false, error: 'Guardian email missing' },
      whatsapp: { success: false, error: 'skipped' },
      bothSucceeded: false,
      signingUrl,
    };
  }
  if (!phone) {
    return {
      email: { success: false, error: 'skipped' },
      whatsapp: { success: false, error: 'Guardian phone missing' },
      bothSucceeded: false,
      signingUrl,
    };
  }

  const studentName = String(contract.student_name || 'Student');
  const contractNumber = String(contract.contract_number || contract.id);
  const schoolName = tenant?.name_en || tenant?.name_ar || 'School';

  let pdfBase64 = '';
  try {
    const pdf = await renderEnrollmentContractPdf({
      schoolNameEn: tenant?.name_en,
      schoolNameAr: tenant?.name_ar,
      logoUrl: tenant?.logo_url,
      contractNumber,
      studentName,
      guardianName: String(contract.guardian_name || ''),
      academicYear: String(contract.academic_year || ''),
      grade: String(contract.grade || ''),
      netAmount: contract.net_amount != null ? Number(contract.net_amount) : null,
      contentEn: String(contract.generated_content_en || ''),
      contentAr: String(contract.generated_content_ar || ''),
      jurisdictionCode: tenant?.jurisdiction_code,
    });
    pdfBase64 = pdf.toString('base64');
  } catch (err) {
    console.warn('[contractShare] PDF render failed (continuing without attachment):', err);
  }

  const emailHtml = `
    <p>Dear Parent,</p>
    <p>Please review and sign the enrollment contract for <strong>${studentName}</strong> (${contractNumber}).</p>
    <p><a href="${signingUrl}">Open signing page</a> (parent portal login required).</p>
    <p>Regards,<br/>${schoolName}</p>
    <hr/>
    <p dir="rtl">عزيزي ولي الأمر، يرجى مراجعة وتوقيع عقد تسجيل <strong>${studentName}</strong>.</p>
  `;

  let emailResult: { success: boolean; error?: string } = { success: false };
  if (!isEmailConfigured()) {
    emailResult = { success: false, error: 'Email (Infobip) not configured' };
  } else {
    try {
      await sendEmail({
        to: email,
        subject: `Enrollment contract ${contractNumber} — please sign`,
        html: emailHtml + (pdfBase64
          ? `<p><em>PDF attached via secure signing page.</em></p>`
          : ''),
      });
      emailResult = { success: true };
    } catch (err) {
      emailResult = { success: false, error: (err as Error).message };
    }
  }

  const waText =
    `Enrollment contract ${contractNumber} for ${studentName}.\n` +
    `Please sign (parent portal login required):\n${signingUrl}\n\n` +
    `———\n` +
    `عقد تسجيل ${contractNumber} للطالب ${studentName}.\n` +
    `يرجى التوقيع عبر بوابة ولي الأمر:\n${signingUrl}`;

  const waResult = await sendWhatsApp(supabase, tenantId, phone, waText);

  const bothSucceeded = emailResult.success && waResult.success;

  await Promise.resolve(
    supabase.from('contract_delivery_logs').insert({
      tenant_id: tenantId,
      contract_id: contract.id,
      contract_number: contractNumber,
      student_id: contract.student_id,
      student_name: studentName,
      guardian_email: email,
      guardian_phone: phone,
      channel: 'both',
      status: bothSucceeded ? 'sent' : 'failed',
      error_message: bothSucceeded
        ? null
        : `email=${emailResult.error || 'ok'}; whatsapp=${waResult.error || 'ok'}`,
      sent_by: sentBy || null,
    }),
  ).catch(() => {});

  if (bothSucceeded) {
    await supabase.from('student_contracts').update({
      status: 'sent',
      sent_date: new Date().toISOString(),
      sent_via: ['email', 'whatsapp'],
      delivery_status: 'sent',
    }).eq('id', contract.id).eq('tenant_id', tenantId);
  }

  return { email: emailResult, whatsapp: waResult, bothSucceeded, signingUrl };
}
