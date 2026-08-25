/**
 * SCRUM-123: Deliver payslips via Infobip email + WhatsApp.
 * PDF attachment on email (retained after link expiry) + secure link (30 days).
 */

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRequestContext, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';
import { isEmailConfigured, sendEmail } from './email.js';
import { getProvider } from './messaging/registry.js';
import { decryptSecret, isAiCryptoConfigured } from '../lib/aiCrypto.js';
import { normalizePhone } from '../lib/phone.js';

const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || process.env.VITE_PUBLIC_BASE_URL || 'http://localhost:3000';
export const PAYSLIP_LINK_TTL_DAYS = 30;

export interface PayslipDeliveryResult {
  email: { success: boolean; error?: string };
  whatsapp: { success: boolean; error?: string };
  bothSucceeded: boolean;
  secureUrl: string;
  expiresAt: string;
  token: string;
}

function linkSecret(): string {
  return process.env.PAYSLIP_LINK_SECRET || process.env.JWT_SECRET || 'dev-payslip-secret';
}

function signToken(payload: string): string {
  return crypto.createHmac('sha256', linkSecret()).update(payload).digest('base64url');
}

export function createPayslipShareToken(
  tenantId: string,
  payslipId: string,
  employeeId: string,
  expiresAt: Date,
): string {
  const exp = expiresAt.toISOString();
  const payload = `${tenantId}|${payslipId}|${employeeId}|${exp}`;
  const sig = signToken(payload);
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

export function verifyPayslipShareToken(token: string): {
  tenant_id: string;
  payslip_id: string;
  employee_id: string;
  expires_at: string;
} | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split('|');
    if (parts.length !== 5) return null;
    const [tenant_id, payslip_id, employee_id, exp, sig] = parts;
    if (!tenant_id || !payslip_id || !employee_id || !exp || !sig) return null;
    if (new Date(exp) < new Date()) return null;
    const payload = `${tenant_id}|${payslip_id}|${employee_id}|${exp}`;
    const expected = signToken(payload);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return { tenant_id, payslip_id, employee_id, expires_at: exp };
  } catch {
    return null;
  }
}

export function payslipPublicViewUrl(token: string): string {
  return `${PUBLIC_BASE_URL}/api/public/payroll/payslips/view?token=${encodeURIComponent(token)}`;
}

