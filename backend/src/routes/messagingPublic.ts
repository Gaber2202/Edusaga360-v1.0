import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { CollectionThreadService } from '../services/collections/threads.js';

export const messagingPublicRouter = Router();

const MetaWebhookSchema = z.object({
  object: z.string().optional(),
  entry: z.array(z.record(z.unknown())).optional(),
});

const GenericWebhookSchema = z.object({
  from: z.string(),
  text: z.string(),
  message_id: z.string(),
  profile_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
});

function classifyReply(text: string): string {
  const lower = text.toLowerCase();
  const ar = lower;
  if (['paid', 'سددت', 'دفعت', 'تم', 'yes', 'ok', 'نعم', 'تمام'].some((k) => lower.includes(k))) {
    return 'paid_claim';
  }
  if (['plan', 'تقسيط', 'installment', 'تقسط'].some((k) => ar.includes(k))) {
    return 'installment_request';
  }
  if (['later', 'لاحقاً', 'postpone', 'تأجيل', 'delay'].some((k) => lower.includes(k))) {
    return 'promise_to_pay';
  }
  if (['no', 'لا', 'cannot', 'cant', 'unable', 'مقدر', 'لا استطيع', 'stop', 'unsubscribe', 'opt out', 'stop sending'].some((k) => lower.includes(k))) {
    return 'dispute';
  }
  return 'other';
}

async function handleInbound(
  tenantId: string,
  from: string,
  text: string,
  externalMessageId: string,
  res: Response,
) {
  const replyClass = classifyReply(text);
  const threadService = new CollectionThreadService(supabase);

  // Find the most recent sent message to this number for this tenant.
  const { data: message } = await supabase
    .from('collection_messages')
    .select('id, profile_id, invoice_id')
    .eq('tenant_id', tenantId)
    .eq('sent_to', from)
    .in('delivery_status', ['sent', 'delivered', 'read'])
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let profileId: string | undefined = (message as { profile_id?: string })?.profile_id;
  const messageId: string | undefined = (message as { id?: string })?.id;

  // If no message found, try to find a guardian profile by phone.
  if (!profileId) {
    const { data: guardian } = await supabase
      .from('guardians')
      .select('id, tenant_id, students(id)')
      .eq('tenant_id', tenantId)
      .or(`phone.eq.${from},phone.eq.${from.replace('+', '')}`)
      .maybeSingle();
    if (!guardian) {
      return res.status(404).json({ error: 'profile_not_found' });
    }

    const guardianId = (guardian as { id: string }).id;
    const { data: profile } = await supabase
      .from('collection_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('guardian_id', guardianId)
      .maybeSingle();
    profileId = (profile as { id?: string })?.id;
  }

  if (!profileId) {
    return res.status(404).json({ error: 'profile_not_found' });
  }

  if (messageId) {
    await supabase
      .from('collection_messages')
      .update({ reply_class: replyClass, reply_raw: text, reply_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('tenant_id', tenantId);
  }

  await supabase.from('collection_message_replies').insert({
    tenant_id: tenantId,
    message_id: messageId,
    reply_text: text,
    reply_class: replyClass,
    provider_message_id: externalMessageId,
    from_number: from,
  });

  // Stop active sequences for this profile if the parent opts out or disputes.
  if (replyClass === 'dispute' || replyClass === 'opt_out') {
    await supabase
      .from('collection_messages')
      .update({ delivery_status: 'stopped', stopped_at: new Date().toISOString(), stop_reason: `inbound_${replyClass}` })
      .eq('tenant_id', tenantId)
      .eq('profile_id', profileId)
      .in('delivery_status', ['pending', 'scheduled', 'failed']);
  }

  await threadService.addMessage(tenantId, {
    thread_id: await threadService.getOrCreateProfileThread(tenantId, profileId),
    sender_type: 'guardian',
    body_en: text,
    body_ar: text,
  });

  return res.json({ received: true, reply_class: replyClass });
}

// ─── POST /api/public/messaging/:provider/webhook ───────────────────────────────
messagingPublicRouter.post('/:provider/webhook', async (req, res) => {
  const provider = req.params.provider as string;
  try {
    if (provider === 'meta' || provider === 'whatsapp') {
      const parsed = MetaWebhookSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'validation_error' });

      const entry = parsed.data.entry?.[0] as Record<string, unknown> | undefined;
      const changes = (entry?.changes as Record<string, unknown>[] | undefined)?.[0] as Record<string, unknown> | undefined;
      const value = (changes?.value as Record<string, unknown> | undefined) ?? {};
      const messages = (value.messages as Record<string, unknown>[] | undefined) ?? [];
      if (!messages.length) return res.json({ received: true });

      const msg = messages[0];
      const from = String(msg.from ?? '');
      const text = String((msg.text as Record<string, unknown>)?.body ?? '');
      const id = String(msg.id ?? '');

      // Meta payloads do not carry tenant_id; we must derive it from the From number.
      const { data: guardian } = await supabase
        .from('guardians')
        .select('tenant_id')
        .or(`phone.eq.${from},phone.eq.${from.replace('+', '')}`)
        .maybeSingle();
      if (!guardian) return res.status(404).json({ error: 'profile_not_found' });

      return await handleInbound((guardian as { tenant_id: string }).tenant_id, from, text, id, res);
    }

    // Infobip / generic / custom provider fallback.
    const parsed = GenericWebhookSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });

    if (!parsed.data.tenant_id) {
      return res.status(400).json({ error: 'tenant_id_required' });
    }

    return await handleInbound(parsed.data.tenant_id, parsed.data.from, parsed.data.text, parsed.data.message_id, res);
  } catch (err) {
    console.error(`[public/messaging/${provider}/webhook] error:`, err);
    return res.status(500).json({ error: 'webhook_processing_failed', message: (err as Error).message });
  }
});
