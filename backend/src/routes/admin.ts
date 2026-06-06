import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const adminRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function isPlatformOwner(req: AuthenticatedRequest): boolean {
  return req.user?.is_platform_owner === true;
}

function forbidden(res: any) {
  return res.status(403).json({ message: 'Platform owner access required' });
}

adminRouter.get('/tenants', async (req: AuthenticatedRequest, res) => {
  if (!isPlatformOwner(req)) return forbidden(res);
  const { data, error } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ tenants: data || [] });
});

adminRouter.get('/users', async (req: AuthenticatedRequest, res) => {
  if (!isPlatformOwner(req)) return forbidden(res);
  const { data, error } = await supabase.from('users').select('*').order('created_date', { ascending: false });
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ users: data || [] });
});

adminRouter.get('/stats', async (req: AuthenticatedRequest, res) => {
  if (!isPlatformOwner(req)) return forbidden(res);
  const [tenantsRes, usersRes] = await Promise.all([
    supabase.from('tenants').select('id, status'),
    supabase.from('users').select('id, is_active'),
  ]);
  const tenants = tenantsRes.data || [];
  const users = usersRes.data || [];
  return res.json({
    totalTenants: tenants.length,
    activeTenants: tenants.filter(t => t.status === 'active').length,
    trialTenants: tenants.filter(t => t.status === 'trial').length,
    totalUsers: users.length,
    activeUsers: users.filter(u => u.is_active !== false).length,
  });
});

adminRouter.delete('/tenants/:id', async (req: AuthenticatedRequest, res) => {
  if (!isPlatformOwner(req)) return forbidden(res);
  const { id } = req.params;
  const { error } = await supabase.from('tenants').delete().eq('id', id);
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ success: true });
});

adminRouter.patch('/tenants/:id', async (req: AuthenticatedRequest, res) => {
  if (!isPlatformOwner(req)) return forbidden(res);
  const { id } = req.params;
  const allowed = ['status', 'trial_end_date', 'max_users', 'max_students', 'max_employees', 'plan', 'plan_code', 'ai_enabled'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid fields to update' });
  }
  const { data, error } = await supabase.from('tenants').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ message: error.message });
  return res.json({ tenant: data });
});
