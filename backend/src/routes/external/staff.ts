/**
 * /api/v1/staff — external employee read + import (HR legacy migration).
 *
 * Write is idempotent on employee_number within the tenant — the natural key
 * every HR/payroll system carries — so re-running an import is a no-op update.
 * Targets the canonical employees schema (name_en NOT NULL).
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';
import { parsePagination } from './shared.js';

export const staffRouter = Router();

staffRouter.get('/', requireScope('staff:read'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { limit, offset } = parsePagination(req);

  const { data, error, count } = await supabase
    .from('employees')
    .select('id, employee_number, name_en, name_ar, email, national_id, iqama_number, employment_type, status, join_date, created_at', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to fetch staff' });
  }
  res.json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } });
});

const StaffCreateSchema = z.object({
  employee_number: z.string().min(1).max(60),
  name_en: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  national_id: z.string().max(50).optional(),
  iqama_number: z.string().max(50).optional(),
  nationality: z.string().max(100).optional(),
  date_of_birth: z.string().max(20).optional(),
  gender: z.enum(['male', 'female']).optional(),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'probation']).optional(),
  join_date: z.string().max(20).optional(),
  basic_salary: z.number().nonnegative().optional(),
  branch_id: z.string().uuid().optional(),
});

staffRouter.post('/', requireScope('staff:write'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const parsed = StaffCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
  }
  const body = parsed.data;

  const { data: existing } = await supabase
    .from('employees')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('employee_number', body.employee_number)
    .maybeSingle();
  if (existing) {
    return res.status(200).json({ data: { id: (existing as { id: string }).id }, created: false });
  }

  const { data, error } = await supabase
    .from('employees')
    .insert({
      tenant_id: tenantId,
      branch_id: body.branch_id ?? null,
      employee_number: body.employee_number,
      name_en: body.name_en,
      name_ar: body.name_ar ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      national_id: body.national_id ?? null,
      iqama_number: body.iqama_number ?? null,
      nationality: body.nationality ?? null,
      date_of_birth: body.date_of_birth ?? null,
      gender: body.gender ?? null,
      employment_type: body.employment_type ?? null,
      join_date: body.join_date ?? null,
      basic_salary: body.basic_salary ?? null,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to create staff member' });
  }
  res.status(201).json({ data: { id: (data as { id: string }).id }, created: true });
});
