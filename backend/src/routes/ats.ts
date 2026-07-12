/**
 * ATS Integration — /api/ats
 *
 * First-party admin/HR surface (Supabase JWT + tenant middleware) to connect an
 * external Applicant Tracking System and sync its candidates into HR.
 *
 * Connector credentials are AES-256-GCM encrypted at rest (lib/aiCrypto) — the
 * plaintext token is accepted on write, encrypted immediately, and NEVER
 * returned by any read. The provider registry (services/ats) knows how to talk
 * to LinkedIn Talent, Indeed, Greenhouse, Workday, and a fully config-driven
 * custom provider.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole, HR_ROLES } from '../middleware/auth.js';
import { decryptSecret, encryptSecret, isAiCryptoConfigured } from '../lib/aiCrypto.js';
import { describeProviders, getProvider } from '../services/ats/registry.js';
import { fetchCandidates, upsertCandidates } from '../services/ats/sync.js';
import { AtsError } from '../services/ats/types.js';

export const atsRouter = Router();

// Configuring connectors is a sensitive, credential-holding action → tighter than
// general HR read access.
const ATS_ADMIN_ROLES = ['admin', 'hr_head', 'hr_admin'];

// Columns safe to return — everything EXCEPT the encrypted `credentials` blob.
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
    .from('ats_connectors')
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

// ─── GET /api/ats/providers — descriptors for the config UI ───────────────────
atsRouter.get('/providers', requireRole(HR_ROLES), (_req, res) => {
  res.json({ data: describeProviders() });
});

// ─── GET /api/ats/connectors — list (never returns credentials) ───────────────
atsRouter.get('/connectors', requireRole(HR_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('ats_connectors')
    .select(`${PUBLIC_COLUMNS}, credentials`)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to list connectors' });

  // Collapse the encrypted blob to a boolean so no ciphertext leaves the server.
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

// ─── POST /api/ats/connectors — create ────────────────────────────────────────
atsRouter.post('/connectors', requireRole(ATS_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const parsed = ConnectorWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const { provider: providerId, display_name, config = {}, credentials = {} } = parsed.data;

  const provider = getProvider(providerId);
  if (!provider) {
    return res.status(400).json({ error: 'unknown_provider', message: `Unknown ATS provider: ${providerId}` });
  }

  const invalid = provider.validate(config, credentials);
  if (invalid) return res.status(400).json({ error: 'invalid_config', message: invalid });

  const hasCreds = Object.keys(credentials).length > 0;
  if (hasCreds && !isAiCryptoConfigured()) {
    return res.status(503).json({ error: 'encryption_unavailable', message: 'Credential encryption key (AI_CONFIG_ENC_KEY) is not configured.' });
  }

  const { data, error } = await supabase
    .from('ats_connectors')
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

// ─── PATCH /api/ats/connectors/:id — update ───────────────────────────────────
atsRouter.patch('/connectors/:id', requireRole(ATS_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
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

  // Re-validate whenever config or credentials are touched.
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
    .from('ats_connectors')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', req.params.id)
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to update connector' });
  res.json({ data });
});

// ─── POST /api/ats/connectors/:id/test — validate + probe ─────────────────────
atsRouter.post('/connectors/:id/test', requireRole(ATS_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const row = await loadConnector(tenantId, String(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });

  const provider = getProvider(row.provider)!;
  const credentials = decryptCreds(row);
  const config = row.config ?? {};

  const invalid = provider.validate(config, credentials);
  if (invalid) return res.status(400).json({ ok: false, error: invalid });

  try {
    const candidates = await fetchCandidates(provider, { config, credentials });
    res.json({ ok: true, sample_count: candidates.length });
  } catch (e) {
    const message = e instanceof AtsError ? e.message : 'Connection failed';
    res.status(502).json({ ok: false, error: message });
  }
});

// ─── POST /api/ats/connectors/:id/sync — pull + upsert candidates ─────────────
atsRouter.post('/connectors/:id/sync', requireRole(ATS_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const row = await loadConnector(tenantId, String(req.params.id));
  if (!row) return res.status(404).json({ error: 'not_found' });

  const provider = getProvider(row.provider)!;
  const credentials = decryptCreds(row);
  const config = row.config ?? {};

  const invalid = provider.validate(config, credentials);
  if (invalid) return res.status(400).json({ error: 'invalid_config', message: invalid });

  const now = new Date().toISOString();
  try {
    const candidates = await fetchCandidates(provider, { config, credentials });
    const result = await upsertCandidates(supabase, tenantId, row.id, row.provider, candidates);
    await supabase
      .from('ats_connectors')
      .update({ status: 'ok', last_sync_at: now, last_sync_status: 'ok', last_error: null, updated_at: now })
      .eq('tenant_id', tenantId)
      .eq('id', row.id);
    res.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof AtsError ? e.message : 'Sync failed';
    await supabase
      .from('ats_connectors')
      .update({ status: 'error', last_sync_at: now, last_sync_status: 'error', last_error: message, updated_at: now })
      .eq('tenant_id', tenantId)
      .eq('id', row.id);
    res.status(502).json({ ok: false, error: message });
  }
});

// ─── DELETE /api/ats/connectors/:id ───────────────────────────────────────────
atsRouter.delete('/connectors/:id', requireRole(ATS_ADMIN_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const { data, error } = await supabase
    .from('ats_connectors')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to delete connector' });
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

// ─── GET /api/ats/candidates — synced candidates ──────────────────────────────
atsRouter.get('/candidates', requireRole(HR_ROLES), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id!;
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { provider, connector_id } = req.query as Record<string, string | undefined>;

  let query = supabase
    .from('hr_candidates')
    .select('id, connector_id, provider, external_id, full_name, email, phone, job_title, stage, applied_at, synced_at', { count: 'exact' })
    .eq('tenant_id', tenantId);
  if (provider) query = query.eq('provider', provider);
  if (connector_id) query = query.eq('connector_id', connector_id);

  const { data, error, count } = await query
    .order('synced_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to list candidates' });
  res.json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } });
});
