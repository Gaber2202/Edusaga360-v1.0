import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Button } from '../components/ui/button';
import StatCard from '../components/ui/StatCard';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  Crown, RefreshCw, TrendingUp, DollarSign, Users, Building2,
  AlertTriangle, ShieldCheck, ShieldAlert, ShieldX, Sparkles, Clock
} from 'lucide-react';

const COLORS = { blue: '#3B82F6', green: '#10B981', amber: '#F59E0B', red: '#EF4444', purple: '#8B5CF6', slate: '#64748B' };
const PIE_COLORS = [COLORS.blue, COLORS.green, COLORS.amber, COLORS.red, COLORS.purple];

function fmtNumber(n, isRTL) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US').format(n);
}

function fmtSAR(n, isRTL) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

function ScoreBar({ label, value }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-800">{fmtPct(value)}</span>
      </div>
      <Progress value={value || 0} className="h-1.5" />
    </div>
  );
}

function TrafficLight({ label, status }) {
  const cfg = {
    green: { Icon: ShieldCheck, cls: 'text-emerald-600 bg-emerald-50' },
    yellow: { Icon: ShieldAlert, cls: 'text-amber-600 bg-amber-50' },
    red: { Icon: ShieldX, cls: 'text-red-600 bg-red-50' },
    unknown: { Icon: ShieldAlert, cls: 'text-slate-400 bg-slate-50' },
  }[status || 'unknown'];
  const { Icon, cls } = cfg;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-100">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </div>
  );
}

function EmptyState({ isRTL, message }) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-400">
      {message || (isRTL ? 'لا توجد بيانات متاحة' : 'No data available')}
    </div>
  );
}

function DataQualityNote({ quality, isRTL }) {
  if (!quality || quality === 'measured') return null;
  const label = quality === 'estimated'
    ? (isRTL ? 'بيانات تقديرية' : 'Estimated')
    : (isRTL ? 'غير متتبع' : 'Not tracked');
  return <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">{label}</Badge>;
}

