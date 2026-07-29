/**
 * OTP / PIN code service — generates, hashes, delivers and verifies one-time
 * codes over SMS, WhatsApp or email using Infobip.
 *
 * The service is purpose-agnostic: it powers MFA login, enrollment, and any
 * future step-up PIN flow (invoice approval, contract signing, etc.).
 */
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../lib/phone.js';
import { assertPublicUrl } from '../lib/ssrfGuard.js';
import { sendEmail } from './email.js';

const OTP_SECRET = process.env.OTP_SECRET || process.env.ADMIN_LINK_SECRET || 'dev-only-otp-secret-change-me';

export type OtpChannel = 'sms' | 'whatsapp' | 'email';

export interface OtpRecord {
  id: string;
  tenant_id: string | null;
  user_id: string;
  purpose: string;
  channel: OtpChannel;
  destination: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  verified: boolean;
  invalidated: boolean;
  delivery_status: string;
  delivery_attempts: unknown[];
}

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
  channel?: OtpChannel;
}

export function generateCode(length = 6): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return randomInt(min, max).toString().padStart(length, '0');
}

export function hashCode(code: string): string {
  return createHmac('sha256', OTP_SECRET).update(code).digest('hex');
}

export function maskDestination(channel: OtpChannel, destination: string): string {
  if (channel === 'email') {
    const [local, domain] = destination.split('@');
    if (!domain) return destination;
    const masked = local.length > 2 ? `${local.slice(0, 2)}***${local.slice(-1)}` : '***';
    return `${masked}@${domain}`;
  }
  // phone
  const digits = destination.replace(/\D/g, '');
  if (digits.length > 4) {
    return `+${digits.slice(0, digits.length - 4)}****${digits.slice(-2)}`;
  }
  return destination;
}

export function isCodeValid(record: OtpRecord, input: string): boolean {
  if (record.verified || record.invalidated) return false;
  if (record.attempts >= record.max_attempts) return false;
  if (new Date(record.expires_at) < new Date()) return false;

  const inputHash = hashCode(input);
  const recordHash = Buffer.from(record.code_hash, 'hex');
  const inputBuf = Buffer.from(inputHash, 'hex');
  if (recordHash.length !== inputBuf.length) return false;
  return timingSafeEqual(recordHash, inputBuf);
}

export async function invalidateExistingCodes(userId: string, purpose: string): Promise<void> {
  await supabase
    .from('otp_codes')
    .update({ invalidated: true })
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .eq('verified', false)
    .eq('invalidated', false);
}

export async function createOtpRecord(input: {
  tenantId?: string | null;
  userId: string;
  purpose: string;
  channel: OtpChannel;
  destination: string;
  code: string;
  expiresInMinutes?: number;
  maxAttempts?: number;
  deliveryStatus?: string;
  deliveryAttempts?: unknown[];
}): Promise<string> {
  const { data, error } = await supabase
    .from('otp_codes')
    .insert({
      tenant_id: input.tenantId ?? null,
      user_id: input.userId,
      purpose: input.purpose,
      channel: input.channel,
      destination: input.destination,
      code_hash: hashCode(input.code),
      max_attempts: input.maxAttempts ?? 5,
      expires_at: new Date(Date.now() + (input.expiresInMinutes ?? 5) * 60 * 1000).toISOString(),
      delivery_status: input.deliveryStatus ?? 'pending',
      delivery_attempts: input.deliveryAttempts ?? [],
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to store OTP: ${error.message}`);
  return (data as { id: string }).id;
}

export async function verifyOtp(otpId: string, userId: string, input: string): Promise<{ valid: boolean; record?: OtpRecord }> {
  const { data, error } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('id', otpId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return { valid: false };

  const record = data as unknown as OtpRecord;
  if (isCodeValid(record, input)) {
    await supabase
      .from('otp_codes')
      .update({ verified: true })
      .eq('id', otpId);
    return { valid: true, record };
  }

  const attempts = record.attempts + 1;
  const update: { attempts: number; invalidated?: boolean } = { attempts };
  if (attempts >= record.max_attempts) update.invalidated = true;
  await supabase.from('otp_codes').update(update).eq('id', otpId);
  return { valid: false };
}

interface InfobipConfig {
  apiKey: string;
  baseUrl: string;
  smsSender: string;
  whatsappSender: string;
}

function getInfobipConfig(): InfobipConfig | null {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = process.env.INFOBIP_BASE_URL?.replace(/\/+$/, '');
  if (!apiKey || !baseUrl) return null;
  return {
    apiKey,
    baseUrl,
    smsSender: process.env.INFOBIP_SMS_SENDER || 'EduSaga',
    whatsappSender: process.env.INFOBIP_WHATSAPP_SENDER || '447860088970',
  };
}

async function sendInfobipSms(config: InfobipConfig, to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `${config.baseUrl}/sms/2/text/advanced`;
  const normalized = normalizePhone(to);
  try {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `App ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [{ from: config.smsSender, destinations: [{ to: normalized }], text }],
      }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const err = (body as any)?.requestError?.serviceException?.text ?? `HTTP ${res.status}`;
      return { success: false, error: err };
    }
    const messages = (body as any)?.messages ?? [];
    const messageId = messages[0]?.messageId ?? (body as any)?.messageId;
    return { success: true, messageId: messageId ? String(messageId) : undefined };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'SMS send failed' };
  }
}

