import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.js';


export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenant_id?: string;
    role?: string;
    is_platform_owner?: boolean;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Primary: app_metadata is admin-only and the most trustworthy source.
    // user_metadata is user-writable, so we do NOT read tenant_id/role from it.
    // The public.users table is the authoritative join between auth.users and tenants;
    // fall back to it when app_metadata is missing (legacy/platform-owner accounts).
    const appMeta = user.app_metadata || {};
    let tenantId = appMeta?.tenant_id;
    let role = appMeta?.role;
    let isPlatformOwner = appMeta?.is_platform_owner === true;

    if ((!tenantId || !role) && typeof supabase.from === 'function') {
      try {
        const { data: appUser } = await supabase
          .from('users')
          .select('tenant_id, user_role, is_platform_owner')
          .eq('auth_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        if (appUser) {
          tenantId = tenantId ?? (appUser.tenant_id as string | undefined);
          role = role ?? (appUser.user_role as string | undefined);
          isPlatformOwner = isPlatformOwner || appUser.is_platform_owner === true;
        }
      } catch (e) {
        // If the users table cannot be queried (e.g. legacy environment), continue
        // with whatever claims are in the JWT so the request is not silently rejected.
        console.error('[authMiddleware] could not load user row from public.users:', e);
      }
    }

    req.user = {
      id: user.id,
      email: user.email!,
      tenant_id: tenantId,
      role,
      is_platform_owner: isPlatformOwner,
    };

    next();
  } catch {
    return res.status(401).json({ message: 'Authentication failed' });
  }
}

// ── Role sets — mirror frontend/src/lib/authHelpers.js ───────────────────────
export const HR_ROLES = ['admin', 'hr_head', 'hr_admin', 'hr_officer'];
export const FINANCE_ROLES = ['admin', 'cfo', 'accountant', 'finance'];
export const PAYROLL_ROLES = ['admin', 'hr_head', 'hr_admin'];

// Internal-staff roles — every provisioned staff role. Used to gate actions any
// staff member may perform but EXTERNAL (`parent`) or not-yet-provisioned
// (`unassigned`) users must not (e.g. sending school communications). This is the
// full role taxonomy from frontend/src/lib/authHelpers.js MINUS parent+unassigned.
// Deliberately broad to avoid breaking legitimate staff; narrow per-feature if a
// tighter policy is desired.
export const STAFF_ROLES = [
  'admin', 'ceo', 'coo', 'chro', 'cfo', 'branch_manager',
  'hr_head', 'hr_admin', 'hr_officer', 'accountant', 'finance', 'collections',
  'crm_agent', 'content_manager', 'admissions', 'teacher', 'procurement',
  'facilities_manager', 'auditor', 'it_admin', 'it_support', 'it_user', 'creator',
];

// Executive / leadership roles — analytics and cross-cutting snapshots.
export const EXEC_ROLES = ['admin', 'ceo', 'coo', 'cfo', 'chro'];

/**
 * Middleware factory — deny request with 403 if req.user.role is not in allowedRoles.
 * Platform owners bypass role checks (they have full access).
 * Must run after authMiddleware (which populates req.user).
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.user?.is_platform_owner) return next();
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
