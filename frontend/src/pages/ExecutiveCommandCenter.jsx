import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { formatCurrency, formatDate, formatDateTime } from '../lib/localization';
import { useJurisdictionFeatures } from '../components/JurisdictionFeatureContext';
import { NATIONALISATION_FEATURES, EINVOICING_FEATURES, WPS_FEATURES, SOCIAL_INSURANCE_FEATURES, LABOR_PORTAL_FEATURES } from '../lib/jurisdictionFeatures.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Button } from '../components/ui/button';
import ExportMenu from '../components/ui/ExportMenu';
import ExecutiveKPICard from '../components/exec/ExecutiveKPICard';
import ExecutivePersonaTabs from '../components/exec/ExecutivePersonaTabs';
import ComplianceSignalRow from '../components/exec/ComplianceSignalRow';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadialBarChart, RadialBar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Legend
} from 'recharts';
import {
  Crown, RefreshCw, TrendingUp, DollarSign, Users, Building2,
  AlertTriangle, ShieldCheck, ShieldAlert, ShieldX, Sparkles, Clock,
  GraduationCap, Target, Wallet, FileWarning, Percent, Activity
} from 'lucide-react';

const COLORS = { najdi: '#0E6B4F', green: '#16A077', amber: '#E0A82E', red: '#D1493F', purple: '#8B5CF6', gold: '#C8A451', info: '#2C7BB0', ink: '#1C2420' };
const PIE_COLORS = [COLORS.najdi, COLORS.green, COLORS.gold, COLORS.red, COLORS.purple];
const PILLAR_COLORS = { retention: '#0E6B4F', engagement: '#2C7BB0', collection: '#C8A451', growth: '#16A077', financial: '#8B5CF6' };

function fmtNumber(n, isRTL) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(isRTL ? 'ar-SA' : 'en-US').format(n);
}


function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  return `${n}%`;
}

function ScoreBar({ label, value }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-ink">{fmtPct(value)}</span>
      </div>
      <Progress value={value || 0} className="h-1.5" />
    </div>
  );
}

function TrafficLight({ label, signal }) {
  const color = signal?.color || 'unknown';
  const cfg = {
    green: { Icon: ShieldCheck, cls: 'text-emerald-600 bg-emerald-50' },
    yellow: { Icon: ShieldAlert, cls: 'text-amber-600 bg-amber-50' },
    red: { Icon: ShieldX, cls: 'text-red-600 bg-red-50' },
    unknown: { Icon: ShieldAlert, cls: 'text-muted-foreground bg-sand' },
  }[color];
  const { Icon, cls } = cfg;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border" title={signal?.message || undefined}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-sm font-medium text-ink">{label}</span>
    </div>
  );
}

