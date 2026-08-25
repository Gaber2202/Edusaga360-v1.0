/**
 * Admissions notify API — SCRUM-115
 * POST /api/admissions/applications/:id/notify
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole } from '../middleware/auth.js';
import {
  AdmissionsNotifyEvent,
  sendAdmissionsStageMessage,
} from '../services/admissionsMessaging.js';

export const admissionsRouter = Router();

const NotifySchema = z.object({
  event: z.enum([
    'welcome',
    'rejection',
    'documents_missing',
    'assessment_results',
    'interview_scheduling',
  ]),
  extra: z.record(z.string().nullable()).optional(),
});

admissionsRouter.post(
  '/applications/:id/notify',
  requireRole(['admin', 'admissions', 'branch_manager']),
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'No tenant' });

    const parsed = NotifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const applicationId = String(req.params.id || '');
    const { data: application, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const result = await sendAdmissionsStageMessage({
      tenantId,
      application,
      event: parsed.data.event as AdmissionsNotifyEvent,
      extra: parsed.data.extra,
    });

    return res.json(result);
  }
);
