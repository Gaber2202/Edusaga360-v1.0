/**
 * Email Integration — /api/email
 *
 * First-party admin/IT + staff surface to connect a school's own mailbox (SMTP,
 * Gmail, Microsoft 365, or a custom gateway), send through it, and — where the
 * provider supports it — sync inbound mail into email_messages.
 *
 * Credentials are AES-256-GCM encrypted at rest (lib/aiCrypto) and NEVER
 * returned by any read. Connector config is gated to admin/it_admin; sending and
 * reads are open to staff roles.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole, STAFF_ROLES } from '../middleware/auth.js';
import { decryptSecret, encryptSecret, isAiCryptoConfigured } from '../lib/aiCrypto.js';
import { describeProviders, getProvider } from '../services/email/registry.js';
import { upsertMessages } from '../services/email/sync.js';
import { EmailError } from '../services/email/types.js';

export const emailConnectorsRouter = Router();

// Configuring mail connectors holds credentials → restrict to admin/IT.
const EMAIL_ADMIN_ROLES = ['admin', 'it_admin'];

const PUBLIC_COLUMNS =
  'id, provider, display_name, config, is_active, status, last_sync_at, last_sync_status, last_error, created_by, created_at, updated_at';

interface ConnectorRow {
  id: string;
  provider: string;
  config: Record<string, unknown> | null;
  credentials: string | null;
}

async function loadConnector(tenantId: string, id: string): Promise<ConnectorRow | null> {
  const { data } = await supabase
    .from('email_connectors')
    .select('id, provider, config, credentials')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return (data as ConnectorRow) ?? null;
}

function decryptCreds(row: ConnectorRow): Record<string, string> {
  if (!row.credentials) return {};
  try {
    return JSON.parse(decryptSecret(row.credentials)) as Record<string, string>;
  } catch {
    return {};
  }
}

// ─── GET /api/email/providers ─────────────────────────────────────────────────
emailConnectorsRouter.get('/providers', requireRole(STAFF_ROLES), (_req, res) => {
  res.json({ data: describeProviders() });
});

// ─── GET /api/email/connectors — list (never returns credentials) ─────────────
emailConnectorsRouter.get('/connectors', requireRole(STAFF_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('email_connectors')
    .select(`${PUBLIC_COLUMNS}, credentials`)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to list connectors' });

  const rows = (data ?? []).map((r) => {
    const { credentials, ...rest } = r as Record<string, unknown>;
    return { ...rest, has_credentials: !!credentials };
  });
  res.json({ data: rows });
});

const ConnectorWriteSchema = z.object({
  provider: z.string().min(1),
  display_name: z.string().min(1).max(120),
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.string()).optional(),
});

// ─── POST /api/email/connectors — create ──────────────────────────────────────
emailConnectorsRouter.post('/connectors', requireRole(EMAIL_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const parsed = ConnectorWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const { provider: providerId, display_name, config = {}, credentials = {} } = parsed.data;

  const provider = getProvider(providerId);
  if (!provider) {
    return res.status(400).json({ error: 'unknown_provider', message: `Unknown email provider: ${providerId}` });
  }
  const invalid = provider.validate(config, credentials);
  if (invalid) return res.status(400).json({ error: 'invalid_config', message: invalid });

  const hasCreds = Object.keys(credentials).length > 0;
  if (hasCreds && !isAiCryptoConfigured()) {
    return res.status(503).json({ error: 'encryption_unavailable', message: 'Credential encryption key (AI_CONFIG_ENC_KEY) is not configured.' });
  }

  const { data, error } = await supabase
    .from('email_connectors')
    .insert({
      tenant_id: tenantId,
      provider: providerId,
      display_name,
      config,
      credentials: hasCreds ? encryptSecret(JSON.stringify(credentials)) : null,
      status: 'configured',
      created_by: req.user!.email,
    })
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to create connector' });
  res.status(201).json({ data });
});

const ConnectorUpdateSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// ─── PATCH /api/email/connectors/:id — update ─────────────────────────────────
emailConnectorsRouter.patch('/connectors/:id', requireRole(EMAIL_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const parsed = ConnectorUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const existing = await loadConnector(tenantId, String(req.params.id));
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const provider = getProvider(existing.provider)!;
  const nextConfig = parsed.data.config ?? (existing.config ?? {});
  const nextCreds = parsed.data.credentials ?? decryptCreds(existing);

  if (parsed.data.config || parsed.data.credentials) {
    const invalid = provider.validate(nextConfig, nextCreds);
    if (invalid) return res.status(400).json({ error: 'invalid_config', message: invalid });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.display_name !== undefined) patch.display_name = parsed.data.display_name;
  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;
  if (parsed.data.config !== undefined) patch.config = parsed.data.config;
  if (parsed.data.credentials !== undefined) {
    if (!isAiCryptoConfigured()) {
      return res.status(503).json({ error: 'encryption_unavailable', message: 'Credential encryption key is not configured.' });
    }
    patch.credentials = encryptSecret(JSON.stringify(parsed.data.credentials));
  }

  const { data, error } = await supabase
    .from('email_connectors')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', String(req.params.id))
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to update connector' });
  res.json({ data });
});

const SendSchema = z
  .object({
    to: z.string().email(),
    subject: z.string().min(1).max(300),
    html: z.string().optional(),
    text: z.string().optional(),
  })
  .refine((m) => !!m.html || !!m.text, { message: 'Provide html or text' });

// ─── POST /api/email/connectors/:id/send — send through the connector ─────────
emailConnectorsRouter.post('/connectors/:id/send', requireRole(STAFF_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const row = await loadConnector(tenantId, String(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });

  const provider = getProvider(row.provider)!;
  const config = row.config ?? {};
  const credentials = decryptCreds(row);
  const invalid = provider.validate(config, credentials);
  if (invalid) return res.status(400).json({ error: 'invalid_config', message: invalid });

  try {
    const result = await provider.send({ config, credentials }, parsed.data);
    res.json({ ok: true, id: result.id ?? null });
  } catch (e) {
    const message = e instanceof EmailError ? e.message : 'Send failed';
    res.status(502).json({ ok: false, error: message });
  }
});

// ─── POST /api/email/connectors/:id/sync — pull inbound → email_messages ──────
emailConnectorsRouter.post('/connectors/:id/sync', requireRole(EMAIL_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const row = await loadConnector(tenantId, String(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });

  const provider = getProvider(row.provider)!;
  if (!provider.capabilities.receive || !provider.fetchMessages) {
    return res.status(400).json({ error: 'receive_unsupported', message: `${provider.label} does not support inbound sync.` });
  }

  const config = row.config ?? {};
  const credentials = decryptCreds(row);
  const now = new Date().toISOString();
  try {
    const messages = await provider.fetchMessages({ config, credentials });
    const result = await upsertMessages(supabase, tenantId, row.id, row.provider, messages);
    await supabase
      .from('email_connectors')
      .update({ status: 'ok', last_sync_at: now, last_sync_status: 'ok', last_error: null, updated_at: now })
      .eq('tenant_id', tenantId)
      .eq('id', row.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof EmailError ? e.message : 'Sync failed';
    await supabase
      .from('email_connectors')
      .update({ status: 'error', last_sync_at: now, last_sync_status: 'error', last_error: message, updated_at: now })
      .eq('tenant_id', tenantId)
      .eq('id', row.id);
    res.status(502).json({ ok: false, error: message });
  }
});

// ─── DELETE /api/email/connectors/:id ─────────────────────────────────────────
emailConnectorsRouter.delete('/connectors/:id', requireRole(EMAIL_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('email_connectors')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', String(req.params.id))
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to delete connector' });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ─── GET /api/email/messages — synced inbound mail ────────────────────────────
emailConnectorsRouter.get('/messages', requireRole(STAFF_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { provider, connector_id } = req.query as Record<string, string | undefined>;

  let query = supabase
    .from('email_messages')
    .select('id, connector_id, provider, external_id, from_address, to_address, subject, snippet, received_at, synced_at', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (provider) query = query.eq('provider', provider);
  if (connector_id) query = query.eq('connector_id', connector_id);

  const { data, error, count } = await query
    .order('received_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to list messages' });
  res.json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } });
});
