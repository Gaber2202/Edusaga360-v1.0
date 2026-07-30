import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from '../../lib/phone.js';
import { getProvider } from '../messaging/registry.js';
import { getOrCreateMoyasarLink } from '../moyasar/moyasarService.js';
import { decryptSecret, isAiCryptoConfigured } from '../../lib/aiCrypto.js';

type Channel = 'whatsapp' | 'sms';

interface InboundPayload {
  from: string;
  to: string;
  text: string;
  messageId: string;
  channel?: string;
}

interface GuardianRow {
  id: string;
  tenant_id: string;
  name_en?: string;
  name_ar?: string;
  phone?: string;
  email?: string;
}

interface Reply {
  ar: string;
  en: string;
}

interface IntentResult {
  intent: string;
  confidence: number;
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  due_date?: string;
  status: string;
}

interface ApplicationRow {
  application_number?: string;
  status?: string;
  stage?: string;
  decision?: string;
  student_name_ar?: string;
  student_name_en?: string;
  submitted_at?: string;
}

export class InfobipAiAssistant {
  constructor(
    private supabase: SupabaseClient,
    private callbackUrl: string,
  ) {}

  async handleInbound(payload: InboundPayload): Promise<{ ok: boolean; reply?: Reply; threadId?: string; error?: string }> {
    try {
      const text = (payload.text || '').trim();
      if (!text) return { ok: false, error: 'empty_message' };

      const guardian = await this.resolveGuardian(payload.from);
      if (!guardian) return { ok: false, error: 'profile_not_found' };

      const lang = detectLanguage(text);
      const threadId = await this.getOrCreateThread(guardian.tenant_id, guardian.id);

      await this.addThreadMessage(
        guardian.tenant_id,
        threadId,
        'guardian',
        guardian.id,
        text,
        text,
      );

      const { intent } = classifyIntent(text);
      const reply = await this.buildReply(intent, text, guardian, lang, threadId);

      await this.addThreadMessage(
        guardian.tenant_id,
        threadId,
        'ai',
        undefined,
        reply.ar,
        reply.en,
      );

      if (intent === 'human') {
        await this.handoffThread(threadId, 'guardian_requested');
      }

      const sendText = lang === 'ar' ? reply.ar : reply.en;
      const channel = payload.channel ? normalizeChannel(payload.channel) : 'whatsapp';
      await this.sendReply(payload.from, sendText, channel, guardian.tenant_id);

      return { ok: true, reply, threadId };
    } catch (err: any) {
      console.error('[ai/inbound] handleInbound failed:', err);
      return { ok: false, error: err.message || 'processing_failed' };
    }
  }

  private async resolveGuardian(rawPhone: string): Promise<GuardianRow | null> {
    const variants = phoneVariants(rawPhone);
    if (variants.length === 0) return null;
    const orClauses = variants.map((v) => `phone.eq.${v}`).join(',');
    const { data, error } = await this.supabase
      .from('guardians')
      .select('id, tenant_id, name_en, name_ar, phone, email')
      .or(orClauses)
      .maybeSingle();
    if (error) {
      console.error('[ai/inbound] resolveGuardian error:', error.message);
      return null;
    }
    return (data as GuardianRow) ?? null;
  }

