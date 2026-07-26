import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';

export const webhooksRouter = Router();

const RegisterWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(['invoice.paid', 'invoice.overdue', 'credit_note.created', 'payment.received', 'invoice.created'])).min(1),
  secret: z.string().optional(),
});

webhooksRouter.post('/', requireScope('webhooks:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const tenantId = req.apiClient!.tenantId;
    const parsed = RegisterWebhookSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });

    const { data, error } = await supabase
      .from('tenant_webhooks')
      .insert({
        tenant_id: tenantId,
        url: parsed.data.url,
        events: parsed.data.events,
        secret: parsed.data.secret,
        scopes: req.apiClient!.scopes,
        created_by: `api:${req.apiClient!.keyId}`,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'server_error', message: error.message });
    return res.status(201).json(data);
  } catch (err) {
    console.error('[external/v1/webhooks] failed:', err);
    return res.status(500).json({ error: 'server_error', message: (err as Error).message });
  }
});

webhooksRouter.get('/', requireScope('webhooks:write'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { data, error } = await supabase
    .from('tenant_webhooks')
    .select('id, url, events, active, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'server_error', message: error.message });
  return res.json(data ?? []);
});

webhooksRouter.delete('/:id', requireScope('webhooks:write'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { id } = req.params;
  const { error } = await supabase
    .from('tenant_webhooks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id as string);
  if (error) return res.status(500).json({ error: 'server_error', message: error.message });
  return res.status(204).send();
});
