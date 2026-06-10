/**
 * HR Manager Dashboard — AC#4: Saudization real-time, AC#9: one-click MHRSD report
 * Real-time KPIs covering the full employee lifecycle
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import BenchmarkDashboard from '../components/benchmarks/BenchmarkDashboard';
import { useBranch } from '../components/BranchContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Link } from 'react-router-dom';
import { Tooltip,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import {
  Users, AlertTriangle, CheckCircle, Clock, TrendingDown,
  Shield, Download, Calendar, DollarSign,
  Building2, Target, Zap, Star, AlertCircle, RefreshCw
} from 'lucide-react';
import { format, differenceInDays, differenceInYears, addDays } from 'date-fns';

const SAR = v => `${(v || 0).toLocaleString('en-SA', { maximumFractionDigits: 0 })} SAR`;
const PCT = v => `${(v || 0).toFixed(1)}%`;

const NITAQAT_BANDS = [
  { name: 'Platinum', nameAr: 'بلاتيني', min: 40, color: '#6366f1' },
  { name: 'Green High', nameAr: 'أخضر عالي', min: 35, color: '#10b981' },
  { name: 'Green Medium', nameAr: 'أخضر متوسط', min: 30, color: '#34d399' },
  { name: 'Green Low', nameAr: 'أخضر منخفض', min: 25, color: '#6ee7b7' },
  { name: 'Yellow', nameAr: 'أصفر', min: 15, color: '#f59e0b' },
  { name: 'Red', nameAr: 'أحمر', min: 0, color: '#ef4444' },
];

function getNitaqatBand(pct) {
  return NITAQAT_BANDS.find(b => pct >= b.min) || NITAQAT_BANDS[NITAQAT_BANDS.length - 1];
}

function KPICard({ title, value, subtitle, icon: KPIIcon, iconBg, alert, warn, to, badge }) {
  const Icon = KPIIcon;
  const inner = (
    <Card className={`hover:shadow-md transition-all ${alert ? 'border-red-300' : warn ? 'border-amber-300' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 font-medium truncate">{title}</p>
            <p className={`text-2xl font-bold mt-0.5 ${alert ? 'text-red-600' : warn ? 'text-amber-600' : 'text-slate-800'}`}>{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
            {badge && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${badge.color}`}>{badge.label}</span>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ms-2 ${iconBg || 'bg-slate-100'}`}>
            <Icon className="w-5 h-5 text-slate-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function HRManagerDashboard() {
  const { isRTL } = useLanguage();
  const { branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [activeTab, setActiveTab] = useState('overview');
  const today = new Date();

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees-hrdash', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_date').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const { data: leaveRequests = [] } = useQuery({
    queryKey: ['leaves-hrdash', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter({ status: 'pending' }))),
    enabled: hasTenantAccess,
  });

  const { data: recruitments = [] } = useQuery({
    queryKey: ['recruitment-hrdash', tenantId],
    queryFn: () => fetchData(tenantQuery('recruitments').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: payRuns = [] } = useQuery({
    queryKey: ['payruns-hrdash', tenantId],
    queryFn: () => fetchData(tenantQuery('pay_runs').select('*').match(tenantFilter()).order('created_date', { ascending: false }).limit(3)),
    enabled: hasTenantAccess,
  });

  // ── Computed KPIs ─────────────────────────────────────
  const kpis = useMemo(() => {
    const active = employees.filter(e => e.status === 'active');
    const saudis = active.filter(e => e.is_saudi || e.nationality?.toLowerCase().includes('saudi'));
    const saudizationPct = active.length > 0 ? (saudis.length / active.length) * 100 : 0;
    const nitaqatBand = getNitaqatBand(saudizationPct);

    const onProbation = active.filter(e => {
      if (!e.hire_date) return false;
      const probEnd = addDays(new Date(e.hire_date), 90);
      return probEnd > today;
    });

    const terminated = employees.filter(e => {
      const d = e.termination_date || e.updated_date;
      if (!d) return false;
      return e.status === 'terminated' && new Date(d) > addDays(today, -365);
    });
    const turnoverRate = active.length > 0 ? (terminated.length / (active.length + terminated.length)) * 100 : 0;

    // Document expiries
    const in30 = active.filter(e => {
      const dates = [e.iqama_expiry, e.passport_expiry, e.license_expiry_date].filter(Boolean);
      return dates.some(d => {
        const diff = differenceInDays(new Date(d), today);
        return diff >= 0 && diff <= 30;
      });
    });
    const in60 = active.filter(e => {
      const dates = [e.iqama_expiry, e.passport_expiry, e.license_expiry_date].filter(Boolean);
      return dates.some(d => {
        const diff = differenceInDays(new Date(d), today);
        return diff > 30 && diff <= 60;
      });
    });
    const expired = active.filter(e => {
      const dates = [e.iqama_expiry, e.passport_expiry, e.license_expiry_date].filter(Boolean);
      return dates.some(d => new Date(d) < today);
    });

    const openVacancies = recruitments.filter(r => r.status === 'open').length;
    const lastPayRun = payRuns[0];
    const wpsCompliant = lastPayRun?.status === 'paid' || lastPayRun?.status === 'completed';

    const totalPayroll = active.reduce((s, e) => s + (e.total_salary || e.salary || 0), 0);
    const totalEOSB = active.reduce((s, e) => {
      if (!e.hire_date) return s;
      const years = differenceInYears(today, new Date(e.hire_date));
      const basic = e.basic_salary || 0;
      if (years <= 5) return s + (basic * 0.5 * years);
      return s + (basic * 0.5 * 5) + (basic * 1.0 * (years - 5));
    }, 0);

    // Nationality breakdown for pie
    const natMap = {};
    active.forEach(e => {
      const nat = e.nationality || 'Unknown';
      natMap[nat] = (natMap[nat] || 0) + 1;
    });
    const natPie = Object.entries(natMap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }));

    // Monthly headcount trend (last 12 months approximation)
    const headcountTrend = Array.from({ length: 6 }, (_, i) => {
      const m = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
      const label = format(m, 'MMM');
      const count = active.length + Math.floor(Math.random() * 3 - 1); // approximate
      return { month: label, count };
    });

    return {
      totalActive: active.length, saudis: saudis.length, nonSaudis: active.length - saudis.length,
      saudizationPct, nitaqatBand, onProbation: onProbation.length,
      terminated: terminated.length, turnoverRate, openVacancies,
      docsExpiredCount: expired.length, docsIn30Count: in30.length, docsIn60Count: in60.length,
      pendingLeaves: leaveRequests.length, wpsCompliant, lastPayRunPeriod: lastPayRun?.period,
      totalPayroll, totalEOSB, natPie, headcountTrend,
    };
  }, [employees, leaveRequests, recruitments, payRuns, today]);

  const exportMHRSDReport = () => {
    const active = employees.filter(e => e.status === 'active');
    const rows = [
      ['Employee ID', 'Name AR', 'Name EN', 'Nationality', 'Is Saudi', 'Job Title', 'Department', 'Hire Date', 'GOSI Number', 'Iqama Expiry', 'Status'],
      ...active.map(e => [
        e.employee_id, e.name_ar, e.name_en || '', e.nationality || '',
        e.is_saudi ? 'YES' : 'NO', e.job_title_name || '', e.department_id || '',
        e.hire_date || '', e.gosi_number || '', e.iqama_expiry || '', e.status
      ])
    ];
    const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `MHRSD_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  if (isLoading) return <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'لوحة تحكم الموارد البشرية' : 'HR Manager Dashboard'}</h1>
          <p className="text-sm text-slate-500">{isRTL ? 'مؤشرات الأداء الرئيسية لحظياً — لا حاجة لطلب تقرير' : 'Real-time HR KPIs — no report requests needed'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportMHRSDReport} className="gap-1">
            <Download className="w-4 h-4" />
            {isRTL ? 'تقرير MHRSD بنقرة واحدة' : 'One-Click MHRSD Report'}
          </Button>
          <Link to="/Employees">
            <Button size="sm" className="gap-1">
              <Users className="w-4 h-4" />
              {isRTL ? 'الموظفون' : 'Employees'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'overview', label: isRTL ? 'نظرة عامة' : 'Overview' },
          { key: 'benchmarks', label: isRTL ? 'المعايير المرجعية' : 'Benchmarks' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'benchmarks' && <BenchmarkDashboard />}
      {activeTab !== 'benchmarks' && <>

      {/* Critical alerts */}
      {(kpis.docsExpiredCount > 0 || kpis.nitaqatBand.name === 'Red' || kpis.nitaqatBand.name === 'Yellow') && (
        <div className="space-y-2">
          {kpis.docsExpiredCount > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                {isRTL
                  ? `${kpis.docsExpiredCount} موظف لديهم وثائق منتهية الصلاحية — إجراء فوري مطلوب`
                  : `${kpis.docsExpiredCount} employee(s) with expired documents — immediate action required`}
              </span>
            </div>
          )}
          {(kpis.nitaqatBand.name === 'Yellow' || kpis.nitaqatBand.name === 'Red') && (
            <div className="flex items-center gap-3 p-3 rounded-xl border bg-amber-50 border-amber-200 text-amber-700 text-sm">
              <Target className="w-4 h-4 flex-shrink-0" />
              <span>
                {isRTL
                  ? `نطاقات: الشريط ${kpis.nitaqatBand.nameAr} — نسبة السعودة ${PCT(kpis.saudizationPct)} — تحتاج توظيف سعوديين`
                  : `Nitaqat: ${kpis.nitaqatBand.name} band — ${PCT(kpis.saudizationPct)} Saudization — need to hire Saudi nationals`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* KPI grid — row 1: headcount */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title={isRTL ? 'إجمالي الموظفين' : 'Total Employees'} value={kpis.totalActive} subtitle={isRTL ? 'موظف نشط' : 'active'} icon={Users} iconBg="bg-blue-50" to="/Employees" />
        <KPICard title={isRTL ? 'السعودة %' : 'Saudization %'} value={PCT(kpis.saudizationPct)} subtitle={`${kpis.saudis} ${isRTL ? 'سعودي' : 'Saudi'}`} icon={Target} iconBg="bg-emerald-50"
          badge={{ label: isRTL ? kpis.nitaqatBand.nameAr : kpis.nitaqatBand.name, color: kpis.nitaqatBand.name === 'Red' ? 'bg-red-100 text-red-700' : kpis.nitaqatBand.name === 'Yellow' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700' }}
          warn={kpis.nitaqatBand.name === 'Yellow'} alert={kpis.nitaqatBand.name === 'Red'} />
        <KPICard title={isRTL ? 'في فترة التجربة' : 'On Probation'} value={kpis.onProbation} icon={Clock} iconBg="bg-amber-50" to="/Employees" />
        <KPICard title={isRTL ? 'وثائق تنتهي (30 يوم)' : 'Docs Expiring (30d)'} value={kpis.docsIn30Count} icon={AlertCircle} iconBg="bg-red-50" warn={kpis.docsIn30Count > 0} alert={kpis.docsExpiredCount > 0} to="/GovernmentRelations" />
        <KPICard title={isRTL ? 'طلبات إجازة معلقة' : 'Pending Leave Requests'} value={kpis.pendingLeaves} icon={Calendar} iconBg="bg-purple-50" to="/Leaves" />
        <KPICard title={isRTL ? 'شواغر مفتوحة' : 'Open Vacancies'} value={kpis.openVacancies} icon={Star} iconBg="bg-indigo-50" to="/RecruitmentPage" />
      </div>

      {/* KPI row 2: finance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard title={isRTL ? 'إجمالي الرواتب الشهرية' : 'Monthly Payroll'} value={SAR(kpis.totalPayroll)} icon={DollarSign} iconBg="bg-green-50" to="/Payroll" />
        <KPICard title={isRTL ? 'مخصص نهاية الخدمة' : 'EOSB Provision'} value={SAR(kpis.totalEOSB)} icon={Shield} iconBg="bg-blue-50" to="/EOSBCalculator" />
        <KPICard title={isRTL ? 'نسبة الدوران' : 'Turnover Rate YTD'} value={PCT(kpis.turnoverRate)} subtitle={`${kpis.terminated} ${isRTL ? 'غادروا' : 'left'}`} icon={TrendingDown} iconBg="bg-red-50" warn={kpis.turnoverRate > 15} />
        <KPICard title={isRTL ? 'WPS آخر شهر' : 'Last WPS Status'} value={kpis.wpsCompliant ? (isRTL ? 'ممتثل ✓' : 'Compliant ✓') : (isRTL ? 'بانتظار' : 'Pending')} subtitle={kpis.lastPayRunPeriod} icon={CheckCircle} iconBg={kpis.wpsCompliant ? 'bg-green-50' : 'bg-amber-50'} to="/Payroll" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Saudization gauge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isRTL ? 'نطاقات السعودة — Nitaqat' : 'Nitaqat Saudization Bands'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-2">
              <div className="text-4xl font-bold" style={{ color: kpis.nitaqatBand.color }}>{PCT(kpis.saudizationPct)}</div>
              <div className="text-sm font-medium mt-1" style={{ color: kpis.nitaqatBand.color }}>
                {isRTL ? kpis.nitaqatBand.nameAr : kpis.nitaqatBand.name}
              </div>
              <div className="w-full mt-4 space-y-1.5">
                {NITAQAT_BANDS.slice().reverse().map(band => (
                  <div key={band.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: band.color }} />
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ backgroundColor: band.color, width: `${Math.min(100, kpis.saudizationPct / (band.min || 1) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-16 text-end">{band.min}%+ {isRTL ? band.nameAr : band.name}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-slate-500 text-center">
                {isRTL ? `${kpis.saudis} سعودي من ${kpis.totalActive} موظف` : `${kpis.saudis} Saudi of ${kpis.totalActive} employees`}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nationality pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isRTL ? 'توزيع الجنسيات' : 'Nationality Distribution'}</CardTitle>
          </CardHeader>
          <CardContent>
            {kpis.natPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={kpis.natPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {kpis.natPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">{isRTL ? 'لا بيانات' : 'No data'}</div>
            )}
          </CardContent>
        </Card>

        {/* Document expiry timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{isRTL ? 'انتهاء صلاحية الوثائق' : 'Document Expiry Summary'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 py-2">
              {[
                { label: isRTL ? 'منتهية الصلاحية' : 'Expired', count: kpis.docsExpiredCount, color: 'bg-red-500', textColor: 'text-red-700', bg: 'bg-red-50' },
                { label: isRTL ? 'تنتهي خلال 30 يوم' : 'Expiring in 30d', count: kpis.docsIn30Count, color: 'bg-amber-500', textColor: 'text-amber-700', bg: 'bg-amber-50' },
                { label: isRTL ? 'تنتهي خلال 60 يوم' : 'Expiring in 60d', count: kpis.docsIn60Count, color: 'bg-yellow-400', textColor: 'text-yellow-700', bg: 'bg-yellow-50' },
              ].map(item => (
                <Link to="/GovernmentRelations" key={item.label}>
                  <div className={`flex items-center justify-between p-3 rounded-xl ${item.bg} border border-transparent hover:border-slate-200 transition-all`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                      <span className={`text-sm font-medium ${item.textColor}`}>{item.label}</span>
                    </div>
                    <span className={`text-xl font-bold ${item.textColor}`}>{item.count}</span>
                  </div>
                </Link>
              ))}
              <div className="pt-1 text-xs text-slate-400 text-center">
                {isRTL ? 'انقر للعرض في سجل الحوكمة' : 'Click to view in Government Relations'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/Employees', icon: Users, label: isRTL ? 'الموظفون' : 'Employees' },
          { to: '/Payroll', icon: DollarSign, label: isRTL ? 'الرواتب' : 'Payroll' },
          { to: '/Leaves', icon: Calendar, label: isRTL ? 'الإجازات' : 'Leaves' },
          { to: '/RecruitmentPage', icon: Star, label: isRTL ? 'التوظيف' : 'Recruitment' },
          { to: '/Onboarding', icon: CheckCircle, label: isRTL ? 'الإلحاق' : 'Onboarding' },
          { to: '/EOSBCalculator', icon: Shield, label: isRTL ? 'نهاية الخدمة' : 'EOSB' },
          { to: '/GovernmentRelations', icon: Building2, label: isRTL ? 'الحوكمة' : 'Gov. Relations' },
          { to: '/YamenAI', icon: Zap, label: isRTL ? 'يامن AI' : 'YAMEN AI' },
        ].map(link => (
          <Link key={link.to} to={link.to}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-3 flex items-center gap-2">
                <link.icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-700 truncate">{link.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>}
    </div>
  );
}