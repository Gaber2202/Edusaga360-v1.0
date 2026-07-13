/**
 * Resolve which tenant a request operates on.
 *
 * Most routes read `req.user.tenant_id` straight from the Supabase JWT
 * (app_metadata). That breaks in two real cases that surfaced on the
 * Integrations screen:
 *   1. Platform-owner / super-admin accounts are not tied to a single school, so
 *      their token legitimately carries no tenant_id.
 *   2. A school admin whose token was minted before the tenant claim was
 *      standardized — the claim is missing from the JWT even though the DB row
 *      (`users.tenant_id`) has it.
 *
 * This helper handles both: platform owners must name a tenant explicitly; for
 * everyone else we trust the JWT claim first and fall back to the users table so
 * a stale token still works.
 */
import { AuthenticatedRequest } from '../middleware/auth.js';
import { supabase } from './supabase.js';

export interface ResolvedTenant {
  tenantId?: string;
  /** Human-readable reason when tenantId is absent. */
  error?: string;
}

export async function resolveTenantId(
  req: AuthenticatedRequest,
  explicit?: string,
): Promise<ResolvedTenant> {
  // Platform owners span every tenant — they must say which one they mean.
  if (req.user?.is_platform_owner) {
    if (!explicit) {
      return { error: 'This account manages all schools and is not tied to one. Specify a tenant_id.' };
    }
    return { tenantId: explicit };
  }

  // Normal path: the tenant claim is on the token.
  if (req.user?.tenant_id) return { tenantId: req.user.tenant_id };

  // Resilience fallback: token lacks the claim — resolve from the users table.
  if (req.user?.id) {
    const { data } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', req.user.id)
      .maybeSingle();
    const dbTenant = (data as { tenant_id?: string } | null)?.tenant_id;
    if (dbTenant) return { tenantId: dbTenant };
  }

  return { error: 'Your account is not linked to a school. Contact your administrator.' };
}
