/**
 * External Integration API — /api/v1
 *
 * The public, versioned data plane for third-party systems (legacy SIS
 * migration, ATS / LinkedIn, email, etc.). Every request here is authenticated
 * by a tenant-scoped API key (see middleware/apiKeyAuth.ts) and authorized by an
 * explicit scope. The tenant is ALWAYS taken from the key, never from the body
 * or query, so a key cannot address another tenant's data.
 *
 * This first cut ships the foundation plus a worked example resource (students)
 * that proves the read + idempotent-write pattern the remaining resources
 * (staff, invoices, ...) will follow. Add new endpoints by: declaring a scope in
 * lib/apiScopes.ts, gating with requireScope, and scoping every query by
 * req.apiClient.tenantId.
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';

export const externalApiRouter = Router();

// ─── Meta ─────────────────────────────────────────────────────────────────────

// GET /api/v1/ping — liveness + "is my key valid" check. No scope required, so
// integrators can verify credentials before requesting any data scope.
externalApiRouter.get('/ping', (_req, res) => {
  res.json({ ok: true, service: 'edusaga-external-api', version: 'v1' });
});

// GET /api/v1/whoami — echo the identity the key resolves to.
externalApiRouter.get('/whoami', (req: ApiKeyRequest, res: Response) => {
  res.json({ tenant_id: req.apiClient!.tenantId, scopes: req.apiClient!.scopes });
});

// ─── Students ───────────────────────────────────────────────────────────────

// GET /api/v1/students — paginated list, scoped to the key's tenant.
externalApiRouter.get(
  '/students',
  requireScope('students:read'),
  async (req: ApiKeyRequest, res: Response) => {
    const tenantId = req.apiClient!.tenantId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

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
  },
);

const StudentCreateSchema = z.object({
  name_en: z.string().min(1).max(200),
  name_ar: z.string().max(200).optional(),
  national_id: z.string().min(1).max(50),
  date_of_birth: z.string().max(20).optional(),
  gender: z.enum(['male', 'female']).optional(),
  nationality: z.string().max(100).optional(),
  branch_id: z.string().uuid().optional(),
});

// POST /api/v1/students — create a student (e.g. legacy migration / SIS sync).
// Idempotent on national_id within the tenant so re-running an import does not
// create duplicates.
externalApiRouter.post(
  '/students',
  requireScope('students:write'),
  async (req: ApiKeyRequest, res: Response) => {
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
  },
);
