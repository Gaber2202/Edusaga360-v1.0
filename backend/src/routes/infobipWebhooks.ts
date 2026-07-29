import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase.js';

export const infobipWebhookRouter = Router();

const INFOBIP_WEBHOOK_SECRET = process.env.INFOBIP_WEBHOOK_SECRET;

interface InfobipStatus {
  name?: string;
  description?: string;
  groupName?: string;
}

interface InfobipResult {
  messageId?: string;
  channel?: string;
  to?: string;
  status?: InfobipStatus;
  error?: Record<string, unknown>;
  sentAt?: string;
  doneAt?: string;
}

function normalizeStatus(status?: string): string {
  const s = (status ?? '').toUpperCase();
  if (['DELIVERED', 'DELIVERED_TO_HANDSET', 'DELIVERED_TO_NETWORK'].includes(s)) return 'delivered';
  if (['READ', 'SEEN', 'OPENED', 'CONSUMED'].includes(s)) return 'read';
  if (['FAILED', 'EXPIRED', 'REJECTED', 'UNDELIVERABLE', 'UNDELIVERED', 'UNKNOWN'].includes(s)) return 'failed';
  if (['PENDING', 'ENROUTE', 'ACCEPTED', 'SENT', 'PENDING_ENROUTE', 'WAITING'].includes(s)) return 'sent';
  return s ? s.toLowerCase() : 'unknown';
}

function extractResults(body: unknown): InfobipResult[] {
  if (!body || typeof body !== 'object') return [];
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.results)) return b.results as InfobipResult[];
  if (Array.isArray(b.messages)) return b.messages as InfobipResult[];
  // Single message log body
  if (b.messageId || b.status) return [b as InfobipResult];
  return [];
}

infobipWebhookRouter.post('/', async (req: Request, res: Response) => {
  try {
    // Optional secret validation. Infobip can be configured with a query token
    // or a custom header. Accept either; if the env is not set, process anyway.
    const token = req.query.token ?? req.headers['x-infobip-webhook-secret'];
    if (INFOBIP_WEBHOOK_SECRET && token !== INFOBIP_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const results = extractResults(req.body);
    if (!results.length) {
      return res.json({ received: true, processed: 0 });
    }

    const now = new Date().toISOString();
    let processed = 0;

    for (const r of results) {
      const messageId = r.messageId;
      if (!messageId) continue;

      const channel = (r.channel ?? req.body.channel ?? 'unknown').toString().toLowerCase();
      const statusName = normalizeStatus(r.status?.name);
      const payload = { ...r, receivedAt: now, raw: req.body };

      // Try to find the outbound collection message this report belongs to.
      const { data: msg } = await supabase
        .from('collection_messages')
        .select('id, tenant_id, delivery_status')
        .eq('provider_message_id', messageId)
        .maybeSingle();

      const tenantId = (msg?.tenant_id as string | undefined) ?? null;

      if (msg) {
        const newStatus = statusName;
        await supabase
          .from('collection_messages')
          .update({
            delivery_status: newStatus,
            delivery_response: payload,
            delivery_updated_at: now,
          })
          .eq('id', msg.id)
          .eq('tenant_id', msg.tenant_id);
      }

      await supabase.from('message_delivery_events').insert({
        tenant_id: tenantId,
        provider: 'infobip',
        channel,
        provider_message_id: messageId,
        event_status: statusName,
        event_payload: payload,
        collection_message_id: msg?.id ?? null,
      });

      processed++;
    }

    return res.json({ received: true, processed });
  } catch (err) {
    console.error('[infobip/webhook] delivery report processing failed:', err);
    return res.status(500).json({ error: 'webhook_processing_failed', message: (err as Error).message });
  }
});
