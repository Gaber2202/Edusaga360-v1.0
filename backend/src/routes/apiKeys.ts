/**
 * API key management — /api/api-keys
 *
 * First-party, browser-facing admin surface (Supabase JWT + tenant middleware)
 * for a school admin to mint, list, and revoke the API keys that external
 * systems use against /api/v1. This is the control plane; /api/v1 is the data
 * plane it authorizes.
 *
 * The plaintext secret is returned exactly ONCE, from POST /. After that only
 * metadata (prefix, scopes, timestamps) is ever readable — there is no endpoint
 * that can reveal an existing key, by design.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole } from '../middleware/auth.js';
import { generateApiKey } from '../lib/apiKeys.js';
import { API_SCOPES, isValidScope } from '../lib/apiScopes.js';

export const apiKeysRouter = Router();

// Key management is an admin-only, security-sensitive action.
const ADMIN_ONLY = ['admin'];

// GET /api/api-keys/scopes — the grantable scope list (drives the create UI).
apiKeysRouter.get('/scopes', requireRole(ADMIN_ONLY), (_req, res) => {
  res.json({ data: API_SCOPES });
});

const CreateKeySchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z
    .array(z.string())
    .min(1, 'At least one scope is required')
    .refine((s) => s.every(isValidScope), { message: 'One or more scopes are not recognised' }),
  expires_at: z.string().datetime().optional(),
});

// POST /api/api-keys — mint a new key. Returns the plaintext secret ONCE.
apiKeysRouter.post('/', requireRole(ADMIN_ONLY), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'no_tenant' });

  const parsed = CreateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const { name, scopes, expires_at } = parsed.data;

  const key = generateApiKey();
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      tenant_id: tenantId,
      name,
      key_prefix: key.prefix,
      key_hash: key.hash,
      scopes,
      created_by: req.user!.email,
      expires_at: expires_at ?? null,
    })
    .select('id, name, key_prefix, scopes, expires_at, created_at')
    .single();

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to create API key' });
  }

  // The one and only time the caller sees the secret.
  res.status(201).json({ ...(data as object), api_key: key.plaintext });
});

// GET /api/api-keys — list this tenant's keys (metadata only, never the secret).
apiKeysRouter.get('/', requireRole(ADMIN_ONLY), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'no_tenant' });

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, created_by, last_used_at, expires_at, revoked_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to list API keys' });
  res.json({ data: data ?? [] });
});

// DELETE /api/api-keys/:id — revoke a key (soft: sets revoked_at). Idempotent.
apiKeysRouter.delete('/:id', requireRole(ADMIN_ONLY), async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'no_tenant' });

  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'server_error', message: 'Failed to revoke API key' });
  if (!data) return res.status(404).json({ error: 'not_found', message: 'API key not found' });
  res.json({ ok: true });
});