  private async getOrCreateThread(tenantId: string, guardianId: string): Promise<string> {
    const { data: existing } = await this.supabase
      .from('message_threads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('type', 'ai_parent')
      .eq('linked_guardian_id', guardianId)
      .maybeSingle();

    if (existing) {
      return (existing as { id: string }).id;
    }

    const { data: thread, error } = await this.supabase
      .from('message_threads')
      .insert({
        tenant_id: tenantId,
        type: 'ai_parent',
        subject: 'AI Parent Assistant',
        linked_guardian_id: guardianId,
        status: 'open',
      })
      .select('id')
      .single();
    if (error || !thread) throw new Error(`Failed to create AI thread: ${error?.message ?? 'unknown'}`);

    const threadId = (thread as { id: string }).id;
    await this.supabase.from('thread_participants').insert({
      tenant_id: tenantId,
      thread_id: threadId,
      participant_type: 'guardian',
      guardian_id: guardianId,
      is_active: true,
    });
    return threadId;
  }

  private async addThreadMessage(
    tenantId: string,
    threadId: string,
    senderType: 'guardian' | 'ai' | 'system',
    guardianId: string | undefined,
    bodyAr: string,
    bodyEn: string,
    replyToMessageId?: string,
  ): Promise<void> {
    const { error } = await this.supabase.from('thread_messages').insert({
      tenant_id: tenantId,
      thread_id: threadId,
      sender_type: senderType,
      guardian_id: guardianId ?? null,
      body_ar: bodyAr,
      body_en: bodyEn,
      reply_to_message_id: replyToMessageId ?? null,
    });
    if (error) console.error('[ai/inbound] addThreadMessage error:', error.message);

    await this.supabase
      .from('message_threads')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', threadId)
      .eq('tenant_id', tenantId);
  }

  private async handoffThread(threadId: string, reason: string): Promise<void> {
    await this.supabase
      .from('message_threads')
      .update({
        status: 'handoff',
        handoff_reason: reason,
        handoff_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', threadId);
  }

  private async buildReply(
    intent: string,
    text: string,
    guardian: GuardianRow,
    lang: 'ar' | 'en',
    threadId: string,
  ): Promise<Reply> {
    const name = lang === 'ar' ? (guardian.name_ar || 'ولي الأمر') : (guardian.name_en || 'Parent');

    switch (intent) {
      case 'greeting':
        return this.greetingReply(name, lang);
      case 'fees':
        return await this.feesReply(guardian, lang);
      case 'payment_link':
        return await this.paymentLinkReply(guardian, lang);
      case 'admissions':
        return await this.admissionsReply(guardian, lang);
      case 'attendance':
        return this.attendanceReply(name, lang);
      case 'documents':
        return this.documentsReply(name, lang);
      case 'human':
        return this.humanReply(name, lang);
      default:
        return this.fallbackReply(name, lang);
    }
  }

  private greetingReply(name: string, lang: 'ar' | 'en'): Reply {
    return {
      ar: `مرحباً ${name}! 🤖\nكيف يمكنني مساعدتك اليوم؟\n1️⃣ رسوم ومدفوعات\n2️⃣ رابط الدفع\n3️⃣ التسجيل والقبول\n4️⃣ الحضور\n5️⃣ المستندات\n6️⃣ التحدث مع موظف\n\nأرسل الرقم أو الكلمة المفتاحية.`,
      en: `Hi ${name}! 🤖\nHow can I help you today?\n1️⃣ Fees & payments\n2️⃣ Payment link\n3️⃣ Admissions\n4️⃣ Attendance\n5️⃣ Documents\n6️⃣ Speak to staff\n\nSend the number or keyword.`,
    };
  }

  private async feesReply(guardian: GuardianRow, lang: 'ar' | 'en'): Promise<Reply> {
    const invoices = await this.getOutstandingInvoices(guardian.tenant_id, guardian.id);
    if (invoices.length === 0) {
      return {
        ar: 'لا توجد فواتير مستحقة حالياً. شكراً لك!',
        en: 'You have no outstanding invoices. Thank you!',
      };
    }
    const totalDue = invoices.reduce((sum, inv) => sum + Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount)), 0);
    const lines = invoices.map((inv) => {
      const due = Math.max(0, Number(inv.total_amount) - Number(inv.paid_amount));
      return `• ${inv.invoice_number}: SAR ${due.toFixed(2)} (due ${inv.due_date ?? '—'})`;
    }).join('\n');
    return {
      ar: `الرصيد المستحق الإجمالي: SAR ${totalDue.toFixed(2)}\nالفواتير:\n${lines}\n\nأرسل "رابط" للحصول على رابط الدفع.`,
      en: `Total outstanding balance: SAR ${totalDue.toFixed(2)}\nInvoices:\n${lines}\n\nSend "link" to get a payment link.`,
    };
  }

  private async paymentLinkReply(guardian: GuardianRow, lang: 'ar' | 'en'): Promise<Reply> {
    const invoices = await this.getOutstandingInvoices(guardian.tenant_id, guardian.id);
    if (invoices.length === 0) {
      return {
        ar: 'لا توجد فواتير مستحقة للدفع.',
        en: 'You have no outstanding invoices to pay.',
      };
    }
    const invoice = invoices[0];
    const link = await getOrCreateMoyasarLink(this.supabase, {
      tenantId: guardian.tenant_id,
      invoiceId: invoice.id,
      callbackUrl: this.callbackUrl,
      sourceType: 'mada',
    });
    if (!link.ok || !link.paymentUrl) {
      return {
        ar: 'لم نتمكن من إنشاء رابط الدفع حالياً. يرجى المحاولة لاحقاً أو التواصل مع المدرسة.',
        en: 'We could not create a payment link right now. Please try again later or contact the school.',
      };
    }
    return {
      ar: `رابط الدفع لفاتورة ${invoice.invoice_number}:\n${link.paymentUrl}\n\nيمكنك الدفع بكل أمان عبر مدى أو بطاقة ائتمان.`,
      en: `Payment link for invoice ${invoice.invoice_number}:\n${link.paymentUrl}\n\nYou can pay securely with Mada or credit card.`,
    };
  }

  private async admissionsReply(guardian: GuardianRow, lang: 'ar' | 'en'): Promise<Reply> {
    const applications = await this.getApplications(guardian);
    if (applications.length === 0) {
      return {
        ar: 'لم نجد طلبات تسجيل مرتبطة برقم جوالك. للاستفسار، أرسل "موظف".',
        en: 'We did not find any applications linked to your phone number. For help, send "staff".',
      };
    }
    const lines = applications.map((app) => {
      const student = lang === 'ar' ? (app.student_name_ar || app.student_name_en || 'طالب') : (app.student_name_en || app.student_name_ar || 'Student');
      return `• ${app.application_number ?? '—'}: ${student} — ${app.stage ?? app.status ?? 'submitted'}`;
    }).join('\n');
    return {
      ar: `حالة طلبات التسجيل:\n${lines}`,
      en: `Your application status:\n${lines}`,
    };
  }

  private attendanceReply(name: string, lang: 'ar' | 'en'): Reply {
    return {
      ar: `عذراً ${name}، تتبع حضور الطلاب سيكون متاحاً قريباً. للاستعجال، أرسل "موظف".`,
      en: `Sorry ${name}, student attendance tracking will be available soon. For urgent matters, send "staff".`,
    };
  }

  private documentsReply(name: string, lang: 'ar' | 'en'): Reply {
    return {
      ar: `يمكنك تحميل المستندات من بوابة ولي الأمر. إذا كنت بحاجة لمساعدة في إيجاد مستند محدد، أرسل "موظف".`,
      en: `You can download documents from the parent portal. If you need help finding a specific document, send "staff".`,
    };
  }

  private humanReply(name: string, lang: 'ar' | 'en'): Reply {
    return {
      ar: `تم رفع طلبك ${name}، وسيقوم أحد موظفي المدرسة بالتواصل معك قريباً.`,
      en: `Your request has been escalated ${name}. A school staff member will contact you soon.`,
    };
  }

  private fallbackReply(name: string, lang: 'ar' | 'en'): Reply {
    return {
      ar: `عذراً ${name}، لم أفهم طلبك.\n\n1️⃣ رسوم ومدفوعات\n2️⃣ رابط الدفع\n3️⃣ التسجيل والقبول\n4️⃣ الحضور\n5️⃣ المستندات\n6️⃣ التحدث مع موظف`,
      en: `Sorry ${name}, I did not understand.\n\n1️⃣ Fees & payments\n2️⃣ Payment link\n3️⃣ Admissions\n4️⃣ Attendance\n5️⃣ Documents\n6️⃣ Speak to staff`,
    };
  }

  private async getOutstandingInvoices(tenantId: string, guardianId: string): Promise<InvoiceRow[]> {
    const { data, error } = await this.supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, paid_amount, due_date, status')
      .eq('tenant_id', tenantId)
      .eq('guardian_id', guardianId)
      .in('status', ['issued', 'partial', 'overdue'])
      .gt('total_amount', 'paid_amount')
      .order('due_date', { ascending: true });
    if (error) {
      console.error('[ai/inbound] getOutstandingInvoices error:', error.message);
      return [];
    }
    return (data ?? []) as unknown as InvoiceRow[];
  }

  private async getApplications(guardian: GuardianRow): Promise<ApplicationRow[]> {
    const variants = phoneVariants(guardian.phone || '');
    if (variants.length === 0) return [];
    const orClauses = variants.map((v) => `guardian_phone.eq.${v}`).join(',');
    const { data, error } = await this.supabase
      .from('applications')
      .select('application_number, status, stage, decision, student_name_ar, student_name_en, submitted_at')
      .eq('tenant_id', guardian.tenant_id)
      .or(orClauses)
      .order('submitted_at', { ascending: false })
      .limit(5);
    if (error) {
      console.error('[ai/inbound] getApplications error:', error.message);
      return [];
    }
    return (data ?? []) as unknown as ApplicationRow[];
  }

  private async sendReply(to: string, text: string, channel: Channel, tenantId: string): Promise<void> {
    const ctx = await this.resolveInfobipContext(tenantId, channel);
    if (!ctx) throw new Error('infobip_not_configured');
    const provider = getProvider('infobip');
    if (!provider) throw new Error('infobip_provider_not_found');
    if (!provider.channels.includes(channel)) channel = 'whatsapp';
    await provider.send(ctx, { to: normalizePhone(to), text, channel });
  }

  private async resolveInfobipContext(
    tenantId: string,
    channel: Channel,
  ): Promise<{ config: Record<string, unknown>; credentials: Record<string, string> } | null> {
    // Try tenant-specific Infobip connector first.
    const { data: connectors, error } = await this.supabase
      .from('messaging_connectors')
      .select('provider, config, credentials')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);
    if (error) console.error('[ai/inbound] resolveInfobipContext connector query error:', error.message);

    for (const row of (connectors ?? []) as unknown as Array<{ provider: string; config: unknown; credentials: string | null }>) {
      const provider = getProvider(row.provider);
      if (!provider || !provider.channels.includes(channel)) continue;
      const config = (row.config ?? {}) as Record<string, unknown>;
      const credentials: Record<string, string> = {};
      if (row.credentials) {
        try {
          if (isAiCryptoConfigured()) {
            Object.assign(credentials, JSON.parse(decryptSecret(row.credentials)) as Record<string, string>);
          }
        } catch (e) {
          console.error('[ai/inbound] failed to decrypt connector credentials:', e);
          continue;
        }
      }
      const invalid = provider.validate(config, credentials);
      if (invalid) {
        console.warn('[ai/inbound] connector invalid:', invalid);
        continue;
      }
      return { config, credentials };
    }

    // Fallback to platform-level Infobip credentials.
    const apiKey = process.env.INFOBIP_API_KEY;
    const baseUrl = (process.env.INFOBIP_BASE_URL ?? '').replace(/\/+$/, '');
    if (!apiKey || !baseUrl) return null;
    return {
      config: {
        base_url: baseUrl,
        sender: process.env.INFOBIP_SMS_SENDER || 'EduSaga',
        whatsapp_sender: process.env.INFOBIP_WHATSAPP_SENDER || '',
      },
      credentials: { api_key: apiKey },
    };
  }
}

