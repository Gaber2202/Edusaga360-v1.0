import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { formatCurrency } from '../../lib/localization';
import { useTenant } from '../TenantContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { createPageUrl } from '../../utils';
import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import JurisdictionFeatureGate from '../JurisdictionFeatureGate';
import { PAGE_FEATURE_KEYS, SOCIAL_INSURANCE_FEATURES, NATIONALISATION_FEATURES } from '../../lib/jurisdictionFeatures.js';
import {
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  FileText,
  CreditCard,
  ArrowRight,
  Bell,
  UserCheck,
  Landmark,
  GraduationCap,
} from 'lucide-react';
import PayrollDashboardHero from './PayrollDashboardHero';
import PayrollKpiStrip from './PayrollKpiStrip';

export default function PayrollDashboard({ onNavigate }) {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const navigate = useNavigate();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const currentPeriod = format(new Date(), 'yyyy-MM');

  const { data: payRuns = [] } = useQuery({
    queryKey: ['payRuns', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('pay_runs').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false }).limit(10)),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter(branchFilter({ status: 'active' })))),
    enabled: hasTenantAccess,
  });

  const { data: loans = [] } = useQuery({
    queryKey: ['employeeLoans', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employee_loans').select('*').match(tenantFilter(branchFilter()))),
    enabled: false, // employee_loans table not built (Bucket C, #246)
  });

  const { data: tuitionAdvances = [] } = useQuery({
    queryKey: ['tuitionAdvances', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('tuition_advances').select('*').match(tenantFilter(branchFilter()))),
    enabled: false, // tuition_advances table not built (Bucket C, #246)
  });

  const filteredEmployees = filterByBranch(employees);
  const currentPayRun = payRuns.find(p => p.period === currentPeriod && (!selectedBranchId || p.branch_id === selectedBranchId));

  const saudiCount = filteredEmployees.filter(e => e.is_saudi).length;
  const nonSaudiCount = filteredEmployees.length - saudiCount;
  const teacherCount = filteredEmployees.filter(e => e.job_title_name?.toLowerCase().includes('teacher') || e.job_title_name?.includes('معلم')).length;
  const adminCount = filteredEmployees.length - teacherCount;
  const postedCount = payRuns.filter(p => p.journal_entry_id).length;

  const expiringIqama = filteredEmployees.filter(e => {
    if (!e.iqama_expiry) return false;
    const daysUntil = differenceInDays(new Date(e.iqama_expiry), new Date());
    return daysUntil > 0 && daysUntil <= 30;
  });

  const expiredIqama = filteredEmployees.filter(e => {
    if (!e.iqama_expiry) return false;
    return new Date(e.iqama_expiry) < new Date();
  });

  const missingIBAN = filteredEmployees.filter(e => !e.iban || e.iban.length < 20);

  const pendingLoans = loans.filter(l => l.status === 'pending' || l.status === 'manager_approved' || l.status === 'hr_approved');
  const pendingTuition = tuitionAdvances.filter(t => t.status === 'pending' || t.status === 'manager_approved' || t.status === 'hr_approved');

  const totalGrossSalary = filteredEmployees.reduce((sum, e) => {
    const basic = e.basic_salary || 0;
    const housing = e.housing_allowance || 0;
    const transport = e.transport_allowance || 0;
    const other = e.other_allowances || 0;
    return sum + (e.total_salary || (basic + housing + transport + other) || e.salary || 0);
  }, 0);

  const employeeSocialInsuranceRate = 0.0975;
  const employerSocialInsuranceRate = 0.1175;
  const nonSaudiSocialInsuranceRate = 0.02;

  const estimatedSocialInsuranceEmployee = filteredEmployees.reduce((sum, e) => {
    const socialInsuranceWage = Math.min((e.basic_salary || 0) + (e.housing_allowance || 0), 45000);
    return sum + (e.is_saudi ? socialInsuranceWage * employeeSocialInsuranceRate : 0);
  }, 0);

  const estimatedSocialInsuranceEmployer = filteredEmployees.reduce((sum, e) => {
    const socialInsuranceWage = Math.min((e.basic_salary || 0) + (e.housing_allowance || 0), 45000);
    return sum + (e.is_saudi ? socialInsuranceWage * employerSocialInsuranceRate : socialInsuranceWage * nonSaudiSocialInsuranceRate);
  }, 0);

  const statusColors = {
    draft: 'bg-sand-alt text-ink',
    calculated: 'bg-najdi-50 text-najdi-900',
    review: 'bg-amber-100 text-amber-700',
    approved: 'bg-purple-100 text-purple-700',
    hr_approved: 'bg-najdi-50 text-najdi-900',
    finance_approved: 'bg-purple-100 text-purple-700',
    exported: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-700',
    posted: 'bg-emerald-100 text-emerald-700',
    paid: 'bg-green-100 text-green-700',
    aborted: 'bg-red-100 text-red-700',
  };

  const statusLabels = {
    draft: { ar: 'مسودة', en: 'Draft' },
    calculated: { ar: 'تم الإعداد', en: 'Calculated' },
    review: { ar: 'قيد المراجعة', en: 'Review' },
    approved: { ar: 'معتمد', en: 'Approved' },
    hr_approved: { ar: 'اعتماد HR', en: 'HR Approved' },
    finance_approved: { ar: 'اعتماد المالية', en: 'Finance Approved' },
    exported: { ar: 'تم التصدير', en: 'Exported' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    posted: { ar: 'مرحّل', en: 'Posted' },
    paid: { ar: 'مدفوع', en: 'Paid' },
    aborted: { ar: 'ملغي', en: 'Aborted' },
  };

  const netAmount = currentPayRun
    ? (currentPayRun.net_payroll || 0)
    : totalGrossSalary * 0.85;

  const primaryKpis = [
    {
      key: 'employees',
      label: isRTL ? 'إجمالي الموظفين' : 'Total employees',
      value: filteredEmployees.length,
      hint: `${isRTL ? 'إجمالي الرواتب:' : 'Gross est:'} ${formatCurrency(totalGrossSalary, tenant?.localization, isRTL)}`,
      icon: Users,
      tone: 'najdi',
      onClick: () => navigate(createPageUrl('Employees')),
    },
    {
      key: 'teachers',
      label: isRTL ? 'معلمون' : 'Teachers',
      value: teacherCount,
      hint: `${isRTL ? 'إداريون:' : 'Admin:'} ${adminCount}`,
      icon: GraduationCap,
      tone: 'sand',
    },
    {
      key: 'gl',
      label: isRTL ? 'كشوف مرحّلة للأستاذ' : 'Pay runs posted to GL',
      value: postedCount,
      hint: `${payRuns.length} ${isRTL ? 'كشف أخير' : 'recent runs'}`,
      icon: Landmark,
      tone: 'emerald',
      onClick: () => onNavigate('payruns'),
    },
    {
      key: 'iban',
      label: isRTL ? 'IBAN ناقص' : 'Missing IBAN',
      value: missingIBAN.length,
      hint: isRTL ? 'يجب إكماله قبل التحويل' : 'Required before bank export',
      icon: CreditCard,
      tone: missingIBAN.length ? 'amber' : 'emerald',
      onClick: () => navigate(createPageUrl('Employees')),
    },
  ];

  return (
    <div className="space-y-6">
      <PayrollDashboardHero
        isRTL={isRTL}
        tenant={tenant}
        periodLabel={format(new Date(), isRTL ? 'MMMM yyyy' : 'MMMM yyyy')}
        currentPayRun={currentPayRun}
        netAmount={netAmount}
        statusLabel={
          currentPayRun
            ? (isRTL ? statusLabels[currentPayRun.status]?.ar : statusLabels[currentPayRun.status]?.en)
            : null
        }
        statusClass={currentPayRun ? statusColors[currentPayRun.status] : ''}
        onNavigatePayRuns={() => onNavigate('payruns')}
      />

      <PayrollKpiStrip items={primaryKpis} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <JurisdictionFeatureGate featureKeys={NATIONALISATION_FEATURES}>
          <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{isRTL ? 'سعودي / غير سعودي' : 'Saudi / Non-Saudi'}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{saudiCount} / {nonSaudiCount}</p>
            <div className="mt-3 w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </JurisdictionFeatureGate>

        <JurisdictionFeatureGate featureKeys={SOCIAL_INSURANCE_FEATURES}>
          <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{isRTL ? 'التأمينات (موظف)' : 'Social Insurance (Employee)'}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{(estimatedSocialInsuranceEmployee / 1000).toFixed(1)}K</p>
            <div className="mt-3 w-10 h-10 bg-najdi-50 rounded-xl flex items-center justify-center">
              <Landmark className="w-5 h-5 text-najdi-700" />
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{isRTL ? 'التأمينات (صاحب العمل)' : 'Social Insurance (Employer)'}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{(estimatedSocialInsuranceEmployer / 1000).toFixed(1)}K</p>
            <div className="mt-3 w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </JurisdictionFeatureGate>

        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{isRTL ? 'قروض نشطة' : 'Active loans'}</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{loans.filter(l => l.status === 'active').length}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">{isRTL ? 'سلف رسوم نشطة' : 'Active tuition'}</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">{tuitionAdvances.filter(t => t.status === 'active').length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white border-border/70 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="w-5 h-5 text-amber-500" />
              {isRTL ? 'تنبيهات ومهام' : 'Alerts & To-Do'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <JurisdictionFeatureGate featureKeys={PAGE_FEATURE_KEYS.GovernmentRelations}>
            {expiredIqama.length > 0 && (
              <button
                className="w-full flex items-center justify-between p-3 bg-red-50 rounded-xl border border-red-100 hover:bg-red-100 transition-colors cursor-pointer text-start"
                onClick={() => navigate(createPageUrl('GovernmentRelations'))}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-red-700">{isRTL ? 'إقامات منتهية الصلاحية' : 'Expired Iqama'}</p>
                    <p className="text-sm text-red-600">{expiredIqama.length} {isRTL ? 'موظف' : 'employees'}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-red-500" />
              </button>
            )}

            {expiringIqama.length > 0 && (
              <button
                className="w-full flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100 hover:bg-amber-100 transition-colors cursor-pointer text-start"
                onClick={() => navigate(createPageUrl('GovernmentRelations'))}
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className="font-medium text-amber-700">{isRTL ? 'إقامات تنتهي قريباً' : 'Expiring Soon'}</p>
                    <p className="text-sm text-amber-600">{expiringIqama.length} {isRTL ? 'موظف خلال 30 يوم' : 'employees within 30 days'}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-500" />
              </button>
            )}
            </JurisdictionFeatureGate>

            {missingIBAN.length > 0 && (
              <button
                className="w-full flex items-center justify-between p-3 bg-orange-50 rounded-xl border border-orange-100 hover:bg-orange-100 transition-colors cursor-pointer text-start"
                onClick={() => navigate(createPageUrl('Employees'))}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-orange-500" />
                  <div>
                    <p className="font-medium text-orange-700">{isRTL ? 'بيانات بنكية ناقصة' : 'Missing Bank Details'}</p>
                    <p className="text-sm text-orange-600">{missingIBAN.length} {isRTL ? 'موظف بدون IBAN' : 'employees without IBAN'}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-orange-500" />
              </button>
            )}

            {pendingLoans.length > 0 && (
              <button
                className="w-full flex items-center justify-between p-3 bg-najdi-50 rounded-xl border border-najdi-100 hover:bg-najdi-50 transition-colors cursor-pointer text-start"
                onClick={() => onNavigate('loans')}
              >
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-najdi-500" />
                  <div>
                    <p className="font-medium text-najdi-900">{isRTL ? 'طلبات قروض معلقة' : 'Pending Loan Requests'}</p>
                    <p className="text-sm text-najdi-700">{pendingLoans.length} {isRTL ? 'طلب' : 'requests'}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-najdi-500" />
              </button>
            )}

            {pendingTuition.length > 0 && (
              <button
                className="w-full flex items-center justify-between p-3 bg-sand-alt rounded-xl border border-border hover:bg-sand transition-colors cursor-pointer text-start"
                onClick={() => onNavigate('tuition')}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-ink" />
                  <div>
                    <p className="font-medium text-ink">{isRTL ? 'طلبات سلف رسوم معلقة' : 'Pending Tuition Advances'}</p>
                    <p className="text-sm text-muted-foreground">{pendingTuition.length} {isRTL ? 'طلب' : 'requests'}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </button>
            )}

            {expiredIqama.length === 0 && expiringIqama.length === 0 && missingIBAN.length === 0 && pendingLoans.length === 0 && pendingTuition.length === 0 && (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 me-2" />
                {isRTL ? 'لا توجد تنبيهات' : 'No alerts'}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border-border/70 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5 text-muted-foreground" />
              {isRTL ? 'كشوفات الرواتب الأخيرة' : 'Recent Pay Runs'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payRuns.slice(0, 5).map(run => (
              <button
                key={run.id}
                className="w-full flex items-center justify-between p-3 bg-sand rounded-xl hover:bg-sand-alt transition-colors cursor-pointer text-start"
                onClick={() => onNavigate('payruns')}
              >
                <div>
                  <p className="font-medium">{run.period}</p>
                  <p className="text-sm text-muted-foreground">
                    {run.employee_count} {isRTL ? 'موظف' : 'employees'} • {formatCurrency((run.net_payroll || 0), tenant?.localization, isRTL)}
                    {run.journal_entry_id ? (isRTL ? ' • مرحّل' : ' • GL posted') : ''}
                  </p>
                </div>
                <Badge className={statusColors[run.status]}>
                  {isRTL ? statusLabels[run.status]?.ar : statusLabels[run.status]?.en}
                </Badge>
              </button>
            ))}
            {payRuns.length === 0 && (
              <div className="text-center p-6 text-muted-foreground">
                {isRTL ? 'لا توجد كشوفات رواتب سابقة' : 'No previous pay runs'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
