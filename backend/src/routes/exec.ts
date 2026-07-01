import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  requireExecAccess,
  getAccessiblePersonas,
  hasImplicitViewAll,
  EXEC_PERSONAS,
  ExecPersona,
} from '../middleware/execAccess.js';
import { resolveProviders, Message } from './ai.js';

export const execRouter = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DAY_MS = 86400000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

// Period-over-period percentage change. Returns null when there is no prior
// value to compare against, so the client can render "—" instead of a
// misleading 0% / Infinity.
export function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

// Strip Markdown emphasis/heading/code markers so AI-authored narrative and
// action text renders cleanly in the plain-text dashboard (no literal "**").
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

// Platform owners have no tenant_id of their own (they oversee every tenant),
// so they must explicitly pick which school's dashboard to view via ?tenant_id=.
// Regular tenant users always use their own JWT-issued tenant_id — the query
// param is never honored for them, so a tenant user can never view another
// tenant's data by tampering with the query string.
function resolveTenantId(req: AuthenticatedRequest): string | null {
  if (req.user?.is_platform_owner) {
    const q = req.query.tenant_id;
    return typeof q === 'string' && q.length > 0 ? q : null;
  }
  return req.user?.tenant_id ?? null;
}

// ─── Audit trail — every dashboard view / persona switch / access grant ─────
// Writes to the existing tenant-scoped audit_logs table (see
// frontend/src/components/AuditService.jsx for the matching client-side
// writer). Best-effort: a logging failure must never block the request.
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

// ─── GET /api/exec/access — which personas can the caller view? ────────────
execRouter.get('/access', async (req: AuthenticatedRequest, res: Response) => {
  const result = await getAccessiblePersonas(req.user);
  res.json({
    ...result,
    // Platform owners have no tenant of their own — the frontend must show a
    // school picker before it can load any persona dashboard.
    requiresTenantSelection: !!req.user?.is_platform_owner && !req.user?.tenant_id,
  });
});

// ─── GET /api/exec/tenants — platform-owner only: schools to view ──────────
execRouter.get('/tenants', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.is_platform_owner) {
    return res.status(403).json({ error: 'Platform owner only' });
  }
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name_en, name_ar')
    .order('name_en');
  if (error) return res.status(500).json({ error: 'Failed to load tenants' });
  res.json({ tenants: data ?? [] });
});

// ─── POST /api/exec/access — admin-only grant/revoke of a persona ──────────
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
    const { error } = await supabase
      .from('exec_dashboard_access')
      .upsert({ tenant_id, user_id, persona, granted_by: req.user!.id }, { onConflict: 'tenant_id,user_id,persona' });
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await supabase
      .from('exec_dashboard_access')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('user_id', user_id)
      .eq('persona', persona);
    if (error) return res.status(500).json({ error: error.message });
  }

  await writeExecAudit(req, `exec_access_${action}`, { user_id, persona }, tenant_id);
  res.json({ success: true });
});

// ─── Shared data helpers ─────────────────────────────────────────────────────

async function getCurrentAndPreviousAcademicYears(tenant_id: string) {
  const { data } = await supabase
    .from('academic_years')
    .select('id, name, start_date, is_current')
    .eq('tenant_id', tenant_id)
    .order('start_date', { ascending: false })
    .limit(2);
  const [current, previous] = data ?? [];
  return { current: current ?? null, previous: previous ?? null };
}

// Financial sub-score: revenue (collected) minus approved expenses over the
// trailing 12 months, scored as a margin band (0% margin -> 50, +/-50% -> 100/0).
async function getFinancials(tenant_id: string) {
  const since = daysAgoStr(365);
  const [invoicesRes, expensesRes] = await Promise.all([
    supabase.from('invoices').select('paid_amount, date').eq('tenant_id', tenant_id).gte('date', since),
    supabase.from('expenses').select('amount, date').eq('tenant_id', tenant_id).eq('status', 'approved').gte('date', since),
  ]);
  const revenue = round2((invoicesRes.data ?? []).reduce((s, r: any) => s + Number(r.paid_amount ?? 0), 0));
  const expenses = round2((expensesRes.data ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0));
  const ebitda = round2(revenue - expenses);
  const margin = revenue > 0 ? ebitda / revenue : 0;
  const score = clamp(Math.round(50 + margin * 100));
  return { revenue, expenses, ebitda, margin: round2(margin * 100), score };
}