function EmptyState({ isRTL, message }) {
  return (
    <div className="border-2 border-dashed border-border rounded-xl p-10 text-center text-muted-foreground">
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
  const { tenant } = useTenant();
  const dashboardRef = useRef(null);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [persona, setPersona] = useState(null);

  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(null);

  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState('all');

  const [period, setPeriod] = useState('current');

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);
  const [metricsRefreshing, setMetricsRefreshing] = useState(false);

  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefRefreshing, setBriefRefreshing] = useState(false);

  const requiresTenantSelection = !!access?.requiresTenantSelection;

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

  // Platform owners have no tenant of their own — they must pick a school
  // before any dashboard data can be loaded.
  useEffect(() => {
    if (!requiresTenantSelection) return;
    let active = true;
    setTenantsLoading(true);
    callApi('/api/exec/tenants', null, { method: 'GET' })
      .then((res) => {
        if (!active) return;
        const list = res.tenants || [];
        setTenants(list);
        if (list.length > 0) setSelectedTenantId(list[0].id);
      })
      .catch(() => {
        if (active) toast.error(isRTL ? 'فشل تحميل قائمة المدارس' : 'Failed to load schools list');
      })
      .finally(() => { if (active) setTenantsLoading(false); });
    return () => { active = false; };
  }, [requiresTenantSelection, isRTL]);

  const dashboardQS = useCallback(() => {
    const params = new URLSearchParams();
    if (requiresTenantSelection && selectedTenantId) params.set('tenant_id', selectedTenantId);
    if (selectedBranchId && selectedBranchId !== 'all') params.set('branch_id', selectedBranchId);
    if (period && period !== 'current') params.set('period', period);
    const str = params.toString();
    return str ? `?${str}` : '';
  }, [requiresTenantSelection, selectedTenantId, selectedBranchId, period]);

  const loadDashboard = useCallback(async (p, opts = {}) => {
    if (!p) return;
    if (requiresTenantSelection && !selectedTenantId) return;
    if (!opts.background) { setDashboardLoading(true); setDashboardError(false); }
    try {
      const res = await callApi(`/api/exec/${p}${dashboardQS()}`, null, { method: 'GET' });
      setDashboard(res);
    } catch (err) {
      if (!opts.background) { setDashboardError(true); setDashboard(null); }
      if (err?.status === 403) {
        toast.error(isRTL ? 'ليس لديك صلاحية الوصول لهذا القسم' : 'You do not have access to this dashboard');
      } else {
        toast.error(isRTL ? 'فشل تحميل البيانات' : 'Failed to load dashboard data');
      }
    } finally {
      if (!opts.background) setDashboardLoading(false);
    }
  }, [isRTL, requiresTenantSelection, selectedTenantId, selectedBranchId, period, dashboardQS]);

  useEffect(() => { if (persona) loadDashboard(persona); }, [persona, selectedTenantId, selectedBranchId, period, loadDashboard]);

  useEffect(() => {
    if (requiresTenantSelection && !selectedTenantId) return;
    let active = true;
    setBranchesLoading(true);
    callApi(`/api/exec/branches${dashboardQS()}`, null, { method: 'GET' })
      .then((res) => { if (active) setBranches(res.branches || []); })
      .catch(() => { if (active) toast.error(isRTL ? 'فشل تحميل الفروع' : 'Failed to load branches'); })
      .finally(() => { if (active) setBranchesLoading(false); });
    return () => { active = false; };
  }, [requiresTenantSelection, selectedTenantId, dashboardQS, isRTL]);

  const refreshMetrics = async () => {
    if (requiresTenantSelection && !selectedTenantId) return;
    setMetricsRefreshing(true);
    try {
      await callApi(`/api/exec/metrics/refresh${dashboardQS()}`, {}, { method: 'POST' });
      toast.success(isRTL ? 'تم تحديث المؤشرات' : 'Metrics refreshed');
      if (persona) loadDashboard(persona, { background: true });
      if (persona === 'ceo') loadBrief();
    } catch {
      toast.error(isRTL ? 'فشل تحديث المؤشرات' : 'Failed to refresh metrics');
    } finally {
      setMetricsRefreshing(false);
    }
  };

  const loadBrief = useCallback(async () => {
    if (requiresTenantSelection && !selectedTenantId) return;
    setBriefLoading(true);
    try {
      const res = await callApi(`/api/exec/ceo/brief${dashboardQS()}`, null, { method: 'GET' });
      setBrief(res);
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, [requiresTenantSelection, selectedTenantId, selectedBranchId, period, dashboardQS]);

  useEffect(() => { if (persona === 'ceo') loadBrief(); }, [persona, selectedTenantId, selectedBranchId, period, loadBrief]);

  const refreshBrief = async () => {
    setBriefRefreshing(true);
    try {
      const res = await callApi(`/api/exec/ceo/brief/refresh${dashboardQS()}`, {}, { method: 'POST' });
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
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
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
    <div dir={isRTL ? 'rtl' : 'ltr'} className="p-4 md:p-6 space-y-6" ref={dashboardRef}>
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-najdi-900 to-najdi-800 flex items-center justify-center shadow-md">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-ink">{t('executiveCommandCenter')}</h1>
              <p className="text-sm text-muted-foreground">{t('executive')}</p>
            </div>
          </div>
          {showSwitcher && (
            <ExecutivePersonaTabs value={persona} onChange={setPersona} available={availablePersonas} isRTL={isRTL} />
          )}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-white border border-border/60 shadow-sm">
          <ExportMenu
            persona={persona}
            tenantId={selectedTenantId || undefined}
            branchId={selectedBranchId}
            period={period}
            filename={`executive-command-center-${persona}-${period}`}
          />
          {requiresTenantSelection && (
            <>
              <span className="text-xs font-medium text-muted-foreground">{isRTL ? 'المدرسة' : 'School'}</span>
              <Select value={selectedTenantId || undefined} onValueChange={setSelectedTenantId} disabled={tenantsLoading || tenants.length === 0}>
                <SelectTrigger className="w-52 h-9">
                  <SelectValue placeholder={tenantsLoading ? (isRTL ? 'جارٍ التحميل...' : 'Loading...') : undefined} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tn) => (
                    <SelectItem key={tn.id} value={tn.id}>{isRTL ? (tn.name_ar || tn.name_en) : (tn.name_en || tn.name_ar)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <span className="text-xs font-medium text-muted-foreground">{isRTL ? 'الفرع' : 'Branch'}</span>
          <Select value={selectedBranchId} onValueChange={setSelectedBranchId} disabled={branchesLoading}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'جميع الفروع' : 'All branches'}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{isRTL ? (b.name_ar || b.name_en) : (b.name_en || b.name_ar)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs font-medium text-muted-foreground">{isRTL ? 'الفترة' : 'Period'}</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">{isRTL ? 'الحالية' : 'Current'}</SelectItem>
              {Array.from({ length: 12 }).map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const key = d.toISOString().slice(0, 7);
                const label = `${formatDate(d, tenant?.localization, isRTL, { month: 'short', year: 'numeric' })}`;
                return <SelectItem key={key} value={key}>{label}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <div className="ms-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshMetrics} disabled={metricsRefreshing} className="gap-1.5 h-9">
              <RefreshCw className={`w-3.5 h-3.5 ${metricsRefreshing ? 'animate-spin' : ''}`} />
              {isRTL ? 'تحديث' : 'Refresh'}
            </Button>
            {dashboard?.computed_at && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatDateTime(dashboard.computed_at, tenant?.localization, isRTL)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {requiresTenantSelection && !tenantsLoading && tenants.length === 0 && (
        <EmptyState isRTL={isRTL} message={isRTL ? 'لا توجد مدارس متاحة' : 'No schools available'} />
      )}

      {(!requiresTenantSelection || selectedTenantId) && dashboardLoading && (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {(!requiresTenantSelection || selectedTenantId) && !dashboardLoading && dashboardError && (
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

function VitalityGauge({ score }) {
  const gaugeColor = score >= 70 ? COLORS.green : score >= 40 ? COLORS.amber : COLORS.red;
  const gaugeData = [{ name: 'score', value: score || 0, fill: gaugeColor }];

  return (
    <div className="relative w-40 h-40">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0} barSize={12} data={gaugeData}>
          <RadialBar background clockWise dataKey="value" cornerRadius={6} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center mt-4">
        <span className="text-4xl font-bold text-white">{score ?? '—'}</span>
        <span className="text-xs text-white/60">/100</span>
      </div>
    </div>
  );
}

function PillarRadar({ subScores, isRTL }) {
  const radarData = [
    { pillar: isRTL ? 'الاستبقاء' : 'Retention', value: subScores?.retention || 0, fullMark: 100 },
    { pillar: isRTL ? 'الالتزام' : 'Engagement', value: subScores?.engagement || subScores?.compliance || 0, fullMark: 100 },
    { pillar: isRTL ? 'التحصيل' : 'Collection', value: subScores?.collections || 0, fullMark: 100 },
    { pillar: isRTL ? 'النمو' : 'Growth', value: subScores?.growth || 0, fullMark: 100 },
    { pillar: isRTL ? 'المالية' : 'Financial', value: subScores?.financial || 0, fullMark: 100 },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={radarData}>
        <PolarGrid stroke="rgba(255,255,255,0.15)" />
        <PolarAngleAxis dataKey="pillar" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={0.3} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function MultiCurrencyBreakdown({ amounts, localization, isRTL }) {
  if (!amounts || Object.keys(amounts).length === 0) return '—';
  return (
    <div className="flex flex-col gap-0.5">
      {Object.entries(amounts).map(([currency, amount]) => (
        <span key={currency} className="text-sm font-semibold leading-tight">
          {formatCurrency(Number(amount), { ...localization, currencyCode: currency }, isRTL)}
        </span>
      ))}
    </div>
  );
}

function CurrencyValue({ value, byCurrency, localization, isRTL }) {
  if (byCurrency && Object.keys(byCurrency).length > 1) {
    return <MultiCurrencyBreakdown amounts={byCurrency} localization={localization} isRTL={isRTL} />;
  }
  return formatCurrency(value, localization, isRTL);
}

function aggregateUtilization(campusVitality) {
  if (!campusVitality?.length) return null;
  const totalCapacity = campusVitality.reduce((s, c) => s + (c.capacity || 0), 0);
  const totalEnrolled = campusVitality.reduce((s, c) => s + (c.enrolled || 0), 0);
  return totalCapacity > 0 ? round2((totalEnrolled / totalCapacity) * 100) : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function CEODashboard({ data, brief, briefLoading, briefRefreshing, onRefreshBrief, isRTL, t }) {
  const { tenant } = useTenant();
  const { vitality, financials, collections, growth = {}, compliance = {}, campus_vitality = [], strategic_alerts = [], revenue_trend = [], collection_trend = [], top_risks = [], cash_runway } = data;

  const collectionRate = collections?.collection_rate_pct;
  const collectionTotalInvoiced = collections?.total_invoiced ?? 0;
  const invoicedByCurrency = collections?.total_invoiced_by_currency ?? {};
  const hasCollectionData = financials?.is_multi_currency
    ? Object.values(invoicedByCurrency).some((v) => Number(v) > 0)
    : collectionTotalInvoiced > 0;
  const isCollectionCritical = !financials?.is_multi_currency && collectionRate !== undefined && collectionRate !== null && collectionRate === 0 && hasCollectionData;

  const capacityUtil = aggregateUtilization(campus_vitality);
  const revenueSpark = financials?.is_multi_currency ? null : revenue_trend?.map((v, i) => ({ name: i, value: v.revenue || 0 }));
  const collectionSpark = financials?.is_multi_currency ? null : collection_trend?.map((v, i) => ({ name: i, value: v.rate || 0 }));
  const enrollmentSpark = growth?.data_quality === 'real' && growth?.current_count != null
    ? [{ value: growth.previous_count || 0 }, { value: growth.current_count }]
    : null;

  const complianceSignals = [
    { key: 'einvoicing', label: isRTL ? 'الفوترة الإلكترونية' : 'E-Invoicing', signal: compliance.einvoicing },
    { key: 'mudad', label: isRTL ? 'حماية الأجور' : 'Wage Protection', signal: compliance.mudad },
    { key: 'gosi', label: isRTL ? 'التأمينات' : 'Social Insurance', signal: compliance.gosi },
    { key: 'qiwa', label: isRTL ? 'قوى' : 'Labor Portal', signal: compliance.qiwa },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Hero — Group Vitality Index with Radial Gauge + Radar Chart */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-najdi-900 via-[#0a5a42] to-najdi-900 text-white">
        <CardContent className="p-6">
          <p className="text-xs uppercase tracking-wide text-white/60 mb-4">
            {isRTL ? 'مؤشر حيوية المجموعة' : 'Group Vitality Index'}
          </p>
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-shrink-0">
              <VitalityGauge score={vitality?.score} />
            </div>
            <div className="flex-1">
              <PillarRadar subScores={vitality?.sub_scores} isRTL={isRTL} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2 flex-shrink-0">
              {[
                [isRTL ? 'الاستبقاء' : 'Retention', vitality?.sub_scores?.retention, PILLAR_COLORS.retention],
                [isRTL ? 'الالتزام' : 'Engagement', vitality?.sub_scores?.engagement || vitality?.sub_scores?.compliance, PILLAR_COLORS.engagement],
                [isRTL ? 'التحصيل' : 'Collection', vitality?.sub_scores?.collections, PILLAR_COLORS.collection],
                [isRTL ? 'النمو' : 'Growth', vitality?.sub_scores?.growth, PILLAR_COLORS.growth],
                [isRTL ? 'المالية' : 'Financial', vitality?.sub_scores?.financial, PILLAR_COLORS.financial],
              ].map(([label, val, color]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-white/70">{label}</span>
                  <span className={`font-semibold ms-auto ${val === 0 ? 'text-red-400' : ''}`}>{val ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. KPI Grid — expanded executive metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <ExecutiveKPICard
          id="revenue"
          title={isRTL ? 'الإيرادات' : 'Revenue'}
          value={<CurrencyValue value={financials?.revenue} byCurrency={financials?.revenue_by_currency} localization={tenant?.localization} isRTL={isRTL} />}
          delta={financials?.is_multi_currency ? null : financials?.revenue_delta_pct}
          sparkData={revenueSpark}
          color="najdi"
          icon={DollarSign}
        />
        <ExecutiveKPICard
          id="ebitda"
          title={isRTL ? 'الأرباح قبل الفوائد والضرائب' : 'EBITDA'}
          value={<CurrencyValue value={financials?.ebitda} byCurrency={financials?.ebitda_by_currency} localization={tenant?.localization} isRTL={isRTL} />}
          delta={financials?.is_multi_currency ? null : financials?.ebitda_delta_pct}
          sparkData={financials?.is_multi_currency ? null : revenue_trend?.map((v, i) => ({ name: i, value: v.ebitda || 0 }))}
          color="green"
          icon={TrendingUp}
        />
        <ExecutiveKPICard
          id="collection"
          title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'}
          value={financials?.is_multi_currency ? (
            <MultiCurrencyBreakdown amounts={collections?.collection_rate_by_currency} localization={tenant?.localization} isRTL={isRTL} />
          ) : isCollectionCritical
            ? <span className="text-red-500">{fmtPct(0)}</span>
            : (hasCollectionData ? fmtPct(collectionRate) : '—')
          }
          delta={financials?.is_multi_currency || !hasCollectionData ? null : collections?.collection_delta_pct}
          sparkData={collectionSpark}
          color={isCollectionCritical ? 'red' : 'gold'}
          icon={Wallet}
        />
        <ExecutiveKPICard
          id="margin"
          title={isRTL ? 'هامش الربح' : 'Profit Margin'}
          value={financials?.margin != null ? fmtPct(round2(financials.margin)) : '—'}
          subtitle={financials?.is_multi_currency ? (isRTL ? 'غير متاح للعملات المتعددة' : 'N/A for multi-currency') : undefined}
          color="purple"
          icon={Percent}
        />
        <ExecutiveKPICard
          id="enrollment"
          title={isRTL ? 'الطلاب المسجلون' : 'Enrolled Students'}
          value={growth?.current_count != null ? fmtNumber(growth.current_count, isRTL) : '—'}
          delta={growth?.data_quality === 'real' ? growth.growth_rate : null}
          sparkData={enrollmentSpark}
          color="info"
          icon={GraduationCap}
          subtitle={growth?.previous_count != null ? `${isRTL ? 'العام السابق' : 'Prior year'}: ${fmtNumber(growth.previous_count, isRTL)}` : undefined}
        />
        <ExecutiveKPICard
          id="capacity"
          title={isRTL ? 'استغلال السعة' : 'Capacity Utilization'}
          value={capacityUtil != null ? fmtPct(capacityUtil) : '—'}
          color={capacityUtil != null && capacityUtil < 60 ? 'red' : capacityUtil != null && capacityUtil >= 85 ? 'green' : 'info'}
          icon={Building2}
        />
        <ExecutiveKPICard
          id="compliance"
          title={isRTL ? 'درجة الامتثال' : 'Compliance Score'}
          value={compliance?.score != null ? `${compliance.score}/100` : '—'}
          subtitle={compliance?.overdue_invoices > 0 ? `${compliance.overdue_invoices} ${isRTL ? 'فاتورة متأخرة' : 'overdue invoices'}` : undefined}
          color={compliance?.score >= 80 ? 'green' : compliance?.score >= 60 ? 'gold' : 'red'}
          icon={ShieldCheck}
        />
        <ExecutiveKPICard
          id="cash-runway"
          title={isRTL ? 'مدى النقد (أشهر)' : 'Cash Runway'}
          value={cash_runway != null ? fmtNumber(cash_runway, isRTL) : '—'}
          subtitle={isRTL ? 'بناءً على الإنفاق الشهري' : 'Based on monthly spend'}
          color={cash_runway != null && cash_runway < 3 ? 'red' : cash_runway != null && cash_runway >= 6 ? 'green' : 'gold'}
          icon={Activity}
        />
      </div>

      {/* Compliance signals strip */}
      {compliance?.score != null && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            {isRTL ? 'إشارات الامتثال' : 'Compliance Signals'}
          </p>
          <ComplianceSignalRow signals={complianceSignals} isRTL={isRTL} />
        </div>
      )}

      {/* Collection = 0 red alert */}
      {isCollectionCritical && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <ShieldX className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm font-medium text-red-700">
            {isRTL ? 'تنبيه: نسبة التحصيل 0% — يتطلب إجراء فوري' : 'Alert: Collection rate is 0% — immediate action required'}
          </p>
        </div>
      )}

      {/* 3. Trend Block — Revenue vs EBITDA over 12 months + Collection rate trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isRTL ? 'الإيرادات مقابل الأرباح (12 شهر)' : 'Revenue vs EBITDA (12 months)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {financials?.is_multi_currency ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{isRTL ? 'الإيرادات حسب العملة' : 'Revenue by currency'}</span>
                  <CurrencyValue value={financials?.revenue} byCurrency={financials?.revenue_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{isRTL ? 'الأرباح حسب العملة' : 'EBITDA by currency'}</span>
                  <CurrencyValue value={financials?.ebitda} byCurrency={financials?.ebitda_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </div>
              </div>
            ) : (!revenue_trend || revenue_trend.length === 0) ? <EmptyState isRTL={isRTL} /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={revenue_trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" fontSize={10} tick={{ fill: COLORS.ink }} />
                  <YAxis fontSize={10} tick={{ fill: COLORS.ink }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" name={isRTL ? 'الإيرادات' : 'Revenue'} fill={COLORS.najdi} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ebitda" name={isRTL ? 'الأرباح' : 'EBITDA'} fill={COLORS.green} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {isRTL ? 'اتجاه نسبة التحصيل' : 'Collection Rate Trend'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {financials?.is_multi_currency ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{isRTL ? 'التحصيل حسب العملة' : 'Collection by currency'}</span>
                  <MultiCurrencyBreakdown amounts={collections?.collection_rate_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{isRTL ? 'المدفوع حسب العملة' : 'Collected by currency'}</span>
                  <CurrencyValue value={collections?.total_collected} byCurrency={collections?.total_collected_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </div>
              </div>
            ) : (!collection_trend || collection_trend.length === 0) ? <EmptyState isRTL={isRTL} /> : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={collection_trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="label" fontSize={10} tick={{ fill: COLORS.ink }} />
                  <YAxis domain={[0, 100]} fontSize={10} tick={{ fill: COLORS.ink }} />
                  <Tooltip />
                  <defs>
                    <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.gold} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="rate" name={isRTL ? 'نسبة التحصيل' : 'Collection %'} stroke={COLORS.gold} fill="url(#collGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Branch Vitality — ranked bars with medals */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="w-4 h-4 text-najdi-900" />
              {isRTL ? 'حيوية الفروع' : 'Branch Vitality'}
            </CardTitle>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥70</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 40–69</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> &lt;40</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {campus_vitality.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <div className="space-y-3">
              {[...campus_vitality].sort((a, b) => (b.score || 0) - (a.score || 0)).map((c, idx) => {
                const barColor = c.score >= 70 ? COLORS.green : c.score >= 40 ? COLORS.amber : COLORS.red;
                const collColor = (c.collection_rate || 0) === 0 ? 'text-red-600 font-bold' : 'text-muted-foreground';
                const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
                return (
                  <div key={c.branch_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-sand-alt/50 transition-colors">
                    <span className="w-6 text-center text-sm">{rankBadge || <span className="text-muted-foreground text-xs">{idx + 1}</span>}</span>
                    <span className="w-28 text-sm font-medium text-ink truncate">{isRTL ? c.name_ar : c.name_en}</span>
                    <div className="flex-1 h-7 bg-sand-alt rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${Math.min(c.score || 0, 100)}%`, background: barColor }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink/70">
                        {c.enrolled != null && c.capacity ? `${c.enrolled}/${c.capacity}` : ''}
                      </span>
                    </div>
                    <span className="w-10 text-sm font-bold text-ink text-center">{c.score ?? '—'}</span>
                    <span className={`w-14 text-xs text-center ${collColor}`}>
                      {fmtPct(c.collection_rate ?? c.utilization_pct)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. AI Board Brief (YAMEN AI) */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {isRTL ? 'موجز مجلس الإدارة — YAMEN AI' : 'AI Board Brief — YAMEN AI'}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={onRefreshBrief} disabled={briefRefreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${briefRefreshing ? 'animate-spin' : ''}`} />
            {isRTL ? 'إنشاء الموجز' : 'Generate Brief'}
          </Button>
        </CardHeader>
        <CardContent>
          {briefLoading ? (
            <div className="flex items-center justify-center h-24">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : brief ? (
            <div className="space-y-4">
              <p className="text-sm text-ink leading-relaxed">
                {isRTL ? brief.narrative_ar : brief.narrative_en}
              </p>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{t('recommendedActions')}</p>
                <ul className="space-y-1.5">
                  {(isRTL ? brief.actions_ar : brief.actions_en)?.map((a, i) => (
                    <li key={i} className="flex gap-2 text-sm text-ink">
                      <span className="text-purple-500 font-semibold">{i + 1}.</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <Sparkles className="w-8 h-8 text-purple-300 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">
                {isRTL ? 'اضغط "إنشاء الموجز" لتوليد تقرير AI للمجلس' : 'Click "Generate Brief" to create an AI board report'}
              </p>
              <Button variant="outline" size="sm" onClick={onRefreshBrief} disabled={briefRefreshing} className="gap-2">
                <Sparkles className="w-4 h-4" />
                {isRTL ? 'إنشاء الموجز' : 'Generate Brief'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldX className="w-4 h-4 text-red-500" />
              {isRTL ? 'أعلى 5 مخاطر' : 'Top 5 Risks'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top_risks.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <ShieldCheck className="w-8 h-8 text-emerald-300 mb-2" />
                <p className="text-sm">{isRTL ? 'لا توجد مخاطر مرتفعة' : 'No high-priority risks'}</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {top_risks.slice(0, 5).map((r, i) => (
                  <li key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-red-50/50 border border-red-100/60 text-sm text-ink">
                    <span className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                    <span>{isRTL ? r.message_ar : r.message_en}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-amber-500" />
              {isRTL ? 'ملخص التحصيل' : 'Collections Summary'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-sand-alt border border-border/40">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{isRTL ? 'إجمالي الفواتير' : 'Total Invoiced'}</p>
                <p className="text-lg font-bold text-ink mt-1">
                  <CurrencyValue value={collections?.total_invoiced} byCurrency={collections?.total_invoiced_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100/60">
                <p className="text-[11px] text-emerald-700 uppercase tracking-wide">{isRTL ? 'المحصّل' : 'Collected'}</p>
                <p className="text-lg font-bold text-emerald-800 mt-1">
                  <CurrencyValue value={collections?.total_collected} byCurrency={collections?.total_collected_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </p>
              </div>
            </div>
            {compliance?.overdue_invoices > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{compliance.overdue_invoices} {isRTL ? 'فاتورة متأخرة السداد' : 'overdue invoices require attention'}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 6. Strategic Alerts with severity badges */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {isRTL ? 'تنبيهات استراتيجية' : 'Strategic Alerts'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {strategic_alerts.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              {isRTL ? 'لا توجد تنبيهات حالياً' : 'No alerts at this time'}
            </div>
          ) : (
            <ul className="space-y-2">
              {strategic_alerts
                .sort((a, b) => {
                  const severityOrder = { high: 0, critical: 0, medium: 1, warning: 1, low: 2, info: 2 };
                  return (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
                })
                .map((a, i) => {
                  const severityCls = {
                    high: 'text-red-700 bg-red-50 border-red-200',
                    critical: 'text-red-700 bg-red-50 border-red-200',
                    medium: 'text-amber-700 bg-amber-50 border-amber-200',
                    warning: 'text-amber-700 bg-amber-50 border-amber-200',
                    low: 'text-muted-foreground bg-sand border-border',
                    info: 'text-blue-700 bg-blue-50 border-blue-200',
                  }[a.severity] || 'text-muted-foreground bg-sand border-border';

                  return (
                    <li key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${severityCls.split(' ').slice(2).join(' ')}`}>
                      <Badge className={`text-[10px] px-2 py-0.5 ${severityCls}`}>
                        {(a.severity || 'info').toUpperCase()}
                      </Badge>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-ink">{isRTL ? a.message_ar : a.message_en}</span>
                        {a.category && (
                          <span className="text-xs text-muted-foreground ms-2">[{a.category}]</span>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CFODashboard({ data, isRTL, t }) {
  const { tenant } = useTenant();
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const einvoiceEnabled = isFeatureEnabled(EINVOICING_FEATURES[0]);
  const wageProtectionEnabled = isFeatureEnabled(WPS_FEATURES[0]);
  const socialInsuranceEnabled = isFeatureEnabled(SOCIAL_INSURANCE_FEATURES[0]);
  const showCompliance = einvoiceEnabled || wageProtectionEnabled || socialInsuranceEnabled;
  const { kpis = {}, ar_aging = {}, overdue_by_campus = [], revenue_vs_ebitda = [], compliance_traffic_lights = {}, scenario_baseline = {} } = data;
  const isMultiCurrency = kpis?.is_multi_currency;

  const [growthRate, setGrowthRate] = useState(0);
  const [expenseRate, setExpenseRate] = useState(0);
  const simRevenue = isMultiCurrency ? null : (scenario_baseline.revenue || 0) * (1 + growthRate / 100);
  const simExpenses = isMultiCurrency ? null : (scenario_baseline.expenses || 0) * (1 + expenseRate / 100);
  const simEbitda = isMultiCurrency ? null : (simRevenue || 0) - (simExpenses || 0);

  const agingData = ar_aging?.buckets ? [
    { label: '0-30', value: ar_aging.buckets['0_30'] || 0 },
    { label: '31-60', value: ar_aging.buckets['31_60'] || 0 },
    { label: '61-90', value: ar_aging.buckets['61_90'] || 0 },
    { label: '90+', value: ar_aging.buckets['90_plus'] || 0 },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ExecutiveKPICard id="cfo-revenue" title={t('revenue')} value={<CurrencyValue value={kpis.revenue} byCurrency={kpis.revenue_by_currency} localization={tenant?.localization} isRTL={isRTL} />} color="najdi" icon={DollarSign} />
        <ExecutiveKPICard id="cfo-ebitda" title={t('ebitda')} value={<CurrencyValue value={kpis.ebitda} byCurrency={kpis.ebitda_by_currency} localization={tenant?.localization} isRTL={isRTL} />} subtitle={isMultiCurrency ? null : fmtPct(kpis.margin_pct)} color="green" icon={TrendingUp} />
        <ExecutiveKPICard id="cfo-cash" title={t('cashCollected')} value={<CurrencyValue value={kpis.cash_collected_30d} byCurrency={kpis.cash_collected_30d_by_currency} localization={tenant?.localization} isRTL={isRTL} />} color="purple" icon={Wallet} />
        <ExecutiveKPICard id="cfo-dso" title={t('dsoDays')} value={kpis.dso_days != null ? fmtNumber(kpis.dso_days, isRTL) : '—'} color={kpis.dso_days > 90 ? 'red' : kpis.dso_days > 60 ? 'gold' : 'green'} icon={Clock} subtitle={isRTL ? 'يوم' : 'days'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{t('arAging')}</CardTitle></CardHeader>
          <CardContent>
            {isMultiCurrency ? (
              <div className="space-y-2 text-sm">
                {Object.entries(ar_aging?.by_currency || {}).map(([currency, buckets]) => (
                  <div key={currency} className="space-y-1 border-b border-sand pb-2 last:border-0">
                    <p className="text-xs font-medium text-muted-foreground">{isRTL ? 'العملة' : 'Currency'}: {currency}</p>
                    {Object.entries(buckets || {}).map(([bucket, amount]) => (
                      <div key={bucket} className="flex justify-between">
                        <span className="text-muted-foreground">{bucket.replace('_', '-')}</span>
                        <span className="font-medium">{formatCurrency(Number(amount), { ...tenant?.localization, currencyCode: currency }, isRTL)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agingData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill={COLORS.najdi} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{t('revenueVsEbitda')}</CardTitle></CardHeader>
          <CardContent>
            {isMultiCurrency ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{isRTL ? 'الإيرادات حسب العملة' : 'Revenue by currency'}</span>
                  <CurrencyValue value={kpis.revenue} byCurrency={kpis.revenue_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{isRTL ? 'الأرباح حسب العملة' : 'EBITDA by currency'}</span>
                  <CurrencyValue value={kpis.ebitda} byCurrency={kpis.ebitda_by_currency} localization={tenant?.localization} isRTL={isRTL} />
                </div>
              </div>
            ) : revenue_vs_ebitda.length === 0 ? <EmptyState isRTL={isRTL} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenue_vs_ebitda}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke={COLORS.najdi} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ebitda" stroke={COLORS.green} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {showCompliance && (
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('complianceTrafficLights')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {einvoiceEnabled && <TrafficLight label={t('complianceEinvoice')} signal={compliance_traffic_lights[EINVOICING_FEATURES[0]]} />}
            {wageProtectionEnabled && <TrafficLight label={t('complianceWps')} signal={compliance_traffic_lights[WPS_FEATURES[0]]} />}
            {socialInsuranceEnabled && <TrafficLight label={t('complianceSocialInsurance')} signal={compliance_traffic_lights[SOCIAL_INSURANCE_FEATURES[0]]} />}
          </div>
        </CardContent>
      </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('overdueByCampus')}</CardTitle></CardHeader>
        <CardContent>
          {overdue_by_campus.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">{isRTL ? 'الفرع' : 'Campus'}</th>
                    <th className="py-2 font-medium">{isRTL ? 'المبلغ المتأخر' : 'Overdue Amount'}</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue_by_campus.map((c) => (
                    <tr key={c.branch_id} className="border-b border-sand">
                      <td className="py-2 text-ink">{isRTL ? c.name_ar : c.name_en}</td>
                      <td className="py-2 text-ink">{formatCurrency(c.overdue_amount, { ...tenant?.localization, currencyCode: c.currency_code }, isRTL)}</td>
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
                <span className="text-muted-foreground">{isRTL ? 'نمو الإيراد' : 'Revenue growth'}</span>
                <span className="font-medium">{growthRate}%</span>
              </div>
              <input type="range" min={-20} max={20} value={growthRate} onChange={(e) => setGrowthRate(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{isRTL ? 'تغير المصروفات' : 'Expense change'}</span>
                <span className="font-medium">{expenseRate}%</span>
              </div>
              <input type="range" min={-20} max={20} value={expenseRate} onChange={(e) => setExpenseRate(Number(e.target.value))} className="w-full" />
            </div>
          </div>
          {isMultiCurrency ? (
            <div className="text-sm text-muted-foreground">{isRTL ? 'المحاكاة غير متوفرة للعملات المتعددة' : 'Scenario simulator is not available for multi-currency scopes.'}</div>
          ) : (
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="text-center"><p className="text-xs text-muted-foreground">{t('revenue')}</p><p className="font-semibold">{formatCurrency(simRevenue, tenant?.localization, isRTL)}</p></div>
              <div className="text-center"><p className="text-xs text-muted-foreground">{isRTL ? 'المصروفات' : 'Expenses'}</p><p className="font-semibold">{formatCurrency(simExpenses, tenant?.localization, isRTL)}</p></div>
              <div className="text-center"><p className="text-xs text-muted-foreground">{t('ebitda')}</p><p className="font-semibold">{formatCurrency(simEbitda, tenant?.localization, isRTL)}</p></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function COODashboard({ data, isRTL, t }) {
  const { tenant } = useTenant();
  const { kpis = {}, capacity_to_cash = [], admissions_funnel = {}, utilization_by_campus = [] } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ExecutiveKPICard id="coo-capacity" title={t('capacityUtilization')} value={fmtPct(kpis.capacity_utilization_pct)} color={kpis.capacity_utilization_pct >= 85 ? 'green' : kpis.capacity_utilization_pct < 60 ? 'red' : 'info'} icon={Building2} />
        <ExecutiveKPICard id="coo-ratio" title={t('studentTeacherRatio')} value={kpis.student_teacher_ratio ?? '—'} subtitle={kpis.student_teacher_ratio_data_quality === 'not_tracked' ? (isRTL ? 'غير متتبع' : 'Not tracked') : undefined} color="green" icon={Users} />
        <ExecutiveKPICard id="coo-attendance" title={isRTL ? 'معدل حضور الطلاب' : 'Student Attendance'} value={kpis.student_attendance_rate_pct != null ? fmtPct(kpis.student_attendance_rate_pct) : '—'} color="purple" icon={GraduationCap} />
        <ExecutiveKPICard id="coo-applicants" title={isRTL ? 'طلبات القبول' : 'Applications'} value={fmtNumber(admissions_funnel.applicants_total, isRTL)} subtitle={`${fmtNumber(admissions_funnel.applicants_pending, isRTL)} ${isRTL ? 'قيد المراجعة' : 'pending'}`} color="gold" icon={Target} />
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('capacityToCash')}</CardTitle></CardHeader>
        <CardContent>
          {capacity_to_cash.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">{isRTL ? 'الفرع' : 'Campus'}</th>
                    <th className="py-2 font-medium">{isRTL ? 'السعة' : 'Capacity'}</th>
                    <th className="py-2 font-medium">{isRTL ? 'المسجلون' : 'Enrolled'}</th>
                    <th className="py-2 font-medium">{t('capacityUtilization')}</th>
                    <th className="py-2 font-medium">{t('cashCollected')}</th>
                  </tr>
                </thead>
                <tbody>
                  {capacity_to_cash.map((c) => (
                    <tr key={c.branch_id} className="border-b border-sand">
                      <td className="py-2 text-ink">{isRTL ? c.name_ar : c.name_en}</td>
                      <td className="py-2 text-ink">{fmtNumber(c.capacity, isRTL)}</td>
                      <td className="py-2 text-ink">{fmtNumber(c.enrolled, isRTL)}</td>
                      <td className="py-2 text-ink">{fmtPct(c.utilization_pct)}</td>
                      <td className="py-2 text-ink">{formatCurrency(c.cash_collected, { ...tenant?.localization, currencyCode: c.currency_code }, isRTL)}</td>
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
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const chroSocialInsuranceEnabled = isFeatureEnabled(SOCIAL_INSURANCE_FEATURES[0]);
  const chroWageProtectionEnabled = isFeatureEnabled(WPS_FEATURES[0]);
  const chroLaborPortalEnabled = isFeatureEnabled(LABOR_PORTAL_FEATURES[0]);
  const showPayrollGovCompliance = chroSocialInsuranceEnabled || chroWageProtectionEnabled || chroLaborPortalEnabled;
  const { kpis = {}, nationalisation = {}, workforce_composition = {}, payroll_gov_compliance = {}, open_roles = {}, contract_expiry_radar = {}, leave_absence_summary = {} } = data;

  const bandColor = { platinum: 'text-purple-600 border-purple-200', green: 'text-emerald-600 border-emerald-200', yellow: 'text-amber-600 border-amber-200', red: 'text-red-600 border-red-200' }[nationalisation.band] || 'text-muted-foreground border-border';

  const genderData = workforce_composition.by_gender
    ? Object.entries(workforce_composition.by_gender).map(([k, v]) => ({ name: k, value: v }))
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ExecutiveKPICard id="chro-headcount" title={t('headcount')} value={fmtNumber(kpis.headcount, isRTL)} color="najdi" icon={Users} />
        {nationalisationEnabled && (
          <ExecutiveKPICard id="chro-saudization" title={t('saudizationRate')} value={fmtPct(kpis.saudization_pct)} color={nationalisation.band === 'green' || nationalisation.band === 'platinum' ? 'green' : nationalisation.band === 'red' ? 'red' : 'gold'} icon={ShieldCheck} subtitle={nationalisation.band ? nationalisation.band.toUpperCase() : undefined} />
        )}
        <ExecutiveKPICard id="chro-retention" title={t('retentionRate')} value={kpis.retention_rate_pct != null ? fmtPct(kpis.retention_rate_pct) : '—'} color="purple" icon={TrendingUp} />
        <ExecutiveKPICard id="chro-open-roles" title={t('openRoles')} value={open_roles.count != null ? fmtNumber(open_roles.count, isRTL) : '—'} subtitle={open_roles.avg_time_to_fill_days != null ? `${fmtNumber(open_roles.avg_time_to_fill_days, isRTL)} ${isRTL ? 'يوم للتعيين' : 'days to fill'}` : undefined} color="info" icon={Building2} />
      </div>

      {nationalisationEnabled && (
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('nationalisationBand')}</CardTitle></CardHeader>
        <CardContent>
          {nationalisation.data_quality === 'not_tracked' ? (
            <EmptyState isRTL={isRTL} message={isRTL ? 'لا توجد بيانات موظفين مسجلة' : 'No employee data on record'} />
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className={`text-base px-4 py-1.5 ${bandColor}`}>
                  {(nationalisation.band || '—').toUpperCase()}
                </Badge>
                <div className="flex-1">
                  <ScoreBar label={t('saudizationRate')} value={nationalisation.saudization_pct} isRTL={isRTL} />
                </div>
              </div>
              {nationalisation.thresholds && (
                <p className="text-xs text-muted-foreground mt-3">
                  {isRTL ? 'الحدود' : 'Thresholds'}: {isRTL ? 'بلاتيني' : 'Platinum'} ≥{nationalisation.thresholds.platinum}% · {isRTL ? 'أخضر' : 'Green'} ≥{nationalisation.thresholds.green}% · {isRTL ? 'أصفر' : 'Yellow'} ≥{nationalisation.thresholds.yellow}%
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
      )}

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
                  <Bar dataKey="count" fill={COLORS.najdi} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {nationalisationEnabled && (
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
        )}
      </div>

      {showPayrollGovCompliance && (
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('payrollGovCompliance')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {chroWageProtectionEnabled && <TrafficLight label={t('complianceWps')} signal={payroll_gov_compliance[WPS_FEATURES[0]]} />}
            {chroSocialInsuranceEnabled && <TrafficLight label={t('complianceSocialInsurance')} signal={payroll_gov_compliance[SOCIAL_INSURANCE_FEATURES[0]]} />}
            {chroLaborPortalEnabled && <TrafficLight label={t('complianceLaborPortal')} signal={payroll_gov_compliance[LABOR_PORTAL_FEATURES[0]]} />}
          </div>
        </CardContent>
      </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{isRTL ? 'عقود تنتهي خلال 90 يوماً' : 'Contracts Expiring in 90 Days'}</CardTitle></CardHeader>
          <CardContent>
            {contract_expiry_radar.data_quality === 'not_tracked' ? <EmptyState isRTL={isRTL} /> : (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-lg font-bold text-red-600">{fmtNumber(contract_expiry_radar['0_30'], isRTL)}</p>
                  <p className="text-xs text-muted-foreground">{isRTL ? '0-30 يوم' : '0-30 days'}</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <p className="text-lg font-bold text-amber-600">{fmtNumber(contract_expiry_radar['31_60'], isRTL)}</p>
                  <p className="text-xs text-muted-foreground">{isRTL ? '31-60 يوم' : '31-60 days'}</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <p className="text-lg font-bold text-emerald-600">{fmtNumber(contract_expiry_radar['61_90'], isRTL)}</p>
                  <p className="text-xs text-muted-foreground">{isRTL ? '61-90 يوم' : '61-90 days'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base">{isRTL ? 'ملخص الغياب والإجازات (30 يوماً)' : 'Leave & Absence Summary (30d)'}</CardTitle></CardHeader>
          <CardContent>
            {leave_absence_summary.data_quality === 'not_tracked' ? <EmptyState isRTL={isRTL} /> : (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                  <p className="text-lg font-bold text-red-600">{fmtNumber(leave_absence_summary.absent, isRTL)}</p>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'غياب' : 'Absent'}</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <p className="text-lg font-bold text-amber-600">{fmtNumber(leave_absence_summary.late, isRTL)}</p>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'تأخر' : 'Late'}</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <p className="text-lg font-bold text-emerald-600">{fmtNumber(leave_absence_summary.excused, isRTL)}</p>
                  <p className="text-xs text-muted-foreground">{isRTL ? 'معذور' : 'Excused'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
