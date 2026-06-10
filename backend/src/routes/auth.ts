import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

export const authRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

authRouter.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ message: 'Invalid token' });
  }

  res.json({
    id: user.id,
    email: user.email,
    // Read privileged claims from app_metadata only (admin-only write).
    // user_metadata is user-writable and must never be used for auth decisions.
    tenant_id: user.app_metadata?.tenant_id,
    role: user.app_metadata?.role,
    is_platform_owner: user.app_metadata?.is_platform_owner === true,
    name: user.user_metadata?.name,
  });
});
