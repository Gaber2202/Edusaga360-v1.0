import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { format, differenceInDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import JurisdictionFeatureGate from '../JurisdictionFeatureGate';
import { PAGE_FEATURE_KEYS } from '../../lib/jurisdictionFeatures.js';
import {
  Users,
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  FileText,
  CreditCard,
  ArrowRight,
  Bell,
  UserCheck,
  Landmark
} from 'lucide-react';

export default function PayrollDashboard({ onNavigate }) {
  const { isRTL } = useLanguage();
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
    enabled: hasTenantAccess,
  });

  const { data: tuitionAdvances = [] } = useQuery({
    queryKey: ['tuitionAdvances', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('tuition_advances').select('*').match(tenantFilter(branchFilter()))),
    enabled: hasTenantAccess,
  });

  const filteredEmployees = filterByBranch(employees);
  const currentPayRun = payRuns.find(p => p.period === currentPeriod && (!selectedBranchId || p.branch_id === selectedBranchId));

  // Calculate stats
  const saudiCount = filteredEmployees.filter(e => e.is_saudi || e.nationality === 'Saudi' || e.nationality === 'سعودي').length;
  const nonSaudiCount = filteredEmployees.length - saudiCount;
  const teacherCount = filteredEmployees.filter(e => e.job_title_name?.toLowerCase().includes('teacher') || e.job_title_name?.includes('معلم')).length;
  const adminCount = filteredEmployees.length - teacherCount;

  // Alerts
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

  // GOSI Calculation (simplified)
  const gosiEmployeeRate = 0.0975; // 9.75% for Saudis
  const gosiEmployerRate = 0.1175; // 11.75% for Saudis
  const gosiNonSaudiRate = 0.02; // 2% GOSI for non-Saudis (employer only)

  const estimatedGOSIEmployee = filteredEmployees.reduce((sum, e) => {
    const isSaudi = e.is_saudi || e.nationality === 'Saudi' || e.nationality === 'سعودي';
    const gosiWage = Math.min((e.basic_salary || 0) + (e.housing_allowance || 0), 45000);
    return sum + (isSaudi ? gosiWage * gosiEmployeeRate : 0);
  }, 0);

  const estimatedGOSIEmployer = filteredEmployees.reduce((sum, e) => {
    const isSaudi = e.is_saudi || e.nationality === 'Saudi' || e.nationality === 'سعودي';
    const gosiWage = Math.min((e.basic_salary || 0) + (e.housing_allowance || 0), 45000);
    return sum + (isSaudi ? gosiWage * gosiEmployerRate : gosiWage * gosiNonSaudiRate);
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

  return (
    <div className="space-y-6">
      {/* Current Pay Run Card */}
      <Card className="bg-gradient-to-br from-najdi-900 to-najdi-900 text-white">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-muted-foreground" />
                <span className="text-muted-foreground">{isRTL ? 'كشف الرواتب الحالي' : 'Current Pay Run'}</span>
              </div>
              <h2 className="text-3xl font-bold">
                {format(new Date(), isRTL ? 'MMMM yyyy' : 'MMMM yyyy')}
              </h2>
              {currentPayRun ? (
                <div className="flex items-center gap-4">
                  <Badge className={statusColors[currentPayRun.status]}>
                    {isRTL ? statusLabels[currentPayRun.status]?.ar : statusLabels[currentPayRun.status]?.en}
                  </Badge>
                  <span className="text-muted-foreground">
                    {currentPayRun.employee_count} {isRTL ? 'موظف' : 'employees'}
                  </span>
                </div>
              ) : (
                <Badge className="bg-ink text-muted-foreground">
                  {isRTL ? 'لم يتم الإنشاء بعد' : 'Not Created Yet'}
                </Badge>
              )}
            </div>
            
            <div className="flex flex-col items-end gap-2">
              <span className="text-muted-foreground text-sm">{isRTL ? 'صافي الرواتب' : 'Net Payroll'}</span>
              <span className="text-4xl font-bold">
                {currentPayRun 
                  ? `${(currentPayRun.net_payroll || 0).toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}`
                  : `${(totalGrossSalary * 0.85).toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}`
                }
              </span>
              {currentPayRun?.payment_date && (
                <span className="text-muted-foreground text-sm">
                  {isRTL ? 'تاريخ الصرف:' : 'Payment Date:'} {format(new Date(currentPayRun.payment_date), 'dd/MM/yyyy')}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button 
              variant="secondary" 
              className="bg-white/10 hover:bg-white/20 text-white border-0"
              onClick={() => onNavigate('payruns')}
            >
              <FileText className="w-4 h-4 me-2" />
              {isRTL ? 'عرض التفاصيل' : 'View Details'}
            </Button>
            {!currentPayRun && (
              <Button 
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => onNavigate('payruns')}
              >
                {isRTL ? 'إنشاء كشف الرواتب' : 'Create Pay Run'}
              </Button>
            )}
            {currentPayRun?.status === 'draft' && (
              <Button 
                className="bg-najdi-500 hover:bg-najdi-700 text-white"
                onClick={() => onNavigate('payruns')}
              >
                {isRTL ? 'متابعة المعالجة' : 'Continue Processing'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to={createPageUrl('Employees')} className="block">
        <Card className="bg-white hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي الموظفين' : 'Total Employees'}</p>
                <p className="text-2xl font-bold mt-1">{filteredEmployees.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'إجمالي الرواتب:' : 'Total Payroll:'} {totalGrossSalary.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</p>
              </div>
              <div className="w-12 h-12 bg-najdi-50 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-najdi-700" />
              </div>
            </div>
          </CardContent>
        </Card>
        </Link>

        <Card className="bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'سعودي / غير سعودي' : 'Saudi / Non-Saudi'}</p>
                <p className="text-2xl font-bold mt-1">{saudiCount} / {nonSaudiCount}</p>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'التأمينات (موظف)' : 'GOSI (Employee)'}</p>
                <p className="text-2xl font-bold mt-1">{(estimatedGOSIEmployee / 1000).toFixed(1)}K</p>
              </div>
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                <Landmark className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'التأمينات (صاحب العمل)' : 'GOSI (Employer)'}</p>
                <p className="text-2xl font-bold mt-1">{(estimatedGOSIEmployer / 1000).toFixed(1)}K</p>
              </div>
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                <Building2 className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'معلمين' : 'Teachers'}</p>
            <p className="text-xl font-bold mt-1">{teacherCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'إداريين' : 'Admin Staff'}</p>
            <p className="text-xl font-bold mt-1">{adminCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'قروض نشطة' : 'Active Loans'}</p>
            <p className="text-xl font-bold mt-1">{loans.filter(l => l.status === 'active').length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{isRTL ? 'سلف رسوم نشطة' : 'Active Tuition'}</p>
            <p className="text-xl font-bold mt-1">{tuitionAdvances.filter(t => t.status === 'active').length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts & To-Do */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts Panel */}
        <Card className="bg-white">
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
                className="w-full flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100 hover:bg-red-100 transition-colors cursor-pointer text-start"
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
                className="w-full flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100 hover:bg-amber-100 transition-colors cursor-pointer text-start"
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
                className="w-full flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100 hover:bg-orange-100 transition-colors cursor-pointer text-start"
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
                className="w-full flex items-center justify-between p-3 bg-najdi-50 rounded-lg border border-najdi-100 hover:bg-najdi-50 transition-colors cursor-pointer text-start"
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
                className="w-full flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100 hover:bg-purple-100 transition-colors cursor-pointer text-start"
                onClick={() => onNavigate('tuition')}
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-purple-500" />
                  <div>
                    <p className="font-medium text-purple-700">{isRTL ? 'طلبات سلف رسوم معلقة' : 'Pending Tuition Advances'}</p>
                    <p className="text-sm text-purple-600">{pendingTuition.length} {isRTL ? 'طلب' : 'requests'}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-500" />
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

        {/* Recent Pay Runs */}
        <Card className="bg-white">
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
                className="w-full flex items-center justify-between p-3 bg-sand rounded-lg hover:bg-sand-alt transition-colors cursor-pointer text-start"
                onClick={() => onNavigate('payruns')}
              >
                <div>
                  <p className="font-medium">{run.period}</p>
                  <p className="text-sm text-muted-foreground">
                    {run.employee_count} {isRTL ? 'موظف' : 'employees'} • {(run.net_payroll || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}
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