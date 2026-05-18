import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card } from '../components/ui/card';
import StatusBadge from '../components/ui/StatusBadge';
import {
  Users, GraduationCap, ClipboardCheck, CreditCard,
  Plus, ArrowUpRight, DollarSign, Building2,
  AlertCircle, FileText, Shield, Bot, CheckCircle,
  Clock, Calendar, Banknote, AlertTriangle, BarChart3,
  UserPlus, Briefcase, Receipt,
} from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenant } from '../components/TenantContext';
import { isExpired, isExpiringWithin } from '../lib/dateCompare';

import DashboardKPICard from '../components/dashboard/DashboardKPICard';
import SaudizationRing from '../components/dashboard/SaudizationRing';
import QuickActionTile from '../components/dashboard/QuickActionTile';
import DashboardAnalytics from '../components/dashboard/DashboardAnalytics';
import ActivityPanel from '../components/dashboard/ActivityPanel';
import DashboardHeader from '../components/dashboard/DashboardHeader';

export default function Dashboard() {
  const { t: _t, isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const { tenant } = useTenant();

  const isHR = ['admin', 'hr_admin', 'hr_officer'].includes(userRole);
  const isFinance = ['admin', 'finance', 'accountant'].includes(userRole);
  const isSchoolAdmin = ['admin', 'admissions', 'branch_manager'].includes(userRole);
  const isBranchMgr = userRole === 'branch_manager';

  const { data: students = [] } = useQuery({ queryKey: ['students', tenantId], queryFn: () => tenantQuery('students').select('*').match(tenantFilter(), '-created_date'), enabled: hasTenantAccess && (isSchoolAdmin || userRole === 'parent') });
  const { data: applications = [] } = useQuery({ queryKey: ['applications', tenantId], queryFn: () => tenantQuery('applications').select('*').match(tenantFilter(), '-created_date'), enabled: hasTenantAccess && isSchoolAdmin });
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices', tenantId], queryFn: () => tenantQuery('invoices').select('*').match(tenantFilter(), '-created_date'), enabled: hasTenantAccess && (isFinance || isSchoolAdmin) });
  const { data: employees = [] } = useQuery({ queryKey: ['employees', tenantId], queryFn: () => tenantQuery('employees').select('*').match(tenantFilter(), '-created_date'), enabled: hasTenantAccess && (isHR || isBranchMgr) });
  const { data: leaveRequests = [] } = useQuery({ queryKey: ['leaveReqDash', tenantId], queryFn: () => tenantQuery('leave_requests').select('*').match(tenantFilter({ status: 'pending' })), enabled: hasTenantAccess && (isHR || isBranchMgr) });
  const { data: payRuns = [] } = useQuery({ queryKey: ['payRunsDash', tenantId], queryFn: () => tenantQuery('pay_runs').select('*').match(tenantFilter(), '-created_date', 5), enabled: hasTenantAccess && (isHR || isFinance) });
  const { data: iqamas = [] } = useQuery({ queryKey: ['iqamasDash', tenantId], queryFn: () => tenantQuery('iqama_records').select('*').match(tenantFilter()), enabled: hasTenantAccess && isHR });
  const { data: violations = [] } = useQuery({ queryKey: ['violationsDash', tenantId], queryFn: () => tenantQuery('govi_violations').select('*').match(tenantFilter({ status: 'open' })), enabled: hasTenantAccess && isHR });
  const { data: branches = [] } = useQuery({ queryKey: ['branches', tenantId], queryFn: () => tenantQuery('branchs').select('*').match(tenantFilter({ is_active: true })), enabled: hasTenantAccess });

  const today = new Date();

  // Computed stats
  const activeStudents = students.filter((s) => s.status === 'active').length;
  const pendingApplications = applications.filter((a) => ['pending', 'submitted'].includes(a.status)).length;
  const activeEmployees = employees.filter((e) => e.status === 'active').length;
  const pendingLeave = leaveRequests.length;
  const pendingFees = invoices.filter((i) => ['issued', 'partial', 'overdue'].includes(i.status)).reduce((s, i) => s + (i.total_amount - (i.paid_amount || 0)), 0);
  const lastPayRun = payRuns[0];
  const expiredIqamaCount = iqamas.filter((i) => isExpired(i.expiry_date, today)).length;
  const expiringIqama30 = iqamas.filter((i) => isExpiringWithin(i.expiry_date, 30, today)).length;
  const saudiPct = activeEmployees > 0 ? Math.round(employees.filter((e) => e.is_saudi || e.nationality === 'Saudi').length / activeEmployees * 100) : 0;

  // Parent view (unchanged)
  if (userRole === 'parent') {
    const linkedStudents = students.filter((s) => user?.linked_student_ids?.includes(s.id));
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">{isRTL ? `مرحباً، ${[user?.first_name_ar, user?.last_name_ar].filter(Boolean).join(' ') || user?.display_name || user?.full_name}` : `Welcome, ${[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.display_name || user?.full_name}`}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {linkedStudents.map((student) => (
            <Card key={student.id} className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{isRTL ? student.name_ar : student.name_en || student.name_ar}</h3>
                  <p className="text-sm text-slate-600 mt-1">{student.grade}</p>
                  <StatusBadge status={student.status} className="mt-2" />
                </div>
                <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-slate-300" />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <Link to={createPageUrl(`Students?id=${student.id}`)} className="text-sm text-emerald-400 font-medium hover:underline inline-flex items-center gap-1">
                  {isRTL ? 'عرض التفاصيل' : 'View Details'} <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-h-full bg-slate-50/60">
      {/* ── HEADER ── */}
      <DashboardHeader user={user} tenant={tenant} isRTL={isRTL} />

      {/* ── SCHOOL / ADMIN KPIs ── */}
      {isSchoolAdmin && (
        <div>
          <h2 className="text-slate-500 mb-3 text-xs font-bold uppercase tracking-widest">{isRTL ? 'مؤشرات المدرسة' : 'School KPIs'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardKPICard title={isRTL ? 'طلاب نشطون' : 'Active Students'} value={activeStudents} icon={Users} color="blue" href={createPageUrl('Students')} trend={5} animDelay={0} />
            <DashboardKPICard title={isRTL ? 'طلبات تسجيل معلقة' : 'Pending Admissions'} value={pendingApplications} icon={GraduationCap} color="amber" alert={pendingApplications > 0} href={createPageUrl('Admissions')} trend={-2} animDelay={60} />
            <DashboardKPICard title={isRTL ? 'مستحقات مالية' : 'Outstanding Fees'} value={`${pendingFees.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}`} icon={CreditCard} color="red" alert={pendingFees > 0} href={createPageUrl('Fees')} trend={3} animDelay={120} />
            <DashboardKPICard title={isRTL ? 'الفروع' : 'Branches'} value={branches.length} icon={Building2} color="teal" animDelay={180} />
          </div>
        </div>
      )}

      {/* ── HR KPIs ── */}
      {isHR && (
        <div>
          <h2 className="text-slate-500 mb-3 text-xs font-bold uppercase tracking-widest">{isRTL ? 'مؤشرات الموارد البشرية' : 'HR KPIs'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <DashboardKPICard title={isRTL ? 'موظفون نشطون' : 'Active Employees'} value={activeEmployees} icon={Users} color="blue" href={createPageUrl('Employees')} trend={2} animDelay={0} />
            <DashboardKPICard title={isRTL ? 'إجازات معلقة' : 'Pending Leave'} value={pendingLeave} icon={Calendar} color="amber" alert={pendingLeave > 0} href={createPageUrl('HRApprovalsInbox')} trend={pendingLeave > 5 ? 8 : -3} animDelay={60} />
            <DashboardKPICard
              title={isRTL ? 'آخر رواتب' : 'Last Payrun'}
              value={lastPayRun ? (lastPayRun.period || `${lastPayRun.period_month}/${lastPayRun.period_year}`) : '—'}
              sub={lastPayRun ? `${isRTL ? 'الحالة:' : 'Status:'} ${lastPayRun.status}` : isRTL ? 'لا يوجد' : 'None yet'}
              icon={Banknote} color="emerald" href={createPageUrl('Payroll')} animDelay={120}
            />
            <SaudizationRing pct={saudiPct} isRTL={isRTL} animDelay={180} />
          </div>
        </div>
      )}

      {/* ── GOV / COMPLIANCE ALERTS (HR) ── */}
      {isHR && (expiredIqamaCount > 0 || expiringIqama30 > 0 || violations.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {expiredIqamaCount > 0 && (
            <Link to={createPageUrl('GovernmentRelations')}>
              <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-700/50 rounded-xl hover:bg-red-900/30 transition-colors">
                <AlertTriangle className="w-7 h-7 text-red-400 flex-shrink-0" />
                <div><div className="text-lg font-bold text-red-300">{expiredIqamaCount}</div><div className="text-xs text-slate-400">{isRTL ? 'إقامات منتهية' : 'Expired Iqamas'}</div></div>
              </div>
            </Link>
          )}
          {expiringIqama30 > 0 && (
            <Link to={createPageUrl('GovernmentRelations')}>
              <div className="flex items-center gap-3 p-4 bg-amber-900/20 border border-amber-700/50 rounded-xl hover:bg-amber-900/30 transition-colors">
                <Clock className="w-7 h-7 text-amber-400 flex-shrink-0" />
                <div><div className="text-lg font-bold text-amber-300">{expiringIqama30}</div><div className="text-xs text-slate-400">{isRTL ? 'إقامات تنتهي 30 يوم' : 'Iqamas Expiring 30d'}</div></div>
              </div>
            </Link>
          )}
          {violations.length > 0 && (
            <Link to={createPageUrl('GovernmentRelations')}>
              <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-700/50 rounded-xl hover:bg-red-900/30 transition-colors">
                <AlertCircle className="w-7 h-7 text-red-400 flex-shrink-0" />
                <div><div className="text-lg font-bold text-red-300">{violations.length}</div><div className="text-xs text-slate-400">{isRTL ? 'مخالفات مفتوحة' : 'Open Violations'}</div></div>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ── FINANCE KPIs ── */}
      {isFinance && !isSchoolAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <DashboardKPICard title={isRTL ? 'مستحقات (ر.س)' : 'Outstanding (SAR)'} value={pendingFees.toLocaleString()} icon={DollarSign} color="red" href={createPageUrl('Collections')} trend={3} animDelay={0} />
          <DashboardKPICard title={isRTL ? 'إجمالي الفواتير' : 'Total Invoices'} value={invoices.length} icon={FileText} color="blue" href={createPageUrl('Fees')} trend={1} animDelay={60} />
          <DashboardKPICard title={isRTL ? 'آخر رواتب' : 'Last Payrun'} value={lastPayRun ? (lastPayRun.period || `${lastPayRun.period_month}/${lastPayRun.period_year}`) : '—'} icon={Banknote} color="emerald" href={createPageUrl('Payroll')} animDelay={120} />
          <DashboardKPICard title={isRTL ? 'الفروع' : 'Branches'} value={branches.length} icon={Building2} color="teal" animDelay={180} />
        </div>
      )}

      {/* ── QUICK ACTIONS ── */}
      <div>
        <h2 className="text-slate-500 mb-3 text-xs font-bold uppercase tracking-widest">{isRTL ? 'إجراءات سريعة' : 'Quick Actions'}</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {isHR && <>
            <QuickActionTile label={isRTL ? 'إضافة موظف' : 'Add Employee'} icon={UserPlus} href={createPageUrl('Employees')} accentIndex={0} />
            <QuickActionTile label={isRTL ? 'الموافقات' : 'Approvals'} icon={CheckCircle} href={createPageUrl('HRApprovalsInbox')} accentIndex={1} />
            <QuickActionTile label={isRTL ? 'الرواتب' : 'Payroll'} icon={Banknote} href={createPageUrl('Payroll')} accentIndex={2} />
            <QuickActionTile label={isRTL ? 'الإجازات' : 'Leaves'} icon={Calendar} href={createPageUrl('Leaves')} accentIndex={3} />
            <QuickActionTile label={isRTL ? 'يامن AI' : 'Yamen AI'} icon={Bot} href={createPageUrl('YamenAI')} accentIndex={4} />
            <QuickActionTile label={isRTL ? 'العلاقات الحكومية' : 'Gov. Relations'} icon={Shield} href={createPageUrl('GovernmentRelations')} accentIndex={5} />
            <QuickActionTile label={isRTL ? 'إنشاء تقرير' : 'Generate Report'} icon={BarChart3} href={createPageUrl('Reports')} accentIndex={6} />
          </>}
          {isSchoolAdmin && <>
            <QuickActionTile label={isRTL ? 'إضافة طالب' : 'Add Student'} icon={Plus} href={createPageUrl('Students')} accentIndex={0} />
            <QuickActionTile label={isRTL ? 'الطلبات' : 'Admissions'} icon={GraduationCap} href={createPageUrl('Admissions')} accentIndex={1} />
            <QuickActionTile label={isRTL ? 'الرسوم' : 'Fees'} icon={CreditCard} href={createPageUrl('Fees')} accentIndex={2} />
            <QuickActionTile label={isRTL ? 'الحضور' : 'Attendance'} icon={ClipboardCheck} href={createPageUrl('StudentAttendancePage')} accentIndex={3} />
            <QuickActionTile label={isRTL ? 'ملف زاتكا' : 'ZATCA Filing'} icon={Receipt} href={createPageUrl('VATManagement')} accentIndex={4} />
            <QuickActionTile label={isRTL ? 'إنشاء تقرير' : 'Generate Report'} icon={BarChart3} href={createPageUrl('Reports')} accentIndex={5} />
          </>}
          {isFinance && !isHR && !isSchoolAdmin && <>
            <QuickActionTile label={isRTL ? 'الفواتير' : 'Invoices'} icon={FileText} href={createPageUrl('Fees')} accentIndex={0} />
            <QuickActionTile label={isRTL ? 'التحصيل' : 'Collections'} icon={Banknote} href={createPageUrl('Collections')} accentIndex={1} />
            <QuickActionTile label={isRTL ? 'قيود يومية' : 'Journals'} icon={Briefcase} href={createPageUrl('JournalEntries')} accentIndex={2} />
            <QuickActionTile label={isRTL ? 'ملف زاتكا' : 'ZATCA Filing'} icon={Receipt} href={createPageUrl('VATManagement')} accentIndex={3} />
            <QuickActionTile label={isRTL ? 'إنشاء تقرير' : 'Generate Report'} icon={BarChart3} href={createPageUrl('Reports')} accentIndex={4} />
          </>}
        </div>
      </div>

      {/* ── ANALYTICS ── */}
      {(isSchoolAdmin || isFinance || isHR) && (
        <DashboardAnalytics students={students} invoices={invoices} isRTL={isRTL} />
      )}

      {/* ── RECENT ACTIVITY ── */}
      <ActivityPanel
        leaveRequests={leaveRequests}
        applications={applications}
        invoices={invoices}
        isHR={isHR}
        isSchoolAdmin={isSchoolAdmin}
        isFinance={isFinance}
        isRTL={isRTL}
      />
    </div>
  );
}