// Growth sub-score: enrollment change vs the previous academic year.
// Falls back to a neutral score with data_quality flag if there's no prior year.
async function getGrowth(tenant_id: string) {
  const { current, previous } = await getCurrentAndPreviousAcademicYears(tenant_id);
  if (!current || !previous) {
    return { current_count: null, previous_count: null, growth_rate: null, score: 50, data_quality: 'no_prior_year' as const };
  }
  const [currentRes, previousRes] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('academic_year', current.id),
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('academic_year', previous.id),
  ]);
  const currentCount = currentRes.count ?? 0;
  const previousCount = previousRes.count ?? 0;
  const growthRate = previousCount > 0 ? (currentCount - previousCount) / previousCount : 0;
  const score = clamp(Math.round(50 + growthRate * 200));
  return { current_count: currentCount, previous_count: previousCount, growth_rate: round2(growthRate * 100), score, data_quality: 'real' as const };
}

// Collections sub-score: paid_amount / total_amount across all invoices.
async function getCollections(tenant_id: string) {
  const { data } = await supabase.from('invoices').select('total_amount, paid_amount, status, due_date, branch_id').eq('tenant_id', tenant_id);
  const rows = data ?? [];
  const totalInvoiced = round2(rows.reduce((s, r: any) => s + Number(r.total_amount ?? 0), 0));
  const totalCollected = round2(rows.reduce((s, r: any) => s + Number(r.paid_amount ?? 0), 0));
  const collectionRate = totalInvoiced > 0 ? totalCollected / totalInvoiced : 0;
  const score = clamp(Math.round(collectionRate * 100));
  return { total_invoiced: totalInvoiced, total_collected: totalCollected, collection_rate: round2(collectionRate * 100), score, rows };
}

// Trailing-N-month trends built from REAL invoice + approved-expense rows.
//   revenue  = paid_amount on invoices dated in the month (cash actually in)
//   ebitda   = revenue − approved expenses dated in the month
//   rate     = collected / invoiced for invoices dated in the month
// Powers the CEO KPI sparklines and the Revenue-vs-EBITDA / Collection-rate
// trend charts, which were previously never sent to the client.
async function getMonthlyTrends(tenant_id: string, months = 12) {
  const since = daysAgoStr(months * 31 + 5);
  const [invRes, expRes] = await Promise.all([
    supabase.from('invoices').select('total_amount, paid_amount, date').eq('tenant_id', tenant_id).gte('date', since),
    supabase.from('expenses').select('amount, date').eq('tenant_id', tenant_id).eq('status', 'approved').gte('date', since),
  ]);
  const revByMonth = new Map<string, number>();
  const invByMonth = new Map<string, number>();
  const expByMonth = new Map<string, number>();
  for (const r of (invRes.data ?? []) as any[]) {
    const key = (r.date ?? '').slice(0, 7);
    if (!key) continue;
    revByMonth.set(key, (revByMonth.get(key) ?? 0) + Number(r.paid_amount ?? 0));
    invByMonth.set(key, (invByMonth.get(key) ?? 0) + Number(r.total_amount ?? 0));
  }
  for (const r of (expRes.data ?? []) as any[]) {
    const key = (r.date ?? '').slice(0, 7);
    if (!key) continue;
    expByMonth.set(key, (expByMonth.get(key) ?? 0) + Number(r.amount ?? 0));
  }
  const revenue_trend: { label: string; revenue: number; ebitda: number }[] = [];
  const collection_trend: { label: string; rate: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const rev = round2(revByMonth.get(key) ?? 0);
    const exp = round2(expByMonth.get(key) ?? 0);
    const invoiced = invByMonth.get(key) ?? 0;
    const collected = revByMonth.get(key) ?? 0;
    revenue_trend.push({ label: key, revenue: rev, ebitda: round2(rev - exp) });
    collection_trend.push({ label: key, rate: invoiced > 0 ? round2((collected / invoiced) * 100) : 0 });
  }
  return { revenue_trend, collection_trend };
}

