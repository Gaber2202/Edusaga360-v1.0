/**
 * HR Manager Dashboard — compliance command center (HR Compliance R1)
 * Real-time KPIs; presentation layer uses real tenant data (no fabricated trends).
 * UI patterns adapted from 21st.dev KPI / stats card layouts into EduSaga tokens.
 */
import React, { useMemo, useState } from 'react';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { formatCurrency } from '../lib/localization';
import BenchmarkDashboard from '../components/benchmarks/BenchmarkDashboard';
import { useBranch } from '../components/BranchContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import JurisdictionFeatureGate from '../components/JurisdictionFeatureGate';
import { useJurisdictionFeatures } from '../components/JurisdictionFeatureContext';
import { PAGE_FEATURE_KEYS, NATIONALISATION_FEATURES } from '../lib/jurisdictionFeatures.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Link } from 'react-router-dom';
import { Tooltip, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import {
  Users, AlertTriangle, CheckCircle, Clock, TrendingDown,
  Shield, Calendar, DollarSign,
  Building2, Target, Zap, Star, AlertCircle, RefreshCw,
  UserPlus, FileWarning, Percent, Layers, Wallet,
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import DashboardKPICard from '../components/dashboard/DashboardKPICard';
import ChartState from '../components/ui/ChartState';
import HRDashboardEmptyState from '../components/hr/HRDashboardEmptyState';
import HRDemoTenantBanner from '../components/hr/HRDemoTenantBanner';
import HRDashboardHero from '../components/hr/HRDashboardHero';
import HRPriorityActions from '../components/hr/HRPriorityActions';
import HRWorkforceMix from '../components/hr/HRWorkforceMix';
import {
  activeEmployees,
  nationalityBreakdown,
  countMissingNationality,
  saudizationMetrics,
  documentExpiryBuckets,
  headcountSparkline,
  leaveRequestSparkline,
  payrollSparkline,
  computeEosbProvision,
  turnoverMetrics,
  newHireCount,
  contractsEndingSoon,
  probationEndingSoon,
  salaryMetrics,
  tenureMetrics,
  genderBreakdown,
  employmentTypeBreakdown,
  gosiCoverage,
  dataCompleteness,
  missingIqamaNonSaudi,
  departmentCount,
} from '../lib/hrDashboardMetrics';

const PCT = (v) => (v == null ? '—' : `${v.toFixed(1)}%`);
const EM_DASH = '—';
const YRS = (v, isRTL) => {
  if (v == null) return EM_DASH;
  const n = v.toFixed(1);
  return isRTL ? `${n} سنة` : `${n} yrs`;
};

const NATIONALIZATION_BANDS = [
  { name: 'Platinum', nameAr: 'بلاتيني', min: 40, color: '#6366f1' },
  { name: 'Green High', nameAr: 'أخضر عالي', min: 35, color: '#10b981' },
  { name: 'Green Medium', nameAr: 'أخضر متوسط', min: 30, color: '#34d399' },
  { name: 'Green Low', nameAr: 'أخضر منخفض', min: 25, color: '#6ee7b7' },
  { name: 'Yellow', nameAr: 'أصفر', min: 15, color: '#f59e0b' },
  { name: 'Red', nameAr: 'أحمر', min: 0, color: '#ef4444' },
];

function getNationalizationBand(pct) {
  if (pct == null) return NATIONALIZATION_BANDS[NATIONALIZATION_BANDS.length - 1];
  return NATIONALIZATION_BANDS.find((b) => pct >= b.min) || NATIONALIZATION_BANDS[NATIONALIZATION_BANDS.length - 1];
}

const PIE_COLORS = ['#0E6B4F', '#3b82f6', '#C8A451', '#ef4444', '#8b5cf6', '#06b6d4'];

function SectionLabel({ children }) {
  return (
    <h2 className="text-sm font-semibold text-ink tracking-tight">
      {children}
    </h2>
  );
}

export default function HRManagerDashboard() {
  const { isRTL } = useLanguage();
  const { tenant, isModuleEnabled } = useTenant();
  const fmt = (v) => formatCurrency(v, tenant?.localization, isRTL);
  const { branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const { areAnyEnabled, isFeatureEnabled } = useJurisdictionFeatures();
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const [activeTab, setActiveTab] = useState('overview');
  const today = useMemo(() => new Date(), []);

  const { data: employees = [], isLoading } = useTenantQuery(
    ['employees-hrdash', tenantId],
    // Keep select aligned with Employees.jsx — unknown columns make PostgREST 400 and fetchData returns [].
    () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, license_expiry_date, nationality, gender, employment_type, photo_url, user_id, created_at, basic_salary, total_salary, salary').match(tenantFilter(branchFilter()))),
    { enabled: hasTenantAccess },
  );

  const { data: leaveRequests = [] } = useTenantQuery(
    ['leaves-hrdash', tenantId],
    () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter({ status: 'pending' }))),
    { enabled: hasTenantAccess },
  );

  const { data: recruitments = [] } = useTenantQuery(
    ['recruitment-hrdash', tenantId],
    () => fetchData(tenantQuery('recruitments').select('*').match(tenantFilter())),
    { enabled: false, initialData: [] },
  );

  const { data: payRuns = [] } = useTenantQuery(
    ['payruns-hrdash', tenantId],
    () => fetchData(tenantQuery('pay_runs').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(12)),
    { enabled: hasTenantAccess && isModuleEnabled('payroll') },
  );

  const kpis = useMemo(() => {
    const active = activeEmployees(employees);
    const { saudis, pct: saudizationPct } = saudizationMetrics(active);
    const nationalizationBand = getNationalizationBand(saudizationPct);

    const onProbation = active.filter((e) => {
      if (!e.hire_date) return false;
      return addDays(new Date(e.hire_date), 90) > today;
    });

    const { terminated, rate: turnoverRate } = turnoverMetrics(employees, today);
    const { expired, in30, in60 } = documentExpiryBuckets(active, today);

    const openVacancies = recruitments.filter((r) => r.status === 'open').length;
    const lastPayRun = payRuns[0];
    const hasPayrollRuns = payRuns.length > 0;
    const wpsCompliant = hasPayrollRuns && (lastPayRun?.status === 'paid' || lastPayRun?.status === 'completed');

    const totalPayroll = active.reduce((s, e) => s + (e.total_salary || e.salary || 0), 0);
    const hasSalaryData = totalPayroll > 0;
    const totalEOSB = computeEosbProvision(active, today);
    const salary = salaryMetrics(active);
    const tenure = tenureMetrics(active, today);
    const gender = genderBreakdown(active);
    const employmentTypes = employmentTypeBreakdown(active);
    const gosi = gosiCoverage(active);
    const completeness = dataCompleteness(active);

    return {
      totalActive: active.length,
      saudis,
      saudizationPct,
      nationalizationBand,
      onProbation: onProbation.length,
      probationEndingSoon: probationEndingSoon(active, 14, today),
      terminated,
      turnoverRate,
      openVacancies,
      docsExpiredCount: expired,
      docsIn30Count: in30,
      docsIn60Count: in60,
      pendingLeaves: leaveRequests.length,
      wpsCompliant,
      hasPayrollRuns,
      lastPayRunPeriod: lastPayRun?.period,
      totalPayroll,
      hasSalaryData,
      totalEOSB,
      natPie: nationalityBreakdown(active, { excludeUnknown: true }),
      missingNat: countMissingNationality(active),
      headcountSeries: headcountSparkline(employees),
      leaveSeries: leaveRequestSparkline(leaveRequests),
      payrollSeries: payrollSparkline(payRuns),
      newHires30: newHireCount(active, 30, today),
      newHires90: newHireCount(active, 90, today),
      contractsEnding60: contractsEndingSoon(active, 60, today),
      salary,
      tenure,
      gender,
      employmentTypes,
      gosi,
      completeness,
      missingIqama: missingIqamaNonSaudi(active),
      departments: departmentCount(active),
    };
  }, [employees, leaveRequests, recruitments, payRuns, today]);

  const priorityItems = useMemo(() => {
    const items = [];
    if (kpis.docsExpiredCount > 0) {
      items.push({
        id: 'docs-expired',
        tone: 'danger',
        icon: AlertTriangle,
        title: isRTL
          ? `${kpis.docsExpiredCount} وثائق منتهية — إجراء فوري`
          : `${kpis.docsExpiredCount} expired document(s) — act now`,
        subtitle: isRTL ? 'افتح سجل الحوكمة للتجديد' : 'Open Government Relations to renew',
        href: '/GovernmentRelations',
      });
    }
    if (nationalisationEnabled && ['Yellow', 'Red'].includes(kpis.nationalizationBand.name)) {
      items.push({
        id: 'nat-band',
        tone: 'warn',
        icon: Target,
        title: isRTL
          ? `التوطين: ${kpis.nationalizationBand.nameAr} (${PCT(kpis.saudizationPct)})`
          : `Nationalization: ${kpis.nationalizationBand.name} (${PCT(kpis.saudizationPct)})`,
        subtitle: isRTL ? 'راجع خطة التوظيف الوطنية' : 'Review national hiring plan',
        href: '/Employees',
      });
    }
    if (kpis.docsIn30Count > 0) {
      items.push({
        id: 'docs-30',
        tone: 'warn',
        icon: FileWarning,
        title: isRTL
          ? `${kpis.docsIn30Count} وثيقة تنتهي خلال 30 يوماً`
          : `${kpis.docsIn30Count} document(s) expiring in 30 days`,
        href: '/GovernmentRelations',
      });
    }
    if (kpis.missingIqama > 0) {
      items.push({
        id: 'iqama-gap',
        tone: 'warn',
        icon: Shield,
        title: isRTL
          ? `${kpis.missingIqama} غير مواطن بلا تاريخ إقامة`
          : `${kpis.missingIqama} non-national(s) missing iqama expiry`,
        href: '/Employees',
      });
    }
    if (kpis.contractsEnding60 > 0) {
      items.push({
        id: 'contracts',
        tone: 'info',
        icon: Clock,
        title: isRTL
          ? `${kpis.contractsEnding60} عقد ينتهي خلال 60 يوماً`
          : `${kpis.contractsEnding60} contract(s) ending in 60 days`,
        href: '/Employees',
      });
    }
    if (kpis.pendingLeaves > 0) {
      items.push({
        id: 'leaves',
        tone: 'info',
        icon: Calendar,
        title: isRTL
          ? `${kpis.pendingLeaves} طلب إجازة بانتظار الموافقة`
          : `${kpis.pendingLeaves} leave request(s) awaiting approval`,
        href: '/Leaves',
      });
    }
    if (kpis.missingNat > 0) {
      items.push({
        id: 'nat-data',
        tone: 'muted',
        icon: AlertCircle,
        title: isRTL
          ? `${kpis.missingNat} موظف بلا جنسية مسجلة`
          : `${kpis.missingNat} employee(s) missing nationality`,
        href: '/Employees',
      });
    }
    if (kpis.completeness.pct != null && kpis.completeness.pct < 70) {
      items.push({
        id: 'completeness',
        tone: 'muted',
        icon: Layers,
        title: isRTL
          ? `اكتمال السجلات ${PCT(kpis.completeness.pct)} — أكمل الراتب وتاريخ التعيين`
          : `Record completeness ${PCT(kpis.completeness.pct)} — finish salary & hire dates`,
        href: '/Employees',
      });
    }
    return items.slice(0, 6);
  }, [kpis, isRTL, nationalisationEnabled]);

  const heroSnapshot = useMemo(() => ([
    {
      label: isRTL ? 'نشطون' : 'Active',
      value: kpis.totalActive.toLocaleString(),
      hint: isRTL ? `${kpis.departments} قسم` : `${kpis.departments} depts`,
    },
    {
      label: isRTL ? 'تعيينات 30ي' : 'Hires 30d',
      value: kpis.newHires30.toLocaleString(),
      hint: isRTL ? `${kpis.newHires90} خلال 90 يوماً` : `${kpis.newHires90} in 90d`,
    },
    {
      label: isRTL ? 'اكتمال البيانات' : 'Data quality',
      value: PCT(kpis.completeness.pct),
      hint: isRTL
        ? `${kpis.completeness.complete} سجل مكتمل`
        : `${kpis.completeness.complete} complete`,
    },
    {
      label: nationalisationEnabled
        ? (isRTL ? 'التوطين' : 'Nationalization')
        : (isRTL ? 'الدوران' : 'Turnover'),
      value: nationalisationEnabled ? PCT(kpis.saudizationPct) : PCT(kpis.turnoverRate),
      hint: nationalisationEnabled
        ? (isRTL ? kpis.nationalizationBand.nameAr : kpis.nationalizationBand.name)
        : (kpis.terminated > 0 ? `${kpis.terminated} left` : (isRTL ? 'مستقر' : 'Stable')),
    },
  ]), [kpis, isRTL, nationalisationEnabled]);

  const exportMHRSDReport = () => {
    const active = activeEmployees(employees);
    const rows = [
      ['Employee ID', 'Name AR', 'Name EN', 'Nationality', 'Is Saudi', 'Job Title', 'Department', 'Hire Date', 'Iqama Expiry', 'Status'],
      ...active.map((e) => [
        e.employee_id, e.name_ar, e.name_en || '', e.nationality || '',
        e.is_saudi ? 'YES' : 'NO', e.job_title || '', e.department_id || '',
        e.hire_date || '', e.iqama_expiry || '', e.status,
      ]),
    ];
    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `MHRSD_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmptyTenant = kpis.totalActive === 0;

  return (
    <div className="w-full max-w-none space-y-5 pb-6">
      <HRDemoTenantBanner isRTL={isRTL} tenant={tenant} />

      <HRDashboardHero
        isRTL={isRTL}
        tenant={tenant}
        snapshot={isEmptyTenant ? [] : heroSnapshot}
        onExport={exportMHRSDReport}
        exportDisabled={isEmptyTenant}
      />

      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'overview', label: isRTL ? 'نظرة عامة' : 'Overview' },
          { key: 'benchmarks', label: isRTL ? 'المعايير المرجعية' : 'Benchmarks' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-najdi-900 text-najdi-900' : 'border-transparent text-muted-foreground hover:text-ink'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'benchmarks' && <BenchmarkDashboard />}

      {activeTab !== 'benchmarks' && (
        <>
          {isEmptyTenant ? (
            <HRDashboardEmptyState isRTL={isRTL} />
          ) : (
            <>
              <HRPriorityActions isRTL={isRTL} items={priorityItems} />

              <section className="space-y-3">
                <SectionLabel>{isRTL ? 'نبض القوى العاملة' : 'Workforce pulse'}</SectionLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <DashboardKPICard
                    id="hr-headcount"
                    title={isRTL ? 'إجمالي الموظفين' : 'Total Employees'}
                    value={kpis.totalActive}
                    sub={isRTL ? `${kpis.departments} قسم` : `${kpis.departments} departments`}
                    icon={Users}
                    color="blue"
                    href="/Employees"
                    series={kpis.headcountSeries.series}
                    trend={kpis.headcountSeries.trend}
                    animDelay={0}
                  />
                  <DashboardKPICard
                    id="hr-hires-30"
                    title={isRTL ? 'تعيينات (30 يوم)' : 'New Hires (30d)'}
                    value={kpis.newHires30}
                    sub={isRTL ? `${kpis.newHires90} خلال 90 يوماً` : `${kpis.newHires90} in 90 days`}
                    icon={UserPlus}
                    color="teal"
                    href="/Employees"
                    animDelay={40}
                  />
                  {nationalisationEnabled && (
                    <DashboardKPICard
                      id="hr-nationalization"
                      title={isRTL ? 'نسبة التوطين' : 'Nationalization Rate'}
                      value={PCT(kpis.saudizationPct)}
                      sub={`${kpis.saudis} ${isRTL ? 'مواطن' : 'national'}`}
                      icon={Target}
                      color={kpis.nationalizationBand.name === 'Red' ? 'red' : kpis.nationalizationBand.name === 'Yellow' ? 'amber' : 'emerald'}
                      alert={kpis.nationalizationBand.name === 'Red'}
                      animDelay={80}
                    />
                  )}
                  <DashboardKPICard
                    id="hr-probation"
                    title={isRTL ? 'في فترة التجربة' : 'On Probation'}
                    value={kpis.onProbation}
                    sub={kpis.probationEndingSoon > 0
                      ? (isRTL ? `${kpis.probationEndingSoon} تنتهي قريباً` : `${kpis.probationEndingSoon} ending soon`)
                      : undefined}
                    icon={Clock}
                    color="amber"
                    href="/Employees"
                    animDelay={120}
                  />
                  <DashboardKPICard
                    id="hr-leave-pending"
                    title={isRTL ? 'إجازات معلقة' : 'Pending Leave'}
                    value={kpis.pendingLeaves}
                    icon={Calendar}
                    color="purple"
                    href="/Leaves"
                    series={kpis.leaveSeries.series}
                    trend={kpis.leaveSeries.trend}
                    animDelay={160}
                  />
                  <DashboardKPICard
                    id="hr-tenure"
                    title={isRTL ? 'متوسط الخدمة' : 'Avg Tenure'}
                    value={YRS(kpis.tenure.avgYears, isRTL)}
                    sub={isRTL ? 'بناءً على تاريخ التعيين' : 'Based on hire date'}
                    icon={Layers}
                    color="slate"
                    animDelay={200}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <SectionLabel>{isRTL ? 'الامتثال والتكلفة' : 'Compliance & cost'}</SectionLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <JurisdictionFeatureGate featureKeys={PAGE_FEATURE_KEYS.GovernmentRelations}>
                    <DashboardKPICard
                      id="hr-docs-expiring"
                      title={isRTL ? 'وثائق تنتهي (30ي)' : 'Docs Expiring (30d)'}
                      value={kpis.docsIn30Count}
                      sub={kpis.docsExpiredCount > 0
                        ? (isRTL ? `${kpis.docsExpiredCount} منتهية` : `${kpis.docsExpiredCount} expired`)
                        : undefined}
                      icon={AlertCircle}
                      color="red"
                      alert={kpis.docsExpiredCount > 0}
                      href="/GovernmentRelations"
                      animDelay={0}
                    />
                  </JurisdictionFeatureGate>
                  <DashboardKPICard
                    id="hr-contracts"
                    title={isRTL ? 'عقود تنتهي (60ي)' : 'Contracts Ending (60d)'}
                    value={kpis.contractsEnding60}
                    icon={FileWarning}
                    color="amber"
                    href="/Employees"
                    animDelay={40}
                  />
                  <DashboardKPICard
                    id="hr-payroll"
                    title={isRTL ? 'الرواتب الشهرية' : 'Monthly Payroll'}
                    value={kpis.hasSalaryData ? fmt(kpis.totalPayroll) : EM_DASH}
                    sub={!kpis.hasSalaryData
                      ? (isRTL ? 'أضف بيانات الراتب' : 'Add salary data')
                      : (kpis.salary.avg != null ? (isRTL ? `متوسط ${fmt(kpis.salary.avg)}` : `Avg ${fmt(kpis.salary.avg)}`) : undefined)}
                    icon={DollarSign}
                    color="emerald"
                    href="/Payroll"
                    series={kpis.payrollSeries.series}
                    trend={kpis.hasSalaryData ? kpis.payrollSeries.trend : undefined}
                    animDelay={80}
                  />
                  <DashboardKPICard
                    id="hr-avg-salary"
                    title={isRTL ? 'متوسط الراتب' : 'Avg Salary'}
                    value={kpis.salary.avg != null ? fmt(kpis.salary.avg) : EM_DASH}
                    sub={kpis.salary.coveragePct != null
                      ? (isRTL ? `تغطية ${PCT(kpis.salary.coveragePct)}` : `${PCT(kpis.salary.coveragePct)} coverage`)
                      : (isRTL ? 'لا بيانات' : 'No data')}
                    icon={Wallet}
                    color="teal"
                    href="/Payroll"
                    animDelay={120}
                  />
                  <DashboardKPICard
                    id="hr-eosb"
                    title={isRTL ? 'مخصص نهاية الخدمة' : 'EOSB Provision'}
                    value={kpis.totalEOSB > 0 ? fmt(kpis.totalEOSB) : EM_DASH}
                    icon={Shield}
                    color="blue"
                    href="/EOSBCalculator"
                    animDelay={160}
                  />
                  <DashboardKPICard
                    id="hr-turnover"
                    title={isRTL ? 'نسبة الدوران' : 'Turnover YTD'}
                    value={PCT(kpis.turnoverRate)}
                    sub={kpis.terminated > 0 ? `${kpis.terminated} ${isRTL ? 'غادروا' : 'left'}` : (isRTL ? 'لا مغادرين' : 'No leavers')}
                    icon={TrendingDown}
                    color="red"
                    alert={kpis.turnoverRate != null && kpis.turnoverRate > 15}
                    animDelay={200}
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <DashboardKPICard
                    id="hr-wps"
                    title={isRTL ? 'حماية الأجور' : 'Wage Protection'}
                    value={
                      !kpis.hasPayrollRuns
                        ? EM_DASH
                        : kpis.wpsCompliant
                          ? (isRTL ? 'ممتثل ✓' : 'Compliant ✓')
                          : (isRTL ? 'بانتظار' : 'Pending')
                    }
                    sub={kpis.hasPayrollRuns ? kpis.lastPayRunPeriod : (isRTL ? 'لا دورات رواتب بعد' : 'No payroll runs yet')}
                    icon={CheckCircle}
                    color={kpis.wpsCompliant ? 'emerald' : 'amber'}
                    href="/Payroll"
                    animDelay={0}
                  />
                  <DashboardKPICard
                    id="hr-gosi"
                    title={isRTL ? 'مشمولو التأمينات' : 'GOSI Eligible'}
                    value={kpis.gosi.eligible}
                    sub={PCT(kpis.gosi.pct)}
                    icon={Percent}
                    color="blue"
                    href="/Employees"
                    animDelay={40}
                  />
                  <DashboardKPICard
                    id="hr-completeness"
                    title={isRTL ? 'اكتمال السجلات' : 'Record Completeness'}
                    value={PCT(kpis.completeness.pct)}
                    sub={isRTL
                      ? `${kpis.completeness.complete} مكتمل`
                      : `${kpis.completeness.complete} complete`}
                    icon={Layers}
                    color={kpis.completeness.pct != null && kpis.completeness.pct < 70 ? 'amber' : 'emerald'}
                    alert={kpis.completeness.pct != null && kpis.completeness.pct < 50}
                    href="/Employees"
                    animDelay={80}
                  />
                  <DashboardKPICard
                    id="hr-vacancies"
                    title={isRTL ? 'شواغر مفتوحة' : 'Open Vacancies'}
                    value={kpis.openVacancies || EM_DASH}
                    sub={kpis.openVacancies === 0 ? (isRTL ? 'لا توجد شواغر' : 'No open reqs') : undefined}
                    icon={Star}
                    color="slate"
                    href="/RecruitmentPage"
                    animDelay={120}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <SectionLabel>{isRTL ? 'رؤى وتحليلات' : 'Insights'}</SectionLabel>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                  {nationalisationEnabled && (
                    <Card className="border-border/60 shadow-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          {isRTL ? 'برنامج التوطين' : 'Nationalization bands'}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col items-center py-1">
                          <div className="text-4xl font-bold tabular-nums" style={{ color: kpis.nationalizationBand.color }}>
                            {PCT(kpis.saudizationPct)}
                          </div>
                          <div className="text-sm font-medium mt-1" style={{ color: kpis.nationalizationBand.color }}>
                            {isRTL ? kpis.nationalizationBand.nameAr : kpis.nationalizationBand.name}
                          </div>
                          <div className="w-full mt-4 space-y-1.5">
                            {NATIONALIZATION_BANDS.slice().reverse().map((band) => (
                              <div key={band.name} className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: band.color }} />
                                <div className="flex-1 h-1.5 rounded-full bg-sand-alt overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{
                                      backgroundColor: band.color,
                                      width: `${Math.min(100, ((kpis.saudizationPct ?? 0) / Math.max(band.min, 1)) * 100)}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-14 text-end">
                                  {band.min}%+
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 text-xs text-muted-foreground text-center">
                            {isRTL
                              ? `${kpis.saudis} مواطن من ${kpis.totalActive}`
                              : `${kpis.saudis} of ${kpis.totalActive} nationals`}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card className="border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{isRTL ? 'توزيع الجنسيات' : 'Nationality distribution'}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartState
                        isEmpty={kpis.natPie.length === 0}
                        height={200}
                        emptyMessage={
                          isRTL
                            ? 'أكمل الجنسية لكل موظف لعرض التوزيع'
                            : 'Complete employee nationality to see distribution'
                        }
                      >
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={kpis.natPie}
                              cx="50%"
                              cy="50%"
                              innerRadius={48}
                              outerRadius={78}
                              dataKey="value"
                              paddingAngle={2}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                              fontSize={10}
                            >
                              {kpis.natPie.map((_, i) => (
                                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartState>
                    </CardContent>
                  </Card>

                  <Card className="border-border/60 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">{isRTL ? 'انتهاء صلاحية الوثائق' : 'Document expiry'}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3 py-1">
                        <JurisdictionFeatureGate featureKeys={PAGE_FEATURE_KEYS.GovernmentRelations}>
                          {[
                            { label: isRTL ? 'منتهية' : 'Expired', count: kpis.docsExpiredCount, color: 'bg-red-500', textColor: 'text-red-700', bg: 'bg-red-50' },
                            { label: isRTL ? 'خلال 30 يوماً' : 'In 30 days', count: kpis.docsIn30Count, color: 'bg-amber-500', textColor: 'text-amber-700', bg: 'bg-amber-50' },
                            { label: isRTL ? 'خلال 60 يوماً' : 'In 60 days', count: kpis.docsIn60Count, color: 'bg-yellow-400', textColor: 'text-yellow-800', bg: 'bg-yellow-50' },
                          ].map((item) => (
                            <Link to="/GovernmentRelations" key={item.label}>
                              <div className={`flex items-center justify-between p-3 rounded-xl ${item.bg} border border-transparent hover:border-border transition-all mb-2`}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                                  <span className={`text-sm font-medium ${item.textColor}`}>{item.label}</span>
                                </div>
                                <span className={`text-xl font-bold tabular-nums ${item.textColor}`}>{item.count}</span>
                              </div>
                            </Link>
                          ))}
                        </JurisdictionFeatureGate>
                      </div>
                    </CardContent>
                  </Card>

                  <HRWorkforceMix
                    isRTL={isRTL}
                    gender={kpis.gender}
                    employmentTypes={kpis.employmentTypes}
                  />
                </div>
              </section>

              <section className="space-y-3">
                <SectionLabel>{isRTL ? 'اختصارات' : 'Shortcuts'}</SectionLabel>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { to: '/Employees', icon: Users, label: isRTL ? 'الموظفون' : 'Employees' },
                    { to: '/Payroll', icon: DollarSign, label: isRTL ? 'الرواتب' : 'Payroll' },
                    { to: '/Leaves', icon: Calendar, label: isRTL ? 'الإجازات' : 'Leaves' },
                    { to: '/RecruitmentPage', icon: Star, label: isRTL ? 'التوظيف' : 'Recruitment' },
                    { to: '/Onboarding', icon: CheckCircle, label: isRTL ? 'الإلحاق' : 'Onboarding' },
                    { to: '/EOSBCalculator', icon: Shield, label: isRTL ? 'نهاية الخدمة' : 'EOSB' },
                    { to: '/GovernmentRelations', icon: Building2, label: isRTL ? 'الحوكمة' : 'Gov. Relations', featureKeys: PAGE_FEATURE_KEYS.GovernmentRelations },
                    { to: '/YamenAI', icon: Zap, label: isRTL ? 'يامن AI' : 'YAMEN AI' },
                  ]
                    .filter((link) => !link.featureKeys || areAnyEnabled(link.featureKeys))
                    .map((link) => (
                      <Link key={link.to} to={link.to}>
                        <div className="group flex items-center gap-2.5 p-3 rounded-xl border border-border/60 bg-white hover:border-najdi-900/25 hover:shadow-sm hover:-translate-y-0.5 transition-all h-full">
                          <div className="w-8 h-8 rounded-lg bg-najdi-50 text-najdi-900 flex items-center justify-center flex-shrink-0 group-hover:bg-najdi-900 group-hover:text-white transition-colors">
                            <link.icon className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-medium text-ink truncate">{link.label}</span>
                        </div>
                      </Link>
                    ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
