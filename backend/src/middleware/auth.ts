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

    req.user = {
      id: user.id,
      email: user.email!,
      tenant_id: user.user_metadata?.tenant_id,
      role: user.user_metadata?.role,
      is_platform_owner: user.user_metadata?.is_platform_owner === true,
    };

    next();
  } catch {
    return res.status(401).json({ message: 'Authentication failed' });
  }
}
