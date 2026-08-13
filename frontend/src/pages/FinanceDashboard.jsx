/**
 * FinanceDashboard — AC#8: CFO real-time KPIs without asking Finance team
 * AC#9: Anomaly detection flagging duplicate payments / unusual transactions
 */
import React, { useMemo, useRef } from 'react';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { tenantQuery, fetchData, normalizeJournalEntries } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { formatCurrency } from '../lib/localization';
import { useBranch } from '../components/BranchContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import ChartState from '../components/ui/ChartState';
import ExportMenu from '../components/ui/ExportMenu';
import { useIsMobile } from '../hooks/use-mobile';
import { format, startOfYear } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Users,
  Building2, CreditCard, BarChart3, Wallet, AlertCircle, CheckCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

const PCT = (v) => `${(v || 0).toFixed(1)}%`;

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function KPICard({ title, value, subtitle, trend, trendLabel, icon: KPIIcon, iconBg, alert, to }) {
  const Icon = KPIIcon;
  const inner = (
    <Card className={`hover:shadow-md transition-shadow ${alert ? 'border-red-300 bg-red-50/30' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground font-medium">{title}</p>
            <p className={`text-2xl font-bold mt-1 ${alert ? 'text-red-600' : 'text-ink'}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {trendLabel}
              </div>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg || 'bg-sand-alt'}`}>
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function FinanceDashboard() {
  const { isRTL } = useLanguage();
  const { tenant, isModuleEnabled } = useTenant();
  const fmt = (v) => formatCurrency(v, tenant?.localization, isRTL);
  const { branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const dashboardRef = useRef(null);
  const isMobile = useIsMobile();
  const ytdStart = format(startOfYear(new Date()), 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: journalEntries = [], isLoading: jeLoading, isError: jeError, refetch: refetchJe } = useTenantQuery(
    ['je-dashboard', tenantId],
    async () => {
      const data = await fetchData(tenantQuery('journal_entries')
        .select('*, journal_entry_lines(*, chart_of_accounts(code, type, name_ar, name_en))')
        .match(tenantFilter(branchFilter({ status: 'posted' }))));
      return normalizeJournalEntries(data);
    },
    { enabled: hasTenantAccess }
  );

  const { data: invoices = [], isLoading: invLoading, isError: invError, refetch: refetchInv } = useTenantQuery(
    ['invoices-dashboard', tenantId],
    () => fetchData(tenantQuery('invoices').select('*').match(tenantFilter(branchFilter()))),
    { enabled: hasTenantAccess }
  );

  const { data: payments = [], isLoading: payLoading, isError: payError, refetch: refetchPay } = useTenantQuery(
    ['payments-dashboard', tenantId],
    () => fetchData(tenantQuery('payments').select('*').match(tenantFilter(branchFilter()))),
    { enabled: hasTenantAccess }
  );

  // Aggregate signals for the analytics charts so a silently-failed query shows
  // an error/retry state instead of a misleading all-zero chart.
  const chartsLoading = jeLoading || invLoading || payLoading;
  const chartsError = jeError || invError || payError;
  const refetchCharts = () => { refetchJe(); refetchInv(); refetchPay(); };

  const { data: apBills = [] } = useTenantQuery(
    ['apbills-dashboard', tenantId],
    () => fetchData(tenantQuery('ap_bills').select('*').match(tenantFilter(branchFilter()))),
    { enabled: hasTenantAccess && isModuleEnabled('reconciliation') }
  );

  const { data: _accounts = [] } = useTenantQuery(
    ['coa-dashboard', tenantId],
    () => fetchData(tenantQuery('chart_of_accounts').select('*').match(tenantFilter({ is_active: true }))),
    { enabled: hasTenantAccess }
  );

  const { data: students = [] } = useTenantQuery(
    ['students-dashboard', tenantId],
    () => fetchData(tenantQuery('students').select('*').match(tenantFilter({ status: 'active' }))),
    { enabled: hasTenantAccess }
  );

  // ── KPIs ────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const ytdInvoices = invoices.filter(i => i.issue_date >= ytdStart);
    const ytdRevenue = ytdInvoices.reduce((s, i) => s + (i.net_amount || i.total_amount || 0), 0);
    const ytdCollected = payments.filter(p => p.payment_date >= ytdStart).reduce((s, p) => s + (p.amount || 0), 0);
    const collectionRate = ytdRevenue > 0 ? (ytdCollected / ytdRevenue) * 100 : 0;

    // AR outstanding
    const unpaidInvoices = invoices.filter(i => i.status === 'unpaid' || i.status === 'partial');
    const totalAR = unpaidInvoices.reduce((s, i) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0);
    const overdueAR = unpaidInvoices.filter(i => i.due_date < today).reduce((s, i) => s + ((i.total_amount || 0) - (i.amount_paid || 0)), 0);

    // AP outstanding
    const unpaidBills = apBills.filter(b => b.status !== 'paid');
    const totalAP = unpaidBills.reduce((s, b) => s + ((b.total_amount || 0) - (b.amount_paid || 0)), 0);
    const apDueThisWeek = unpaidBills.filter(b => {
      const due = b.due_date;
      const week = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
      return due && due <= week && due >= today;
    }).reduce((s, b) => s + ((b.total_amount || 0) - (b.amount_paid || 0)), 0);

    // Salary % of revenue (from JEs on salary accounts - approx)
    const salaryJEs = journalEntries.filter(j => j.date >= ytdStart);
    const salaryExpense = salaryJEs.flatMap(j => j.lines || [])
      .filter(l => l.account_code?.startsWith('5') || l.account_code?.startsWith('601') || l.account_code?.startsWith('602'))
      .reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const salaryPct = ytdRevenue > 0 ? (salaryExpense / ytdRevenue) * 100 : 0;

    // Cost per student
    const totalExpenseJEs = journalEntries.filter(j => j.date >= ytdStart);
    const totalExpenses = totalExpenseJEs.flatMap(j => j.lines || [])
      .filter(l => {
        const code = parseInt(l.account_code);
        return code >= 5000 && code <= 6999;
      })
      .reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const studentCount = students.length || 1;
    const costPerStudent = totalExpenses / studentCount;

    return {
      ytdRevenue, ytdCollected, collectionRate,
      totalAR, overdueAR,
      totalAP, apDueThisWeek,
      salaryPct, costPerStudent, studentCount,
      totalExpenses,
      grossProfit: ytdRevenue - totalExpenses,
      netMargin: ytdRevenue > 0 ? ((ytdRevenue - totalExpenses) / ytdRevenue) * 100 : 0,
    };
  }, [invoices, payments, apBills, journalEntries, students, ytdStart, today]);

  // ── Monthly revenue chart ──────────────────────────────
  const monthlyData = useMemo(() => {
    const months = {};
    invoices.forEach(inv => {
      if (!inv.issue_date) return;
      const m = inv.issue_date.substring(0, 7);
      if (!months[m]) months[m] = { month: m, revenue: 0, collected: 0 };
      months[m].revenue += (inv.net_amount || inv.total_amount || 0);
    });
    payments.forEach(p => {
      if (!p.payment_date) return;
      const m = p.payment_date.substring(0, 7);
      if (!months[m]) months[m] = { month: m, revenue: 0, collected: 0 };
      months[m].collected += (p.amount || 0);
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [invoices, payments]);

  // ── Revenue breakdown pie ──────────────────────────────
  const revenuePie = useMemo(() => {
    const types = {};
    invoices.filter(i => i.issue_date >= ytdStart).forEach(inv => {
      const type = inv.fee_type || 'Tuition';
      types[type] = (types[type] || 0) + (inv.net_amount || inv.total_amount || 0);
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [invoices, ytdStart]);

  // ── AR Aging ──────────────────────────────────────────
  const arAging = useMemo(() => {
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    const unpaid = invoices.filter(i => i.status === 'unpaid' || i.status === 'partial');
    unpaid.forEach(inv => {
      const outstanding = (inv.total_amount || 0) - (inv.amount_paid || 0);
      if (!inv.due_date) { buckets.current += outstanding; return; }
      const days = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
      if (days <= 0) buckets.current += outstanding;
      else if (days <= 30) buckets.d1_30 += outstanding;
      else if (days <= 60) buckets.d31_60 += outstanding;
      else if (days <= 90) buckets.d61_90 += outstanding;
      else buckets.d90plus += outstanding;
    });
    return [
      { name: isRTL ? 'جاري' : 'Current', value: buckets.current, color: '#10b981' },
      { name: isRTL ? '1-30 يوم' : '1-30 Days', value: buckets.d1_30, color: '#f59e0b' },
      { name: isRTL ? '31-60 يوم' : '31-60 Days', value: buckets.d31_60, color: '#f97316' },
      { name: isRTL ? '61-90 يوم' : '61-90 Days', value: buckets.d61_90, color: '#ef4444' },
      { name: isRTL ? '+90 يوم' : '90+ Days', value: buckets.d90plus, color: '#7f1d1d' },
    ];
  }, [invoices, isRTL]);

  // ── AC#9: Anomaly detection ───────────────────────────
  const anomalies = useMemo(() => {
    const flags = [];
    // Duplicate payment detection: same vendor + same amount within 30 days
    const pMap = {};
    payments.forEach(p => {
      const key = `${p.student_id || p.vendor_id}-${p.amount}`;
      if (!pMap[key]) pMap[key] = [];
      pMap[key].push(p);
    });
    Object.entries(pMap).forEach(([_key, pList]) => {
      if (pList.length >= 2) {
        const sorted = pList.sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date));
        const daysDiff = Math.abs((new Date(sorted[0].payment_date) - new Date(sorted[1].payment_date)) / 86400000);
        if (daysDiff <= 30) {
          flags.push({
            type: 'duplicate',
            severity: 'high',
            message: isRTL
              ? `دفعة مكررة محتملة: ${sorted[0].student_name || 'غير معروف'} — ${formatCurrency(sorted[0].amount, tenant?.localization, isRTL)}`
              : `Possible duplicate payment: ${sorted[0].student_name || 'Unknown'} — ${formatCurrency(sorted[0].amount, tenant?.localization, isRTL)}`,
          });
        }
      }
    });
    // High-value unposted journals
    journalEntries.filter(j => j.status === 'draft' && (j.total_debit || 0) > 50000).forEach(j => {
      flags.push({
        type: 'approval',
        severity: 'medium',
        message: isRTL
          ? `قيد بمبلغ ${formatCurrency(j.total_debit, tenant?.localization, isRTL)} بانتظار الاعتماد`
          : `Journal ${formatCurrency(j.total_debit, tenant?.localization, isRTL)} pending approval`,
      });
    });
    // Salary cost alert
    if (kpis.salaryPct > 55) {
      flags.push({
        type: 'kpi',
        severity: 'high',
        message: isRTL
          ? `تكلفة الرواتب ${kpis.salaryPct.toFixed(1)}% من الإيرادات (الهدف: أقل من 55%)`
          : `Salary cost ${kpis.salaryPct.toFixed(1)}% of revenue (target: <55%)`,
      });
    }
    return flags;
  }, [payments, journalEntries, kpis, isRTL]);

  const fmtM = (m) => m?.slice(5, 7) + '/' + m?.slice(0, 4);

  return (
    <div className="space-y-5" ref={dashboardRef}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink">{isRTL ? 'لوحة تحكم المالية' : 'Finance Dashboard'}</h1>
          <p className="text-sm text-muted-foreground">{isRTL ? 'مؤشرات مالية لحظية — لا حاجة لطلب تقرير' : 'Real-time financial KPIs — no report requests needed'}</p>
        </div>
        <ExportMenu targetRef={dashboardRef} filename="finance-dashboard" className="flex-shrink-0" />
      </div>

      {/* Anomaly alerts */}
      {anomalies.length > 0 && (
        <div className="space-y-2">
          {anomalies.map((a, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
              a.severity === 'high' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {a.message}
            </div>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KPICard title={isRTL ? 'الإيرادات (سنوي)' : 'Revenue YTD'} value={fmt(kpis.ytdRevenue)} subtitle={isRTL ? 'منذ بداية السنة' : 'Since year start'} icon={TrendingUp} iconBg="bg-emerald-50" to="/Fees" />
        <KPICard title={isRTL ? 'إجمالي المصروفات' : 'Expenses YTD'} value={fmt(kpis.totalExpenses)} icon={TrendingDown} iconBg="bg-red-50" to="/JournalEntries" />
        <KPICard title={isRTL ? 'صافي الربح' : 'Net Profit'} value={fmt(kpis.grossProfit)} subtitle={PCT(kpis.netMargin) + (isRTL ? ' هامش' : ' margin')} icon={DollarSign} iconBg="bg-najdi-50" />
        <KPICard title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'} value={PCT(kpis.collectionRate)} subtitle={fmt(kpis.ytdCollected) + (isRTL ? ' محصّل' : ' collected')} icon={CreditCard} iconBg="bg-purple-50" to="/Collections" />
        <KPICard title={isRTL ? 'ذمم مدينة' : 'AR Outstanding'} value={fmt(kpis.totalAR)} subtitle={isRTL ? `${fmt(kpis.overdueAR)} متأخر` : `${fmt(kpis.overdueAR)} overdue`} alert={kpis.overdueAR > 50000} icon={AlertCircle} iconBg="bg-amber-50" to="/Fees" />
        <KPICard title={isRTL ? 'ذمم دائنة' : 'AP Outstanding'} value={fmt(kpis.totalAP)} subtitle={isRTL ? `${fmt(kpis.apDueThisWeek)} هذا الأسبوع` : `${fmt(kpis.apDueThisWeek)} due this week`} icon={Wallet} iconBg="bg-orange-50" to="/APBills" />
        <KPICard title={isRTL ? 'الرواتب % من الإيرادات' : 'Salary % Revenue'} value={PCT(kpis.salaryPct)} subtitle={isRTL ? 'الهدف: أقل من 55%' : 'Target: <55%'} alert={kpis.salaryPct > 55} icon={Users} iconBg="bg-indigo-50" />
        <KPICard title={isRTL ? 'تكلفة الطالب' : 'Cost per Student'} value={fmt(kpis.costPerStudent)} subtitle={`${kpis.studentCount} ${isRTL ? 'طالب' : 'students'}`} icon={BarChart3} iconBg="bg-teal-50" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue vs Collections bar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isRTL ? 'الإيرادات مقابل التحصيل (شهري)' : 'Revenue vs Collections (Monthly)'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartState loading={chartsLoading} error={chartsError} isEmpty={!monthlyData.length} height={220} onRetry={refetchCharts}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tickFormatter={fmtM} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => (v/1000).toFixed(0) + 'K'} />
                  <Tooltip formatter={(v) => fmt(v)} labelFormatter={fmtM} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name={isRTL ? 'الإيرادات' : 'Revenue'} fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="collected" name={isRTL ? 'المحصّل' : 'Collected'} fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartState>
          </CardContent>
        </Card>

        {/* Revenue pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isRTL ? 'توزيع الإيرادات' : 'Revenue Breakdown'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartState loading={chartsLoading} error={chartsError} isEmpty={!revenuePie.length} height={220} onRetry={refetchCharts}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={revenuePie}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 45 : 55}
                    outerRadius={isMobile ? 70 : 85}
                    dataKey="value"
                    labelLine={false}
                    fontSize={10}
                    /* On phones, category names overflow the slice labels, so
                       show just the percentage and move names to the legend. */
                    label={isMobile
                      ? ({ percent }) => `${(percent * 100).toFixed(0)}%`
                      : ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {revenuePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                  {isMobile && <Legend wrapperStyle={{ fontSize: 11 }} />}
                </PieChart>
              </ResponsiveContainer>
            </ChartState>
          </CardContent>
        </Card>
      </div>

      {/* AR Aging */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{isRTL ? 'تحليل أعمار الذمم المدينة' : 'AR Aging Analysis'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {arAging.map(bucket => (
              <div key={bucket.name} className="text-center p-3 rounded-xl border bg-sand">
                <p className="text-xs text-muted-foreground mb-1">{bucket.name}</p>
                <p className="font-bold text-sm" style={{ color: bucket.color }}>{fmt(bucket.value)}</p>
                {kpis.totalAR > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">{((bucket.value / kpis.totalAR) * 100).toFixed(0)}%</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/GeneralLedger', icon: BarChart3, label: isRTL ? 'دفتر الأستاذ' : 'General Ledger' },
          { to: '/JournalEntries', icon: DollarSign, label: isRTL ? 'القيود اليومية' : 'Journal Entries' },
          { to: '/VATManagement', icon: Building2, label: isRTL ? 'إدارة الضريبة' : 'VAT Management' },
          { to: '/FiscalPeriods', icon: CheckCircle, label: isRTL ? 'الفترات المالية' : 'Fiscal Periods' },
        ].map(link => (
          <Link key={link.to} to={link.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <link.icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium text-ink">{link.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}