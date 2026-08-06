import type { SupabaseClient } from '@supabase/supabase-js';
import { sar, getAgingReport, getExpectedCollections, getRevenueByFeeType } from './reports.js';
import { buildRequestContext, resolveJurisdiction, NotImplementedInJurisdiction } from '../lib/jurisdiction.js';
import { resolvePack } from '../packs/registry.js';

const DAY_MS = 86400000;

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function daysAgoStr(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().split('T')[0];
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pctDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function isoMonth(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return d.toISOString().slice(0, 7);
}

interface MetricInput {
  value?: number | null;
  numerator?: number | null;
  denominator?: number | null;
  metadata?: any;
}

export interface DashboardData {
  ceo: any;
  cfo: any;
  coo: any;
  chro: any;
  computed_at: string;
  period: string;
}

export class MetricsService {
  constructor(private supabase: SupabaseClient) {}

  private async ensureRegistry(): Promise<void> {
    const registry = [
      // CEO
      { kpi: 'ceo.vitality.score', name_ar: 'مؤشر حيوية المجموعة', name_en: 'Group Vitality Score', owner_persona: ['ceo'], display_format: 'number' },
      { kpi: 'ceo.vitality.sub_scores', name_ar: 'درجات المحاور الفرعية', name_en: 'Pillar Sub-scores', owner_persona: ['ceo'], display_format: 'text' },
      { kpi: 'ceo.financials.revenue', name_ar: 'الإيرادات', name_en: 'Revenue', owner_persona: ['ceo','cfo'], display_format: 'currency' },
      { kpi: 'ceo.financials.ebitda', name_ar: 'الأرباح قبل الفوائد والضرائب والإهلاك', name_en: 'EBITDA', owner_persona: ['ceo','cfo'], display_format: 'currency' },
      { kpi: 'ceo.financials.revenue_delta_pct', name_ar: 'نسبة التغير في الإيرادات', name_en: 'Revenue Change %', owner_persona: ['ceo','cfo'], display_format: 'percent' },
      { kpi: 'ceo.financials.ebitda_delta_pct', name_ar: 'نسبة التغير في الأرباح', name_en: 'EBITDA Change %', owner_persona: ['ceo','cfo'], display_format: 'percent' },
      { kpi: 'ceo.collections.collection_rate_pct', name_ar: 'نسبة التحصيل', name_en: 'Collection Rate %', owner_persona: ['ceo','cfo'], display_format: 'percent', threshold_green: 95, threshold_amber: 80, threshold_red: 60 },
      { kpi: 'ceo.collections.collection_delta_pct', name_ar: 'نسبة التغير في التحصيل', name_en: 'Collection Rate Change %', owner_persona: ['ceo'], display_format: 'percent' },
      { kpi: 'ceo.growth.growth_rate_pct', name_ar: 'معدل النمو السنوي', name_en: 'YoY Growth %', owner_persona: ['ceo'], display_format: 'percent' },
      { kpi: 'ceo.compliance.score', name_ar: 'درجة الالتزام النظامي', name_en: 'Compliance Score', owner_persona: ['ceo','chro'], display_format: 'number', threshold_green: 80, threshold_amber: 60, threshold_red: 40 },
      { kpi: 'ceo.campus_vitality', name_ar: 'حيوية الفروع', name_en: 'Branch Vitality', owner_persona: ['ceo'], display_format: 'text' },
      { kpi: 'ceo.revenue_trend', name_ar: 'اتجاه الإيرادات', name_en: 'Revenue Trend', owner_persona: ['ceo','cfo'], display_format: 'text' },
      { kpi: 'ceo.collection_trend', name_ar: 'اتجاه نسبة التحصيل', name_en: 'Collection Trend', owner_persona: ['ceo','cfo'], display_format: 'text' },
      { kpi: 'ceo.strategic_alerts', name_ar: 'تنبيهات استراتيجية', name_en: 'Strategic Alerts', owner_persona: ['ceo'], display_format: 'text' },
      { kpi: 'ceo.top_risks', name_ar: 'أعلى 5 مخاطر', name_en: 'Top 5 Risks', owner_persona: ['ceo'], display_format: 'text' },
      { kpi: 'ceo.cash_runway', name_ar: 'مدى النقد', name_en: 'Cash Runway', owner_persona: ['ceo'], display_format: 'days' },
      // CFO
      { kpi: 'cfo.kpis.revenue', name_ar: 'الإيرادات', name_en: 'Revenue', owner_persona: ['cfo'], display_format: 'currency' },
      { kpi: 'cfo.kpis.ebitda', name_ar: 'الأرباح قبل الفوائد والضرائب والإهلاك', name_en: 'EBITDA', owner_persona: ['cfo'], display_format: 'currency' },
      { kpi: 'cfo.kpis.margin_pct', name_ar: 'هامش الربح', name_en: 'Margin %', owner_persona: ['cfo'], display_format: 'percent' },
      { kpi: 'cfo.kpis.cash_collected_30d', name_ar: 'النقد المحصل (30 يوم)', name_en: 'Cash Collected (30d)', owner_persona: ['cfo'], display_format: 'currency' },
      { kpi: 'cfo.kpis.dso_days', name_ar: 'أيام التحصيل المتوسطة', name_en: 'DSO (Days)', owner_persona: ['cfo'], display_format: 'days', threshold_green: 30, threshold_amber: 60, threshold_red: 90 },
      { kpi: 'cfo.ar_aging', name_ar: 'أعمار الذمم المدينة', name_en: 'AR Aging', owner_persona: ['cfo'], display_format: 'text' },
      { kpi: 'cfo.overdue_by_campus', name_ar: 'المتأخرات حسب الفرع', name_en: 'Overdue by Campus', owner_persona: ['cfo'], display_format: 'text' },
      { kpi: 'cfo.revenue_vs_ebitda', name_ar: 'الإيرادات مقابل الأرباح', name_en: 'Revenue vs EBITDA', owner_persona: ['cfo'], display_format: 'text' },
      { kpi: 'cfo.compliance_traffic_lights', name_ar: 'مؤشرات الالتزام النظامي', name_en: 'Compliance Traffic Lights', owner_persona: ['cfo'], display_format: 'text' },
      { kpi: 'cfo.revenue_by_fee_type', name_ar: 'الإيرادات حسب نوع الرسم', name_en: 'Revenue by Fee Type', owner_persona: ['cfo'], display_format: 'text' },
      { kpi: 'cfo.collections_forecast', name_ar: 'توقع التحصيل', name_en: 'Collections Forecast', owner_persona: ['cfo'], display_format: 'text' },
      { kpi: 'cfo.vat_position', name_ar: 'موقف ضريبة القيمة المضافة', name_en: 'VAT Position', owner_persona: ['cfo'], display_format: 'text' },
      { kpi: 'cfo.budget_vs_actual', name_ar: 'الميزانية مقابل الفعلي', name_en: 'Budget vs Actual', owner_persona: ['cfo'], display_format: 'text' },
      // COO
      { kpi: 'coo.kpis.capacity_utilization_pct', name_ar: 'معدل استغلال السعة', name_en: 'Capacity Utilization %', owner_persona: ['coo'], display_format: 'percent', threshold_green: 90, threshold_amber: 70, threshold_red: 50 },
      { kpi: 'coo.kpis.student_teacher_ratio', name_ar: 'نسبة الطلاب للمعلمين', name_en: 'Student-Teacher Ratio', owner_persona: ['coo'], display_format: 'ratio' },
      { kpi: 'coo.kpis.student_attendance_rate_pct', name_ar: 'معدل حضور الطلاب', name_en: 'Student Attendance %', owner_persona: ['coo'], display_format: 'percent', threshold_green: 95, threshold_amber: 85, threshold_red: 70 },
      { kpi: 'coo.capacity_to_cash', name_ar: 'السعة إلى النقد', name_en: 'Capacity to Cash', owner_persona: ['coo'], display_format: 'text' },
      { kpi: 'coo.admissions_funnel', name_ar: 'قمع القبول والتسجيل', name_en: 'Admissions Funnel', owner_persona: ['coo'], display_format: 'text' },
      { kpi: 'coo.utilization_by_campus', name_ar: 'الاستغلال حسب الفرع', name_en: 'Utilization by Campus', owner_persona: ['coo'], display_format: 'text' },
      { kpi: 'coo.section_fill_rates', name_ar: 'معدل إشغال الفصول', name_en: 'Section Fill Rates', owner_persona: ['coo'], display_format: 'text' },
      { kpi: 'coo.employee_attendance_summary', name_ar: 'ملخص حضور الموظفين', name_en: 'Employee Attendance Summary', owner_persona: ['coo','chro'], display_format: 'text' },
      { kpi: 'coo.staff_coverage_alerts', name_ar: 'تنبيهات تغطية الموظفين', name_en: 'Staff Coverage Alerts', owner_persona: ['coo'], display_format: 'text' },
      // CHRO
      { kpi: 'chro.kpis.headcount', name_ar: 'إجمالي الموظفين', name_en: 'Headcount', owner_persona: ['chro'], display_format: 'number' },
      { kpi: 'chro.kpis.saudization_pct', name_ar: 'نسبة التوطين', name_en: 'Saudization %', owner_persona: ['chro'], display_format: 'percent', threshold_green: 25, threshold_amber: 15, threshold_red: 10 },
      { kpi: 'chro.kpis.retention_rate_pct', name_ar: 'معدل الاستبقاء', name_en: 'Retention %', owner_persona: ['chro'], display_format: 'percent' },
      { kpi: 'chro.kpis.open_roles_count', name_ar: 'الوظائف الشاغرة', name_en: 'Open Roles', owner_persona: ['chro'], display_format: 'number' },
      { kpi: 'chro.nitaqat', name_ar: 'فئة نطاقات', name_en: 'Nitaqat Band', owner_persona: ['chro'], display_format: 'text' },
      { kpi: 'chro.workforce_composition', name_ar: 'تكوين القوى العاملة', name_en: 'Workforce Composition', owner_persona: ['chro'], display_format: 'text' },
      { kpi: 'chro.saudi_vs_non_saudi', name_ar: 'السعوديون مقابل غير السعوديين', name_en: 'Saudi vs Non-Saudi', owner_persona: ['chro'], display_format: 'text' },
      { kpi: 'chro.payroll_gov_compliance', name_ar: 'الالتزام الحكومي للرواتب', name_en: 'Payroll Government Compliance', owner_persona: ['chro'], display_format: 'text' },
      { kpi: 'chro.contract_expiry_radar', name_ar: 'رادار انتهاء العقود', name_en: 'Contract Expiry Radar', owner_persona: ['chro'], display_format: 'text' },
      { kpi: 'chro.teacher_load_distribution', name_ar: 'توزيع حمل المعلمين', name_en: 'Teacher Load Distribution', owner_persona: ['chro'], display_format: 'text' },
      { kpi: 'chro.leave_absence_summary', name_ar: 'ملخص الإجازات والغياب', name_en: 'Leave & Absence Summary', owner_persona: ['chro'], display_format: 'text' },
    ];

    const registryRows = (registry as any[]).map((row) => ({
      metric_key: row.kpi,
      name_ar: row.name_ar,
      name_en: row.name_en,
      formula: row.formula,
      source_tables: row.source_tables,
      owner_persona: row.owner_persona,
      threshold_green: row.threshold_green,
      threshold_amber: row.threshold_amber,
      threshold_red: row.threshold_red,
      display_format: row.display_format,
    }));
    const { error } = await this.supabase.from('kpi_registry').upsert(registryRows as any, { onConflict: 'metric_key' });
    if (error) console.error('kpi_registry upsert error:', error);
  }

  private async upsert(kpi: string, tenantId: string, period: string, input: MetricInput, branchId?: string): Promise<void> {
    await this.supabase.from('kpi_snapshots').upsert(
      {
        tenant_id: tenantId,
        branch_id: branchId ?? null,
        metric_key: kpi,
        period,
        value: input.value ?? null,
        numerator: input.numerator ?? null,
        denominator: input.denominator ?? null,
        metadata: input.metadata ?? {},
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id, branch_id, metric_key, period' },
    );
  }

  private snapshotQuery(tenantId: string, period: string, branchId?: string) {
    let q = this.supabase.from('kpi_snapshots').select('*').eq('tenant_id', tenantId).eq('period', period);
    if (branchId) q = q.eq('branch_id', branchId);
    else q = q.is('branch_id', null);
    return q;
  }

  async loadDashboardSnapshot(persona: string, tenantId: string, period: string, branchId?: string): Promise<any | null> {
    const { data } = await this.snapshotQuery(tenantId, period, branchId)
      .eq('metric_key', `${persona}.dashboard`)
      .maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.computed_at).getTime() > 3600000) return null;
    return { ...data.metadata, computed_at: data.computed_at, period: data.period };
  }

  private branchFilter(q: any, branchId?: string) {
    if (branchId) return q.eq('branch_id', branchId);
    return q;
  }

  async computeAndStoreAll(tenantId: string, period = 'current', branchId?: string, persona?: 'ceo' | 'cfo' | 'coo' | 'chro'): Promise<DashboardData> {
    await this.ensureRegistry();

    const ctx = await buildRequestContext(this.supabase, tenantId, branchId ?? undefined);
    const pack = resolvePack(ctx);

    const needsCEO = !persona || persona === 'ceo';
    const needsCFO = !persona || persona === 'cfo';
    const needsCOO = !persona || persona === 'coo';
    const needsCHRO = !persona || persona === 'chro';

    // Period range for trailing-financial computations.
    const periodEnd = todayStr();
    const periodStart = daysAgoStr(365);
    const startOfMonth = `${isoMonth(0)}-01`;

    const [academicYear, branches] = await Promise.all([
      pack.academicCalendar?.currentAcademicYearForDate
        ? await pack.academicCalendar.currentAcademicYearForDate(this.supabase, tenantId) as { id: string; start_date: string } | null
        : null,
      this.supabase.from('branches').select('id, name_en, name_ar').eq('tenant_id', tenantId).then(r => r.data ?? []),
    ]);

    // === Financials (cash basis: paid invoices - approved expenses) ===
    let invoices: any[] = [];
    let expenses: any[] = [];
    if (needsCEO || needsCFO || needsCOO) {
      const [invRes, expRes] = await Promise.all([
        this.branchFilter(this.supabase.from('invoices').select('total_amount, paid_amount, date, branch_id, vat_amount, status, due_date').eq('tenant_id', tenantId).gte('date', periodStart).neq('status', 'cancelled'), branchId),
        this.branchFilter(this.supabase.from('expenses').select('amount, date, branch_id').eq('tenant_id', tenantId).eq('status', 'approved').gte('date', periodStart), branchId),
      ]);
      invoices = (invRes.data ?? []) as any[];
      expenses = (expRes.data ?? []) as any[];
    }

    const revenue = round2(invoices.reduce((s, r) => s + Number(r.paid_amount ?? 0), 0));
    const expTotal = round2(expenses.reduce((s, r) => s + Number(r.amount ?? 0), 0));
    const ebitda = round2(revenue - expTotal);
    const margin = revenue > 0 ? round2((ebitda / revenue) * 100) : 0;

    // === Monthly trends (12 months) ===
    const revByMonth = new Map<string, number>();
    const expByMonth = new Map<string, number>();
    const invByMonth = new Map<string, number>();
    const collectedByMonth = new Map<string, number>();
    for (const r of invoices) {
      const key = (r.date ?? '').slice(0, 7);
      if (!key) continue;
      revByMonth.set(key, (revByMonth.get(key) ?? 0) + Number(r.paid_amount ?? 0));
      invByMonth.set(key, (invByMonth.get(key) ?? 0) + Number(r.total_amount ?? 0));
      collectedByMonth.set(key, (collectedByMonth.get(key) ?? 0) + Number(r.paid_amount ?? 0));
    }
    for (const r of expenses) {
      const key = (r.date ?? '').slice(0, 7);
      if (!key) continue;
      expByMonth.set(key, (expByMonth.get(key) ?? 0) + Number(r.amount ?? 0));
    }
    const revenue_trend: { label: string; revenue: number; ebitda: number }[] = [];
    const collection_trend: { label: string; rate: number; note?: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const key = isoMonth(i);
      const rev = round2(revByMonth.get(key) ?? 0);
      const exp = round2(expByMonth.get(key) ?? 0);
      const invoiced = invByMonth.get(key) ?? 0;
      const collected = collectedByMonth.get(key) ?? 0;
      revenue_trend.push({ label: key, revenue: rev, ebitda: round2(rev - exp) });
      let rate = invoiced > 0 ? round2((collected / invoiced) * 100) : 0;
      let note: string | undefined;
      if (rate > 100) {
        note = 'includes prior-period arrears collection';
        rate = 100;
      }
      collection_trend.push({ label: key, rate, ...(note ? { note } : {}) });
    }

    const n = revenue_trend.length;
    const revenueDelta = pctDelta(revenue_trend[n - 1]?.revenue ?? 0, revenue_trend[n - 2]?.revenue ?? 0);
    const ebitdaDelta = pctDelta(revenue_trend[n - 1]?.ebitda ?? 0, revenue_trend[n - 2]?.ebitda ?? 0);
    const collectionDelta = pctDelta(collection_trend[n - 1]?.rate ?? 0, collection_trend[n - 2]?.rate ?? 0);

    // === Collection aggregates (12-month trailing for the branch filter) ===
    const totalInvoicedAll = round2(invoices.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0));
    const totalCollectedAll = round2(invoices.reduce((s: number, r: any) => s + Number(r.paid_amount ?? 0), 0));
    let collectionRate = totalInvoicedAll > 0 ? round2((totalCollectedAll / totalInvoicedAll) * 100) : 0;
    let collectionRateNote: string | undefined;
    if (collectionRate > 100) {
      collectionRateNote = 'يشمل تحصيل متأخرات فترات سابقة / includes collection of prior-period arrears';
      collectionRate = 100;
    }

    // === Cash collected 30d & DSO ===
    let cashCollected30d = 0;
    if (needsCEO || needsCFO) {
      const since30 = daysAgoStr(30);
      const payments30 = await this.branchFilter(this.supabase.from('payments').select('amount, date, branch_id').eq('tenant_id', tenantId).gte('date', since30), branchId).then((r: any) => (r.data ?? []) as any[]);
      cashCollected30d = round2(payments30.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0));
    }

    const unpaidInvoices = invoices.filter((r: any) => Number(r.total_amount ?? 0) - Number(r.paid_amount ?? 0) > 0);
    const ar = round2(unpaidInvoices.reduce((s: number, r: any) => s + (Number(r.total_amount ?? 0) - Number(r.paid_amount ?? 0)), 0));
    const dso = revenue > 0 ? round2(ar / (revenue / 365)) : null;

    // === AR aging (CFO only) ===
    let arAging = { '0_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
    if (needsCFO) {
      const aging = await getAgingReport(this.supabase, tenantId, { academic_year: academicYear?.id, includeStudents: false });
      arAging = {
        '0_30': aging.buckets.current ?? 0,
        '31_60': aging.buckets['1_30'] ?? 0,
        '61_90': aging.buckets['31_60'] ?? 0,
        '90_plus': aging.buckets['90_plus'] ?? 0,
      };
    }

    // === Overdue by campus ===
    const today = Date.now();
    const overdueByBranch = new Map<string, number>();
    for (const r of unpaidInvoices) {
      const balance = Number(r.total_amount ?? 0) - Number(r.paid_amount ?? 0);
      if (r.branch_id) overdueByBranch.set(r.branch_id, (overdueByBranch.get(r.branch_id) ?? 0) + balance);
    }
    const overdue_by_campus = branches.map((b: any) => ({ branch_id: b.id, name_en: b.name_en, name_ar: b.name_ar, overdue_amount: round2(overdueByBranch.get(b.id) ?? 0) }));

    // === Revenue by fee type & collections forecast (CFO only) ===
    let revenueByFeeType: any = { data_quality: 'not_tracked', message: 'Revenue by fee type not requested.' };
    let expectedCollections: any = { data_quality: 'not_tracked', message: 'Collections forecast not requested.' };
    if (needsCFO) {
      revenueByFeeType = await getRevenueByFeeType(this.supabase, tenantId, periodStart, periodEnd);
      const forecastFrom = todayStr();
      const forecastTo = daysAgoStr(-90); // 90 days ahead
      expectedCollections = await getExpectedCollections(this.supabase, tenantId, forecastFrom, forecastTo);
    }

    // === VAT position ===
    const vatAccrued = round2(invoices.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0));
    const nextFilingDate = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      d.setDate(0);
      return d.toISOString().split('T')[0];
    })();

    // === Growth (enrollment vs previous academic year, CEO/COO only) ===
    let growthData: any = { current_count: null, previous_count: null, growth_rate: null, score: 50, data_quality: 'not_tracked' };
    if ((needsCEO || needsCOO) && academicYear) {
      const currentRes = await this.branchFilter(this.supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('academic_year', academicYear.id), branchId);
      const currentCount = (currentRes as any).count ?? 0;
      // previous academic year: largest start_date < current.start_date
      const prevYear = pack.academicCalendar?.academicYearBefore
        ? await pack.academicCalendar.academicYearBefore(this.supabase, tenantId, academicYear.start_date) as { id: string } | null
        : null;
      let previousCount = 0;
      if (prevYear?.id) {
        previousCount = (await this.branchFilter(this.supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('academic_year', prevYear.id), branchId).then((r: any) => r.count ?? 0)) as number;
      }
      const rate = previousCount > 0 ? round2(((currentCount - previousCount) / previousCount) * 100) : 0;
      growthData = {
        current_count: currentCount,
        previous_count: previousCount,
        growth_rate: rate,
        score: clamp(Math.round(50 + rate * 2)),
        data_quality: 'real',
      };
    }

    // === Capacity & COO ===
    let sections: any[] = [];
    let students: any[] = [];
    let employees: any[] = [];
    let applicants: any[] = [];
    let applications: any[] = [];
    if (needsCEO || needsCOO) {
      const [sectionsRes, studentsRes, employeesRes, applicantsRes, applicationsRes] = await Promise.all([
        this.branchFilter(this.supabase.from('sections').select('branch_id, capacity, id, name_en, name_ar, grade_id').eq('tenant_id', tenantId), branchId),
        this.branchFilter(this.supabase.from('students').select('id, branch_id, status').eq('tenant_id', tenantId).eq('status', 'active'), branchId),
        this.branchFilter(this.supabase.from('employees').select('id, job_title_id, job_titles(name_en, name_ar), status, branch_id').eq('tenant_id', tenantId).eq('status', 'active'), branchId),
        this.branchFilter(this.supabase.from('applicants').select('id, status, branch_id').eq('tenant_id', tenantId), branchId),
        this.supabase.from('applications').select('id, stage, decision').eq('tenant_id', tenantId),
      ]);
      sections = (sectionsRes.data ?? []) as any[];
      students = (studentsRes.data ?? []) as any[];
      employees = (employeesRes.data ?? []) as any[];
      applicants = (applicantsRes.data ?? []) as any[];
      applications = (applicationsRes.data ?? []) as any[];
    }

    const capacityByBranch = new Map<string, number>();
    for (const s of sections) {
      if (!s.branch_id) continue;
      capacityByBranch.set(s.branch_id, (capacityByBranch.get(s.branch_id) ?? 0) + Number(s.capacity ?? 0));
    }
    const studentsByBranch = new Map<string, number>();
    for (const s of students) {
      if (!s.branch_id) continue;
      studentsByBranch.set(s.branch_id, (studentsByBranch.get(s.branch_id) ?? 0) + 1);
    }

    const capacityToCash = branches.map((b: any) => {
      const capacity = capacityByBranch.get(b.id) ?? 0;
      const enrolled = studentsByBranch.get(b.id) ?? 0;
      const branchInvoices = invoices.filter((r) => r.branch_id === b.id);
      const cash = round2(branchInvoices.reduce((s, r) => s + Number(r.paid_amount ?? 0), 0));
      return {
        branch_id: b.id,
        name_en: b.name_en,
        name_ar: b.name_ar,
        capacity,
        enrolled,
        utilization_pct: capacity > 0 ? round2((enrolled / capacity) * 100) : null,
        cash_collected: cash,
      };
    });
    const totalCapacity = [...capacityByBranch.values()].reduce((s, v) => s + v, 0);
    const totalEnrolled = students.length;
    const capacityUtilization = totalCapacity > 0 ? round2((totalEnrolled / totalCapacity) * 100) : null;

    // Student-teacher ratio (estimate by job title containing 'teacher'/'معلم')
    const teacherCount = employees.filter((e: any) => {
      const jt = e.job_titles;
      const name = `${jt?.name_en ?? ''} ${jt?.name_ar ?? ''}`;
      return /teach|معلم/i.test(name);
    }).length;
    const studentTeacherRatio = teacherCount > 0 ? round2(totalEnrolled / teacherCount) : null;

    // Admissions funnel: use application stages, with applicant statuses as top levels
    const funnel = {
      applicants_total: applicants.length,
      applicants_pending: applicants.filter((a) => a.status === 'pending').length,
      applicants_accepted: applicants.filter((a) => a.status === 'accepted').length,
      applications_by_stage: Object.entries(
        applications.reduce((acc: Record<string, number>, a: any) => {
          const stage = a.stage ?? 'submitted';
          acc[stage] = (acc[stage] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([stage, count]) => ({ stage, count })).sort((a: any, b: any) => b.count - a.count),
    };

    // Student attendance not tracked
    const studentAttendanceRate = null;

    // === HR / CHRO ===
    let employeesFull: any[] = [];
    let departments: any[] = [];
    let iqamaList: any[] = [];
    let attendanceRecords: any[] = [];
    if (needsCHRO || needsCEO || needsCFO || needsCOO) {
      const [employeesFullRes, departmentsRes, iqamaRes, attendanceRes] = await Promise.all([
        this.branchFilter(this.supabase.from('employees').select('id, status, nationality, gender, department_id, is_saudi, hire_date, end_date, contract_type').eq('tenant_id', tenantId), branchId),
        this.supabase.from('departments').select('id, name_en, name_ar').eq('tenant_id', tenantId),
        this.branchFilter(this.supabase.from('employees').select('id, iqama_expiry').eq('tenant_id', tenantId).eq('status', 'active').not('iqama_expiry', 'is', null), branchId),
        this.supabase.from('employee_attendance').select('employee_id, status, late_minutes, is_excused, date').eq('tenant_id', tenantId).gte('date', daysAgoStr(30)),
      ]);
      employeesFull = (employeesFullRes.data ?? []) as any[];
      departments = (departmentsRes.data ?? []) as any[];
      iqamaList = (iqamaRes.data ?? []) as any[];
      attendanceRecords = (attendanceRes.data ?? []) as any[];
    }
    const activeEmployees = employeesFull.filter((e: any) => e.status === 'active');

    if (!pack.regulatorReports?.calculateNitaqat) {
      throw new NotImplementedInJurisdiction(resolveJurisdiction(ctx), 'Nitaqat calculation');
    }
    const nitaqatData = await pack.regulatorReports.calculateNitaqat(this.supabase, tenantId, {
      branchId,
      employees: employeesFull,
      departments,
    }) as any;
    const {
      headcount,
      saudiCount,
      saudizationPct,
      nitaqatBand,
      nitaqat,
      workforce_composition: workforceComposition,
      saudi_vs_non_saudi: saudiVsNonSaudi,
    } = nitaqatData;

    // Retention: 12-mo rolling attrition
    const cutoff12mo = daysAgoStr(365);
    const activeNow = headcount;
    const separations = employeesFull.filter((e: any) => e.end_date && String(e.end_date) >= cutoff12mo && String(e.end_date) <= todayStr()).length;
    const avgHeadcount = Math.max(1, Math.round((activeNow + Math.max(0, activeNow - separations)) / 2));
    const attritionRate = round2((separations / avgHeadcount) * 100);
    const retentionRate = round2(100 - attritionRate);
    const retentionQuality = activeNow === 0 ? 'not_tracked' : 'real';

    // Contract expiry radar
    const now = new Date();
    const buckets30 = employeesFull.filter((e: any) => e.end_date && !Number.isNaN(new Date(e.end_date).getTime()) && new Date(e.end_date).getTime() <= now.getTime() + 30 * DAY_MS && new Date(e.end_date).getTime() >= now.getTime()).length;
    const buckets60 = employeesFull.filter((e: any) => e.end_date && new Date(e.end_date).getTime() > now.getTime() + 30 * DAY_MS && new Date(e.end_date).getTime() <= now.getTime() + 60 * DAY_MS).length;
    const buckets90 = employeesFull.filter((e: any) => e.end_date && new Date(e.end_date).getTime() > now.getTime() + 60 * DAY_MS && new Date(e.end_date).getTime() <= now.getTime() + 90 * DAY_MS).length;
    const contractExpiry = {
      '0_30': buckets30,
      '31_60': buckets60,
      '61_90': buckets90,
      data_quality: activeEmployees.some((e: any) => e.end_date) ? 'real' : 'not_tracked',
    };

    // Leave/absence summary from employee_attendance last 30 days
    const absentCount = attendanceRecords.filter((r: any) => r.status === 'absent' && !r.is_excused).length;
    const lateCount = attendanceRecords.filter((r: any) => r.status === 'late').length;
    const excusedCount = attendanceRecords.filter((r: any) => r.is_excused).length;
    const leaveAbsenceSummary = {
      absent: absentCount,
      late: lateCount,
      excused: excusedCount,
      data_quality: attendanceRecords.length > 0 ? 'real' : 'not_tracked',
    };

    // Compliance signals
    const cutoff30 = daysAgoStr(-30);
    const [overdueCountRes, zatcaRes] = await Promise.all([
      this.branchFilter(this.supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).neq('status', 'paid').lte('due_date', todayStr()).not('due_date', 'is', null), branchId),
      this.supabase.from('zatca_submissions').select('zatca_status, submitted_at').eq('tenant_id', tenantId).order('submitted_at', { ascending: false }).limit(1),
    ]);
    let payRun: any = null;
    try {
      const { data } = await this.supabase.from('pay_runs').select('status, created_at').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1);
      payRun = data?.[0] ?? null;
    } catch {
      payRun = null;
    }
    const overdueCount = (overdueCountRes as any).count ?? 0;
    const iqamaExpiringCount = (iqamaList ?? []).filter((e: any) => new Date(e.iqama_expiry).getTime() <= new Date(cutoff30).getTime()).length;
    const zatca = zatcaRes.data?.[0] ?? null;
    const zatcaColor = !zatca ? 'unknown' : ['cleared', 'reported'].includes(zatca.zatca_status) ? 'green' : ['pending', 'generated'].includes(zatca.zatca_status) ? 'yellow' : 'red';
    const payrollColor = !payRun ? 'unknown' : payRun.status === 'paid' ? 'green' : ['processed', 'approved'].includes(payRun.status) ? 'yellow' : 'red';
    const gosiColor = activeEmployees.length > 0 && activeEmployees.some((e: any) => e.is_saudi && e.is_gosi_applicable) ? 'yellow' : 'unknown';

    let complianceScore = 100;
    complianceScore -= Math.min(40, overdueCount * 2);
    complianceScore -= Math.min(30, iqamaExpiringCount * 3);
    if (zatcaColor === 'red') complianceScore -= 10;
    complianceScore = clamp(complianceScore);

    const complianceSignals = {
      zatca_vat: zatca
        ? { color: zatcaColor, status: zatca.zatca_status, submitted_at: zatca.submitted_at }
        : { color: 'unknown', status: 'not_tracked', message: 'No ZATCA submissions yet.' },
      wps_mudad: { color: payrollColor, status: payRun?.status ?? 'not_tracked', message: payRun ? 'Latest pay run status.' : 'No payroll run records found.' },
      gosi: gosiColor === 'unknown'
        ? { color: 'unknown', status: 'not_tracked', message: 'GOSI tracking not configured.' }
        : { color: gosiColor, status: 'pending', message: 'GOSI applicable for Saudi employees.' },
      qiwa: { color: 'unknown', status: 'not_tracked', message: 'No Qiwa contract-status table exists.' },
    };

    // Vitality Index
    const weights = await this.supabase.from('exec_vitality_weights').select('*').eq('tenant_id', tenantId).maybeSingle().then(r => ({
      financial: Number(r.data?.financial_weight ?? 25),
      growth: Number(r.data?.growth_weight ?? 20),
      collections: Number(r.data?.collections_weight ?? 20),
      compliance: Number(r.data?.compliance_weight ?? 20),
      retention: Number(r.data?.retention_weight ?? 15),
    }));
    const financialScore = clamp(Math.round(50 + (margin - 0.5) * 100)); // 0% margin -> 50, 50% -> 100
    const collectionScore = clamp(Math.round(collectionRate));
    const complianceSub = complianceScore;
    const retentionSub = retentionQuality === 'real' ? retentionRate : 50;
    const totalWeight = weights.financial + weights.growth + weights.collections + weights.compliance + weights.retention || 1;
    const vitalityScore = Math.round(
      (financialScore * weights.financial +
        growthData.score * weights.growth +
        collectionScore * weights.collections +
        complianceSub * weights.compliance +
        retentionSub * weights.retention) / totalWeight,
    );
    const subScores = {
      financial: financialScore,
      growth: growthData.score,
      collections: collectionScore,
      compliance: complianceSub,
      retention: retentionSub,
    };

    // Strategic alerts
    const strategicAlerts: any[] = [];
    if (overdueCount > 0) strategicAlerts.push({ severity: overdueCount > 10 ? 'high' : 'medium', category: 'collections', message_en: `${overdueCount} invoices are overdue.`, message_ar: `يوجد ${overdueCount} فاتورة متأخرة السداد.` });
    if (iqamaExpiringCount > 0) strategicAlerts.push({ severity: 'medium', category: 'compliance', message_en: `${iqamaExpiringCount} employee iqamas expire within 30 days.`, message_ar: `${iqamaExpiringCount} إقامة موظف ستنتهي خلال 30 يوماً.` });
    if (growthData.data_quality === 'real' && growthData.growth_rate < 0) strategicAlerts.push({ severity: 'high', category: 'growth', message_en: `Enrollment declined ${Math.abs(growthData.growth_rate)}% year-over-year.`, message_ar: `انخفض عدد الطلاب المسجلين ${Math.abs(growthData.growth_rate)}٪ على أساس سنوي.` });
    if (collectionRate < 80) strategicAlerts.push({ severity: 'medium', category: 'collections', message_en: `Collection rate is ${collectionRate}%, below the 80% target.`, message_ar: `نسبة التحصيل ${collectionRate}٪، أقل من الهدف 80٪.` });

    // Top risks (rule-based priority list)
    const riskCandidates = [
      { priority: collectionRate < 60 ? 1 : collectionRate < 80 ? 2 : 99, message_en: `Low collection rate (${collectionRate}%).`, message_ar: `نسبة تحصيل منخفضة (${collectionRate}٪).` },
      { priority: dso && dso > 90 ? 1 : dso && dso > 60 ? 2 : 99, message_en: `DSO is ${dso} days.`, message_ar: `متوسط أيام التحصيل ${dso} يوماً.` },
      { priority: overdueCount > 10 ? 1 : overdueCount > 0 ? 3 : 99, message_en: `${overdueCount} overdue invoices.`, message_ar: `${overdueCount} فاتورة متأخرة.` },
      { priority: capacityUtilization && capacityUtilization < 60 ? 2 : 99, message_en: `Low capacity utilization (${capacityUtilization}%).`, message_ar: `استغلال السعة منخفض (${capacityUtilization}٪).` },
      { priority: growthData.growth_rate !== null && growthData.growth_rate < 0 ? 1 : 99, message_en: `Enrollment declining ${growthData.growth_rate}%.`, message_ar: `عدد الطلاب ينخفض ${growthData.growth_rate}٪.` },
      { priority: headcount > 0 && nitaqatBand === 'red' ? 1 : headcount > 0 && nitaqatBand === 'yellow' ? 2 : 99, message_en: `Nitaqat band is ${nitaqatBand}.`, message_ar: `فئة نطاقات ${nitaqatBand}.` },
      { priority: iqamaExpiringCount > 0 ? 2 : 99, message_en: `${iqamaExpiringCount} iqamas expiring soon.`, message_ar: `${iqamaExpiringCount} إقامة ستنتهي قريباً.` },
    ].filter(r => r.priority < 99).sort((a, b) => a.priority - b.priority).slice(0, 5);

    // Cash runway (best-effort: cash collected 30d * 12 / monthly expenses)
    const monthlyExpenses = expTotal / 12 || expTotal;
    const cashRunway = monthlyExpenses > 0 ? round2((cashCollected30d * 12) / monthlyExpenses) : null;

    // Build snapshot payloads
    const computedAt = new Date().toISOString();
    const ceoData = {
      vitality: { score: vitalityScore, sub_scores: subScores },
      financials: { revenue, ebitda, margin: margin * 100, revenue_delta_pct: revenueDelta, ebitda_delta_pct: ebitdaDelta, expenses: expTotal },
      collections: { total_invoiced: totalInvoicedAll, total_collected: totalCollectedAll, collection_rate_pct: collectionRate, collection_rate_note: collectionRateNote, collection_delta_pct: collectionDelta },
      growth: growthData,
      compliance: { score: complianceScore, overdue_invoices: overdueCount, iqama_expiring_30d: iqamaExpiringCount, ...complianceSignals },
      campus_vitality: capacityToCash.map((c) => ({ ...c, score: clamp(Math.round(c.utilization_pct ?? 0)) })),
      revenue_trend: revenue_trend,
      collection_trend: collection_trend,
      strategic_alerts: strategicAlerts,
      top_risks: riskCandidates,
      cash_runway: cashRunway,
    };
    const cfoData = {
      kpis: { revenue, ebitda, margin_pct: margin * 100, cash_collected_30d: cashCollected30d, dso_days: dso },
      collection_rate_pct: collectionRate,
      ar_aging: arAging,
      overdue_by_campus: overdue_by_campus,
      revenue_vs_ebitda: revenue_trend.slice(-6),
      compliance_traffic_lights: { zatca_vat: complianceSignals.zatca_vat, wps_mudad: complianceSignals.wps_mudad, gosi: complianceSignals.gosi },
      revenue_by_fee_type: revenueByFeeType,
      collections_forecast: expectedCollections,
      vat_position: { output_vat_accrued: vatAccrued, next_filing_date: nextFilingDate, period_start: periodStart, period_end: periodEnd },
      budget_vs_actual: { data_quality: 'not_tracked', message: 'Budget ledger not configured.' },
      scenario_baseline: { revenue, expenses: expTotal, ebitda },
    };
    const cooData = {
      kpis: { capacity_utilization_pct: capacityUtilization, student_teacher_ratio: studentTeacherRatio, student_teacher_ratio_data_quality: teacherCount > 0 ? 'estimated' : 'not_tracked', student_attendance_rate_pct: studentAttendanceRate, student_attendance_data_quality: 'not_tracked' },
      capacity_to_cash: capacityToCash,
      admissions_funnel: funnel,
      utilization_by_campus: capacityToCash.map((c) => ({ branch_id: c.branch_id, name_en: c.name_en, name_ar: c.name_ar, utilization_pct: c.utilization_pct })),
      section_fill_rates: { data_quality: 'not_tracked', message: 'Student-section mapping not available in schema.' },
      staff_coverage_alerts: { data_quality: 'not_tracked', message: 'Open-position requisitions not configured.' },
      employee_attendance_summary: leaveAbsenceSummary,
    };
    const chroData = {
      kpis: { headcount, saudization_pct: saudizationPct, retention_rate_pct: retentionQuality === 'real' ? retentionRate : null, retention_data_quality: retentionQuality, open_roles_count: null },
      nitaqat,
      workforce_composition: workforceComposition,
      saudi_vs_non_saudi: saudiVsNonSaudi,
      payroll_gov_compliance: complianceSignals,
      contract_expiry_radar: contractExpiry,
      teacher_load_distribution: { data_quality: 'not_tracked', message: 'Teaching load data not available.' },
      leave_absence_summary: leaveAbsenceSummary,
      open_roles: { count: null, avg_time_to_fill_days: null, count_data_quality: 'not_tracked', time_to_fill_data_quality: 'not_tracked', message: 'Open-role requisitions not configured.' },
    };

    // Build metric snapshots (only for the requested persona when applicable)
    const metricValues: Record<string, MetricInput> = {};
    if (needsCEO) {
      metricValues['ceo.vitality.score'] = { value: vitalityScore, metadata: { sub_scores: subScores } };
      metricValues['ceo.financials.revenue'] = { value: revenue };
      metricValues['ceo.financials.ebitda'] = { value: ebitda };
      metricValues['ceo.financials.revenue_delta_pct'] = { value: revenueDelta };
      metricValues['ceo.financials.ebitda_delta_pct'] = { value: ebitdaDelta };
      metricValues['ceo.collections.collection_rate_pct'] = { value: collectionRate, numerator: totalCollectedAll, denominator: totalInvoicedAll };
      metricValues['ceo.collections.collection_delta_pct'] = { value: collectionDelta };
      metricValues['ceo.growth.growth_rate_pct'] = { value: growthData.growth_rate };
      metricValues['ceo.compliance.score'] = { value: complianceScore };
      metricValues['ceo.campus_vitality'] = { metadata: capacityToCash.map((c) => ({ ...c, score: clamp(Math.round(c.utilization_pct ?? 0)) })) };
      metricValues['ceo.revenue_trend'] = { metadata: revenue_trend };
      metricValues['ceo.collection_trend'] = { metadata: collection_trend };
      metricValues['ceo.strategic_alerts'] = { metadata: strategicAlerts };
      metricValues['ceo.top_risks'] = { metadata: riskCandidates };
      metricValues['ceo.cash_runway'] = { value: cashRunway };
    }
    if (needsCFO) {
      metricValues['cfo.kpis.revenue'] = { value: revenue };
      metricValues['cfo.kpis.ebitda'] = { value: ebitda };
      metricValues['cfo.kpis.margin_pct'] = { value: margin * 100 };
      metricValues['cfo.kpis.cash_collected_30d'] = { value: cashCollected30d };
      metricValues['cfo.kpis.dso_days'] = { value: dso };
      metricValues['cfo.ar_aging'] = { metadata: arAging };
      metricValues['cfo.overdue_by_campus'] = { metadata: overdue_by_campus };
      metricValues['cfo.revenue_vs_ebitda'] = { metadata: revenue_trend.slice(-6) };
      metricValues['cfo.compliance_traffic_lights'] = { metadata: { zatca_vat: complianceSignals.zatca_vat, wps_mudad: complianceSignals.wps_mudad, gosi: complianceSignals.gosi } };
      metricValues['cfo.revenue_by_fee_type'] = { metadata: revenueByFeeType };
      metricValues['cfo.collections_forecast'] = { metadata: expectedCollections };
      metricValues['cfo.vat_position'] = { metadata: { output_vat_accrued: vatAccrued, next_filing_date: nextFilingDate, period_start: periodStart, period_end: periodEnd } };
    }
    if (needsCOO) {
      metricValues['coo.kpis.capacity_utilization_pct'] = { value: capacityUtilization, numerator: totalEnrolled, denominator: totalCapacity };
      metricValues['coo.kpis.student_teacher_ratio'] = { value: studentTeacherRatio };
      metricValues['coo.capacity_to_cash'] = { metadata: capacityToCash };
      metricValues['coo.admissions_funnel'] = { metadata: funnel };
      metricValues['coo.utilization_by_campus'] = { metadata: capacityToCash.map((c) => ({ branch_id: c.branch_id, name_en: c.name_en, name_ar: c.name_ar, utilization_pct: c.utilization_pct })) };
    }
    if (needsCHRO) {
      metricValues['chro.kpis.headcount'] = { value: headcount };
      metricValues['chro.kpis.saudization_pct'] = { value: saudizationPct, numerator: saudiCount, denominator: headcount };
      metricValues['chro.kpis.retention_rate_pct'] = { value: retentionQuality === 'real' ? retentionRate : null, numerator: separations, denominator: avgHeadcount };
      metricValues['chro.nitaqat'] = { metadata: nitaqat };
      metricValues['chro.workforce_composition'] = { metadata: workforceComposition };
      metricValues['chro.saudi_vs_non_saudi'] = { metadata: saudiVsNonSaudi };
      metricValues['chro.payroll_gov_compliance'] = { metadata: complianceSignals };
      metricValues['chro.contract_expiry_radar'] = { metadata: contractExpiry };
      metricValues['chro.leave_absence_summary'] = { metadata: leaveAbsenceSummary };
      metricValues['chro.open_roles'] = { metadata: { count: null, avg_time_to_fill_days: null, count_data_quality: 'not_tracked', time_to_fill_data_quality: 'not_tracked', message: 'Open-role requisitions not configured.' } };
    }

    const snapshotRows = Object.entries(metricValues).map(([k, v]) => ({
      tenant_id: tenantId,
      branch_id: branchId ?? null,
      metric_key: k,
      period,
      value: v.value ?? null,
      numerator: v.numerator ?? null,
      denominator: v.denominator ?? null,
      metadata: v.metadata ?? {},
      computed_at: new Date().toISOString(),
    }));
    if (snapshotRows.length) {
      await this.supabase.from('kpi_snapshots').upsert(snapshotRows as any, { onConflict: 'tenant_id, branch_id, metric_key, period' });
    }
    // Also store assembled persona payloads for fast dashboard reads.
    const dashboardRows: any[] = [];
    if (needsCEO) dashboardRows.push({ tenant_id: tenantId, branch_id: branchId ?? null, metric_key: 'ceo.dashboard', period, metadata: ceoData, computed_at: new Date().toISOString() });
    if (needsCFO) dashboardRows.push({ tenant_id: tenantId, branch_id: branchId ?? null, metric_key: 'cfo.dashboard', period, metadata: cfoData, computed_at: new Date().toISOString() });
    if (needsCOO) dashboardRows.push({ tenant_id: tenantId, branch_id: branchId ?? null, metric_key: 'coo.dashboard', period, metadata: cooData, computed_at: new Date().toISOString() });
    if (needsCHRO) dashboardRows.push({ tenant_id: tenantId, branch_id: branchId ?? null, metric_key: 'chro.dashboard', period, metadata: chroData, computed_at: new Date().toISOString() });
    if (dashboardRows.length) {
      await this.supabase.from('kpi_snapshots').upsert(dashboardRows as any, { onConflict: 'tenant_id, branch_id, metric_key, period' });
    }

    return {
      ceo: ceoData,
      cfo: cfoData,
      coo: cooData,
      chro: chroData,
      computed_at: computedAt,
      period,
    };
  }

  async getDashboard(persona: 'ceo' | 'cfo' | 'coo' | 'chro', tenantId: string, period = 'current', branchId?: string, force = false): Promise<any> {
    if (!force) {
      const cached = await this.loadDashboardSnapshot(persona, tenantId, period, branchId);
      if (cached) return cached;
    }
    const all = await this.computeAndStoreAll(tenantId, period, branchId, persona);
    return { ...all[persona], computed_at: all.computed_at, period: all.period };
  }

  async refresh(tenantId: string, period = 'current', branchId?: string): Promise<{ status: string; metrics_count: number }> {
    await this.computeAndStoreAll(tenantId, period, branchId);
    const count = await this.supabase.from('kpi_snapshots').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('period', period).is('branch_id', branchId ? branchId : null).then((r: any) => r.count ?? 0);
    return { status: 'completed', metrics_count: count };
  }
}
