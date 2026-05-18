import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';

export function tenantMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (req.user.is_platform_owner) {
    return next();
  }

  if (!req.user.tenant_id) {
    return res.status(403).json({ message: 'No tenant assigned to user' });
  }

  next();
}
