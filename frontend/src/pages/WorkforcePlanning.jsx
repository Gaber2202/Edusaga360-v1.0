import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { extractAiText } from '../components/yamen/yamenUtils';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import Currency from '../components/Currency';
import { getCurrencySymbol, formatCurrency } from '../lib/localization';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Skeleton } from '../components/ui/skeleton';
import PageHeader from '../components/ui/PageHeader';
import ChartState from '../components/ui/ChartState';
import CircularProgress from '../components/ui/circular-progress';
import DashboardKPICard from '../components/dashboard/DashboardKPICard';
import JurisdictionFeatureGate from '../components/JurisdictionFeatureGate';
import { PAGE_FEATURE_KEYS } from '../lib/jurisdictionFeatures.js';
import { cumulativeSeries, countSince } from '../lib/dashboardMetrics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Bot, Loader2, Users, DollarSign, TrendingUp, Briefcase, Sparkles, Target, Wallet } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';
import ExecScenarioSlider from '../components/exec/ExecScenarioSlider';
import { cn } from '../lib/utils';

const CHART = { najdi: '#0E6B4F', green: '#16A077', gold: '#C8A451', ink: '#1C2420' };

const NITAQAT_BANDS = [
  { name: 'Platinum', nameAr: 'بلاتيني', min: 40, color: '#6366f1' },
  { name: 'Green High', nameAr: 'أخضر عالي', min: 35, color: '#10b981' },
  { name: 'Green Medium', nameAr: 'أخضر متوسط', min: 30, color: '#34d399' },
  { name: 'Green Low', nameAr: 'أخضر منخفض', min: 25, color: '#6ee7b7' },
  { name: 'Yellow', nameAr: 'أصفر', min: 15, color: '#f59e0b' },
  { name: 'Red', nameAr: 'أحمر', min: 0, color: '#ef4444' },
];

const SAUDIZATION_TARGET = 50;

function nitaqatBand(pct) {
  return NITAQAT_BANDS.find((b) => pct >= b.min) || NITAQAT_BANDS[NITAQAT_BANDS.length - 1];
}

function empSalary(e) {
  return Number(e.total_salary || e.salary || e.basic_salary || 0);
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-ink mb-0.5">{label}</p>
      <p className="text-muted-foreground tabular-nums">{payload[0].value}</p>
    </div>
  );
}

function TypeRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {count} <span className="text-[11px]">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-sand overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function PayrollRow({ label, children }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-ink tabular-nums">{children}</span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export default function WorkforcePlanning() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [activeTab, setActiveTab] = useState('overview');
  const [aiInsight, setAiInsight] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [hiringScenario, setHiringScenario] = useState({ count: 5, avg_salary: 8000, months: 6 });
  const salarySeeded = useRef(false);

  const {
    data: employees = [],
    isLoading: employeesLoading,
    isError: employeesError,
    refetch: refetchEmployees,
  } = useQuery({
    queryKey: ['employees', tenantId, 'workforce'],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at, basic_salary, total_salary, salary').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: departments = [], isLoading: deptsLoading } = useQuery({
    queryKey: ['departments', tenantId],
    queryFn: () => fetchData(tenantQuery('departments').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: recruitments = [] } = useQuery({
    enabled: false,
    queryKey: ['recruitments', tenantId],
    queryFn: () => fetchData(tenantQuery('recruitments').select('*').match(tenantFilter())),
    initialData: [],
  });

  const metrics = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active');
    const totalPayroll = active.reduce((sum, e) => sum + empSalary(e), 0);
    const avgSalary = active.length > 0 ? Math.round(totalPayroll / active.length) : 0;
    const openVacancies = recruitments
      .filter((r) => r.status === 'approved' || r.status === 'open')
      .reduce((sum, r) => sum + (r.number_of_positions || 1), 0);
    const saudiCount = active.filter((e) => e.is_saudi).length;
    const nonSaudiCount = active.length - saudiCount;
    const saudizationRate = active.length > 0 ? Math.round((saudiCount / active.length) * 100) : 0;
    const hired90 = countSince(active, 90, 'hire_date');
    const headcount = cumulativeSeries(active, 'hire_date');

    const deptData = departments
      .map((d) => ({
        name: isRTL ? (d.name_ar || d.name_en) : (d.name_en || d.name_ar),
        count: employees.filter((e) => e.department_id === d.id && e.status === 'active').length,
      }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);

    const typeData = [
      { key: 'full_time', name: isRTL ? 'دوام كامل' : 'Full Time', color: CHART.najdi },
      { key: 'part_time', name: isRTL ? 'دوام جزئي' : 'Part Time', color: CHART.gold },
      { key: 'contract', name: isRTL ? 'عقد' : 'Contract', color: CHART.green },
    ].map((t) => ({
      ...t,
      count: active.filter((e) => e.employment_type === t.key).length,
    }));

    return {
      active,
      totalPayroll,
      avgSalary,
      openVacancies,
      saudiCount,
      nonSaudiCount,
      saudizationRate,
      hired90,
      headcount,
      deptData,
      typeData,
      band: nitaqatBand(saudizationRate),
    };
  }, [employees, departments, recruitments, isRTL]);

  useEffect(() => {
    if (!salarySeeded.current && metrics.avgSalary > 0) {
      salarySeeded.current = true;
      setHiringScenario((p) => ({ ...p, avg_salary: metrics.avgSalary }));
    }
  }, [metrics.avgSalary]);

  const simulatedCost = hiringScenario.count * hiringScenario.avg_salary * hiringScenario.months;
  const newPayroll = metrics.totalPayroll + hiringScenario.count * hiringScenario.avg_salary;
  const increasePct = metrics.totalPayroll > 0
    ? Math.round(((newPayroll - metrics.totalPayroll) / metrics.totalPayroll) * 100)
    : 0;
  const currentShare = newPayroll > 0 ? Math.round((metrics.totalPayroll / newPayroll) * 100) : 100;
  const salaryMax = Math.max(20000, Math.ceil((metrics.avgSalary || 8000) / 1000) * 2000);
  const deptChartHeight = Math.max(240, Math.min(420, metrics.deptData.length * 36 + 40));
  const saudizationHealthy = metrics.saudizationRate >= SAUDIZATION_TARGET;
  const ringColor = saudizationHealthy ? 'stroke-emerald-400' : metrics.saudizationRate >= 30 ? 'stroke-amber-400' : 'stroke-red-400';
  const ringTrack = saudizationHealthy ? 'stroke-white/15' : 'stroke-white/20';

  const handleAI = async () => {
    setLoadingAI(true);
    setAiInsight('');
    const prompt = `You are Yamen AI, an HR workforce planning advisor for a Saudi school.
    Current workforce data:
    - Total active employees: ${metrics.active.length}
    - Total monthly payroll: ${formatCurrency(metrics.totalPayroll, tenant?.localization, isRTL)}
    - Average salary: ${formatCurrency(metrics.avgSalary, tenant?.localization, isRTL)}
    - Saudization rate: ${metrics.saudizationRate}%
    - Open vacancies: ${metrics.openVacancies}
    - Department breakdown: ${JSON.stringify(metrics.deptData)}
    - Employment types: ${JSON.stringify(metrics.typeData.map(({ name, count }) => ({ name, count })))}
    
    Provide strategic workforce planning recommendations including:
    1. Saudization risk assessment vs Vision 2030 targets
    2. Payroll sustainability analysis
    3. Hiring prioritization recommendations
    4. Risk indicators
    
    Respond in both Arabic and English. If data is insufficient, clearly state what's missing.`;
    try {
      const res = await callApi('/api/ai/invoke-llm', { prompt, source: 'hr' });
      setAiInsight(extractAiText(res));
    } catch {
      setAiInsight(isRTL ? 'تعذّر توليد التقرير. حاول مرة أخرى.' : 'Could not generate the report. Please try again.');
    } finally {
      setLoadingAI(false);
    }
  };

  if (employeesLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'تخطيط القوى العاملة' : 'Workforce Planning'}
        subtitle={isRTL ? 'تحليل الهيكل الوظيفي وتوقعات التوظيف' : 'Workforce structure analysis & hiring forecasts'}
      >
        <Button variant="outline" className="gap-2" onClick={() => setActiveTab('ai')}>
          <Sparkles className="w-4 h-4 text-purple-600" />
          Yamen AI
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardKPICard
          id="wf-headcount"
          title={isRTL ? 'إجمالي الموظفين' : 'Total Employees'}
          value={metrics.active.length}
          sub={metrics.hired90 > 0
            ? (isRTL ? `${metrics.hired90} تعيين خلال 90 يوماً` : `${metrics.hired90} hired in 90 days`)
            : (isRTL ? 'الموظفون النشطون' : 'Active headcount')}
          icon={Users}
          color="blue"
          href={createPageUrl('Employees')}
          series={metrics.headcount.series}
          trend={metrics.headcount.trend}
          animDelay={0}
        />
        <DashboardKPICard
          id="wf-payroll"
          title={isRTL ? 'الرواتب الشهرية' : 'Monthly Payroll'}
          value={<Currency amount={metrics.totalPayroll} />}
          sub={isRTL ? `متوسط ${formatCurrency(metrics.avgSalary, tenant?.localization, isRTL)}` : `Avg ${formatCurrency(metrics.avgSalary, tenant?.localization, isRTL)}`}
          icon={DollarSign}
          color="emerald"
          animDelay={60}
        />
        <DashboardKPICard
          id="wf-saudization"
          title={isRTL ? 'نسبة السعودة' : 'Saudization'}
          value={`${metrics.saudizationRate}%`}
          sub={isRTL
            ? `${metrics.saudiCount} سعودي · الهدف ${SAUDIZATION_TARGET}%`
            : `${metrics.saudiCount} Saudi · target ${SAUDIZATION_TARGET}%`}
          icon={TrendingUp}
          color={saudizationHealthy ? 'emerald' : metrics.saudizationRate >= 30 ? 'amber' : 'red'}
          alert={!saudizationHealthy}
          animDelay={120}
        />
        <DashboardKPICard
          id="wf-vacancies"
          title={isRTL ? 'وظائف شاغرة' : 'Open Vacancies'}
          value={metrics.openVacancies}
          sub={isRTL ? 'طلبات التوظيف المعتمدة' : 'Approved requisitions'}
          icon={Briefcase}
          color="purple"
          href={createPageUrl('RecruitmentPage')}
          animDelay={180}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-border/60 h-10">
          <TabsTrigger value="overview" className="gap-1.5">{isRTL ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="simulation" className="gap-1.5">
            <Target className="w-3.5 h-3.5" />
            {isRTL ? 'محاكاة التوظيف' : 'Hiring Simulation'}
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Bot className="w-3.5 h-3.5" />
            Yamen AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{isRTL ? 'توزيع الموظفين حسب القسم' : 'Employees by Department'}</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartState
                  loading={deptsLoading}
                  error={employeesError}
                  onRetry={refetchEmployees}
                  isEmpty={!metrics.deptData.length}
                  height={deptChartHeight}
                  emptyMessage={isRTL ? 'لا توجد أقسام بموظفين نشطين' : 'No departments with active staff yet'}
                >
                  <ResponsiveContainer width="100%" height={deptChartHeight}>
                    <BarChart data={metrics.deptData} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e4d8" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={isRTL ? 96 : 110} tick={{ fontSize: 12, fill: CHART.ink }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(14,107,79,0.06)' }} />
                      <Bar dataKey="count" fill={CHART.najdi} radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartState>
              </CardContent>
            </Card>

            <JurisdictionFeatureGate
              featureKeys={PAGE_FEATURE_KEYS.SaudizationTracker}
              fallback={
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{isRTL ? 'ملخص الرواتب' : 'Payroll Summary'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PayrollSummary metrics={metrics} isRTL={isRTL} />
                  </CardContent>
                </Card>
              }
            >
              <div className="relative overflow-hidden rounded-xl border border-najdi-900/20 bg-najdi-900 text-white shadow-sm p-6 flex flex-col min-h-[280px]">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/20 pointer-events-none" />
                <div className="relative flex items-start justify-between gap-2 mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-1">
                      {isRTL ? 'الهدف الأساسي' : 'Primary Goal'}
                    </p>
                    <h3 className="text-lg font-semibold tracking-tight">{isRTL ? 'السعودة' : 'Saudization'}</h3>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-white/20 text-white bg-white/5 text-[10px]"
                    style={{ borderColor: `${metrics.band.color}66`, color: metrics.band.color }}
                  >
                    {isRTL ? metrics.band.nameAr : metrics.band.name}
                  </Badge>
                </div>
                <div className="relative flex-1 flex items-center justify-center py-2">
                  <CircularProgress
                    value={metrics.saudizationRate}
                    size={148}
                    circleStrokeWidth={12}
                    progressStrokeWidth={12}
                    className={ringTrack}
                    progressClassName={ringColor}
                    labelClassName="text-3xl font-semibold text-white"
                    renderLabel={(v) => `${Math.round(v)}%`}
                  />
                </div>
                <div className="relative mt-4 space-y-3">
                  <div className="flex justify-between items-end">
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{metrics.saudizationRate}%</span>
                    <span className="text-xs text-white/60 mb-1">
                      {isRTL ? `الهدف: ${SAUDIZATION_TARGET}%` : `Target: ${SAUDIZATION_TARGET}%`}
                    </span>
                  </div>
                  <Progress value={metrics.saudizationRate} className="h-1.5 bg-white/15 [&>div]:!bg-white" />
                  <div className="flex items-center justify-between text-xs text-white/70 pt-1">
                    <span>{isRTL ? `${metrics.saudiCount} سعودي` : `${metrics.saudiCount} Saudi`}</span>
                    <span>{isRTL ? `${metrics.nonSaudiCount} غير سعودي` : `${metrics.nonSaudiCount} Non-Saudi`}</span>
                  </div>
                </div>
              </div>
            </JurisdictionFeatureGate>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{isRTL ? 'نوع التوظيف' : 'Employment Type'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 pt-2">
                {metrics.active.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {isRTL ? 'لا توجد بيانات موظفين بعد' : 'No employee data yet'}
                  </p>
                ) : (
                  metrics.typeData.map((t) => (
                    <TypeRow key={t.key} label={t.name} count={t.count} total={metrics.active.length} color={t.color} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{isRTL ? 'ملخص الرواتب' : 'Payroll Summary'}</CardTitle>
              </CardHeader>
              <CardContent>
                <PayrollSummary metrics={metrics} isRTL={isRTL} showSaudization />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="simulation" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-2 border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{isRTL ? 'سيناريو التوظيف' : 'Hiring Scenario'}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {isRTL ? 'حرّك المنزلقات لمعاينة أثر الرواتب فوراً' : 'Drag the sliders to preview payroll impact live'}
                </p>
              </CardHeader>
              <CardContent className="space-y-8 pt-4">
                <ExecScenarioSlider
                  label={isRTL ? 'عدد الموظفين الجدد' : 'New Hires'}
                  value={hiringScenario.count}
                  min={1}
                  max={30}
                  step={1}
                  onChange={(count) => setHiringScenario((p) => ({ ...p, count }))}
                />
                <ExecScenarioSlider
                  label={isRTL ? 'متوسط الراتب' : 'Avg Salary'}
                  value={hiringScenario.avg_salary}
                  min={1000}
                  max={salaryMax}
                  step={500}
                  suffix={getCurrencySymbol(tenant?.localization, isRTL)}
                  onChange={(avg_salary) => setHiringScenario((p) => ({ ...p, avg_salary }))}
                />
                <ExecScenarioSlider
                  label={isRTL ? 'عدد الأشهر' : 'Months'}
                  value={hiringScenario.months}
                  min={1}
                  max={24}
                  step={1}
                  suffix={isRTL ? 'شهر' : 'mo'}
                  onChange={(months) => setHiringScenario((p) => ({ ...p, months }))}
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-3 border-border/60 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{isRTL ? 'أثر الرواتب' : 'Payroll Impact'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <ImpactTile
                    icon={Wallet}
                    label={isRTL ? 'التكلفة الإجمالية' : 'Total Cost'}
                    value={<Currency amount={simulatedCost} />}
                    hint={isRTL ? `${hiringScenario.months} أشهر` : `${hiringScenario.months} months`}
                    tone="najdi"
                  />
                  <ImpactTile
                    icon={DollarSign}
                    label={isRTL ? 'الرواتب الجديدة' : 'New Monthly Payroll'}
                    value={<Currency amount={newPayroll} />}
                    hint={isRTL ? 'شهرياً' : 'Monthly'}
                    tone="green"
                  />
                  <ImpactTile
                    icon={TrendingUp}
                    label={isRTL ? 'الزيادة' : 'Increase'}
                    value={`${increasePct}%`}
                    hint={<Currency amount={hiringScenario.count * hiringScenario.avg_salary} />}
                    tone="gold"
                  />
                  <ImpactTile
                    icon={Users}
                    label={isRTL ? 'إجمالي الموظفين' : 'Total Headcount'}
                    value={metrics.active.length + hiringScenario.count}
                    hint={isRTL ? `+${hiringScenario.count}` : `+${hiringScenario.count}`}
                    tone="slate"
                  />
                </div>

                <div className="rounded-xl bg-sand p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-muted-foreground">{isRTL ? 'الحالي مقابل الزيادة' : 'Current vs added'}</span>
                    <span className="tabular-nums text-ink">{currentShare}% / {100 - currentShare}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white overflow-hidden flex">
                    <div className="h-full bg-najdi-700 transition-all duration-500" style={{ width: `${currentShare}%` }} />
                    <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${100 - currentShare}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-najdi-700" />
                      {isRTL ? 'الرواتب الحالية' : 'Current payroll'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      {isRTL ? 'التوظيف الجديد' : 'New hires'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-purple-50 via-white to-white px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 border-b border-purple-100/80">
              <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-ink">Yamen AI — {isRTL ? 'تخطيط القوى العاملة' : 'Workforce Strategy'}</h3>
                <p className="text-sm text-muted-foreground">
                  {isRTL ? 'توصيات استراتيجية مبنية على البيانات الفعلية' : 'Data-driven strategic recommendations'}
                </p>
              </div>
              <Button onClick={handleAI} disabled={loadingAI} className="gap-2 bg-purple-600 hover:bg-purple-700 flex-shrink-0">
                {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isRTL ? 'توليد تقرير استراتيجي' : 'Generate Strategic Report'}
              </Button>
            </div>
            <CardContent className="p-6">
              {loadingAI && (
                <div className="space-y-3" aria-busy="true">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              )}
              {!loadingAI && !aiInsight && (
                <div className="py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-purple-500" />
                  </div>
                  <p className="text-sm font-medium text-ink mb-1">
                    {isRTL ? 'لم يُنشأ تقرير بعد' : 'No report generated yet'}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {isRTL
                      ? 'يحلل يامن بيانات الموظفين والرواتب والسعودة ويقترح أولويات التوظيف.'
                      : 'Yamen will read headcount, payroll, and Saudization, then suggest hiring priorities.'}
                  </p>
                </div>
              )}
              {!loadingAI && aiInsight && (
                <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-5 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {aiInsight}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PayrollSummary({ metrics, isRTL, showSaudization = false }) {
  const saudizationHealthy = metrics.saudizationRate >= SAUDIZATION_TARGET;
  return (
    <div>
      <PayrollRow label={isRTL ? 'إجمالي شهري' : 'Monthly Total'}><Currency amount={metrics.totalPayroll} /></PayrollRow>
      <PayrollRow label={isRTL ? 'متوسط الراتب' : 'Avg Salary'}><Currency amount={metrics.avgSalary} /></PayrollRow>
      <PayrollRow label={isRTL ? 'سنوي تقديري' : 'Annual Estimate'}><Currency amount={metrics.totalPayroll * 12} /></PayrollRow>
      {showSaudization && (
        <div className="pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{isRTL ? 'نسبة السعودة' : 'Saudization Rate'}</span>
            <span className={cn('font-semibold tabular-nums', saudizationHealthy ? 'text-emerald-600' : 'text-red-600')}>
              {metrics.saudizationRate}%
            </span>
          </div>
          <Progress value={metrics.saudizationRate} className="h-1.5" />
        </div>
      )}
    </div>
  );
}

function ImpactTile({ icon: Icon, label, value, hint, tone }) {
  const tones = {
    najdi: 'bg-najdi-50 text-najdi-900',
    green: 'bg-emerald-50 text-emerald-700',
    gold: 'bg-amber-50 text-amber-800',
    slate: 'bg-sand text-ink',
  };
  const iconTone = tones[tone] || tones.slate;
  return (
    <div className="rounded-xl border border-border/60 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconTone)}>
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="text-xl font-bold text-ink tabular-nums leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