// Matches the is-Saudi convention used elsewhere (payroll.ts, benchmarks.ts) —
// there is no boolean is_saudi column, only the free-text nationality field.
function isSaudi(nationality: string | null | undefined): boolean {
  return /^(saudi|saudi arabia|sa|سعودي)$/i.test((nationality ?? '').trim());
}

function notTrackedSignal(message: string) {
  return { color: 'unknown' as const, status: 'not_tracked' as const, message };
}

// Compliance sub-score: overdue invoices + expiring iqamas + latest ZATCA
// e-invoicing submission status. Starts at 100, deducts penalties for the
// signals we can actually measure.
// TODO: WPS/Mudad and Qiwa have no dedicated filing-status tables in this
// schema yet, and GOSI is computed live per payroll run rather than stored
// as a filing record — those three traffic lights report not_tracked
// instead of querying tables that don't exist.
async function getComplianceSignals(tenant_id: string) {
  const cutoff30 = daysAgoStr(-30); // 30 days ahead
  const today = todayStr();

  const [overdueRes, iqamaRes, zatcaRes] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id).neq('status', 'paid').lte('due_date', today).not('due_date', 'is', null),
    supabase.from('employees').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('status', 'active').lte('iqama_expiry', cutoff30).not('iqama_expiry', 'is', null),
    supabase.from('zatca_submissions').select('zatca_status, submitted_at').eq('tenant_id', tenant_id).order('submitted_at', { ascending: false }).limit(1),
  ]);

  const overdueCount = overdueRes.count ?? 0;
  const iqamaExpiringCount = iqamaRes.count ?? 0;
  const zatca = zatcaRes.data?.[0] ?? null;
  const zatcaColor = !zatca ? 'unknown' : ['cleared', 'reported'].includes(zatca.zatca_status) ? 'green' : ['pending', 'generated'].includes(zatca.zatca_status) ? 'yellow' : 'red';

  let penalty = 0;
  penalty += Math.min(40, overdueCount * 2);
  penalty += Math.min(30, iqamaExpiringCount * 3);
  if (zatcaColor === 'red') penalty += 10;

  const score = clamp(Math.round(100 - penalty));

  return {
    score,
    overdue_invoices: overdueCount,
    iqama_expiring_30d: iqamaExpiringCount,
    zatca_vat: zatca
      ? { color: zatcaColor, status: zatca.zatca_status, submitted_at: zatca.submitted_at }
      : notTrackedSignal('No zatca_submissions row found for this tenant yet.'),
    wps_mudad: notTrackedSignal('No WPS/Mudad filing-status table exists yet.'),
    gosi: notTrackedSignal('GOSI is computed per payroll run, not stored as a filing record.'),
    qiwa: notTrackedSignal('No Qiwa contract-status table exists yet.'),
  };
}

// Retention sub-score: employees has no termination/separation date column,
// so a true 12-month retention rate cannot be computed from this schema yet.
// Only active_headcount is real; the rest is null + a neutral fallback score
// so the Vitality Index composite isn't skewed by a fabricated number.
async function getRetention(tenant_id: string) {
  const activeRes = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant_id).eq('status', 'active');
  const active = activeRes.count ?? 0;
  return { active_headcount: active, separations_12mo: null, retention_rate: null, score: 50, data_quality: 'not_tracked' as const };
}

async function getVitalityWeights(tenant_id: string) {
  const { data } = await supabase.from('exec_vitality_weights').select('*').eq('tenant_id', tenant_id).maybeSingle();
  return {
    financial: Number(data?.financial_weight ?? 25),
    growth: Number(data?.growth_weight ?? 20),
    collections: Number(data?.collections_weight ?? 20),
    compliance: Number(data?.compliance_weight ?? 20),
    retention: Number(data?.retention_weight ?? 15),
  };
}

