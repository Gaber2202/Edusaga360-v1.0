/**
 * SCRUM-115: Bilingual (AR+EN) Infobip WhatsApp messages for admissions stage events.
 * One combined message per event.
 */

import { supabase } from '../lib/supabase.js';
import { normalizePhone } from '../lib/phone.js';
import { assertPublicUrl } from '../lib/ssrfGuard.js';

export type AdmissionsNotifyEvent =
  | 'welcome'
  | 'rejection'
  | 'documents_missing'
  | 'assessment_results'
  | 'interview_scheduling';

type TemplatePair = { ar: string; en: string };

const EVENT_TEMPLATES: Record<AdmissionsNotifyEvent, TemplatePair> = {
  welcome: {
    ar: 'مرحباً {{guardian_name}}،\nتم استلام طلب قبول {{student_name}} للصف {{grade}} بنجاح.\nرقم الطلب: {{application_number}}\nسنتواصل معكم بالخطوات التالية.',
    en: 'Hello {{guardian_name}},\nWe received the admission application for {{student_name}} (grade {{grade}}).\nApplication #: {{application_number}}\nWe will contact you with next steps.',
  },
  rejection: {
    ar: 'عزيزي {{guardian_name}}،\nنأسف لإبلاغكم بأن طلب قبول {{student_name}} لم يُقبل في هذه المرحلة.\nللاستفسار يرجى التواصل مع إدارة القبول.',
    en: 'Dear {{guardian_name}},\nWe regret to inform you that the admission application for {{student_name}} was not accepted at this time.\nPlease contact Admissions for questions.',
  },
  documents_missing: {
    ar: 'عزيزي {{guardian_name}}،\nطلب {{student_name}} يحتاج مستندات ناقصة أو مراجعة حضورية.\nالمستندات الناقصة: {{missing_docs}}\nيرجى زيارة المدرسة لإكمال الإجراءات.',
    en: 'Dear {{guardian_name}},\nThe application for {{student_name}} requires missing documents or an on-site visit.\nMissing: {{missing_docs}}\nPlease visit the school to complete the process.',
  },
  assessment_results: {
    ar: 'عزيزي {{guardian_name}}،\nنتائج تقييم {{student_name}}: {{result_summary}}\nالمرحلة الحالية: {{stage}}',
    en: 'Dear {{guardian_name}},\nAssessment results for {{student_name}}: {{result_summary}}\nCurrent stage: {{stage}}',
  },
  interview_scheduling: {
    ar: 'عزيزي {{guardian_name}}،\nتم جدولة مقابلة لـ {{student_name}}.\nالتاريخ: {{interview_date}} الساعة {{interview_time}}\nالنوع: {{interview_type}}\nالرابط: {{interview_link}}',
    en: 'Dear {{guardian_name}},\nAn interview has been scheduled for {{student_name}}.\nDate: {{interview_date}} at {{interview_time}}\nType: {{interview_type}}\nLink: {{interview_link}}',
  },
};

function interpolate(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = vars[key];
    return value != null ? String(value) : '';
  });
}

function bilingualBody(event: AdmissionsNotifyEvent, vars: Record<string, string | null | undefined>): string {
  const t = EVENT_TEMPLATES[event];
  const ar = interpolate(t.ar, vars);
  const en = interpolate(t.en, vars);
  return `${ar}\n\n———\n\n${en}`;
}

async function sendInfobipWhatsAppText(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.INFOBIP_API_KEY;
  const baseUrl = (process.env.INFOBIP_BASE_URL ?? '').replace(/\/+$/, '');
  const sender = process.env.INFOBIP_WHATSAPP_SENDER ?? '447860088970';

  if (!apiKey) return { success: false, error: 'INFOBIP_API_KEY not configured' };
  if (!baseUrl) return { success: false, error: 'INFOBIP_BASE_URL not configured' };

  try {
    assertPublicUrl(baseUrl);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  const normalised = normalizePhone(to);
  const url = `${baseUrl}/whatsapp/1/message/text`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `App ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: normalised,
        content: { text },
      }),
    });
    const json = await res.json().catch(() => ({})) as { messageId?: string; requestError?: { serviceException?: { text?: string } } };
    if (!res.ok) {
      return {
        success: false,
        error: json?.requestError?.serviceException?.text || `Infobip HTTP ${res.status}`,
      };
    }
    return { success: true, messageId: json.messageId };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function sendAdmissionsStageMessage(opts: {
  tenantId: string;
  application: Record<string, unknown>;
  event: AdmissionsNotifyEvent;
  extra?: Record<string, string | null | undefined>;
}): Promise<{ sent: boolean; skipped?: string; error?: string; messageId?: string }> {
  const { tenantId, application, event, extra = {} } = opts;
  const to = String(application.guardian_whatsapp || application.guardian_phone || '').trim();
  if (!to) return { sent: false, skipped: 'no_guardian_phone' };

  const vars: Record<string, string | null | undefined> = {
    guardian_name: String(application.guardian_name_ar || application.guardian_name_en || ''),
    student_name: String(application.student_name_ar || application.student_name_en || ''),
    grade: String(application.applying_for_grade || ''),
    application_number: String(application.application_number || ''),
    stage: String(application.status || application.pipeline_stage || ''),
    missing_docs: Array.isArray(application.missing_documents)
      ? (application.missing_documents as string[]).join(', ')
      : String(extra.missing_docs || ''),
    result_summary: String(extra.result_summary || application.status || ''),
    interview_date: String(extra.interview_date || ''),
    interview_time: String(extra.interview_time || ''),
    interview_type: String(extra.interview_type || ''),
    interview_link: String(extra.interview_link || ''),
    ...extra,
  };

  const body = bilingualBody(event, vars);
  const result = await sendInfobipWhatsAppText(to, body);

  await Promise.resolve(
    supabase.from('communications').insert({
      tenant_id: tenantId,
      type: `admissions_${event}`,
      channel: 'whatsapp',
      subject: event,
      body,
      recipients: [normalizePhone(to)],
      status: result.success ? 'sent' : 'failed',
      reference_id: String(application.id || ''),
      metadata: { provider: 'infobip', messageId: result.messageId, error: result.error },
    }),
  ).catch(() => {});

  if (application.intake_link_id) {
    await Promise.resolve(
      supabase.from('intake_comm_logs').insert({
        tenant_id: tenantId,
        intake_link_id: application.intake_link_id,
        channel: 'whatsapp',
        recipient_name: vars.guardian_name,
        recipient_phone: normalizePhone(to),
        recipient_email: application.guardian_email || null,
        message_preview: body.slice(0, 280),
        status: result.success ? 'sent' : 'failed',
      }),
    ).catch(() => {});
  }

  if (!result.success) return { sent: false, error: result.error };
  return { sent: true, messageId: result.messageId };
}

/** Map pipeline status → notify event (or null if none). */
export function mapStageToNotifyEvent(toStatus: string, opts?: { documentsMissing?: boolean }): AdmissionsNotifyEvent | null {
  if (opts?.documentsMissing) return 'documents_missing';
  switch (toStatus) {
    case 'inquiry':
    case 'submitted':
      return 'welcome';
    case 'rejected':
      return 'rejection';
    case 'assessment':
      return 'assessment_results';
    case 'interview':
      return 'interview_scheduling';
    case 'accepted':
      return 'welcome';
    default:
      return null;
  }
}
