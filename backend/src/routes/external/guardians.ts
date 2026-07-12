/**
 * /api/v1/guardians — external guardian read + import.
 *
 * Write is idempotent on national_id within the tenant. Targets the canonical
 * guardians schema (name_en NOT NULL).
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';
import { parsePagination } from './shared.js';

export const guardiansRouter = Router();

guardiansRouter.get('/', requireScope('guardians:read'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { limit, offset } = parsePagination(req);

  const { data, error, count } = await supabase
    .from('guardians')
    .select('id, name_en, name_ar, national_id, phone, email, relation, created_at', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to fetch guardians' });
  }
  res.json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } });
});

const GuardianCreateSchema = z.object({
  name_en: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  national_id: z.string().min(1).max(50),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(200).optional(),
  relation: z.string().max(50).optional(),
});

guardiansRouter.post('/', requireScope('guardians:write'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const parsed = GuardianCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const { data: existing } = await supabase
    .from('guardians')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('national_id', body.national_id)
    .maybeSingle();
  if (existing) {
    return res.status(200).json({ data: { id: (existing as { id: string }).id }, created: false });
  }

  const { data, error } = await supabase
    .from('guardians')
    .insert({
      tenant_id: tenantId,
      name_en: body.name_en,
      name_ar: body.name_ar ?? null,
      national_id: body.national_id,
      phone: body.phone ?? null,
      email: body.email ?? null,
      relation: body.relation ?? null,
    })
    .select('id')
    .single();

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to create guardian' });
  }
  res.status(201).json({ data: { id: (data as { id: string }).id }, created: true });
});
