import { Router, Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  requireExecAccess,
  getAccessiblePersonas,
  hasImplicitViewAll,
  EXEC_PERSONAS,
  ExecPersona,
} from '../middleware/execAccess.js';
import { resolveProviders, Message, recordAIUsage } from './ai.js';
import { MetricsService } from '../services/metrics.js';
import { renderDashboardExport } from '../services/execExport.js';

export const execRouter = Router();

const metricsService = new MetricsService(supabase);

const DAY_MS = 86400000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function stripMarkdown(text: string): string {
  if (typeof text !== 'string') return text;
  return text
    .replace(/```[a-zA-Z]*\n?/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[*+]\s+/gm, '- ')
    .replace(/\*\*/g, '')
    .trim();
}

export function computeVitalityIndex(
  weights: { financial: number; growth: number; collections: number; compliance: number; retention: number },
  subscores: { financial: number; growth: number; collections: number; compliance: number; retention: number },
) {
  const totalWeight = weights.financial + weights.growth + weights.collections + weights.compliance + weights.retention || 1;
  const weighted =
    subscores.financial * weights.financial +
    subscores.growth * weights.growth +
    subscores.collections * weights.collections +
    subscores.compliance * weights.compliance +
    subscores.retention * weights.retention;
  return { score: Math.round(weighted / totalWeight), weights, sub_scores: subscores };
}

function resolveTenantId(req: AuthenticatedRequest): string | null {
  if (req.user?.is_platform_owner) {
    const q = req.query.tenant_id;
    return (typeof q === 'string' && q.length > 0 ? q : req.user?.tenant_id) ?? null;
  }
  return req.user?.tenant_id ?? null;
}

async function writeExecAudit(
  req: AuthenticatedRequest,
  action: string,
  newValues: Record<string, unknown>,
  tenantId?: string | null,
): Promise<void> {
  try {
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId ?? req.user?.tenant_id ?? null,
      user_id: req.user?.id ?? null,
      action,
      entity_type: 'exec_dashboard',
      new_values: newValues,
      ip_address: req.ip ?? null,
    });
  } catch {
    /* best-effort */
  }
}

execRouter.get('/access', async (req: AuthenticatedRequest, res: Response) => {
  const result = await getAccessiblePersonas(req.user);
  res.json({
    ...result,
    requiresTenantSelection: !!req.user?.is_platform_owner && !req.user?.tenant_id,
  });
});

execRouter.get('/tenants', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.is_platform_owner) return res.status(403).json({ error: 'Platform owner only' });
  const { data, error } = await supabase.from('tenants').select('id, name_en, name_ar').order('name_en');
  if (error) return res.status(500).json({ error: 'Failed to load tenants' });
  res.json({ tenants: data ?? [] });
});

execRouter.get('/branches', async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });
  const { data, error } = await supabase.from('branches').select('id, name_en, name_ar').eq('tenant_id', tenant_id).order('name_en');
  if (error) return res.status(500).json({ error: 'Failed to load branches' });
  res.json({ branches: data ?? [] });
});

const GrantAccessSchema = z.object({
  user_id: z.string().uuid(),
  persona: z.enum(EXEC_PERSONAS),
  action: z.enum(['grant', 'revoke']),
});

execRouter.post('/access', async (req: AuthenticatedRequest, res: Response) => {
  if (!hasImplicitViewAll(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions', code: 'EXEC_ACCESS_DENIED' });
  }
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });
  const parsed = GrantAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', errors: parsed.error.flatten() });
  }
  const { user_id, persona, action } = parsed.data;
  if (action === 'grant') {
    const { error } = await supabase.from('exec_dashboard_access').upsert({ tenant_id, user_id, persona, granted_by: req.user!.id }, { onConflict: 'tenant_id,user_id,persona' });
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await supabase.from('exec_dashboard_access').delete().eq('tenant_id', tenant_id).eq('user_id', user_id).eq('persona', persona);
    if (error) return res.status(500).json({ error: error.message });
  }
  await writeExecAudit(req, `exec_access_${action}`, { user_id, persona }, tenant_id);
  res.json({ success: true });
});

async function getDashboard(req: AuthenticatedRequest, persona: 'ceo' | 'cfo' | 'coo' | 'chro', res: Response) {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });
  const period = typeof req.query.period === 'string' && req.query.period ? req.query.period : 'current';
  const branch_id = typeof req.query.branch_id === 'string' && req.query.branch_id ? req.query.branch_id : undefined;
  try {
    const data = await metricsService.getDashboard(persona, tenant_id, period, branch_id);
    await writeExecAudit(req, 'exec_dashboard_view', { persona, period, branch_id }, tenant_id);
    res.json(data);
  } catch (err) {
    console.error(`${persona.toUpperCase()} dashboard error:`, err);
    res.status(500).json({ error: `Failed to load ${persona.toUpperCase()} dashboard` });
  }
}

execRouter.get('/ceo', requireExecAccess('ceo'), (req, res) => getDashboard(req, 'ceo', res));
execRouter.get('/cfo', requireExecAccess('cfo'), (req, res) => getDashboard(req, 'cfo', res));
execRouter.get('/coo', requireExecAccess('coo'), (req, res) => getDashboard(req, 'coo', res));
execRouter.get('/chro', requireExecAccess('chro'), (req, res) => getDashboard(req, 'chro', res));

execRouter.get('/:persona/export', (req: AuthenticatedRequest, res: Response, next) => {
  const persona = req.params.persona as 'ceo' | 'cfo' | 'coo' | 'chro';
  if (!['ceo', 'cfo', 'coo', 'chro'].includes(persona)) return res.status(404).json({ error: 'Unknown persona' });
  return requireExecAccess(persona)(req, res, next);
}, async (req: AuthenticatedRequest, res: Response) => {
  const persona = req.params.persona as 'ceo' | 'cfo' | 'coo' | 'chro';
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });
  const period = typeof req.query.period === 'string' && req.query.period ? req.query.period : 'current';
  const branch_id = typeof req.query.branch_id === 'string' && req.query.branch_id ? req.query.branch_id : undefined;
  const format = req.query.format === 'png' ? 'png' : 'pdf';
  const isRTL = Boolean(req.query.lang === 'ar' || req.headers['accept-language']?.startsWith('ar'));
  try {
    const [data, tenant, branch] = await Promise.all([
      metricsService.getDashboard(persona, tenant_id, period, branch_id),
      supabase.from('tenants').select('name_en, name_ar').eq('id', tenant_id).maybeSingle(),
      branch_id ? supabase.from('branches').select('name_en, name_ar').eq('id', branch_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const tenantName = isRTL ? tenant.data?.name_ar || tenant.data?.name_en : tenant.data?.name_en || tenant.data?.name_ar;
    const branchName = branch.data ? (isRTL ? branch.data.name_ar || branch.data.name_en : branch.data.name_en || branch.data.name_ar) : undefined;
    const buffer = await renderDashboardExport({ persona, tenantName, branchName, period, isRTL, data, format });
    const filename = `edusaga-${persona}-${period}.${format}`;
    res.setHeader('Content-Type', format === 'png' ? 'image/png' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
    await writeExecAudit(req, 'exec_dashboard_export', { persona, period, branch_id, format }, tenant_id);
  } catch (err) {
    console.error('Dashboard export error:', err);
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

execRouter.post('/metrics/refresh', requireExecAccess('ceo'), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });
  const period = typeof req.body?.period === 'string' ? req.body.period : 'current';
  const branch_id = typeof req.body?.branch_id === 'string' ? req.body.branch_id : undefined;
  try {
    const result = await metricsService.refresh(tenant_id, period, branch_id);
    await writeExecAudit(req, 'exec_metrics_refresh', { period, branch_id }, tenant_id);
    res.json(result);
  } catch (err) {
    console.error('Metrics refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh metrics' });
  }
});

interface BoardBrief {
  narrative_en: string;
  narrative_ar: string;
  actions_en: string[];
  actions_ar: string[];
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

function buildBriefPrompt(metrics: Record<string, unknown>): Message[] {
  const instructions = `You are YAMEN, the board-briefing assistant for a Saudi K-12 school group's CEO. ` +
    `Given the metrics JSON below, respond with ONLY a JSON object (no markdown, no code fences) of this exact shape:\n` +
    `{"narrative_en": string, "narrative_ar": string, "actions_en": [string, string, string], "actions_ar": [string, string, string]}\n` +
    `narrative_en/narrative_ar: a concise (3-5 sentence) board-level narrative summarizing performance and key risks. ` +
    `actions_en/actions_ar: EXACTLY 3 recommended actions, ordered by priority. ` +
    `Arabic text must be professional Modern Standard Arabic, not a literal word-for-word translation. ` +
    `Use SAR for currency figures. Metrics:\n${JSON.stringify(metrics)}`;
  return [{ role: 'user', content: instructions }];
}

function parseBriefResponse(raw: string): BoardBrief | null {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.narrative_en === 'string' &&
      typeof parsed.narrative_ar === 'string' &&
      Array.isArray(parsed.actions_en) && parsed.actions_en.length === 3 &&
      Array.isArray(parsed.actions_ar) && parsed.actions_ar.length === 3
    ) {
      return {
        narrative_en: stripMarkdown(parsed.narrative_en),
        narrative_ar: stripMarkdown(parsed.narrative_ar),
        actions_en: parsed.actions_en.map((a: string) => stripMarkdown(String(a))),
        actions_ar: parsed.actions_ar.map((a: string) => stripMarkdown(String(a))),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function generateAndCacheBrief(tenant_id: string, period: string, generated_by: string) {
  const all = await metricsService.computeAndStoreAll(tenant_id, period);
  const metrics = {
    period,
    vitality_score: all.ceo.vitality.score,
    sub_scores: all.ceo.vitality.sub_scores,
    financials: all.ceo.financials,
    growth: all.ceo.growth,
    collections: all.ceo.collections,
    compliance: all.ceo.compliance,
    top_risks: all.ceo.top_risks,
  };

  let brief: BoardBrief | null = null;
  let usedProvider: string | null = null;
  let usedResult: any = null;
  for (const runner of resolveProviders(buildBriefPrompt(metrics), tenant_id)) {
    try {
      const result = await runner.run();
      const parsed = parseBriefResponse(result.text);
      if (parsed) {
        brief = parsed;
        usedProvider = runner.name;
        usedResult = result;
        break;
      }
    } catch {
      /* try next provider */
    }
  }
  if (!brief || !usedResult) return null;

  await recordAIUsage(tenant_id, usedResult, 'executive');

  await supabase.from('exec_brief_cache').upsert(
    {
      tenant_id, period,
      narrative_en: brief.narrative_en, narrative_ar: brief.narrative_ar,
      actions_en: brief.actions_en, actions_ar: brief.actions_ar,
      metrics_snapshot: metrics, provider: usedProvider, generated_by, generated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,period' },
  );
  return { ...brief, metrics_snapshot: metrics, provider: usedProvider, period };
}

execRouter.get('/ceo/brief', requireExecAccess('ceo'), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });
  const period = (req.query.period as string) || currentPeriod();
  try {
    const { data: cached } = await supabase.from('exec_brief_cache').select('*').eq('tenant_id', tenant_id).eq('period', period).maybeSingle();
    res.json(cached ?? null);
  } catch (err) {
    console.error('Board brief error:', err);
    res.status(500).json({ error: 'Failed to load board brief' });
  }
});

execRouter.post('/ceo/brief/refresh', requireExecAccess('ceo'), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });
  const period = (req.body?.period as string) || currentPeriod();
  try {
    const brief = await generateAndCacheBrief(tenant_id, period, req.user!.id);
    if (!brief) return res.status(503).json({ error: 'No AI provider available to generate the board brief' });
    await writeExecAudit(req, 'exec_brief_refresh', { period }, tenant_id);
    res.json(brief);
  } catch (err) {
    console.error('Board brief refresh error:', err);
    res.status(500).json({ error: 'Failed to refresh board brief' });
  }
});