// Group Vitality Index — weighted composite of the five sub-scores (each 0-100).
// Default weights: Financial 25 / Growth 20 / Collections 20 / Compliance 20 / Retention 15.
// Weights are tenant-configurable via exec_vitality_weights and normalized to
// sum to 100 here so a misconfigured row can never silently over/under-weight.
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

async function buildVitality(tenant_id: string) {
  const [financials, growth, collections, compliance, retention, weights] = await Promise.all([
    getFinancials(tenant_id),
    getGrowth(tenant_id),
    getCollections(tenant_id),
    getComplianceSignals(tenant_id),
    getRetention(tenant_id),
    getVitalityWeights(tenant_id),
  ]);
  const vitality = computeVitalityIndex(weights, {
    financial: financials.score,
    growth: growth.score,
    collections: collections.score,
    compliance: compliance.score,
    retention: retention.score,
  });
  return { vitality, financials, growth, collections, compliance, retention };
}

async function getBranches(tenant_id: string) {
  const { data } = await supabase.from('branches').select('id, name_en, name_ar').eq('tenant_id', tenant_id);
  return data ?? [];
}

// ─── GET /api/exec/ceo ───────────────────────────────────────────────────────
execRouter.get('/ceo', requireExecAccess('ceo'), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });

  try {
    const { vitality, financials, growth, collections, compliance, retention } = await buildVitality(tenant_id);
    const [branches, trends] = await Promise.all([
      getBranches(tenant_id),
      getMonthlyTrends(tenant_id, 12),
    ]);
    const { revenue_trend, collection_trend } = trends;

    // Period-over-period deltas from the trailing trend (last full month vs the
    // month before it) — real movement, not a fabricated figure.
    const n = revenue_trend.length;
    const revenueDelta = pctDelta(revenue_trend[n - 1]?.revenue ?? 0, revenue_trend[n - 2]?.revenue ?? 0);
    const ebitdaDelta = pctDelta(revenue_trend[n - 1]?.ebitda ?? 0, revenue_trend[n - 2]?.ebitda ?? 0);
    const collectionDelta = pctDelta(collection_trend[n - 1]?.rate ?? 0, collection_trend[n - 2]?.rate ?? 0);

    // Per-campus vitality: same financial+collections lens, scoped by branch_id.
    const campusVitality = await Promise.all(
      branches.map(async (b: any) => {
        const { data: invs } = await supabase.from('invoices').select('total_amount, paid_amount').eq('tenant_id', tenant_id).eq('branch_id', b.id);
        const rows = invs ?? [];
        const invoiced = rows.reduce((s, r: any) => s + Number(r.total_amount ?? 0), 0);
        const collected = rows.reduce((s, r: any) => s + Number(r.paid_amount ?? 0), 0);
        const rate = invoiced > 0 ? collected / invoiced : 0;
        return { branch_id: b.id, name_en: b.name_en, name_ar: b.name_ar, collection_rate: round2(rate * 100), score: clamp(Math.round(rate * 100)) };
      }),
    );

    const strategicAlerts: Array<{ severity: string; category: string; message_en: string; message_ar: string }> = [];
    if (compliance.overdue_invoices > 0) {
      strategicAlerts.push({ severity: compliance.overdue_invoices > 10 ? 'high' : 'medium', category: 'collections', message_en: `${compliance.overdue_invoices} invoices are overdue.`, message_ar: `يوجد ${compliance.overdue_invoices} فاتورة متأخرة السداد.` });
    }
    if (compliance.iqama_expiring_30d > 0) {
      strategicAlerts.push({ severity: 'medium', category: 'compliance', message_en: `${compliance.iqama_expiring_30d} employee iqamas expire within 30 days.`, message_ar: `${compliance.iqama_expiring_30d} إقامة موظف ستنتهي خلال 30 يوماً.` });
    }
    if (growth.data_quality === 'real' && (growth.growth_rate ?? 0) < 0) {
      strategicAlerts.push({ severity: 'high', category: 'growth', message_en: `Enrollment declined ${Math.abs(growth.growth_rate ?? 0)}% year-over-year.`, message_ar: `انخفض عدد الطلاب المسجلين ${Math.abs(growth.growth_rate ?? 0)}٪ على أساس سنوي.` });
    }

    await writeExecAudit(req, 'exec_dashboard_view', { persona: 'ceo' }, tenant_id);

    // Drop the internal `rows` (full invoice list) from the collections payload —
    // the client only needs the aggregates, and shipping every invoice is both
    // wasteful and needless data exposure. Expose `collection_rate_pct` (the name
    // the CEO KPI card reads) plus the period delta.
    const { rows: _collRows, ...collectionsPublic } = collections;

    res.json({
      vitality,
      financials: { ...financials, revenue_delta_pct: revenueDelta, ebitda_delta_pct: ebitdaDelta },
      growth,
      collections: { ...collectionsPublic, collection_rate_pct: collections.collection_rate, collection_delta_pct: collectionDelta },
      campus_vitality: campusVitality,
      revenue_trend,
      collection_trend,
      strategic_alerts: strategicAlerts,
    });
  } catch (err) {
    console.error('CEO dashboard error:', err);
    res.status(500).json({ error: 'Failed to load CEO dashboard' });
  }
});

