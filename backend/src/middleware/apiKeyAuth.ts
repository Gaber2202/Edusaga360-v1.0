/**
 * Authentication for the external integration API (`/api/v1`).
 *
 * This is the counterpart to authMiddleware (Supabase JWT, first-party browser
 * apps). External systems — a legacy SIS doing a one-off migration, an ATS
 * syncing candidates, a mail provider — instead present a tenant-scoped API key
 * as either `Authorization: Bearer esk_...` or `X-API-Key: esk_...`.
 *
 * On success it attaches `req.apiClient` with the tenant and granted scopes.
 * Handlers MUST read the tenant from `req.apiClient.tenantId` and never from
 * caller input, so a key can only ever reach its own tenant's rows.
 */
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { prefixOf, verifyKey } from '../lib/apiKeys.js';

export interface ApiKeyRequest extends Request {
  apiClient?: {
    keyId: string;
    tenantId: string;
    scopes: string[];
  };
}

/** Pull the raw key from either the Bearer header or X-API-Key. */
function extractKey(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const alt = req.headers['x-api-key'];
  if (typeof alt === 'string' && alt.trim()) return alt.trim();
  return null;
}

export async function apiKeyAuth(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction,
) {
  const key = extractKey(req);
  // All keys carry the "esk_" marker — reject anything that can't be one before
  // touching the database.
  if (!key || !key.startsWith('esk_')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing or malformed API key' });
  }

  const { data: row, error } = await supabase
    .from('api_keys')
    .select('id, tenant_id, key_hash, scopes, revoked_at, expires_at')
    .eq('key_prefix', prefixOf(key))
    .maybeSingle();

  // Uniform 401 for "no such key" and "wrong secret" — never reveal which.
  if (error || !row || !verifyKey(key, row.key_hash as string)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid API key' });
  }
  if (row.revoked_at) {
    return res.status(401).json({ error: 'unauthorized', message: 'API key revoked' });
  }
  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) {
    return res.status(401).json({ error: 'unauthorized', message: 'API key expired' });
  }

  req.apiClient = {
    keyId: row.id as string,
    tenantId: row.tenant_id as string,
    scopes: (row.scopes as string[]) ?? [],
  };

  // Best-effort last-used bump for observability — never block the request on it.
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => undefined, () => undefined);

  next();
}

/**
 * Guard factory — 403 unless the authenticated key was granted `scope`.
 * Must run after apiKeyAuth (which populates req.apiClient).
 */
export function requireScope(scope: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (!req.apiClient?.scopes.includes(scope)) {
      return res.status(403).json({ error: 'forbidden', message: `Missing required scope: ${scope}` });
    }
    next();
  };
}
