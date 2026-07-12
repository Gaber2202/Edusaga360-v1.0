/**
 * /api/v1/students — external student read + import.
 *
 * Write is idempotent on national_id within the tenant so a legacy migration can
 * be re-run without creating duplicates. Targets the canonical students schema
 * (name_en NOT NULL).
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';
import { parsePagination } from './shared.js';

export const studentsRouter = Router();

studentsRouter.get('/', requireScope('students:read'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { limit, offset } = parsePagination(req);

  const { data, error, count } = await supabase
    .from('students')
    .select('id, student_id, name_en, name_ar, national_id, status, enrollment_date, created_at', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to fetch students' });
  }
  res.json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } });
});

const StudentCreateSchema = z.object({
  name_en: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  national_id: z.string().min(1).max(50),
  date_of_birth: z.string().max(20).optional(),
  gender: z.enum(['male', 'female']).optional(),
  nationality: z.string().max(100).optional(),
  branch_id: z.string().uuid().optional(),
});

studentsRouter.post('/', requireScope('students:write'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const parsed = StudentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const { data: existing } = await supabase
    .from('students')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('national_id', body.national_id)
    .maybeSingle();
  if (existing) {
    return res.status(200).json({ data: { id: (existing as { id: string }).id }, created: false });
  }

  const { data, error } = await supabase
    .from('students')
    .insert({
      tenant_id: tenantId,
      branch_id: body.branch_id ?? null,
      student_id: `STU-${Date.now().toString(36).toUpperCase()}`,
      name_en: body.name_en,
      name_ar: body.name_ar ?? null,
      national_id: body.national_id,
      date_of_birth: body.date_of_birth ?? null,
      gender: body.gender ?? null,
      nationality: body.nationality ?? null,
      enrollment_type: 'new',
      enrollment_date: new Date().toISOString().split('T')[0],
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to create student' });
  }
  res.status(201).json({ data: { id: (data as { id: string }).id }, created: true });
});