// ─── GET /api/exec/cfo ───────────────────────────────────────────────────────
execRouter.get('/cfo', requireExecAccess('cfo'), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });

  try {
    const [financials, collections, compliance] = await Promise.all([
      getFinancials(tenant_id),
      getCollections(tenant_id),
      getComplianceSignals(tenant_id),
    ]);

    const since30 = daysAgoStr(30);
    const { data: recentPayments } = await supabase.from('payments').select('amount, date').eq('tenant_id', tenant_id).gte('date', since30);
    const cash30d = round2((recentPayments ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0));

    // DSO = Accounts Receivable / (trailing-12mo revenue / 365)
    const unpaidRows = collections.rows.filter((r: any) => Number(r.total_amount ?? 0) - Number(r.paid_amount ?? 0) > 0);
    const accountsReceivable = round2(unpaidRows.reduce((s: number, r: any) => s + (Number(r.total_amount ?? 0) - Number(r.paid_amount ?? 0)), 0));
    const dso = financials.revenue > 0 ? round2(accountsReceivable / (financials.revenue / 365)) : null;

    // AR aging buckets (0-30 / 31-60 / 61-90 / 90+) by days past due_date.
    const today = Date.now();
    const buckets = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
    const overdueByBranch = new Map<string, number>();
    for (const r of unpaidRows as any[]) {
      const balance = Number(r.total_amount ?? 0) - Number(r.paid_amount ?? 0);
      const dueDate = r.due_date ? new Date(r.due_date).getTime() : null;
      const daysPastDue = dueDate ? Math.floor((today - dueDate) / DAY_MS) : 0;
      if (daysPastDue <= 30) buckets['0_30'] += balance;
      else if (daysPastDue <= 60) buckets['31_60'] += balance;
      else if (daysPastDue <= 90) buckets['61_90'] += balance;
      else buckets['90_plus'] += balance;
      if (r.branch_id) overdueByBranch.set(r.branch_id, (overdueByBranch.get(r.branch_id) ?? 0) + balance);
    }
    for (const k of Object.keys(buckets) as (keyof typeof buckets)[]) buckets[k] = round2(buckets[k]);

    const branches = await getBranches(tenant_id);
    const overdueByCampus = branches.map((b: any) => ({ branch_id: b.id, name_en: b.name_en, name_ar: b.name_ar, overdue_amount: round2(overdueByBranch.get(b.id) ?? 0) }));

    // Revenue vs EBITDA — last 6 months, grouped by paid invoices / approved expenses.
    const months: { label: string; revenue: number; ebitda: number }[] = [];
    const since6mo = daysAgoStr(180);
    const [invForChart, expForChart] = await Promise.all([
      supabase.from('invoices').select('paid_amount, date').eq('tenant_id', tenant_id).gte('date', since6mo),
      supabase.from('expenses').select('amount, date').eq('tenant_id', tenant_id).eq('status', 'approved').gte('date', since6mo),
    ]);
    const revenueByMonth = new Map<string, number>();
    const expensesByMonth = new Map<string, number>();
    for (const r of (invForChart.data ?? []) as any[]) {
      const key = (r.date ?? '').slice(0, 7);
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(r.paid_amount ?? 0));
    }
    for (const r of (expForChart.data ?? []) as any[]) {
      const key = (r.date ?? '').slice(0, 7);
      expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + Number(r.amount ?? 0));
    }
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const rev = round2(revenueByMonth.get(key) ?? 0);
      const exp = round2(expensesByMonth.get(key) ?? 0);
      months.push({ label: key, revenue: rev, ebitda: round2(rev - exp) });
    }

    await writeExecAudit(req, 'exec_dashboard_view', { persona: 'cfo' }, tenant_id);

    res.json({
      kpis: { revenue: financials.revenue, ebitda: financials.ebitda, margin_pct: financials.margin, cash_collected_30d: cash30d, dso_days: dso },
      ar_aging: buckets,
      collection_rate_pct: collections.collection_rate,
      overdue_by_campus: overdueByCampus,
      revenue_vs_ebitda: months,
      compliance_traffic_lights: {
        zatca_vat: compliance.zatca_vat,
        wps_mudad: compliance.wps_mudad,
        gosi: compliance.gosi,
      },
      // Scenario simulator baseline — sliders on the client recompute against
      // these figures (e.g. fee uplift %, headcount change %); no server round-trip needed.
      scenario_baseline: { revenue: financials.revenue, expenses: financials.expenses, ebitda: financials.ebitda },
    });
  } catch (err) {
    console.error('CFO dashboard error:', err);
    res.status(500).json({ error: 'Failed to load CFO dashboard' });
  }
});

