import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const notificationsRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;
const INFOBIP_BASE_URL = 'https://5wy37y.api.infobip.com';  // per Infobip account base URL
const WHATSAPP_SENDER = process.env.INFOBIP_WHATSAPP_SENDER ?? '447860099299'; // Infobip sandbox sender

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SendWhatsAppSchema = z.object({
  to:           z.string().min(7).max(20).regex(/^\+?[0-9]+$/, 'Must be a phone number'),
  template_key: z.string().min(1).max(100),
  variables:    z.record(z.string()).default({}),
  language:     z.enum(['ar', 'en']).default('ar'),
  employee_id:  z.string().uuid().optional(),
  student_id:   z.string().uuid().optional(),
  reference_id: z.string().optional(),
});

const BulkWhatsAppSchema = z.object({
  recipients: z.array(z.object({
    to:          z.string().min(7).max(20),
    variables:   z.record(z.string()).default({}),
    language:    z.enum(['ar', 'en']).default('ar'),
    reference_id: z.string().optional(),
  })).min(1).max(100),
  template_key: z.string().min(1).max(100),
});

const InAppNotificationSchema = z.object({
  user_id: z.string().uuid(),
  title:   z.string().min(1).max(200),
  body:    z.string().max(1000).optional(),
  type:    z.string().max(50).optional(),
  link:    z.string().max(500).optional(),
});

// ─── WhatsApp message templates ───────────────────────────────────────────────
// Variables use {{key}} format; replaced before sending.

interface Template { ar: string; en: string }

const TEMPLATES: Record<string, Template> = {
  fee_due: {
    ar: 'عزيزي ولي الأمر،\n\nيوجد فاتورة مستحقة بمبلغ *{{amount}} ريال* للطالب {{student_name}}.\nتاريخ الاستحقاق: {{due_date}}\n\nيرجى السداد في أقرب وقت. شكراً لتعاونكم.',
    en: 'Dear Parent,\n\nAn invoice of *SAR {{amount}}* is due for student {{student_name}}.\nDue date: {{due_date}}\n\nPlease settle at your earliest convenience. Thank you.',
  },
  fee_overdue: {
    ar: 'تنبيه: الفاتورة متأخرة!\n\nعزيزي ولي أمر {{student_name}}،\nالمبلغ المستحق *{{amount}} ريال* تجاوز تاريخ الاستحقاق {{due_date}}.\n\nيرجى التواصل مع إدارة المدرسة فوراً.',
    en: 'OVERDUE NOTICE\n\nDear parent of {{student_name}},\nPayment of *SAR {{amount}}* was due on {{due_date}} and is now overdue.\n\nPlease contact school administration immediately.',
  },
  payment_received: {
    ar: 'تم استلام الدفعة ✅\n\nعزيزي ولي أمر {{student_name}}،\nتم تسجيل دفعة بمبلغ *{{amount}} ريال* بتاريخ {{date}}.\n\nشكراً لكم.',
    en: 'Payment Received ✅\n\nDear parent of {{student_name}},\nA payment of *SAR {{amount}}* was received on {{date}}.\n\nThank you.',
  },
  student_absent: {
    ar: 'غياب الطالب 📋\n\nعزيزي ولي أمر {{student_name}}،\nسُجّل غياب ابنك/ابنتك اليوم {{date}}.\n\nلمزيد من المعلومات، يرجى التواصل مع المدرسة.',
    en: 'Student Absence 📋\n\nDear parent of {{student_name}},\nYour child was marked absent today {{date}}.\n\nPlease contact the school for more information.',
  },
  student_late: {
    ar: 'تأخر الطالب ⏰\n\nعزيزي ولي أمر {{student_name}}،\nوصل ابنك/ابنتك متأخراً اليوم {{date}} بـ {{minutes}} دقيقة.',
    en: 'Student Late ⏰\n\nDear parent of {{student_name}},\nYour child arrived {{minutes}} minutes late today {{date}}.',
  },
  payslip_ready: {
    ar: 'كشف راتب جاهز 📄\n\nعزيزي {{employee_name}}،\nكشف راتب شهر {{month}} {{year}} جاهز للتحميل.\nصافي الراتب: *{{net_salary}} ريال*',
    en: 'Payslip Ready 📄\n\nDear {{employee_name}},\nYour payslip for {{month}} {{year}} is ready.\nNet salary: *SAR {{net_salary}}*',
  },
  leave_approved: {
    ar: 'تمت الموافقة على الإجازة ✅\n\nعزيزي {{employee_name}}،\nتمت الموافقة على طلب إجازتك من {{start_date}} إلى {{end_date}} ({{days}} أيام).',
    en: 'Leave Approved ✅\n\nDear {{employee_name}},\nYour leave request from {{start_date}} to {{end_date}} ({{days}} days) has been approved.',
  },
  leave_rejected: {
    ar: 'طلب الإجازة مرفوض ❌\n\nعزيزي {{employee_name}}،\nتم رفض طلب إجازتك من {{start_date}} إلى {{end_date}}.\nالسبب: {{reason}}',
    en: 'Leave Rejected ❌\n\nDear {{employee_name}},\nYour leave request from {{start_date}} to {{end_date}} has been rejected.\nReason: {{reason}}',
  },
  announcement: {
    ar: 'إعلان من {{school_name}} 📢\n\n{{message}}',
    en: 'Announcement from {{school_name}} 📢\n\n{{message}}',
  },
  contract_signed: {
    ar: 'تأكيد التسجيل ✅\n\nعزيزي ولي أمر {{student_name}}،\nتم توقيع عقد الالتحاق للعام الدراسي {{year}} بنجاح.\n\nمرحباً بكم في {{school_name}}!',
    en: 'Enrollment Confirmed ✅\n\nDear parent of {{student_name}},\nEnrollment contract for academic year {{year}} has been signed successfully.\n\nWelcome to {{school_name}}!',
  },
};

