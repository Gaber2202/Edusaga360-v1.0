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
    tenant_id: user.user_metadata?.tenant_id,
    role: user.user_metadata?.role,
    name: user.user_metadata?.name,
  });
});
