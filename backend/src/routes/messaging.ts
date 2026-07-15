/**
 * Messaging Integration — /api/messaging
 *
 * First-party surface to connect a school's SMS / WhatsApp gateway and send
 * through it. Mirrors the email connector model: credentials are AES-256-GCM
 * encrypted at rest (lib/aiCrypto) and never returned by any read. Connector
 * config is gated to admin/it_admin; sending + reads to staff roles.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole, STAFF_ROLES } from '../middleware/auth.js';
import { decryptSecret, encryptSecret, isAiCryptoConfigured } from '../lib/aiCrypto.js';
import { describeProviders, getProvider } from '../services/messaging/registry.js';
import { MessagingError } from '../services/messaging/types.js';

export const messagingRouter = Router();

const MESSAGING_ADMIN_ROLES = ['admin', 'it_admin'];

const PUBLIC_COLUMNS =
  'id, provider, display_name, config, is_active, status, last_error, created_by, created_at, updated_at';

interface ConnectorRow {
  id: string;
  provider: string;
  config: Record<string, unknown> | null;
  credentials: string | null;
}

async function loadConnector(tenantId: string, id: string): Promise<ConnectorRow | null> {
  const { data } = await supabase
    .from('messaging_connectors')
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

// ─── GET /api/messaging/providers ─────────────────────────────────────────────
messagingRouter.get('/providers', requireRole(STAFF_ROLES), (_req, res) => {
  res.json({ data: describeProviders() });
});

// ─── GET /api/messaging/connectors — list (never returns credentials) ─────────
messagingRouter.get('/connectors', requireRole(STAFF_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('messaging_connectors')
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

// ─── POST /api/messaging/connectors — create ──────────────────────────────────
messagingRouter.post('/connectors', requireRole(MESSAGING_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const parsed = ConnectorWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const { provider: providerId, display_name, config = {}, credentials = {} } = parsed.data;

  const provider = getProvider(providerId);
  if (!provider) {
    return res.status(400).json({ error: 'unknown_provider', message: `Unknown messaging provider: ${providerId}` });
  }
  const invalid = provider.validate(config, credentials);
  if (invalid) return res.status(400).json({ error: 'invalid_config', message: invalid });

  const hasCreds = Object.keys(credentials).length > 0;
  if (hasCreds && !isAiCryptoConfigured()) {
    return res.status(503).json({ error: 'encryption_unavailable', message: 'Credential encryption key (AI_CONFIG_ENC_KEY) is not configured.' });
  }

  const { data, error } = await supabase
    .from('messaging_connectors')
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

// ─── PATCH /api/messaging/connectors/:id — update ─────────────────────────────
messagingRouter.patch('/connectors/:id', requireRole(MESSAGING_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
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
    .from('messaging_connectors')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', String(req.params.id))
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to update connector' });
  res.json({ data });
});

const SendSchema = z.object({
  to: z.string().min(3).max(32),
  text: z.string().min(1).max(2000),
  channel: z.enum(['sms', 'whatsapp']).optional(),
});

// ─── POST /api/messaging/connectors/:id/send ──────────────────────────────────
messagingRouter.post('/connectors/:id/send', requireRole(STAFF_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const parsed = SendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const row = await loadConnector(tenantId, String(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });

  const provider = getProvider(row.provider)!;
  const channel = parsed.data.channel ?? provider.channels[0];
  if (!provider.channels.includes(channel)) {
    return res.status(400).json({ error: 'unsupported_channel', message: `${provider.label} does not support ${channel}.` });
  }

  const config = row.config ?? {};
  const credentials = decryptCreds(row);
  const invalid = provider.validate(config, credentials);
  if (invalid) return res.status(400).json({ error: 'invalid_config', message: invalid });

  try {
    const result = await provider.send({ config, credentials }, { to: parsed.data.to, text: parsed.data.text, channel });
    res.json({ ok: true, id: result.id ?? null, channel });
  } catch (e) {
    const message = e instanceof MessagingError ? e.message : 'Send failed';
    res.status(502).json({ ok: false, error: message });
  }
});

// ─── DELETE /api/messaging/connectors/:id ─────────────────────────────────────
messagingRouter.delete('/connectors/:id', requireRole(MESSAGING_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('messaging_connectors')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', String(req.params.id))
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to delete connector' });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});