// ─── Interpolate template variables ──────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─── Send a single WhatsApp message via Infobip ───────────────────────────────

async function sendViaInfobip(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!INFOBIP_API_KEY) {
    return { success: false, error: 'INFOBIP_API_KEY not configured' };
  }

  // Normalise number — strip leading 0, ensure country code
  const normalised = to.replace(/^0/, '').replace(/\D/g, '');

  try {
    const response = await fetch(`${INFOBIP_BASE_URL}/whatsapp/1/message/text`, {
      method: 'POST',
      headers: {
        'Authorization': `App ${INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        from: WHATSAPP_SENDER,
        to:   normalised,
        content: { text },
      }),
    });

    const body = await response.json() as any;

    if (!response.ok) {
      return { success: false, error: body?.requestError?.serviceException?.text ?? `HTTP ${response.status}` };
    }

    const messageId = body?.messages?.[0]?.messageId ?? body?.messageId;
    return { success: true, messageId };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Network error' };
  }
}

// ─── Log communication record ─────────────────────────────────────────────────

async function logCommunication(
  tenantId: string,
  type: string,
  subject: string,
  body: string,
  recipients: object[],
  status: string,
  referenceId?: string,
): Promise<void> {
  await supabase.from('communications').insert({
    tenant_id:  tenantId,
    type,
    subject,
    body,
    recipients,
    status,
    sent_at:    status === 'sent' ? new Date().toISOString() : null,
    reference_id: referenceId,
  });
}

// ─── POST /api/notifications/whatsapp — send single message ──────────────────

notificationsRouter.post('/whatsapp', async (req: AuthenticatedRequest, res) => {
  const parsed = SendWhatsAppSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const tenant_id = req.user!.tenant_id!;
  const { to, template_key, variables, language, reference_id } = parsed.data;

  const template = TEMPLATES[template_key];
  if (!template) {
    return res.status(400).json({ error: `Unknown template: ${template_key}`, available: Object.keys(TEMPLATES) });
  }

  const text   = interpolate(template[language], variables);
  const result = await sendViaInfobip(to, text);

  await logCommunication(
    tenant_id, 'whatsapp', template_key, text,
    [{ phone: to, language }],
    result.success ? 'sent' : 'failed',
    reference_id,
  );

  if (!result.success) {
    return res.status(502).json({ error: 'Failed to send WhatsApp message', detail: result.error });
  }

  return res.json({ success: true, message_id: result.messageId, template: template_key });
});

// ─── POST /api/notifications/whatsapp/bulk ────────────────────────────────────

notificationsRouter.post('/whatsapp/bulk', async (req: AuthenticatedRequest, res) => {
  const parsed = BulkWhatsAppSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const tenant_id = req.user!.tenant_id!;
  const { recipients, template_key } = parsed.data;

  const template = TEMPLATES[template_key];
  if (!template) {
    return res.status(400).json({ error: `Unknown template: ${template_key}`, available: Object.keys(TEMPLATES) });
  }

  // Send concurrently (Infobip handles rate limits on their end)
  const results = await Promise.allSettled(
    recipients.map(async (r) => {
      const text   = interpolate(template[r.language], r.variables);
      const result = await sendViaInfobip(r.to, text);
      return { to: r.to, ...result };
    }),
  );

  const summary = {
    total:   results.length,
    sent:    0,
    failed:  0,
    errors:  [] as string[],
  };

  const logRecipients: object[] = [];
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') {
      if (r.value.success) { summary.sent++; }
      else { summary.failed++; summary.errors.push(`${r.value.to}: ${r.value.error}`); }
      logRecipients.push({ phone: recipients[idx].to, success: r.value.success });
    } else {
      summary.failed++;
      logRecipients.push({ phone: recipients[idx].to, success: false });
    }
  });

  await logCommunication(
    tenant_id, 'whatsapp_bulk', template_key,
    `Bulk send to ${recipients.length} recipients`,
    logRecipients,
    summary.failed === 0 ? 'sent' : summary.sent > 0 ? 'partial' : 'failed',
  );

  return res.json({ summary });
});

// ─── POST /api/notifications/in-app ──────────────────────────────────────────

notificationsRouter.post('/in-app', async (req: AuthenticatedRequest, res) => {
  const parsed = InAppNotificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });

  const tenant_id = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('notifications')
    .insert({ ...parsed.data, tenant_id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ notification: data });
});

// ─── GET /api/notifications/my — current user's in-app notifications ──────────

notificationsRouter.get('/my', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ notifications: data ?? [], unread: (data ?? []).filter((n: any) => !n.is_read).length });
});

// ─── POST /api/notifications/my/read-all ─────────────────────────────────────

notificationsRouter.post('/my/read-all', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('tenant_id', tenant_id)
    .eq('user_id', req.user!.id)
    .eq('is_read', false);
  return res.json({ success: true });
});

// ─── PATCH /api/notifications/my/:id/read ────────────────────────────────────

notificationsRouter.patch('/my/:id/read', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('tenant_id', tenant_id)
    .eq('user_id', req.user!.id);
  return res.json({ success: true });
});

// ─── GET /api/notifications/history — admin communication log ────────────────

notificationsRouter.get('/history', async (req: AuthenticatedRequest, res) => {
  const tenant_id = req.user!.tenant_id!;
  const { type, status, from, to } = req.query as Record<string, string>;

  let q = supabase
    .from('communications')
    .select('id, type, subject, status, recipients, sent_at, created_at')
    .eq('tenant_id', tenant_id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (type)   q = q.eq('type', type);
  if (status) q = q.eq('status', status);
  if (from)   q = q.gte('created_at', from);
  if (to)     q = q.lte('created_at', to + 'T23:59:59Z');

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ history: data ?? [] });
});

// ─── GET /api/notifications/templates — list available templates ──────────────

notificationsRouter.get('/templates', (_req: AuthenticatedRequest, res) => {
  return res.json({
    templates: Object.entries(TEMPLATES).map(([key, t]) => ({
      key,
      preview_ar: t.ar.slice(0, 80) + '…',
      preview_en: t.en.slice(0, 80) + '…',
      variables: [...new Set([...t.ar.matchAll(/\{\{(\w+)\}\}/g), ...t.en.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))],
    })),
  });
});
