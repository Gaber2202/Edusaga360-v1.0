import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const tenantRequestRouter = Router();


const CreateTenantRequestSchema = z.object({
  type: z.enum(['feature_request', 'support', 'billing', 'upgrade', 'other']),
  subject: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
});

tenantRequestRouter.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = CreateTenantRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: parsed.error.flatten(),
      });
    }

    const { data: request, error } = await supabase
      .from('tenant_requests')
      .insert({
        ...parsed.data,
        tenant_id: req.user!.tenant_id,
        submitted_by: req.user!.id,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(request);
  } catch (err) {
    console.error('Failed to create tenant request:', err);
    res.status(500).json({ message: 'Failed to create tenant request' });
  }
});

tenantRequestRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    let query = supabase.from('tenant_requests').select('*');

    if (!req.user!.is_platform_owner) {
      query = query.eq('tenant_id', req.user!.tenant_id);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Failed to list tenant requests:', err);
    res.status(500).json({ message: 'Failed to list tenant requests' });
  }
});