export default function ExecutiveCommandCenter() {
  const { t, isRTL } = useLanguage();

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [persona, setPersona] = useState(null);

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);

  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefRefreshing, setBriefRefreshing] = useState(false);

  const loadAccess = useCallback(async () => {
    setAccessLoading(true);
    try {
      const res = await callApi('/api/exec/access', null, { method: 'GET' });
      setAccess(res);
      const available = res.isAdmin ? ['ceo', 'cfo', 'coo', 'chro'] : (res.personas || []);
      if (available.length > 0) setPersona(available[0]);
    } catch {
      toast.error(isRTL ? 'فشل تحميل صلاحيات الوصول' : 'Failed to load access permissions');
      setAccess({ isAdmin: false, personas: [] });
    } finally {
      setAccessLoading(false);
    }
  }, [isRTL]);

  useEffect(() => { loadAccess(); }, [loadAccess]);

  const loadDashboard = useCallback(async (p) => {
    if (!p) return;
    setDashboardLoading(true);
    setDashboardError(false);
    try {
      const res = await callApi(`/api/exec/${p}`, null, { method: 'GET' });
      setDashboard(res);
    } catch (err) {
      setDashboardError(true);
      setDashboard(null);
      if (err?.status === 403) {
        toast.error(isRTL ? 'ليس لديك صلاحية الوصول لهذا القسم' : 'You do not have access to this dashboard');
      } else {
        toast.error(isRTL ? 'فشل تحميل البيانات' : 'Failed to load dashboard data');
      }
    } finally {
      setDashboardLoading(false);
    }
  }, [isRTL]);

  useEffect(() => { if (persona) loadDashboard(persona); }, [persona, loadDashboard]);

  const loadBrief = useCallback(async () => {
    setBriefLoading(true);
    try {
      const res = await callApi('/api/exec/ceo/brief', null, { method: 'GET' });
      setBrief(res);
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, []);

  useEffect(() => { if (persona === 'ceo') loadBrief(); }, [persona, loadBrief]);

  const refreshBrief = async () => {
    setBriefRefreshing(true);
    try {
      const res = await callApi('/api/exec/ceo/brief/refresh', {}, { method: 'POST' });
      setBrief(res);
      toast.success(isRTL ? 'تم تحديث الموجز' : 'Brief refreshed');
    } catch {
      toast.error(isRTL ? 'فشل تحديث الموجز' : 'Failed to refresh brief');
    } finally {
      setBriefRefreshing(false);
    }
  };

  const availablePersonas = access?.isAdmin ? ['ceo', 'cfo', 'coo', 'chro'] : (access?.personas || []);
  const showSwitcher = access?.isAdmin || availablePersonas.length > 1;

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!accessLoading && availablePersonas.length === 0) {
    return (
      <div dir={isRTL ? 'rtl' : 'ltr'} className="p-6">
        <EmptyState isRTL={isRTL} message={t('noExecAccess')} />
      </div>
    );
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{t('executiveCommandCenter')}</h1>
            <p className="text-sm text-slate-500">{t('executive')}</p>
          </div>
        </div>

        {showSwitcher && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{t('switchPersona')}</span>
            <Select value={persona || undefined} onValueChange={setPersona}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePersonas.map((p) => (
                  <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {dashboardLoading && (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      )}

      {!dashboardLoading && dashboardError && (
        <EmptyState isRTL={isRTL} message={isRTL ? 'تعذر تحميل لوحة البيانات' : 'Could not load this dashboard'} />
      )}

      {!dashboardLoading && !dashboardError && dashboard && persona === 'ceo' && (
        <CEODashboard data={dashboard} brief={brief} briefLoading={briefLoading} briefRefreshing={briefRefreshing} onRefreshBrief={refreshBrief} isRTL={isRTL} t={t} />
      )}
      {!dashboardLoading && !dashboardError && dashboard && persona === 'cfo' && (
        <CFODashboard data={dashboard} isRTL={isRTL} t={t} />
      )}
      {!dashboardLoading && !dashboardError && dashboard && persona === 'coo' && (
        <COODashboard data={dashboard} isRTL={isRTL} t={t} />
      )}
      {!dashboardLoading && !dashboardError && dashboard && persona === 'chro' && (
        <CHRODashboard data={dashboard} isRTL={isRTL} t={t} />
      )}
    </div>
  );
}

function CEODashboard({ data, brief, briefLoading, briefRefreshing, onRefreshBrief, isRTL, t }) {
  const { vitality, financials, collections, campus_vitality = [], strategic_alerts = [] } = data;

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-gradient-to-br from-slate-900 to-slate-700 text-white">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-shrink-0 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-300 mb-1">{t('groupVitalityIndex')}</p>
              <p className="text-5xl font-bold">{vitality?.score ?? '—'}</p>
              <p className="text-xs text-slate-300 mt-1">/100</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
              {[
                ['financialScore', vitality?.sub_scores?.financial],
                ['growthScore', vitality?.sub_scores?.growth],
                ['collectionsScore', vitality?.sub_scores?.collections],
                ['complianceScore', vitality?.sub_scores?.compliance],
                ['retentionScore', vitality?.sub_scores?.retention],
              ].map(([key, val]) => (
                <div key={key} className="bg-white/10 rounded-lg p-3">
                  <p className="text-[11px] text-slate-300 mb-1">{t(key)}</p>
                  <p className="text-lg font-semibold">{val ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {t('boardBrief')}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onRefreshBrief} disabled={briefRefreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${briefRefreshing ? 'animate-spin' : ''}`} />
            {t('refreshBrief')}
          </Button>
        </CardHeader>
        <CardContent>
          {briefLoading ? (
            <div className="flex items-center justify-center h-24"><RefreshCw className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : brief ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                {isRTL ? brief.narrative_ar : brief.narrative_en}
              </p>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">{t('recommendedActions')}</p>
                <ul className="space-y-1.5">
                  {(isRTL ? brief.actions_ar : brief.actions_en)?.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700">
                      <span className="text-purple-500 font-semibold">{i + 1}.</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <EmptyState isRTL={isRTL} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={t('revenue')} value={fmtSAR(financials?.revenue, isRTL)} icon={DollarSign} iconClassName="bg-blue-50" />
        <StatCard title={t('ebitda')} value={fmtSAR(financials?.ebitda, isRTL)} icon={TrendingUp} iconClassName="bg-emerald-50" />
        <StatCard title={t('collectionRate')} value={fmtPct(collections?.collection_rate_pct)} icon={ShieldCheck} iconClassName="bg-purple-50" />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('campusVitality')}</CardTitle></CardHeader>
        <CardContent>
          {campus_vitality.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 font-medium">{isRTL ? 'الفرع' : 'Campus'}</th>
                    <th className="py-2 font-medium">{t('collectionRate')}</th>
                    <th className="py-2 font-medium">{isRTL ? 'النتيجة' : 'Score'}</th>
                  </tr>
                </thead>
                <tbody>
                  {campus_vitality.map((c) => (
                    <tr key={c.branch_id} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700">{isRTL ? c.name_ar : c.name_en}</td>
                      <td className="py-2 text-slate-700">{fmtPct(c.collection_rate)}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={c.score >= 70 ? 'text-emerald-600 border-emerald-200' : c.score >= 40 ? 'text-amber-600 border-amber-200' : 'text-red-600 border-red-200'}>
                          {c.score}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />{t('strategicAlerts')}</CardTitle></CardHeader>
        <CardContent>
          {strategic_alerts.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <ul className="space-y-2">
              {strategic_alerts.map((a, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100">
                  <Badge variant="outline" className={
                    a.severity === 'high' ? 'text-red-600 border-red-200' :
                    a.severity === 'medium' ? 'text-amber-600 border-amber-200' : 'text-slate-500 border-slate-200'
                  }>
                    {a.category}
                  </Badge>
                  <span className="text-sm text-slate-700">{isRTL ? a.message_ar : a.message_en}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CFODashboard({ data, isRTL, t }) {
  const { kpis = {}, ar_aging = {}, overdue_by_campus = [], revenue_vs_ebitda = [], compliance_traffic_lights = {}, scenario_baseline = {} } = data;

  const [growthRate, setGrowthRate] = useState(0);
  const [expenseRate, setExpenseRate] = useState(0);
  const simRevenue = (scenario_baseline.revenue || 0) * (1 + growthRate / 100);
  const simExpenses = (scenario_baseline.expenses || 0) * (1 + expenseRate / 100);
  const simEbitda = simRevenue - simExpenses;

  const agingData = [
    { label: '0-30', value: ar_aging['0_30'] || 0 },
    { label: '31-60', value: ar_aging['31_60'] || 0 },
    { label: '61-90', value: ar_aging['61_90'] || 0 },
    { label: '90+', value: ar_aging['90_plus'] || 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title={t('revenue')} value={fmtSAR(kpis.revenue, isRTL)} icon={DollarSign} iconClassName="bg-blue-50" />
        <StatCard title={t('ebitda')} value={fmtSAR(kpis.ebitda, isRTL)} subtitle={fmtPct(kpis.margin_pct)} icon={TrendingUp} iconClassName="bg-emerald-50" />
        <StatCard title={t('cashCollected')} value={fmtSAR(kpis.cash_collected_30d, isRTL)} icon={ShieldCheck} iconClassName="bg-purple-50" />
        <StatCard title={t('dsoDays')} value={fmtNumber(kpis.dso_days, isRTL)} icon={Clock} iconClassName="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{t('arAging')}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="value" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{t('revenueVsEbitda')}</CardTitle></CardHeader>
          <CardContent>
            {revenue_vs_ebitda.length === 0 ? <EmptyState isRTL={isRTL} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenue_vs_ebitda}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke={COLORS.blue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ebitda" stroke={COLORS.green} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('complianceTrafficLights')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TrafficLight label="ZATCA / VAT" status={compliance_traffic_lights.zatca_vat} isRTL={isRTL} />
            <TrafficLight label="WPS / Mudad" status={compliance_traffic_lights.wps_mudad} isRTL={isRTL} />
            <TrafficLight label="GOSI" status={compliance_traffic_lights.gosi} isRTL={isRTL} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('overdueByCampus')}</CardTitle></CardHeader>
        <CardContent>
          {overdue_by_campus.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 font-medium">{isRTL ? 'الفرع' : 'Campus'}</th>
                    <th className="py-2 font-medium">{isRTL ? 'المبلغ المتأخر' : 'Overdue Amount'}</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue_by_campus.map((c) => (
                    <tr key={c.branch_id} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700">{isRTL ? c.name_ar : c.name_en}</td>
                      <td className="py-2 text-slate-700">{fmtSAR(c.overdue_amount, isRTL)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('scenarioSimulator')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">{isRTL ? 'نمو الإيراد' : 'Revenue growth'}</span>
                <span className="font-medium">{growthRate}%</span>
              </div>
              <input type="range" min={-20} max={20} value={growthRate} onChange={(e) => setGrowthRate(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">{isRTL ? 'تغير المصروفات' : 'Expense change'}</span>
                <span className="font-medium">{expenseRate}%</span>
              </div>
              <input type="range" min={-20} max={20} value={expenseRate} onChange={(e) => setExpenseRate(Number(e.target.value))} className="w-full" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center"><p className="text-xs text-slate-500">{t('revenue')}</p><p className="font-semibold">{fmtSAR(simRevenue, isRTL)}</p></div>
            <div className="text-center"><p className="text-xs text-slate-500">{isRTL ? 'المصروفات' : 'Expenses'}</p><p className="font-semibold">{fmtSAR(simExpenses, isRTL)}</p></div>
            <div className="text-center"><p className="text-xs text-slate-500">{t('ebitda')}</p><p className="font-semibold">{fmtSAR(simEbitda, isRTL)}</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function COODashboard({ data, isRTL, t }) {
  const { kpis = {}, capacity_to_cash = [], admissions_funnel = {}, utilization_by_campus = [] } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={t('capacityUtilization')} value={fmtPct(kpis.capacity_utilization_pct)} icon={Building2} iconClassName="bg-blue-50" />
        <StatCard
          title={t('studentTeacherRatio')}
          value={kpis.student_teacher_ratio ?? '—'}
          subtitle={<DataQualityNote quality={kpis.student_teacher_ratio_data_quality} isRTL={isRTL} />}
          icon={Users}
          iconClassName="bg-emerald-50"
        />
        <StatCard
          title={isRTL ? 'معدل حضور الطلاب' : 'Student Attendance'}
          value={kpis.student_attendance_rate_pct !== null ? fmtPct(kpis.student_attendance_rate_pct) : '—'}
          subtitle={<DataQualityNote quality={kpis.student_attendance_data_quality} isRTL={isRTL} />}
          icon={ShieldCheck}
          iconClassName="bg-purple-50"
        />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('capacityToCash')}</CardTitle></CardHeader>
        <CardContent>
          {capacity_to_cash.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="py-2 font-medium">{isRTL ? 'الفرع' : 'Campus'}</th>
                    <th className="py-2 font-medium">{isRTL ? 'السعة' : 'Capacity'}</th>
                    <th className="py-2 font-medium">{isRTL ? 'المسجلون' : 'Enrolled'}</th>
                    <th className="py-2 font-medium">{t('capacityUtilization')}</th>
                    <th className="py-2 font-medium">{t('cashCollected')}</th>
                  </tr>
                </thead>
                <tbody>
                  {capacity_to_cash.map((c) => (
                    <tr key={c.branch_id} className="border-b border-slate-50">
                      <td className="py-2 text-slate-700">{isRTL ? c.name_ar : c.name_en}</td>
                      <td className="py-2 text-slate-700">{fmtNumber(c.capacity, isRTL)}</td>
                      <td className="py-2 text-slate-700">{fmtNumber(c.enrolled, isRTL)}</td>
                      <td className="py-2 text-slate-700">{fmtPct(c.utilization_pct)}</td>
                      <td className="py-2 text-slate-700">{fmtSAR(c.cash_collected, isRTL)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{t('admissionsFunnel')}</CardTitle></CardHeader>
          <CardContent>
            {!admissions_funnel.applications_by_stage?.length ? <EmptyState isRTL={isRTL} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={admissions_funnel.applications_by_stage} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={12} />
                  <YAxis dataKey="stage" type="category" fontSize={12} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS.purple} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{t('utilizationByCampus')}</CardTitle></CardHeader>
          <CardContent>
            {utilization_by_campus.length === 0 ? <EmptyState isRTL={isRTL} /> : (
              <div className="space-y-3">
                {utilization_by_campus.map((c) => (
                  <ScoreBar key={c.branch_id} label={isRTL ? c.name_ar : c.name_en} value={c.utilization_pct} isRTL={isRTL} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CHRODashboard({ data, isRTL, t }) {
  const { kpis = {}, nitaqat = {}, workforce_composition = {}, payroll_gov_compliance = {}, open_roles = {} } = data;

  const bandColor = { platinum: 'text-purple-600 border-purple-200', green: 'text-emerald-600 border-emerald-200', yellow: 'text-amber-600 border-amber-200', red: 'text-red-600 border-red-200' }[nitaqat.band] || 'text-slate-500 border-slate-200';

  const genderData = workforce_composition.by_gender
    ? Object.entries(workforce_composition.by_gender).map(([k, v]) => ({ name: k, value: v }))
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={t('headcount')} value={fmtNumber(kpis.headcount, isRTL)} icon={Users} iconClassName="bg-blue-50" />
        <StatCard title={t('saudizationRate')} value={fmtPct(kpis.saudization_pct)} icon={ShieldCheck} iconClassName="bg-emerald-50" />
        <StatCard
          title={t('retentionRate')}
          value={kpis.retention_rate_pct !== null ? fmtPct(kpis.retention_rate_pct) : '—'}
          subtitle={<DataQualityNote quality={kpis.retention_data_quality} isRTL={isRTL} />}
          icon={TrendingUp}
          iconClassName="bg-purple-50"
        />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('nitaqatBand')}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className={`text-base px-4 py-1.5 ${bandColor}`}>
              {(nitaqat.band || '—').toUpperCase()}
            </Badge>
            <div className="flex-1">
              <ScoreBar label={t('saudizationRate')} value={nitaqat.saudization_pct} isRTL={isRTL} />
            </div>
          </div>
          {nitaqat.thresholds && (
            <p className="text-xs text-slate-400 mt-3">
              {isRTL ? 'الحدود' : 'Thresholds'}: {isRTL ? 'بلاتيني' : 'Platinum'} ≥{nitaqat.thresholds.platinum}% · {isRTL ? 'أخضر' : 'Green'} ≥{nitaqat.thresholds.green}% · {isRTL ? 'أصفر' : 'Yellow'} ≥{nitaqat.thresholds.yellow}%
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{t('workforceComposition')}</CardTitle></CardHeader>
          <CardContent>
            {!workforce_composition.by_department?.length ? <EmptyState isRTL={isRTL} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={workforce_composition.by_department}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey={isRTL ? 'name_ar' : 'name_en'} fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{isRTL ? 'السعوديون مقابل غير السعوديين' : 'Saudi vs Non-Saudi'}</CardTitle></CardHeader>
          <CardContent>
            {genderData.length === 0 ? <EmptyState isRTL={isRTL} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {genderData.map((entry, idx) => (
                      <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('payrollGovCompliance')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TrafficLight label="WPS / Mudad" status={payroll_gov_compliance.wps_mudad} isRTL={isRTL} />
            <TrafficLight label="GOSI" status={payroll_gov_compliance.gosi} isRTL={isRTL} />
            <TrafficLight label="Qiwa" status={payroll_gov_compliance.qiwa} isRTL={isRTL} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard title={t('openRoles')} value={fmtNumber(open_roles.count, isRTL)} icon={Building2} iconClassName="bg-blue-50" />
        <StatCard
          title={t('timeToFill')}
          value={open_roles.avg_time_to_fill_days !== null ? `${fmtNumber(open_roles.avg_time_to_fill_days, isRTL)} ${isRTL ? 'يوم' : 'days'}` : '—'}
          subtitle={<DataQualityNote quality={open_roles.time_to_fill_data_quality} isRTL={isRTL} />}
          icon={Clock}
          iconClassName="bg-amber-50"
        />
      </div>
    </div>
  );
}
