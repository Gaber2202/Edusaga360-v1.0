import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole } from '../middleware/auth.js';
import {
  APP_ROLE_CATALOG,
  SYSTEM_ROLE_CODES,
  toSystemRoleRow,
} from '../lib/appRoles.js';

export const rolesRouter = Router();

const ROLE_MANAGERS = ['admin', 'creator', 'it_admin', 'it_user'];

const RoleBody = z.object({
  role_code: z.string().min(2).max(50).regex(/^[a-z][a-z0-9_]*$/),
  name_ar: z.string().min(1).max(120),
  name_en: z.string().min(1).max(120),
  description_ar: z.string().max(500).optional().default(''),
  description_en: z.string().max(500).optional().default(''),
  module_access: z.record(z.boolean()).optional().default({}),
  action_permissions: z.record(z.boolean()).optional().default({}),
  data_scope: z.enum(['all', 'company', 'branch', 'department', 'own']).optional().default('branch'),
  is_trial: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
});

let seedPromise: Promise<void> | null = null;

export async function ensureSystemRoles(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedSystemRoles().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

async function seedSystemRoles(): Promise<void> {
  const rows = APP_ROLE_CATALOG.map(toSystemRoleRow);
  const { error } = await supabase.from('roles').upsert(rows, { onConflict: 'role_code' });
  if (error) {
    console.error('[roles] failed to seed system roles:', error.message);
    throw error;
  }
}

function canManageRoles(req: AuthenticatedRequest): boolean {
  if (req.user?.is_platform_owner) return true;
  const role = req.user?.role;
  return !!role && ROLE_MANAGERS.includes(role);
}

function catalogFallback() {
  return APP_ROLE_CATALOG.map((def) => ({ id: def.role_code, ...toSystemRoleRow(def) }));
}

rolesRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    try {
      await ensureSystemRoles();
    } catch (seedErr) {
      console.error('[roles] seed skipped:', (seedErr as Error).message);
    }

    const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';
    const tenantId = req.user?.tenant_id;

    let query = supabase.from('roles').select('*').order('name_en', { ascending: true });
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const list = Array.isArray(data) ? data : [];
    const rows = list.filter((row) => {
      if (row.tenant_id == null) return true;
      if (req.user?.is_platform_owner) return true;
      return tenantId && row.tenant_id === tenantId;
    });

    if (rows.length === 0) {
      return res.json({ roles: catalogFallback(), source: 'catalog' });
    }

    res.json({ roles: rows });
  } catch (err) {
    console.error('GET /api/roles failed:', err);
    res.json({ roles: catalogFallback(), source: 'catalog' });
  }
});

rolesRouter.post('/', requireRole(ROLE_MANAGERS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!canManageRoles(req)) return res.status(403).json({ error: 'Insufficient permissions' });
    const tenantId = req.user?.tenant_id;
    if (!tenantId && !req.user?.is_platform_owner) {
      return res.status(400).json({ error: 'No tenant context' });
    }

    const parsed = RoleBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION', errors: parsed.error.flatten() });
    }
    const body = parsed.data;
    if (SYSTEM_ROLE_CODES.has(body.role_code)) {
      return res.status(409).json({ error: 'RESERVED', message: 'That role code is reserved for a system role' });
    }

    const insert = {
      ...body,
      name: body.name_en,
      description: body.description_en,
      is_system: false,
      is_system_role: false,
      is_creator_role: false,
      is_assignable: true,
      tenant_id: tenantId ?? null,
      created_by: req.user?.email ?? null,
    };

    const { data, error } = await supabase.from('roles').insert(insert).select('*').single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'DUPLICATE', message: 'A role with this code already exists' });
      }
      throw error;
    }
    res.status(201).json({ role: data });
  } catch (err) {
    console.error('POST /api/roles failed:', err);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

rolesRouter.patch('/:id', requireRole(ROLE_MANAGERS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!canManageRoles(req)) return res.status(403).json({ error: 'Insufficient permissions' });
    const { id } = req.params;

    const { data: existing, error: fetchErr } = await supabase.from('roles').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (existing.is_system_role || existing.is_creator_role) {
      return res.status(403).json({ error: 'System roles cannot be edited' });
    }
    if (existing.tenant_id && req.user?.tenant_id && existing.tenant_id !== req.user.tenant_id && !req.user.is_platform_owner) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const parsed = RoleBody.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'VALIDATION', errors: parsed.error.flatten() });
    }
    if (parsed.data.role_code && SYSTEM_ROLE_CODES.has(parsed.data.role_code)) {
      return res.status(409).json({ error: 'RESERVED', message: 'That role code is reserved for a system role' });
    }

    const updates: Record<string, unknown> = {
      ...parsed.data,
      last_modified_by: req.user?.email ?? null,
      last_modified_date: new Date().toISOString(),
    };
    if (parsed.data.name_en) updates.name = parsed.data.name_en;
    if (parsed.data.description_en !== undefined) updates.description = parsed.data.description_en;

    const { data, error } = await supabase.from('roles').update(updates).eq('id', id).select('*').single();
    if (error) throw error;
    res.json({ role: data });
  } catch (err) {
    console.error('PATCH /api/roles/:id failed:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

rolesRouter.delete('/:id', requireRole(ROLE_MANAGERS), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!canManageRoles(req)) return res.status(403).json({ error: 'Insufficient permissions' });
    const { id } = req.params;

    const { data: existing, error: fetchErr } = await supabase.from('roles').select('*').eq('id', id).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.is_system_role || existing.is_creator_role) {
      return res.status(403).json({ error: 'System roles cannot be deleted' });
    }
    if (existing.tenant_id && req.user?.tenant_id && existing.tenant_id !== req.user.tenant_id && !req.user.is_platform_owner) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/roles/:id failed:', err);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});
