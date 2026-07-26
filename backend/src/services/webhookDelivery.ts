import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface WebhookPayload {
  event: string;
  tenant_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function dispatchWebhook(
  supabase: SupabaseClient,
  tenantId: string,
  event: string,
  data: Record<string, unknown>,
  sourceId?: string,
): Promise<{ delivered: number; failed: number }> {
  const { data: hooks } = await supabase
    .from('tenant_webhooks')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .contains('events', [event]);

  let delivered = 0;
  let failed = 0;

  for (const hook of hooks ?? []) {
    if (sourceId) {
      const { data: existing } = await supabase
        .from('webhook_deliveries')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('webhook_id', hook.id)
        .eq('event', event)
        .eq('source_id', sourceId)
        .eq('delivery_status', 'delivered')
        .maybeSingle();
      if (existing) continue;
    }

    const payload: WebhookPayload = {
      event,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
    };
    if (hook.secret) {
      headers['X-Webhook-Signature'] = `sha256=${signPayload(body, hook.secret as string)}`;
    }

    let status = 0;
    let responseBody = '';
    try {
      const res = await fetch(hook.url as string, { method: 'POST', headers, body });
      status = res.status;
      responseBody = await res.text();
      if (res.ok) delivered++;
      else failed++;
    } catch (err) {
      status = 0;
      responseBody = (err as Error).message;
      failed++;
    }

    await supabase.from('webhook_deliveries').insert({
      tenant_id: tenantId,
      webhook_id: hook.id,
      event,
      source_id: sourceId,
      payload,
      response_status: status,
      response_body: responseBody,
      delivery_status: status >= 200 && status < 300 ? 'delivered' : 'failed',
      retry_count: 0,
      next_retry_at: status >= 200 && status < 300 ? null : new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }

  return { delivered, failed };
}