function detectLanguage(text: string): 'ar' | 'en' {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'ar';
}

function classifyIntent(text: string): IntentResult {
  const t = text.toLowerCase().trim();

  // Numeric menu shortcuts
  if (/^(1|رسوم|مدفوعات|فواتير|fees|balance|due)$/.test(t)) return { intent: 'fees', confidence: 1 };
  if (/^(2|رابط|دفع|pay|payment|link)$/.test(t)) return { intent: 'payment_link', confidence: 1 };
  if (/^(3|تسجيل|قبول|admission|application|register)$/.test(t)) return { intent: 'admissions', confidence: 1 };
  if (/^(4|حضور|غياب|attendance|absent|present)$/.test(t)) return { intent: 'attendance', confidence: 1 };
  if (/^(5|مستند|وثيقة|document|documents|file)$/.test(t)) return { intent: 'documents', confidence: 1 };
  if (/^(6|موظف|متحدث|خدمة|human|agent|staff|speak)$/.test(t)) return { intent: 'human', confidence: 1 };

  const scores: Record<string, number> = {
    greeting: 0,
    fees: 0,
    payment_link: 0,
    admissions: 0,
    attendance: 0,
    documents: 0,
    human: 0,
  };

  const patterns: Record<string, string[]> = {
    greeting: ['hi', 'hello', 'hey', 'مرحبا', 'السلام', 'اهلا', 'مساء', 'صباح', 'hola', 'good morning'],
    fees: ['fees', 'balance', 'due', 'invoice', 'invoices', 'amount', 'pay', 'cost', 'remaining', 'total', 'sar', 'رسوم', 'فاتورة', 'فواتير', 'مستحق', 'المبلغ', 'المتبقي', 'باقي', 'دفع'],
    payment_link: ['link', 'payment link', 'pay now', 'رابط', 'رابط الدفع'],
    admissions: ['admission', 'admissions', 'apply', 'application', 'registered', 'register', 'enroll', 'enrollment', 'تسجيل', 'قبول', 'القبول', 'التسجيل', 'طلب', 'تقديم'],
    attendance: ['attendance', 'absent', 'present', 'late', 'حضور', 'غياب', 'غائب', 'حاضر', 'تأخر'],
    documents: ['document', 'documents', 'file', 'files', 'paper', 'مستند', 'مستندات', 'وثيقة', 'ملف', 'ملفات'],
    human: ['human', 'agent', 'staff', 'representative', 'speak', 'help', 'support', 'موظف', 'متحدث', 'خدمة', 'عامل', 'مندوب', 'ممثل', 'دعم'],
  };

  for (const [intent, keywords] of Object.entries(patterns)) {
    for (const kw of keywords) {
      if (t.includes(kw.toLowerCase())) {
        scores[intent] += kw.length > 3 ? 2 : 1;
      }
    }
  }

  const entries = Object.entries(scores);
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0];
  if (!top || top[1] === 0) return { intent: 'fallback', confidence: 0 };
  if (top[0] === 'greeting') return { intent: 'greeting', confidence: top[1] };
  return { intent: top[0], confidence: top[1] };
}

function normalizeChannel(channel?: string): Channel {
  const c = (channel ?? '').toLowerCase();
  if (c === 'sms' || c.includes('sms')) return 'sms';
  return 'whatsapp';
}

function phoneVariants(raw: string): string[] {
  const variants = new Set<string>();
  const cleaned = raw.trim();
  if (!cleaned) return [];
  variants.add(cleaned);
  variants.add(cleaned.replace(/^\+/, ''));
  variants.add(`+${cleaned.replace(/^\+/, '')}`);
  const normalized = normalizePhone(cleaned);
  if (normalized) variants.add(normalized);
  variants.add(`+${normalized}`);
  return Array.from(variants);
}