export function payslipLinkExpiresAt(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + PAYSLIP_LINK_TTL_DAYS);
  return d;
}

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

  const connector =
    (connectors ?? []).find((c) => (c.provider as string) === 'infobip') ||
    (connectors ?? []).find((c) => String(c.provider).includes('meta')) ||
    (connectors ?? [])[0];

  if (connector) {
    const provider = getProvider(String(connector.provider));
    if (!provider) return { success: false, error: `Unknown provider ${connector.provider}` };
    let credentials: Record<string, string> = {};
    if (isAiCryptoConfigured() && connector.credentials) {
      try {
        credentials = JSON.parse(decryptSecret(connector.credentials as string)) as Record<string, string>;
      } catch {
        /* ignore */
      }
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
      const body = (await res.json().catch(() => ({}))) as {
        requestError?: { serviceException?: { text?: string } };
      };
      return {
        success: false,
        error: body?.requestError?.serviceException?.text || `HTTP ${res.status}`,
      };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Build payslip PDF buffer using jurisdiction pack (same path as /payslip-pdf). */
export async function renderPayslipPdfBuffer(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    payslipId: string;
    employeeId: string;
    periodMonth: number;
    periodYear: number;
  },
): Promise<Buffer> {
  const { tenantId, payslipId, employeeId, periodMonth, periodYear } = opts;

  const { data: rawEmployee, error: empError } = await supabase
    .from('employees')
    .select(
      'id, employee_number, name_ar, name_en, job_title_name, bank_iban, nationality, hire_date, department_name, branch_id, basic_salary, housing_allowance, transport_allowance, other_allowances',
    )
    .eq('id', employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (empError || !rawEmployee) throw new Error('Employee not found');
  const employee = rawEmployee as Record<string, unknown>;

  const { data: rawTenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name_ar, name_en, logo_url')
    .eq('id', tenantId)
    .single();
  if (tenantError || !rawTenant) throw tenantError ?? new Error('Tenant not found');
  const tenant = rawTenant as Record<string, unknown>;

  let branchNameAr: string | null = null;
  let branchNameEn: string | null = null;
  if (employee.branch_id) {
    const { data: bd } = await supabase
      .from('branches')
      .select('name_ar, name_en')
      .eq('id', employee.branch_id as string)
      .eq('tenant_id', tenantId)
      .single();
    if (bd) {
      const b = bd as Record<string, unknown>;
      branchNameAr = (b.name_ar as string) ?? null;
      branchNameEn = (b.name_en as string) ?? null;
    }
  }

  const ctx = await buildRequestContext(supabase, tenantId, (employee.branch_id as string) ?? undefined);
  const pack = resolvePack(ctx);
  if (!pack.documents?.renderPayslipPdf) {
    throw new NotImplementedInJurisdiction(pack.code, 'payslip PDF');
  }

  const { data: rawPayslip, error: payslipError } = await supabase
    .from('payslip_lines')
    .select('*')
    .eq('id', payslipId)
    .eq('tenant_id', tenantId)
    .single();

  let pv: Record<string, unknown>;
  if (payslipError || !rawPayslip) {
    const basic = Number(employee.basic_salary ?? 0);
    const otherSum = Object.values((employee.other_allowances as Record<string, unknown>) ?? {}).reduce(
      (sum: number, v) => sum + Number(v ?? 0),
      0,
    );
    let employeeContrib = 0;
    let employerContrib = 0;
    try {
      if (pack.payroll?.calculateGosi) {
        const g = pack.payroll.calculateGosi(basic, employee.nationality as string);
        employeeContrib = g.employee;
        employerContrib = g.employer;
      }
    } catch (e) {
      if (!(e instanceof NotImplementedInJurisdiction || (e as Error).name === 'NotImplementedInJurisdiction')) {
        throw e;
      }
    }
    pv = {
      basic_salary: basic,
      housing_allowance: Number(employee.housing_allowance ?? 0),
      transport_allowance: Number(employee.transport_allowance ?? 0),
      teaching_allowance: 0,
      overtime: 0,
      bonus: 0,
      other_allowances: otherSum,
      gosi_employee: employeeContrib,
      absence_deduction: 0,
      loan_deduction: 0,
      tuition_advance: 0,
      penalties: 0,
      other_deductions: 0,
      gosi_employer: employerContrib,
    };
  } else {
    pv = rawPayslip as Record<string, unknown>;
  }

  return pack.documents.renderPayslipPdf({
    name_ar: employee.name_ar ?? null,
    name_en: employee.name_en ?? null,
    employee_number: employee.employee_number ?? null,
    job_title_name: employee.job_title_name ?? null,
    iban: employee.bank_iban ?? null,
    nationality: employee.nationality ?? null,
    hire_date: employee.hire_date ?? null,
    department_name: employee.department_name ?? null,
    branch_name_ar: branchNameAr,
    branch_name_en: branchNameEn,
    company_name_ar: tenant.name_ar ?? null,
    company_name_en: tenant.name_en ?? null,
    logo_url: tenant.logo_url ?? null,
    period_month: periodMonth,
    period_year: periodYear,
    ...pv,
  });
}

export async function deliverPayslipBothChannels(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    payslipId: string;
    employeeId: string;
    periodMonth: number;
    periodYear: number;
    sentBy?: string | null;
  },
): Promise<PayslipDeliveryResult> {
  const { tenantId, payslipId, employeeId, periodMonth, periodYear, sentBy } = opts;

  const { data: emp, error: empErr } = await supabase
    .from('employees')
    .select('id, name_ar, name_en, email, personal_email, phone')
    .eq('id', employeeId)
    .eq('tenant_id', tenantId)
    .single();
  if (empErr || !emp) throw new Error('Employee not found');

  const email = String((emp as { email?: string; personal_email?: string }).email
    || (emp as { personal_email?: string }).personal_email
    || '').trim();
  const phone = String((emp as { phone?: string }).phone || '').trim();
  const nameEn = String((emp as { name_en?: string }).name_en || (emp as { name_ar?: string }).name_ar || 'Employee');
  const nameAr = String((emp as { name_ar?: string }).name_ar || nameEn);
  const periodLabel = `${String(periodMonth).padStart(2, '0')}/${periodYear}`;

  const expiresAt = payslipLinkExpiresAt();
  const token = createPayslipShareToken(tenantId, payslipId, employeeId, expiresAt);
  const secureUrl = payslipPublicViewUrl(token);

  let pdfBase64 = '';
  try {
    const pdf = await renderPayslipPdfBuffer(supabase, {
      tenantId,
      payslipId,
      employeeId,
      periodMonth,
      periodYear,
    });
    pdfBase64 = pdf.toString('base64');
  } catch (err) {
    console.warn('[payslipDelivery] PDF render failed:', err);
  }

  const emailHtml = `
    <p>Dear ${nameEn},</p>
    <p>Your payslip for <strong>${periodLabel}</strong> is ready.</p>
    <p><a href="${secureUrl}">View / download payslip</a> (link expires in ${PAYSLIP_LINK_TTL_DAYS} days).</p>
    <p>The PDF is also attached so you keep a copy after the link expires.</p>
    <p>Regards,<br/>HR</p>
    <hr/>
    <p dir="rtl">عزيزي/عزيزتي ${nameAr}، كشف راتبك لشهر <strong>${periodLabel}</strong> جاهز.</p>
    <p dir="rtl"><a href="${secureUrl}">عرض / تحميل كشف الراتب</a> (ينتهي الرابط بعد ${PAYSLIP_LINK_TTL_DAYS} يوماً).</p>
  `;

  let emailResult: { success: boolean; error?: string } = { success: false };
  if (!email) {
    emailResult = { success: false, error: 'Employee email missing' };
  } else if (!isEmailConfigured()) {
    emailResult = { success: false, error: 'Email (Infobip) not configured' };
  } else {
    try {
      await sendEmail({
        to: email,
        subject: `Payslip ${periodLabel} / كشف الراتب ${periodLabel}`,
        html: emailHtml,
        attachments: pdfBase64
          ? [
              {
                fileName: `payslip_${periodMonth}_${periodYear}.pdf`,
                contentType: 'application/pdf',
                contentBase64: pdfBase64,
              },
            ]
          : undefined,
      });
      emailResult = { success: true };
    } catch (err) {
      emailResult = { success: false, error: (err as Error).message };
    }
  }

  let waResult: { success: boolean; error?: string } = { success: false };
  if (!phone) {
    waResult = { success: false, error: 'Employee phone missing' };
  } else {
    const waText =
      `Your payslip for ${periodLabel} is ready.\n` +
      `Secure link (expires in ${PAYSLIP_LINK_TTL_DAYS} days):\n${secureUrl}\n\n` +
      `———\n` +
      `كشف راتبك لشهر ${periodLabel} جاهز.\n` +
      `رابط آمن (ينتهي بعد ${PAYSLIP_LINK_TTL_DAYS} يوماً):\n${secureUrl}`;
    waResult = await sendWhatsApp(supabase, tenantId, phone, waText);
  }

  const bothSucceeded = emailResult.success && waResult.success;

  await Promise.resolve(
    supabase.from('payslip_share_tokens').insert({
      tenant_id: tenantId,
      payslip_id: payslipId,
      employee_id: employeeId,
      period_month: periodMonth,
      period_year: periodYear,
      token,
      channel: 'link',
      expires_at: expiresAt.toISOString(),
      sent_to: [email, phone].filter(Boolean).join(';') || null,
      created_by: sentBy || null,
    }),
  ).catch(() => {});

  return {
    email: emailResult,
    whatsapp: waResult,
    bothSucceeded,
    secureUrl,
    expiresAt: expiresAt.toISOString(),
    token,
  };
}
