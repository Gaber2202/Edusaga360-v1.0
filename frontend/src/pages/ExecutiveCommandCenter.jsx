import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Button } from '../components/ui/button';
import StatCard from '../components/ui/StatCard';
import ExportMenu from '../components/ui/ExportMenu';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  RadialBarChart, RadialBar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Legend
} from 'recharts';
import {
  Crown, RefreshCw, TrendingUp, DollarSign, Users, Building2,
  AlertTriangle, ShieldCheck, ShieldAlert, ShieldX, Sparkles, Clock
} from 'lucide-react';

const COLORS = { najdi: '#0E6B4F', green: '#16A077', amber: '#E0A82E', red: '#D1493F', purple: '#8B5CF6', gold: '#C8A451', info: '#2C7BB0', ink: '#1C2420' };
const PIE_COLORS = [COLORS.najdi, COLORS.green, COLORS.gold, COLORS.red, COLORS.purple];
const PILLAR_COLORS = { retention: '#0E6B4F', engagement: '#2C7BB0', collection: '#C8A451', growth: '#16A077', financial: '#8B5CF6' };

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
  const dashboardRef = useRef(null);

  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [persona, setPersona] = useState(null);

  const [tenants, setTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState(null);

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);

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

  const tenantQS = useCallback((sep = '?') => (
    requiresTenantSelection && selectedTenantId ? `${sep}tenant_id=${encodeURIComponent(selectedTenantId)}` : ''
  ), [requiresTenantSelection, selectedTenantId]);

  const loadDashboard = useCallback(async (p) => {
    if (!p) return;
    if (requiresTenantSelection && !selectedTenantId) return;
    setDashboardLoading(true);
    setDashboardError(false);
    try {
      const res = await callApi(`/api/exec/${p}${tenantQS()}`, null, { method: 'GET' });
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
  }, [isRTL, requiresTenantSelection, selectedTenantId, tenantQS]);

  useEffect(() => { if (persona) loadDashboard(persona); }, [persona, selectedTenantId, loadDashboard]);

  const loadBrief = useCallback(async () => {
    if (requiresTenantSelection && !selectedTenantId) return;
    setBriefLoading(true);
    try {
      const res = await callApi(`/api/exec/ceo/brief${tenantQS()}`, null, { method: 'GET' });
      setBrief(res);
    } catch {
      setBrief(null);
    } finally {
      setBriefLoading(false);
    }
  }, [requiresTenantSelection, selectedTenantId, tenantQS]);

  useEffect(() => { if (persona === 'ceo') loadBrief(); }, [persona, selectedTenantId, loadBrief]);

  const refreshBrief = async () => {
    setBriefRefreshing(true);
    try {
      const res = await callApi(`/api/exec/ceo/brief/refresh${tenantQS()}`, {}, { method: 'POST' });
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-najdi-900 flex items-center justify-center">
            <Crown className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink">{t('executiveCommandCenter')}</h1>
            <p className="text-sm text-muted-foreground">{t('executive')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ExportMenu targetRef={dashboardRef} filename="executive-command-center" />
          {requiresTenantSelection && (
            <>
              <span className="text-sm text-muted-foreground">{isRTL ? 'المدرسة' : 'School'}</span>
              <Select value={selectedTenantId || undefined} onValueChange={setSelectedTenantId} disabled={tenantsLoading || tenants.length === 0}>
                <SelectTrigger className="w-56">
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
          {showSwitcher && (
            <>
              <span className="text-sm text-muted-foreground">{t('switchPersona')}</span>
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
            </>
          )}
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

function MiniSparkline({ data, color, height = 40 }) {
  if (!data || data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} fill={`url(#spark-${color.replace('#', '')})`} strokeWidth={1.5} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function KPICard({ title, value, delta, sparkData, color, isRTL }) {
  const deltaColor = delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground';
  const deltaIcon = delta > 0 ? '▲' : delta < 0 ? '▼' : '';

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{title}</p>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xl font-bold text-ink">{value}</p>
            {delta !== undefined && delta !== null && (
              <span className={`text-xs font-medium ${deltaColor}`}>
                {deltaIcon} {Math.abs(delta).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="w-24 flex-shrink-0">
            <MiniSparkline data={sparkData} color={color || COLORS.najdi} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CEODashboard({ data, brief, briefLoading, briefRefreshing, onRefreshBrief, isRTL, t }) {
  const { vitality, financials, collections, campus_vitality = [], strategic_alerts = [], revenue_trend = [], collection_trend = [] } = data;

  const collectionRate = collections?.collection_rate_pct;
  const isCollectionCritical = collectionRate !== undefined && collectionRate !== null && collectionRate === 0;

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

      {/* 2. KPI Strip — Revenue, EBITDA, Collection Rate with sparklines */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          title={isRTL ? 'الإيرادات' : 'Revenue'}
          value={fmtSAR(financials?.revenue, isRTL)}
          delta={financials?.revenue_delta_pct}
          sparkData={revenue_trend?.map((v, i) => ({ name: i, value: v.revenue || v }))}
          color={COLORS.najdi}
          isRTL={isRTL}
        />
        <KPICard
          title={isRTL ? 'الأرباح قبل الفوائد والضرائب والإهلاك' : 'EBITDA'}
          value={fmtSAR(financials?.ebitda, isRTL)}
          delta={financials?.ebitda_delta_pct}
          sparkData={revenue_trend?.map((v, i) => ({ name: i, value: v.ebitda || 0 }))}
          color={COLORS.green}
          isRTL={isRTL}
        />
        <KPICard
          title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'}
          value={isCollectionCritical
            ? <span className="text-red-500 font-bold">{fmtPct(0)}</span>
            : fmtPct(collectionRate)
          }
          delta={collections?.collection_delta_pct}
          sparkData={collection_trend?.map((v, i) => ({ name: i, value: v.rate || v }))}
          color={isCollectionCritical ? COLORS.red : COLORS.gold}
          isRTL={isRTL}
        />
      </div>

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
            {(!revenue_trend || revenue_trend.length === 0) ? <EmptyState isRTL={isRTL} /> : (
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
            {(!collection_trend || collection_trend.length === 0) ? <EmptyState isRTL={isRTL} /> : (
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

      {/* 4. Branch Vitality — ranked bars */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            {isRTL ? 'حيوية الفروع' : 'Branch Vitality'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campus_vitality.length === 0 ? <EmptyState isRTL={isRTL} /> : (
            <div className="space-y-3">
              {[...campus_vitality].sort((a, b) => (b.score || 0) - (a.score || 0)).map((c) => {
                const barColor = c.score >= 70 ? COLORS.green : c.score >= 40 ? COLORS.amber : COLORS.red;
                const collColor = (c.collection_rate || 0) === 0 ? 'text-red-600 font-bold' : 'text-muted-foreground';
                return (
                  <div key={c.branch_id} className="flex items-center gap-4">
                    <span className="w-32 text-sm text-ink truncate">{isRTL ? c.name_ar : c.name_en}</span>
                    <div className="flex-1 h-6 bg-sand-alt rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(c.score || 0, 100)}%`, background: barColor }}
                      />
                    </div>
                    <span className="w-10 text-sm font-semibold text-ink text-center">{c.score ?? '—'}</span>
                    <span className={`w-16 text-xs text-center ${collColor}`}>
                      {fmtPct(c.collection_rate)}
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
        <StatCard title={t('revenue')} value={fmtSAR(kpis.revenue, isRTL)} icon={DollarSign} iconClassName="bg-najdi-50" />
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
                <Bar dataKey="value" fill={COLORS.najdi} radius={[4, 4, 0, 0]} />
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
                  <Line type="monotone" dataKey="revenue" stroke={COLORS.najdi} strokeWidth={2} dot={false} />
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
            <TrafficLight label="ZATCA / VAT" signal={compliance_traffic_lights.zatca_vat} />
            <TrafficLight label="WPS / Mudad" signal={compliance_traffic_lights.wps_mudad} />
            <TrafficLight label="GOSI" signal={compliance_traffic_lights.gosi} />
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
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 font-medium">{isRTL ? 'الفرع' : 'Campus'}</th>
                    <th className="py-2 font-medium">{isRTL ? 'المبلغ المتأخر' : 'Overdue Amount'}</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue_by_campus.map((c) => (
                    <tr key={c.branch_id} className="border-b border-sand">
                      <td className="py-2 text-ink">{isRTL ? c.name_ar : c.name_en}</td>
                      <td className="py-2 text-ink">{fmtSAR(c.overdue_amount, isRTL)}</td>
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
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center"><p className="text-xs text-muted-foreground">{t('revenue')}</p><p className="font-semibold">{fmtSAR(simRevenue, isRTL)}</p></div>
            <div className="text-center"><p className="text-xs text-muted-foreground">{isRTL ? 'المصروفات' : 'Expenses'}</p><p className="font-semibold">{fmtSAR(simExpenses, isRTL)}</p></div>
            <div className="text-center"><p className="text-xs text-muted-foreground">{t('ebitda')}</p><p className="font-semibold">{fmtSAR(simEbitda, isRTL)}</p></div>
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
        <StatCard title={t('capacityUtilization')} value={fmtPct(kpis.capacity_utilization_pct)} icon={Building2} iconClassName="bg-najdi-50" />
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
                      <td className="py-2 text-ink">{fmtSAR(c.cash_collected, isRTL)}</td>
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

  const bandColor = { platinum: 'text-purple-600 border-purple-200', green: 'text-emerald-600 border-emerald-200', yellow: 'text-amber-600 border-amber-200', red: 'text-red-600 border-red-200' }[nitaqat.band] || 'text-muted-foreground border-border';

  const genderData = workforce_composition.by_gender
    ? Object.entries(workforce_composition.by_gender).map(([k, v]) => ({ name: k, value: v }))
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={t('headcount')} value={fmtNumber(kpis.headcount, isRTL)} icon={Users} iconClassName="bg-najdi-50" />
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
            <p className="text-xs text-muted-foreground mt-3">
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
                  <Bar dataKey="count" fill={COLORS.najdi} radius={[4, 4, 0, 0]} />
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
            <TrafficLight label="WPS / Mudad" signal={payroll_gov_compliance.wps_mudad} />
            <TrafficLight label="GOSI" signal={payroll_gov_compliance.gosi} />
            <TrafficLight label="Qiwa" signal={payroll_gov_compliance.qiwa} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title={t('openRoles')}
          value={fmtNumber(open_roles.count, isRTL)}
          subtitle={<DataQualityNote quality={open_roles.count_data_quality} isRTL={isRTL} />}
          icon={Building2}
          iconClassName="bg-najdi-50"
        />
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
