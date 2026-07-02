import { Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest } from './auth.js';


export const EXEC_PERSONAS = ['ceo', 'cfo', 'coo', 'chro'] as const;
export type ExecPersona = (typeof EXEC_PERSONAS)[number];

/**
 * admin/creator (tenant owner or platform owner) get implicit view-all access —
 * mirrors Layout.jsx's isCreatorRole nav bypass, so a tenant admin who can see
 * every nav item can also see every exec persona without an explicit grant row.
 */
export function hasImplicitViewAll(user: AuthenticatedRequest['user']): boolean {
  return !!user?.is_platform_owner || user?.role === 'admin' || user?.role === 'creator';
}

/**
 * Resolve which exec personas the caller may view.
 * Returns isAdmin=true (view-all) for admin/creator/platform-owner — they are
 * never restricted to the rows in exec_dashboard_access.
 */
export async function getAccessiblePersonas(
  user: AuthenticatedRequest['user'],
): Promise<{ isAdmin: boolean; personas: ExecPersona[] }> {
  if (hasImplicitViewAll(user)) {
    return { isAdmin: true, personas: [...EXEC_PERSONAS] };
  }
  if (!user?.tenant_id) return { isAdmin: false, personas: [] };

  const { data, error } = await supabase
    .from('exec_dashboard_access')
    .select('persona')
    .eq('tenant_id', user.tenant_id)
    .eq('user_id', user.id);

  if (error || !data) return { isAdmin: false, personas: [] };
  return {
    isAdmin: false,
    personas: data.map((r: { persona: string }) => r.persona as ExecPersona),
  };
}

/**
 * Middleware factory — deny request with 403 unless the caller can view the
 * given persona's dashboard. Platform owners and tenant admins/creators bypass
 * (implicit view-all). Must run after authMiddleware + tenantMiddleware.
 *
 * This is the server-side enforcement the task requires: a CFO-only grant must
 * 403 on /api/exec/ceo even with a valid token and direct API call.
 */
export function requireExecAccess(persona: ExecPersona) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (hasImplicitViewAll(req.user)) return next();

    const user = req.user;
    if (!user?.tenant_id) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'EXEC_ACCESS_DENIED' });
    }

    const { data, error } = await supabase
      .from('exec_dashboard_access')
      .select('id')
      .eq('tenant_id', user.tenant_id)
      .eq('user_id', user.id)
      .eq('persona', persona)
      .maybeSingle();

    if (error || !data) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'EXEC_ACCESS_DENIED', persona });
    }

    next();
  };
}
