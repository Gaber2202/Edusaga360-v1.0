import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/**
 * Authenticate either with an internal service token or by falling through to
 * the normal Supabase JWT auth flow. Used for scheduler-triggered endpoints.
 */
type AuthMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => void | Promise<void> | Promise<Response | undefined> | Response | undefined;

export function createInternalOrAuthMiddleware(authMiddleware: AuthMiddleware) {
  return function internalOrAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const token = req.headers[INTERNAL_TOKEN_HEADER] as string | undefined;
    const expected = process.env.COLLECTIONS_INTERNAL_TOKEN;

    if (token && expected && token === expected) {
      // For internal calls, tenant_id must come from a header or body.
      const tenantId =
        (req.headers['x-tenant-id'] as string | undefined) ||
        (req.body?.tenant_id as string | undefined) ||
        (req.query?.tenant_id as string | undefined);
      if (!tenantId) {
        return res.status(400).json({ error: 'tenant_id_required', message: 'x-tenant-id header, body, or query is required for internal calls' });
      }
      req.user = {
        id: 'internal',
        email: 'internal@system',
        tenant_id: tenantId,
        role: 'system',
        is_platform_owner: false,
      };
      return next();
    }

    return authMiddleware(req, res, next);
  };
}