async function sendInfobipWhatsApp(config: InfobipConfig, to: string, code: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const templateName = process.env.INFOBIP_OTP_WHATSAPP_TEMPLATE ?? process.env.INFOBIP_WHATSAPP_TEMPLATE;
  if (templateName) {
    return sendInfobipWhatsAppTemplate(config, to, templateName, code);
  }
  // No template configured — attempt a plain session message (only works when a session exists).
  const url = `${config.baseUrl}/whatsapp/1/message/text`;
  const normalized = normalizePhone(to);
  try {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `App ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: config.whatsappSender,
        to: normalized,
        content: { text },
      }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const err = (body as any)?.requestError?.serviceException?.text ?? `HTTP ${res.status}`;
      return { success: false, error: err };
    }
    const messageId = (body as any)?.messages?.[0]?.messageId ?? (body as any)?.messageId;
    return { success: true, messageId: messageId ? String(messageId) : undefined };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'WhatsApp send failed' };
  }
}

async function sendInfobipWhatsAppTemplate(
  config: InfobipConfig,
  to: string,
  templateName: string,
  code: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const url = `${config.baseUrl}/whatsapp/1/message/template`;
  const normalized = normalizePhone(to);
  const language = process.env.INFOBIP_OTP_WHATSAPP_TEMPLATE_LANGUAGE ?? process.env.INFOBIP_WHATSAPP_TEMPLATE_LANGUAGE ?? 'en';
  try {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `App ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          from: config.whatsappSender,
          to: normalized,
          content: {
            templateName,
            language,
            templateData: {
              body: {
                placeholders: [code],
              },
            },
          },
        }],
      }),
    });
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const err = (body as any)?.requestError?.serviceException?.text ?? `HTTP ${res.status}`;
      return { success: false, error: err };
    }
    const messageId = (body as any)?.messages?.[0]?.messageId ?? (body as any)?.messageId;
    return { success: true, messageId: messageId ? String(messageId) : undefined };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'WhatsApp template send failed' };
  }
}

export async function deliverOtp(
  channel: OtpChannel,
  destination: string,
  code: string,
  language: 'ar' | 'en' = 'ar',
): Promise<SendOtpResult> {
  const textAr = `رمز التحقق الخاص بك في EduSaga 360 هو: ${code}`;
  const textEn = `Your EduSaga 360 verification code is: ${code}`;
  const text = language === 'ar' ? textAr : textEn;

  if (channel === 'email') {
    const html = `<div dir="${language === 'ar' ? 'rtl' : 'ltr'}" style="text-align:${language === 'ar' ? 'right' : 'left'};font-family:Arial,sans-serif;">
      <h2>${language === 'ar' ? 'رمز التحقق' : 'Verification Code'}</h2>
      <p>${text}</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
      <p>${language === 'ar' ? 'صالح لمدة 5 دقائق.' : 'Valid for 5 minutes.'}</p>
    </div>`;
    const subject = language === 'ar' ? 'رمز التحقق — EduSaga 360' : 'Verification Code — EduSaga 360';
    try {
      await sendEmail({ to: destination, subject, html });
      return { success: true, channel: 'email' };
    } catch (err: any) {
      return { success: false, error: err.message ?? 'Email send failed', channel: 'email' };
    }
  }

  const config = getInfobipConfig();
  if (!config) {
    return { success: false, error: 'Infobip not configured', channel };
  }

  if (channel === 'sms') {
    const result = await sendInfobipSms(config, destination, text);
    return { ...result, channel: 'sms', provider: 'infobip' };
  }

  if (channel === 'whatsapp') {
    const result = await sendInfobipWhatsApp(config, destination, code, text);
    return { ...result, channel: 'whatsapp', provider: 'infobip' };
  }

  return { success: false, error: `Unsupported channel ${channel}`, channel };
}