// ─── GET /api/exec/coo ───────────────────────────────────────────────────────
execRouter.get('/coo', requireExecAccess('coo'), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });

  try {
    const branches = await getBranches(tenant_id);
    const [sectionsRes, studentsRes, employeesRes, applicantsRes, applicationsRes] = await Promise.all([
      supabase.from('sections').select('branch_id, capacity').eq('tenant_id', tenant_id),
      supabase.from('students').select('id, branch_id').eq('tenant_id', tenant_id).eq('status', 'active'),
      supabase.from('employees').select('job_title_id, job_titles(name_en, name_ar)').eq('tenant_id', tenant_id).eq('status', 'active'),
      supabase.from('applicants').select('id, status').eq('tenant_id', tenant_id),
      supabase.from('applications').select('id, stage, decision').eq('tenant_id', tenant_id),
    ]);

    const sections = sectionsRes.data ?? [];
    const students = studentsRes.data ?? [];
    const employees = employeesRes.data ?? [];

    const capacityByBranch = new Map<string, number>();
    for (const s of sections as any[]) {
      if (!s.branch_id) continue;
      capacityByBranch.set(s.branch_id, (capacityByBranch.get(s.branch_id) ?? 0) + Number(s.capacity ?? 0));
    }
    const studentsByBranch = new Map<string, number>();
    for (const s of students as any[]) {
      if (!s.branch_id) continue;
      studentsByBranch.set(s.branch_id, (studentsByBranch.get(s.branch_id) ?? 0) + 1);
    }

    // Capacity-to-Cash: utilization per campus alongside collected revenue per campus.
    const capacityToCash = await Promise.all(
      branches.map(async (b: any) => {
        const capacity = capacityByBranch.get(b.id) ?? 0;
        const enrolled = studentsByBranch.get(b.id) ?? 0;
        const { data: invs } = await supabase.from('invoices').select('paid_amount').eq('tenant_id', tenant_id).eq('branch_id', b.id);
        const cash = round2((invs ?? []).reduce((s, r: any) => s + Number(r.paid_amount ?? 0), 0));
        return {
          branch_id: b.id, name_en: b.name_en, name_ar: b.name_ar,
          capacity, enrolled,
          utilization_pct: capacity > 0 ? round2((enrolled / capacity) * 100) : null,
          cash_collected: cash,
        };
      }),
    );

    const totalCapacity = [...capacityByBranch.values()].reduce((s, v) => s + v, 0);
    const totalEnrolled = students.length;

    // Student-teacher ratio is a BEST-EFFORT proxy (no `is_teacher` flag exists on
    // employees/job_titles) — matches employees whose job title looks like a
    // teaching role. Flagged as an estimate, never presented as exact.
    const teacherCount = (employees as any[]).filter((e) => {
      const jt = e.job_titles;
      const name = `${jt?.name_en ?? ''} ${jt?.name_ar ?? ''}`;
      return /teach|معلم/i.test(name);
    }).length;
    const studentTeacherRatio = teacherCount > 0 ? round2(totalEnrolled / teacherCount) : null;

    const admissionsFunnel = {
      applicants_total: (applicantsRes.data ?? []).length,
      applicants_pending: (applicantsRes.data ?? []).filter((a: any) => a.status === 'pending').length,
      applicants_accepted: (applicantsRes.data ?? []).filter((a: any) => a.status === 'accepted').length,
      applications_by_stage: Object.entries(
        (applicationsRes.data ?? []).reduce((acc: Record<string, number>, a: any) => {
          acc[a.stage ?? 'submitted'] = (acc[a.stage ?? 'submitted'] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([stage, count]) => ({ stage, count })),
    };

    await writeExecAudit(req, 'exec_dashboard_view', { persona: 'coo' }, tenant_id);

    res.json({
      kpis: {
        capacity_utilization_pct: totalCapacity > 0 ? round2((totalEnrolled / totalCapacity) * 100) : null,
        student_teacher_ratio: studentTeacherRatio,
        student_teacher_ratio_data_quality: 'estimated',
        // TODO: no student attendance table exists in the schema (only
        // employee_attendance for HR/staff) — this widget has no real backing data.
        student_attendance_rate_pct: null,
        student_attendance_data_quality: 'not_tracked',
      },
      capacity_to_cash: capacityToCash,
      admissions_funnel: admissionsFunnel,
      utilization_by_campus: capacityToCash.map((c) => ({ branch_id: c.branch_id, name_en: c.name_en, name_ar: c.name_ar, utilization_pct: c.utilization_pct })),
    });
  } catch (err) {
    console.error('COO dashboard error:', err);
    res.status(500).json({ error: 'Failed to load COO dashboard' });
  }
});

// ─── GET /api/exec/chro ──────────────────────────────────────────────────────
execRouter.get('/chro', requireExecAccess('chro'), async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = resolveTenantId(req);
  if (!tenant_id) return res.status(400).json({ error: 'No tenant context' });

  try {
    const [employeesRes, departmentsRes, compliance, retention] = await Promise.all([
      supabase.from('employees').select('id, status, nationality, gender, department_id').eq('tenant_id', tenant_id),
      supabase.from('departments').select('id, name_en, name_ar').eq('tenant_id', tenant_id),
      getComplianceSignals(tenant_id),
      getRetention(tenant_id),
    ]);

    const employees = employeesRes.data ?? [];
    const active = employees.filter((e: any) => e.status === 'active');
    const saudiCount = active.filter((e: any) => isSaudi(e.nationality)).length;
    const saudizationPct = active.length > 0 ? round2((saudiCount / active.length) * 100) : 0;

    // Nitaqat banding — simplified default thresholds (documented here, not a
    // precise sector/size lookup against the real MOL Nitaqat program).
    // TODO: make thresholds tenant-configurable once a settings UI exists.
    const NITAQAT_THRESHOLDS = { platinum: 40, green: 25, yellow: 15 };
    let nitaqatBand: 'platinum' | 'green' | 'yellow' | 'red';
    if (saudizationPct >= NITAQAT_THRESHOLDS.platinum) nitaqatBand = 'platinum';
    else if (saudizationPct >= NITAQAT_THRESHOLDS.green) nitaqatBand = 'green';
    else if (saudizationPct >= NITAQAT_THRESHOLDS.yellow) nitaqatBand = 'yellow';
    else nitaqatBand = 'red';

    const departments = departmentsRes.data ?? [];
    const deptName = new Map(departments.map((d: any) => [d.id, { en: d.name_en, ar: d.name_ar }]));
    const byDepartment = new Map<string, number>();
    for (const e of active as any[]) {
      const key = e.department_id ?? 'unassigned';
      byDepartment.set(key, (byDepartment.get(key) ?? 0) + 1);
    }
    const workforceByDepartment = [...byDepartment.entries()].map(([id, count]) => ({
      department_id: id === 'unassigned' ? null : id,
      name_en: deptName.get(id)?.en ?? 'Unassigned',
      name_ar: deptName.get(id)?.ar ?? 'غير محدد',
      count,
    }));
    const byGender = active.reduce((acc: Record<string, number>, e: any) => {
      const key = e.gender ?? 'unspecified';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    await writeExecAudit(req, 'exec_dashboard_view', { persona: 'chro' }, tenant_id);

    res.json({
      kpis: {
        headcount: active.length,
        saudization_pct: saudizationPct,
        retention_rate_pct: retention.retention_rate,
        retention_data_quality: retention.data_quality,
      },
      nitaqat: { band: nitaqatBand, saudization_pct: saudizationPct, thresholds: NITAQAT_THRESHOLDS },
      workforce_composition: { by_department: workforceByDepartment, by_gender: byGender, saudi_count: saudiCount, non_saudi_count: active.length - saudiCount },
      payroll_gov_compliance: {
        wps_mudad: compliance.wps_mudad,
        gosi: compliance.gosi,
        qiwa: compliance.qiwa,
      },
      open_roles: {
        // TODO: no career_postings/job-requisitions table exists in the schema
        // yet, so open-role count and time-to-fill cannot be computed.
        count: null,
        count_data_quality: 'not_tracked',
        avg_time_to_fill_days: null,
        time_to_fill_data_quality: 'not_tracked',
      },
    });
  } catch (err) {
    console.error('CHRO dashboard error:', err);
    res.status(500).json({ error: 'Failed to load CHRO dashboard' });
  }
});

// ─── YAMEN Board Brief — bilingual narrative + exactly 3 actions ───────────
// Reuses the existing AI provider gateway (resolveProviders) with zero new
// secrets. Cached per tenant+period in exec_brief_cache; refreshed manually
// or when the cache for the current period is missing.

interface BoardBrief {
  narrative_en: string;
  narrative_ar: string;
  actions_en: string[];
  actions_ar: string[];
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
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
      // Scrub any stray Markdown the model emitted so the brief renders as clean
      // plain text (no literal "**") in the board-brief card.
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
  const { vitality, financials, growth, collections, compliance, retention } = await buildVitality(tenant_id);
  const metrics = { period, vitality_score: vitality.score, sub_scores: vitality.sub_scores, financials, growth, collections, compliance, retention };

  let brief: BoardBrief | null = null;
  let usedProvider: string | null = null;
  for (const runner of resolveProviders(buildBriefPrompt(metrics), tenant_id)) {
    try {
      const raw = await runner.run();
      const parsed = parseBriefResponse(raw);
      if (parsed) {
        brief = parsed;
        usedProvider = runner.name;
        break;
      }
    } catch {
      /* try next provider */
    }
  }

  if (!brief) return null;

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
    // IMPORTANT — token discipline: GET only ever returns an EXISTING brief. It
    // must never call the LLM, because this endpoint is fetched automatically
    // whenever the CEO dashboard mounts. The brief is generated ONLY when the
    // user explicitly clicks "Generate Brief" (POST /ceo/brief/refresh). When no
    // brief exists yet we return null so the client shows the generate CTA.
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
