import type { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from '../messaging/registry.js';
import { decryptSecret, isAiCryptoConfigured } from '../../lib/aiCrypto.js';
import { sendEmail as sendTransactionalEmail } from '../email.js';
import { getOrCreateMoyasarLink } from '../moyasar/moyasarService.js';
import { writeLedger } from './ledgerWriter.js';
import { CollectionThreadService } from './threads.js';

export interface SequenceStep {
  step: number;
  days_after_due: number;
  channel: 'whatsapp' | 'sms' | 'email';
  template_key: string;
}

const DEFAULT_SEQUENCES: Record<string, SequenceStep[]> = {
  A: [{ step: 1, days_after_due: 3, channel: 'whatsapp', template_key: 'friendly_reminder' }],
  B: [
    { step: 1, days_after_due: 1, channel: 'whatsapp', template_key: 'due_soon_notice' },
    { step: 2, days_after_due: 7, channel: 'whatsapp', template_key: 'overdue_notice' },
    { step: 3, days_after_due: 14, channel: 'sms', template_key: 'overdue_notice' },
  ],
  C: [
    { step: 1, days_after_due: 1, channel: 'whatsapp', template_key: 'overdue_notice' },
    { step: 2, days_after_due: 7, channel: 'whatsapp', template_key: 'installment_offer' },
    { step: 3, days_after_due: 14, channel: 'sms', template_key: 'installment_offer' },
  ],
  D: [
    { step: 1, days_after_due: 1, channel: 'whatsapp', template_key: 'overdue_notice' },
    { step: 2, days_after_due: 7, channel: 'sms', template_key: 'overdue_notice' },
    { step: 3, days_after_due: 14, channel: 'email', template_key: 'escalation_notice' },
    { step: 4, days_after_due: 21, channel: 'whatsapp', template_key: 'escalation_notice' },
  ],
  E: [
    { step: 1, days_after_due: 1, channel: 'whatsapp', template_key: 'formal_notice_draft' },
    { step: 2, days_after_due: 7, channel: 'email', template_key: 'formal_notice_draft' },
  ],
};

interface MessengerMessage {
  id: string;
  tenant_id: string;
  profile_id: string;
  invoice_id: string;
  sequence_step: number;
  channel: string;
  template_key: string;
  language: string;
  personalized_body_ar?: string;
  personalized_body_en?: string;
  amount_due?: number;
  due_date?: string;
  moyasar_link?: string;
  sent_to?: string;
  scheduled_at: string;
  delivery_status: string;
}

interface ProfileWithNames {
  id: string;
  guardian_id: string;
  current_segment: string;
  preferred_language: string;
  guardian_name_en?: string;
  guardian_name_ar?: string;
  student_name_en?: string;
  student_name_ar?: string;
  phone?: string;
  email?: string;
}

export class CollectionMessenger {
  private threadService: CollectionThreadService;

  constructor(private supabase: SupabaseClient, private callbackUrl: string) {
    this.threadService = new CollectionThreadService(supabase);
  }

  async getSequence(tenantId: string, segment: string): Promise<SequenceStep[]> {
    const { data } = await this.supabase
      .from('collection_sequences')
      .select('sequence_definition')
      .eq('tenant_id', tenantId)
      .eq('segment', segment)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.sequence_definition) {
      return (data.sequence_definition as { steps?: SequenceStep[] }).steps ?? DEFAULT_SEQUENCES[segment] ?? [];
    }
    return DEFAULT_SEQUENCES[segment] ?? [];
  }

  /**
   * Enqueue the next reminder for each overdue invoice per profile.
   * Respects the tenant kill switch and feature flag.
   */
  async enqueueRemindersForTenant(tenantId: string): Promise<{ enqueued: number; skipped: number }> {
    const settings = await this.loadSettings(tenantId);
    if (!settings?.is_enabled || settings.kill_switch_activated_at) {
      return { enqueued: 0, skipped: 0 };
    }

    const profiles = await this.loadOverdueProfiles(tenantId);
    let enqueued = 0;
    let skipped = 0;

    for (const profile of profiles) {
      try {
        const invoice = await this.findOldestOverdueInvoice(tenantId, profile.guardian_id);
        if (!invoice) {
          skipped++;
          continue;
        }

        const sequence = await this.getSequence(tenantId, profile.current_segment);
        const lastStep = await this.getLastSentStep(tenantId, profile.id, invoice.id);
        const nextStepIndex = lastStep === null ? 0 : Math.min(lastStep, sequence.length - 1);
        const step = sequence[nextStepIndex];
        if (!step) {
          skipped++;
          continue;
        }

        const daysOverdue = this.daysBetween(new Date().toISOString().split('T')[0], invoice.due_date);
        if (daysOverdue < step.days_after_due) {
          skipped++;
          continue;
        }

        // For segment E (legal track) require human approval before enqueuing.
        if (profile.current_segment === 'E' && step.template_key === 'formal_notice_draft') {
          await this.requestApproval(tenantId, profile.id, invoice.id, step);
          skipped++;
          continue;
        }

        const idempotencyKey = `reminder:${tenantId}:${profile.id}:${invoice.id}:${step.step}`;
        const language = profile.preferred_language ?? 'ar';
        const scheduledAt = this.nextSendWindow(settings);

        const { error } = await this.supabase.from('collection_messages').insert({
          tenant_id: tenantId,
          profile_id: profile.id,
          invoice_id: invoice.id,
          sequence_step: step.step,
          channel: step.channel,
          template_key: step.template_key,
          language,
          amount_due: invoice.balance,
          due_date: invoice.due_date,
          scheduled_at: scheduledAt,
          delivery_status: 'pending',
          idempotency_key: idempotencyKey,
        });

        if (error) {
          if ((error as any).code === '23505') {
            skipped++;
          } else {
            throw error;
          }
        } else {
          enqueued++;
        }
      } catch (err) {
        console.error(`[collections/messenger] enqueue failed for profile ${profile.id}:`, err);
      }
    }

    return { enqueued, skipped };
  }

  /**
   * Send all pending messages whose scheduled_at has passed and that fall inside
   * the tenant send window.
   */
  async sendPendingMessages(limit = 100): Promise<{ sent: number; failed: number }> {
    const now = new Date().toISOString();
    const { data: messages, error } = await this.supabase
      .from('collection_messages')
      .select('*, collection_profiles!inner(guardian_id, preferred_language, total_invoiced, outstanding_balance)')
      .in('delivery_status', ['pending', 'scheduled'])
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(limit);
    if (error) throw error;

    let sent = 0;
    let failed = 0;

    for (const msg of (messages ?? []) as unknown as MessengerMessage[]) {
      try {
        const didSend = await this.sendMessage(msg);
        if (didSend) sent++;
      } catch (err) {
        console.error(`[collections/messenger] send failed for message ${msg.id}:`, err);
        await this.supabase
          .from('collection_messages')
          .update({ delivery_status: 'failed', delivery_response: { error: (err as Error).message } })
          .eq('id', msg.id)
          .eq('tenant_id', msg.tenant_id);
        failed++;
      }
    }

    return { sent, failed };
  }

  private async sendMessage(msg: MessengerMessage): Promise<boolean> {
    const settings = await this.loadSettings(msg.tenant_id);
    if (settings?.kill_switch_activated_at || !this.isInSendWindow(settings ?? {})) {
      // Leave pending; it will be retried when the window opens or kill switch is cleared.
      return false;
    }

    const profile = await this.loadProfileForSend(msg.tenant_id, msg.profile_id);
    if (!profile) throw new Error('Profile not found');

    const link = await getOrCreateMoyasarLink(this.supabase, {
      tenantId: msg.tenant_id,
      invoiceId: msg.invoice_id,
      callbackUrl: this.callbackUrl,
      sourceType: 'mada',
    });
    if (!link.ok) throw new Error(link.error);

    const [bodyAr, bodyEn] = this.fillTemplate(msg.template_key, profile, msg.amount_due ?? 0, msg.due_date ?? '', link.paymentUrl);
    const language = profile.preferred_language ?? 'ar';
    const to = msg.channel === 'email' ? profile.email : profile.phone;
    if (!to) throw new Error(`No ${msg.channel} destination for profile ${profile.id}`);

    let providerId = 'email';
    if (msg.channel === 'email') {
      await this.sendEmailMessage(to, bodyAr, bodyEn);
    } else {
      const connector = await this.selectConnector(msg.tenant_id, msg.channel as 'whatsapp' | 'sms');
      if (!connector) throw new Error(`No active ${msg.channel} connector configured`);

      const provider = getProvider(connector.provider);
      if (!provider) throw new Error(`Unknown provider ${connector.provider}`);

      const body = language === 'ar' ? bodyAr : bodyEn;
      const result = await provider.send({ config: connector.config, credentials: connector.credentials }, { to, text: body, channel: msg.channel as 'whatsapp' | 'sms' });
      providerId = connector.provider;
      if (!result.id) throw new Error('Provider did not return a message id');
    }

    const { error: updateError } = await this.supabase
      .from('collection_messages')
      .update({
        delivery_status: 'sent',
        sent_at: new Date().toISOString(),
        sent_to: to,
        moyasar_link: link.paymentUrl,
        personalized_body_ar: bodyAr,
        personalized_body_en: bodyEn,
      })
      .eq('id', msg.id)
      .eq('tenant_id', msg.tenant_id);
    if (updateError) {
      console.error('[collections/messenger] update failed:', updateError);
      throw new Error(`Failed to mark message as sent: ${updateError.message}`);
    }

    await writeLedger(this.supabase, {
      tenant_id: msg.tenant_id,
      action_type: 'message',
      actor: 'yamen',
      reference_table: 'collection_messages',
      reference_id: msg.id,
      input_snapshot: { message_id: msg.id, invoice_id: msg.invoice_id, channel: msg.channel, language },
      decision: 'sent',
      outcome: { provider: providerId, to, language },
    });

    // Mirror the outbound message into the staff↔parent thread for full case history.
    await this.threadService.mirrorYamenMessage(msg.tenant_id, msg.profile_id, bodyAr, bodyEn, providerId);
    return true;
  }

  private async sendEmailMessage(to: string, bodyAr: string, bodyEn: string): Promise<void> {
    const subject = 'Reminder: Tuition fee payment';
    const html = `<div dir="rtl" style="text-align:right;"><p>${bodyAr}</p><hr/><p dir="ltr" style="text-align:left;">${bodyEn}</p></div>`;
    await sendTransactionalEmail({ to, subject, html });
  }

  private fillTemplate(templateKey: string, profile: ProfileWithNames, amount: number, dueDate: string, link: string): [string, string] {
    const amountStr = amount.toFixed(2);
    const dueStr = dueDate;
    const guardianNameEn = profile.guardian_name_en ?? 'Parent';
    const guardianNameAr = profile.guardian_name_ar ?? 'ولي الأمر';
    const studentNameEn = profile.student_name_en ?? 'your child';
    const studentNameAr = profile.student_name_ar ?? 'ابنكم/ابنتكم';

    const templates = TEMPLATES[templateKey] ?? TEMPLATES.friendly_reminder;
    const ar = templates.ar
      .replace(/\{\{guardian_name\}\}/g, guardianNameAr)
      .replace(/\{\{student_name\}\}/g, studentNameAr)
      .replace(/\{\{amount_due\}\}/g, amountStr)
      .replace(/\{\{due_date\}\}/g, dueStr)
      .replace(/\{\{payment_link\}\}/g, link);
    const en = templates.en
      .replace(/\{\{guardian_name\}\}/g, guardianNameEn)
      .replace(/\{\{student_name\}\}/g, studentNameEn)
      .replace(/\{\{amount_due\}\}/g, amountStr)
      .replace(/\{\{due_date\}\}/g, dueStr)
      .replace(/\{\{payment_link\}\}/g, link);
    return [ar, en];
  }

  private async loadSettings(tenantId: string) {
    const { data } = await this.supabase
      .from('collection_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return data as { is_enabled: boolean; kill_switch_activated_at?: string | null; send_window_start?: string; send_window_end?: string; timezone?: string } | null;
  }

  private async loadOverdueProfiles(tenantId: string) {
    const { data, error } = await this.supabase
      .from('collection_profiles')
      .select('*, guardians(name_en, name_ar, phone, email), students(name_en, name_ar)')
      .eq('tenant_id', tenantId)
      .gt('outstanding_balance', 0)
      .order('outstanding_balance', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((p: Record<string, unknown>) => this.mapProfile(p));
  }

  private async loadProfileForSend(tenantId: string, profileId: string): Promise<ProfileWithNames | null> {
    const { data, error } = await this.supabase
      .from('collection_profiles')
      .select('*, guardians(name_en, name_ar, phone, email), students(name_en, name_ar)')
      .eq('id', profileId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return this.mapProfile(data);
  }

  private mapProfile(p: Record<string, unknown>): ProfileWithNames {
    const guardian = (p.guardians as Record<string, unknown>) ?? {};
    const student = (p.students as Record<string, unknown> | undefined) ?? (p.students as Record<string, unknown>[] ?? [{}])[0] ?? {};
    return {
      id: p.id as string,
      guardian_id: p.guardian_id as string,
      current_segment: (p.current_segment as string) ?? 'B',
      preferred_language: (p.preferred_language as string) ?? 'ar',
      guardian_name_en: (guardian.name_en as string) ?? undefined,
      guardian_name_ar: (guardian.name_ar as string) ?? undefined,
      student_name_en: (student.name_en as string) ?? undefined,
      student_name_ar: (student.name_ar as string) ?? undefined,
      phone: (guardian.phone as string) ?? undefined,
      email: (guardian.email as string) ?? undefined,
    };
  }

  private async findOldestOverdueInvoice(tenantId: string, guardianId: string): Promise<{ id: string; due_date: string; balance: number } | null> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.supabase
      .from('invoices')
      .select('id, due_date, total_amount, paid_amount, students!inner(guardian_id)')
      .eq('tenant_id', tenantId)
      .eq('students.guardian_id', guardianId)
      .lt('due_date', today)
      .in('status', ['issued', 'partial', 'overdue'])
      .order('due_date', { ascending: true })
      .limit(1);
    if (error) throw error;
    if (!data?.length) return null;
    const inv = data[0] as Record<string, unknown>;
    return {
      id: inv.id as string,
      due_date: String(inv.due_date),
      balance: Number(inv.total_amount ?? 0) - Number(inv.paid_amount ?? 0),
    };
  }

  private async getLastSentStep(tenantId: string, profileId: string, invoiceId: string): Promise<number | null> {
    const { data } = await this.supabase
      .from('collection_messages')
      .select('sequence_step')
      .eq('tenant_id', tenantId)
      .eq('profile_id', profileId)
      .eq('invoice_id', invoiceId)
      .in('delivery_status', ['sent', 'delivered', 'read'])
      .order('sequence_step', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? ((data as { sequence_step: number }).sequence_step) : null;
  }

  private async selectConnector(
    tenantId: string,
    channel: 'whatsapp' | 'sms' | 'email',
  ): Promise<{ provider: string; config: Record<string, unknown>; credentials: Record<string, string> } | null> {
    if (channel === 'email') return null;

    const { data, error } = await this.supabase
      .from('messaging_connectors')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) throw error;

    for (const row of (data ?? []) as unknown as { provider: string; config: unknown; credentials: string }[]) {
      const provider = getProvider(row.provider);
      if (provider && provider.channels.includes(channel)) {
        return { provider: row.provider, config: row.config as Record<string, unknown>, credentials: this.decryptCreds(row) };
      }
    }

    // Fallback to platform-level Infobip credentials when no tenant connector is configured.
    const apiKey = process.env.INFOBIP_API_KEY;
    const baseUrl = (process.env.INFOBIP_BASE_URL ?? '').replace(/\/+$/, '');
    if (apiKey && baseUrl) {
      const sender = process.env.INFOBIP_SMS_SENDER || 'EduSaga';
      const whatsappSender = process.env.INFOBIP_WHATSAPP_SENDER || '447860088970';
      return {
        provider: 'infobip',
        config: { base_url: baseUrl, sender, whatsapp_sender: whatsappSender },
        credentials: { api_key: apiKey },
      };
    }

    return null;
  }

  private decryptCreds(row: { credentials?: string | null }): Record<string, string> {
    if (!row.credentials) return {};
    if (!isAiCryptoConfigured()) return {};
    try {
      return JSON.parse(decryptSecret(row.credentials)) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async requestApproval(tenantId: string, profileId: string, invoiceId: string, step: SequenceStep): Promise<void> {
    await this.supabase.from('agent_approval_queue').insert({
      tenant_id: tenantId,
      item_type: 'escalation',
      reference_table: 'collection_messages',
      reference_id: invoiceId,
      requested_by: 'yamen',
      status: 'pending',
      payload: { profile_id: profileId, invoice_id: invoiceId, step },
    });
  }

  private nextSendWindow(settings: { send_window_start?: string; send_window_end?: string; timezone?: string }): string {
    const now = new Date();
    const tz = settings.timezone ?? 'Asia/Riyadh';
    const start = settings.send_window_start ?? '10:00:00';
    const [startHour, startMinute] = start.split(':').map(Number);

    // Build candidate send time at the start of the window in the tenant timezone.
    // v1: schedule for the next occurrence of the start time in the tenant timezone.
    // For simplicity, use the current UTC time plus offset for Asia/Riyadh (+3) if needed.
    const offsetMs = tz === 'Asia/Riyadh' ? 3 * 60 * 60 * 1000 : 0;
    const tzNow = new Date(now.getTime() + offsetMs);
    const windowStart = new Date(tzNow);
    windowStart.setUTCHours(startHour, startMinute, 0, 0);
    windowStart.setTime(windowStart.getTime() - offsetMs);
    if (windowStart <= now) {
      windowStart.setUTCDate(windowStart.getUTCDate() + 1);
    }
    return windowStart.toISOString();
  }

  private isInSendWindow(settings: { send_window_start?: string; send_window_end?: string; timezone?: string }): boolean {
    const tz = settings.timezone ?? 'Asia/Riyadh';
    const start = settings.send_window_start ?? '10:00:00';
    const end = settings.send_window_end ?? '20:00:00';
    const offsetMs = tz === 'Asia/Riyadh' ? 3 * 60 * 60 * 1000 : 0;
    const tzNow = new Date(new Date().getTime() + offsetMs);
    const nowTime = tzNow.getUTCHours() * 60 + tzNow.getUTCMinutes();
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    return nowTime >= startMin && nowTime <= endMin;
  }

  private daysBetween(a: string, b: string): number {
    return Math.round(new Date(a).getTime() / 86400000 - new Date(b).getTime() / 86400000);
  }
}

const TEMPLATES: Record<string, { ar: string; en: string }> = {
  friendly_reminder: {
    ar: 'السيد/ة {{guardian_name}}، نود تذكيركم برسوم {{student_name}} البالغة {{amount_due}} ريال سعودي والمستحقة بتاريخ {{due_date}}. يمكنكم السداد عبر الرابط: {{payment_link}}',
    en: 'Dear {{guardian_name}}, this is a friendly reminder that {{student_name}}\'s fee of {{amount_due}} SAR is due on {{due_date}}. Pay now: {{payment_link}}',
  },
  due_soon_notice: {
    ar: 'السيد/ة {{guardian_name}}، رسوم {{student_name}} البالغة {{amount_due}} ريال سعودي مستحقة قريباً بتاريخ {{due_date}}. للسداد: {{payment_link}}',
    en: 'Dear {{guardian_name}}, {{student_name}}\'s fee of {{amount_due}} SAR is due soon on {{due_date}}. Pay here: {{payment_link}}',
  },
  overdue_notice: {
    ar: 'السيد/ة {{guardian_name}}، رسوم {{student_name}} البالغة {{amount_due}} ريال سعودي متأخرة منذ {{due_date}}. نرجو السداد في أقرب وقت: {{payment_link}}',
    en: 'Dear {{guardian_name}}, {{student_name}}\'s fee of {{amount_due}} SAR is overdue since {{due_date}}. Please settle at your earliest convenience: {{payment_link}}',
  },
  installment_offer: {
    ar: 'السيد/ة {{guardian_name}}، لمساعدتكم في تسوية رسوم {{student_name}} البالغة {{amount_due}} ريال سعودي، يمكننا تقديم خطة تقسيط. راجعوا الرابط: {{payment_link}}',
    en: 'Dear {{guardian_name}}, to help settle {{student_name}}\'s fee of {{amount_due}} SAR, we can offer an installment plan. Review: {{payment_link}}',
  },
  escalation_notice: {
    ar: 'السيد/ة {{guardian_name}}، رسوم {{student_name}} البالغة {{amount_due}} ريال سعودي متأخرة منذ {{due_date}}. نرجو التواصل فوراً لتفادي المزيد من الإجراءات: {{payment_link}}',
    en: 'Dear {{guardian_name}}, {{student_name}}\'s fee of {{amount_due}} SAR remains overdue since {{due_date}}. Please contact us immediately to avoid further action: {{payment_link}}',
  },
  formal_notice_draft: {
    ar: 'السيد/ة {{guardian_name}}، نظراً لتأخر رسوم {{student_name}} البالغة {{amount_due}} ريال سعودي منذ {{due_date}}، تم رفع ملفكم للمراجعة القانونية. سيتواصل معكم الموظف المختص.',
    en: 'Dear {{guardian_name}}, due to the continued delay on {{student_name}}\'s fee of {{amount_due}} SAR since {{due_date}}, your case has been escalated for legal review. A staff member will contact you.',
  },
  payment_thank_you: {
    ar: 'السيد/ة {{guardian_name}}، تم استلام دفعتكم بقيمة {{amount_due}} ريال سعودي. شكراً لكم.',
    en: 'Dear {{guardian_name}}, we received your payment of {{amount_due}} SAR. Thank you.',
  },
};
