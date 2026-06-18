import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

    // Security: ALL privileged claims must come from app_metadata (admin-only write).
    // user_metadata is user-writable via supabase.auth.updateUser() — do NOT use it
    // for role or tenant_id, as that allows self-escalation (set role='admin' client-side).
    // The user_metadata fallback has been removed. Any user missing app_metadata claims
    // needs to be re-onboarded through the admin provisioning flow.
    req.user = {
      id: user.id,
      email: user.email!,
      tenant_id: user.app_metadata?.tenant_id,
      role: user.app_metadata?.role,
      is_platform_owner: user.app_metadata?.is_platform_owner === true,
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
