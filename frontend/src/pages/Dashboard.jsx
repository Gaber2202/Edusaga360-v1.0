import React from 'react';
import { useTenantQuery } from '../hooks/useTenantQuery';
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
  UserPlus, Briefcase, Receipt, BookOpen, Megaphone,
  Headphones, Wrench, ShoppingCart, Monitor,
  TrendingUp, Percent, Wallet,
} from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenant } from '../components/TenantContext';
import { formatCurrency, getCurrencySymbol } from '../lib/localization';
import { isExpired, isExpiringWithin } from '../lib/dateCompare';
import { countSeries, amountSeries, cumulativeSeries } from '../lib/dashboardMetrics';

import DashboardKPICard from '../components/dashboard/DashboardKPICard';
import SaudizationRing from '../components/dashboard/SaudizationRing';
import QuickActionTile from '../components/dashboard/QuickActionTile';
import JurisdictionFeatureGate from '../components/JurisdictionFeatureGate';
import { PAGE_FEATURE_KEYS, EINVOICING_FEATURES } from '../lib/jurisdictionFeatures.js';
import DashboardAnalytics from '../components/dashboard/DashboardAnalytics';
import ActivityPanel from '../components/dashboard/ActivityPanel';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import GettingStartedPanel from '../components/dashboard/GettingStartedPanel';
import AlertBanner from '../components/dashboard/AlertBanner';

const SectionLabel = ({ children, action }) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-muted-foreground text-xs font-bold uppercase tracking-widest">{children}</h2>
    {action}
  </div>
);

export default function Dashboard() {
  const { t: _t, isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const { tenantId, hasTenantAccess } = useTenantFilter();
  const { tenant } = useTenant();

  const isCreator = userRole === 'creator';
  const isHR = isCreator || ['admin', 'hr_admin', 'hr_officer'].includes(userRole);
  const isFinance = isCreator || ['admin', 'finance', 'accountant'].includes(userRole);
  const isSchoolAdmin = isCreator || ['admin', 'admissions', 'branch_manager'].includes(userRole);
  const isBranchMgr = userRole === 'branch_manager';
  const isTeacher = userRole === 'teacher';
  const isParent = userRole === 'parent';

  // ── Data queries (each gated to the personas that need it) ──────────────────
  const useTableQuery = (key, table, filt = {}, enabled = true) => useTenantQuery(
    [key, tenantId],
    async () => { const { data } = await tenantQuery(table).select('*').match(filt); return data || []; },
    { enabled: hasTenantAccess && enabled }
  );

  const { data: students = [] } = useTableQuery('students', 'students', {}, isSchoolAdmin || isParent || isTeacher);
  const { data: applications = [] } = useTableQuery('applications', 'applications', {}, isSchoolAdmin);
  const { data: invoices = [] } = useTableQuery('invoices', 'invoices', {}, isFinance || isSchoolAdmin);
  const { data: employees = [] } = useTableQuery('employees', 'employees', {}, isHR || isBranchMgr);
  const { data: leaveRequests = [] } = useTableQuery('leaveReqDash', 'leave_requests', { status: 'pending' }, isHR || isBranchMgr);
  const { data: payRuns = [] } = useTableQuery('payRunsDash', 'pay_runs', {}, isHR || isFinance);
  const { data: iqamas = [] } = useTableQuery('iqamasDash', 'iqama_records', {}, false); // table not built (Bucket C)
  const { data: violations = [] } = useTableQuery('violationsDash', 'govi_violations', { status: 'open' }, false); // table not built (Bucket C)
  const { data: branches = [] } = useTableQuery('branches', 'branches', { status: 'active' }, true);
  const { data: sections = [] } = useTableQuery('sectionsDash', 'sections', {}, isSchoolAdmin || isBranchMgr);
  const { data: teacherSections = [] } = useTableQuery('teacherSections', 'sections', {}, isTeacher);
  const { data: attendance = [] } = useTableQuery('teacherAttendance', 'student_attendances', {}, isTeacher);
  const { data: announcements = [] } = useTableQuery('teacherComms', 'communications', {}, isTeacher);

  const today = new Date();

  // ── Computed stats ──────────────────────────────────────────────────────────
  const activeStudents = students.filter((s) => s.status === 'active').length;
  const pendingApplications = applications.filter((a) => ['pending', 'submitted'].includes(a.status) || !a.decision).length;
  const acceptedApplications = applications.filter((a) => a.decision === 'accepted' || a.status === 'accepted').length;
  const activeEmployees = employees.filter((e) => e.status === 'active').length;
  const pendingLeave = leaveRequests.length;
  const unpaidInvoices = invoices.filter((i) => ['issued', 'partial', 'overdue'].includes(i.status));
  const pendingFees = unpaidInvoices.reduce((s, i) => s + (i.total_amount - (i.paid_amount || 0)), 0);
  const totalBilled = invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
  const totalCollected = invoices.reduce((s, i) => s + (i.paid_amount || 0), 0);
  const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 1000) / 10 : null;
  const overdueInvoices = invoices.filter((i) => i.status !== 'paid' && i.due_date && new Date(i.due_date) < today).length;
  const paidInvoices = invoices.filter((i) => i.status === 'paid').length;
  const totalCapacity = sections.reduce((s, sec) => s + (Number(sec.capacity) || 0), 0);
  const capacityUtil = totalCapacity > 0 ? Math.round((activeStudents / totalCapacity) * 100) : null;
  const monthKey = today.toISOString().slice(0, 7);
  const newEnrollmentsMonth = students.filter((s) => s.enrollment_date?.startsWith(monthKey)).length;
  const lastPayRun = payRuns[0];
  const expiredIqamaCount = iqamas.filter((i) => isExpired(i.expiry_date, today)).length;
  const expiringIqama30 = iqamas.filter((i) => isExpiringWithin(i.expiry_date, 30, today)).length;
  const saudiPct = activeEmployees > 0 ? Math.round(employees.filter((e) => e.is_saudi).length / activeEmployees * 100) : 0;

  // ── Real-data sparkline series (no fabricated numbers) ──────────────────────
  const studentSeries = cumulativeSeries(students.filter((s) => s.status === 'active'));
  const applicationSeries = countSeries(applications);
  const feesSeries = amountSeries(unpaidInvoices, (i) => i.total_amount - (i.paid_amount || 0));
  const invoiceSeries = countSeries(invoices);
  const collectedSeries = amountSeries(invoices.filter((i) => (i.paid_amount || 0) > 0), (i) => i.paid_amount || 0);
  const employeeSeries = cumulativeSeries(employees.filter((e) => e.status === 'active'));
  const leaveSeries = countSeries(leaveRequests);

  // ── PARENT VIEW ──────────────────────────────────────────────────────────────
  if (isParent) {
    const linkedStudents = students.filter((s) => user?.linked_student_ids?.includes(s.id));
    return (
      <div className="space-y-6">
        <DashboardHeader user={user} tenant={tenant} isRTL={isRTL} />
        <SectionLabel>{isRTL ? 'أبنائي' : 'My Children'}</SectionLabel>
        {linkedStudents.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-2">
            <GraduationCap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">{isRTL ? 'لا يوجد طلاب مرتبطون بحسابك بعد.' : 'No students are linked to your account yet.'}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {linkedStudents.map((student) => (
              <Card key={student.id} className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
                <div className="h-1.5 bg-gradient-to-r from-najdi-900 to-emerald-500" />
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-ink text-lg">{isRTL ? student.name_ar : student.name_en || student.name_ar}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{student.grade}</p>
                      <StatusBadge status={student.status} className="mt-2" />
                    </div>
                    <div className="w-12 h-12 bg-gradient-to-br from-najdi-900 to-najdi-700 rounded-xl flex items-center justify-center shadow-sm">
                      <GraduationCap className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border flex gap-3">
                    <Link to={createPageUrl(`Students?id=${student.id}`)} className="text-sm text-najdi-700 font-medium hover:underline inline-flex items-center gap-1">
                      {isRTL ? 'عرض التفاصيل' : 'View Details'} <ArrowUpRight className="w-4 h-4" />
                    </Link>
                    <Link to={createPageUrl('Fees')} className="text-sm text-emerald-600 font-medium hover:underline inline-flex items-center gap-1">
                      {isRTL ? 'الرسوم' : 'Fees'} <CreditCard className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── TEACHER VIEW ──────────────────────────────────────────────────────────────
  if (isTeacher) {
    const myStudents = students.filter((s) => s.status === 'active');
    const todayStr = today.toISOString().split('T')[0];
    const todayAttendance = attendance.filter((a) => (a.date || a.attendance_date || '').startsWith(todayStr));
    const presentToday = todayAttendance.filter((a) => a.status === 'present').length;
    const absentToday = todayAttendance.filter((a) => a.status === 'absent').length;
    const recentAnnouncements = [...announcements].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 4);

    return (
      <div className="space-y-6">
        <DashboardHeader user={user} tenant={tenant} isRTL={isRTL} snapshot={[
          { label: isRTL ? 'طلاب' : 'Students', value: myStudents.length },
          { label: isRTL ? 'حاضر' : 'Present', value: presentToday },
          { label: isRTL ? 'غائب' : 'Absent', value: absentToday },
        ]} />
        <SectionLabel>{isRTL ? 'فصلي اليوم' : 'My Classroom Today'}</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <DashboardKPICard id="teacher-students" title={isRTL ? 'طلابي' : 'My Students'} value={myStudents.length} icon={Users} color="blue" href={createPageUrl('Students')} series={cumulativeSeries(myStudents).series} animDelay={0} />
          <DashboardKPICard id="teacher-sections" title={isRTL ? 'الفصول' : 'Sections'} value={teacherSections.length} icon={BookOpen} color="purple" animDelay={60} />
          <DashboardKPICard id="teacher-present" title={isRTL ? 'حضور اليوم' : 'Present Today'} value={presentToday} icon={CheckCircle} color="emerald" animDelay={120} />
          <DashboardKPICard id="teacher-absent" title={isRTL ? 'غياب اليوم' : 'Absent Today'} value={absentToday} icon={AlertCircle} color="amber" alert={absentToday > 0} animDelay={180} />
          <DashboardKPICard id="teacher-attendance" title={isRTL ? 'نسبة الحضور' : 'Attendance Rate'} value={todayAttendance.length > 0 ? `${Math.round((presentToday / todayAttendance.length) * 100)}%` : '—'} icon={Percent} color="teal" animDelay={240} />
          <DashboardKPICard id="teacher-comms" title={isRTL ? 'إعلانات' : 'Announcements'} value={announcements.length} icon={Megaphone} color="slate" animDelay={300} />
        </div>

        <div>
          <SectionLabel>{isRTL ? 'إجراءات سريعة' : 'Quick Actions'}</SectionLabel>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <QuickActionTile label={isRTL ? 'تسجيل الحضور' : 'Take Attendance'} icon={ClipboardCheck} href={createPageUrl('StudentAttendancePage')} accentIndex={0} />
            <QuickActionTile label={isRTL ? 'طلابي' : 'My Students'} icon={Users} href={createPageUrl('Students')} accentIndex={1} />
            <QuickActionTile label={isRTL ? 'العيادة' : 'Clinic'} icon={ClipboardCheck} href={createPageUrl('SchoolClinic')} accentIndex={2} />
            <QuickActionTile label={isRTL ? 'المكتبة' : 'Library'} icon={BookOpen} href={createPageUrl('LibraryManagement')} accentIndex={3} />
          </div>
        </div>

        <div>
          <SectionLabel>{isRTL ? 'آخر الإعلانات' : 'Recent Announcements'}</SectionLabel>
          <Card className="divide-y divide-border">
            {recentAnnouncements.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">{isRTL ? 'لا توجد إعلانات' : 'No announcements yet'}</div>
            ) : recentAnnouncements.map((a) => (
              <div key={a.id} className="p-4 flex items-start gap-3">
                <Megaphone className="w-4 h-4 text-najdi-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{a.subject || a.title || (isRTL ? 'إعلان' : 'Announcement')}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.body || a.message || ''}</p>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    );
  }

  // ── ADMIN / HR / FINANCE / BRANCH-MANAGER VIEW ─────────────────────────────────
  const isOpsRole = ['collections', 'procurement', 'crm_agent', 'it_admin', 'it_support', 'facilities_manager'].includes(userRole);
  const hasAnyKpiBlock = isSchoolAdmin || isHR || isFinance;

  const headerSnapshot = hasAnyKpiBlock ? [
    ...(isSchoolAdmin ? [{ label: isRTL ? 'طلاب' : 'Students', value: activeStudents }] : []),
    ...(isFinance || isSchoolAdmin ? [{ label: isRTL ? 'تحصيل' : 'Collection', value: collectionRate != null ? `${collectionRate}%` : '—' }] : []),
    ...(isHR ? [{ label: isRTL ? 'موظفون' : 'Staff', value: activeEmployees }] : []),
    ...(pendingLeave > 0 ? [{ label: isRTL ? 'إجازات' : 'Leave', value: pendingLeave }] : []),
  ].slice(0, 4) : undefined;

  return (
    <div className="space-y-6 min-h-full">
      <DashboardHeader user={user} tenant={tenant} isRTL={isRTL} snapshot={headerSnapshot} />

      {/* First-run onboarding (admins only) */}
      {(userRole === 'admin' || isCreator) && (
        <GettingStartedPanel
          isRTL={isRTL}
          tenant={tenant}
          counts={{ students: students.length, employees: employees.length, branches: branches.length, invoices: invoices.length }}
        />
      )}

      {/* SCHOOL / ADMIN KPIs */}
      {isSchoolAdmin && (
        <div>
          <SectionLabel>{isRTL ? 'مؤشرات المدرسة' : 'School KPIs'}</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <DashboardKPICard id="school-students" title={isRTL ? 'طلاب نشطون' : 'Active Students'} value={activeStudents} icon={Users} color="blue" href={createPageUrl('Students')} series={studentSeries.series} trend={studentSeries.trend} animDelay={0} />
            <DashboardKPICard id="school-admissions" title={isRTL ? 'طلبات معلقة' : 'Pending Admissions'} value={pendingApplications} icon={GraduationCap} color="amber" alert={pendingApplications > 0} href={createPageUrl('Admissions')} series={applicationSeries.series} trend={applicationSeries.trend} animDelay={60} />
            <DashboardKPICard id="school-accepted" title={isRTL ? 'مقبولون' : 'Accepted'} value={acceptedApplications} icon={UserPlus} color="emerald" href={createPageUrl('Admissions')} animDelay={120} />
            <DashboardKPICard id="school-fees" title={isRTL ? 'مستحقات مالية' : 'Outstanding Fees'} value={formatCurrency(pendingFees, tenant?.localization, isRTL)} icon={CreditCard} color="red" alert={pendingFees > 0} href={createPageUrl('Fees')} series={feesSeries.series} trend={feesSeries.trend} animDelay={180} />
            <DashboardKPICard id="school-collection" title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'} value={collectionRate != null ? `${collectionRate}%` : '—'} icon={Percent} color={collectionRate != null && collectionRate < 80 ? 'amber' : 'emerald'} href={createPageUrl('Collections')} series={collectedSeries.series} trend={collectedSeries.trend} animDelay={240} />
            <DashboardKPICard id="school-capacity" title={isRTL ? 'استغلال السعة' : 'Capacity Used'} value={capacityUtil != null ? `${capacityUtil}%` : '—'} sub={totalCapacity > 0 ? `${activeStudents}/${totalCapacity}` : undefined} icon={Building2} color={capacityUtil != null && capacityUtil >= 85 ? 'emerald' : capacityUtil != null && capacityUtil < 60 ? 'red' : 'teal'} animDelay={300} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <DashboardKPICard id="school-overdue" title={isRTL ? 'فواتير متأخرة' : 'Overdue Invoices'} value={overdueInvoices} icon={AlertTriangle} color="red" alert={overdueInvoices > 0} href={createPageUrl('Fees')} animDelay={0} />
            <DashboardKPICard id="school-collected" title={isRTL ? 'إجمالي المحصّل' : 'Total Collected'} value={formatCurrency(totalCollected, tenant?.localization, isRTL)} icon={Wallet} color="emerald" href={createPageUrl('Collections')} series={collectedSeries.series} animDelay={60} />
            <DashboardKPICard id="school-enrollments" title={isRTL ? 'تسجيلات هذا الشهر' : 'Enrollments This Month'} value={newEnrollmentsMonth} icon={TrendingUp} color="purple" animDelay={120} />
            <DashboardKPICard id="school-branches" title={isRTL ? 'الفروع' : 'Branches'} value={branches.length} icon={Building2} color="teal" animDelay={180} />
          </div>
        </div>
      )}

      {/* HR KPIs */}
      {isHR && (
        <div>
          <SectionLabel>{isRTL ? 'مؤشرات الموارد البشرية' : 'HR KPIs'}</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <DashboardKPICard id="hr-employees" title={isRTL ? 'موظفون نشطون' : 'Active Employees'} value={activeEmployees} icon={Users} color="blue" href={createPageUrl('Employees')} series={employeeSeries.series} trend={employeeSeries.trend} animDelay={0} />
            <DashboardKPICard id="hr-leave" title={isRTL ? 'إجازات معلقة' : 'Pending Leave'} value={pendingLeave} icon={Calendar} color="amber" alert={pendingLeave > 0} href={createPageUrl('HRApprovalsInbox')} series={leaveSeries.series} trend={leaveSeries.trend} animDelay={60} />
            <DashboardKPICard
              id="hr-payrun"
              title={isRTL ? 'آخر رواتب' : 'Last Payrun'}
              value={lastPayRun ? (lastPayRun.period || `${lastPayRun.period_month}/${lastPayRun.period_year}`) : '—'}
              sub={lastPayRun ? `${isRTL ? 'الحالة:' : 'Status:'} ${lastPayRun.status}` : isRTL ? 'لا يوجد' : 'None yet'}
              icon={Banknote} color="emerald" href={createPageUrl('Payroll')} animDelay={120}
            />
            <DashboardKPICard id="hr-branches" title={isRTL ? 'الفروع' : 'Branches'} value={branches.length} icon={Building2} color="teal" animDelay={180} />
            <SaudizationRing pct={saudiPct} isRTL={isRTL} animDelay={240} />
          </div>
        </div>
      )}

      {/* GOV / COMPLIANCE ALERTS (HR) */}
      <JurisdictionFeatureGate featureKeys={PAGE_FEATURE_KEYS.GovernmentRelations}>
      {isHR && (expiredIqamaCount > 0 || expiringIqama30 > 0 || violations.length > 0) && (
        <AlertBanner
          isRTL={isRTL}
          items={[
            ...(expiredIqamaCount > 0 ? [{ key: 'expired', count: expiredIqamaCount, label: isRTL ? 'إقامات منتهية' : 'Expired Iqamas', href: createPageUrl('GovernmentRelations'), variant: 'red' }] : []),
            ...(expiringIqama30 > 0 ? [{ key: 'expiring', count: expiringIqama30, label: isRTL ? 'إقامات تنتهي 30 يوم' : 'Iqamas Expiring 30d', href: createPageUrl('GovernmentRelations'), variant: 'amber', icon: Clock }] : []),
            ...(violations.length > 0 ? [{ key: 'violations', count: violations.length, label: isRTL ? 'مخالفات مفتوحة' : 'Open Violations', href: createPageUrl('GovernmentRelations'), variant: 'red', icon: AlertCircle }] : []),
          ]}
        />
      )}
      </JurisdictionFeatureGate>

      {/* FINANCE KPIs */}
      {isFinance && !isSchoolAdmin && (
        <div>
          <SectionLabel>{isRTL ? 'مؤشرات المالية' : 'Finance KPIs'}</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <DashboardKPICard id="fin-outstanding" title={isRTL ? `مستحقات (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Outstanding (${getCurrencySymbol(tenant?.localization, isRTL)})`} value={formatCurrency(pendingFees, tenant?.localization, isRTL)} icon={DollarSign} color="red" href={createPageUrl('Collections')} series={feesSeries.series} trend={feesSeries.trend} animDelay={0} />
            <DashboardKPICard id="fin-collected" title={isRTL ? 'إجمالي المحصّل' : 'Total Collected'} value={formatCurrency(totalCollected, tenant?.localization, isRTL)} icon={Wallet} color="emerald" href={createPageUrl('Collections')} series={collectedSeries.series} trend={collectedSeries.trend} animDelay={60} />
            <DashboardKPICard id="fin-rate" title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'} value={collectionRate != null ? `${collectionRate}%` : '—'} icon={Percent} color={collectionRate != null && collectionRate < 80 ? 'amber' : 'emerald'} animDelay={120} />
            <DashboardKPICard id="fin-invoices" title={isRTL ? 'إجمالي الفواتير' : 'Total Invoices'} value={invoices.length} icon={FileText} color="blue" href={createPageUrl('Fees')} series={invoiceSeries.series} trend={invoiceSeries.trend} animDelay={180} />
            <DashboardKPICard id="fin-paid" title={isRTL ? 'فواتير مدفوعة' : 'Paid Invoices'} value={paidInvoices} icon={CheckCircle} color="teal" animDelay={240} />
            <DashboardKPICard id="fin-overdue" title={isRTL ? 'متأخرة' : 'Overdue'} value={overdueInvoices} icon={AlertTriangle} color="red" alert={overdueInvoices > 0} href={createPageUrl('Fees')} animDelay={300} />
          </div>
        </div>
      )}

      {/* OPERATIONS-ONLY ROLES — give them a relevant landing instead of an empty page */}
      {isOpsRole && !hasAnyKpiBlock && (
        <Card className="p-6">
          <SectionLabel>{isRTL ? 'مساحة عملك' : 'Your Workspace'}</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {userRole === 'collections' && <QuickActionTile label={isRTL ? 'التحصيل' : 'Collections'} icon={Banknote} href={createPageUrl('Collections')} accentIndex={0} />}
            {userRole === 'procurement' && <>
              <QuickActionTile label={isRTL ? 'الموردون' : 'Vendors'} icon={ShoppingCart} href={createPageUrl('Vendors')} accentIndex={0} />
              <QuickActionTile label={isRTL ? 'أوامر الشراء' : 'Purchase Orders'} icon={FileText} href={createPageUrl('PurchaseOrders')} accentIndex={1} />
            </>}
            {userRole === 'crm_agent' && <QuickActionTile label={isRTL ? 'علاقات العملاء' : 'CRM'} icon={Headphones} href={createPageUrl('CRM')} accentIndex={0} />}
            {(userRole === 'it_admin' || userRole === 'it_support') && <QuickActionTile label={isRTL ? 'الدعم الفني' : 'IT Helpdesk'} icon={Monitor} href={createPageUrl('ITHelpdesk')} accentIndex={0} />}
            {userRole === 'facilities_manager' && <QuickActionTile label={isRTL ? 'المرافق' : 'Facilities'} icon={Wrench} href={createPageUrl('Facilities')} accentIndex={0} />}
            <QuickActionTile label={isRTL ? 'العمليات' : 'Operations'} icon={BarChart3} href={createPageUrl('OperationsDashboard')} accentIndex={3} />
          </div>
        </Card>
      )}

      {/* QUICK ACTIONS */}
      {hasAnyKpiBlock && (
        <div>
          <SectionLabel>{isRTL ? 'إجراءات سريعة' : 'Quick Actions'}</SectionLabel>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {isHR && <>
              <QuickActionTile label={isRTL ? 'إضافة موظف' : 'Add Employee'} icon={UserPlus} href={createPageUrl('Employees')} accentIndex={0} />
              <QuickActionTile label={isRTL ? 'الموافقات' : 'Approvals'} icon={CheckCircle} href={createPageUrl('HRApprovalsInbox')} accentIndex={1} />
              <QuickActionTile label={isRTL ? 'الرواتب' : 'Payroll'} icon={Banknote} href={createPageUrl('Payroll')} accentIndex={2} />
              <QuickActionTile label={isRTL ? 'الإجازات' : 'Leaves'} icon={Calendar} href={createPageUrl('Leaves')} accentIndex={3} />
              <QuickActionTile label={isRTL ? 'يامن AI' : 'Yamen AI'} icon={Bot} href={createPageUrl('YamenAI')} accentIndex={4} />
              <JurisdictionFeatureGate featureKeys={PAGE_FEATURE_KEYS.GovernmentRelations}>
                <QuickActionTile label={isRTL ? 'العلاقات الحكومية' : 'Gov. Relations'} icon={Shield} href={createPageUrl('GovernmentRelations')} accentIndex={5} />
              </JurisdictionFeatureGate>
              <QuickActionTile label={isRTL ? 'إنشاء تقرير' : 'Generate Report'} icon={BarChart3} href={createPageUrl('Reports')} accentIndex={6} />
            </>}
            {isSchoolAdmin && <>
              <QuickActionTile label={isRTL ? 'إضافة طالب' : 'Add Student'} icon={Plus} href={createPageUrl('Students')} accentIndex={0} />
              <QuickActionTile label={isRTL ? 'الطلبات' : 'Admissions'} icon={GraduationCap} href={createPageUrl('Admissions')} accentIndex={1} />
              <QuickActionTile label={isRTL ? 'الرسوم' : 'Fees'} icon={CreditCard} href={createPageUrl('Fees')} accentIndex={2} />
              <QuickActionTile label={isRTL ? 'الحضور' : 'Attendance'} icon={ClipboardCheck} href={createPageUrl('StudentAttendancePage')} accentIndex={3} />
              <JurisdictionFeatureGate featureKeys={EINVOICING_FEATURES}>
              <QuickActionTile label={isRTL ? 'ملف زاتكا' : 'ZATCA Filing'} icon={Receipt} href={createPageUrl('VATManagement')} accentIndex={4} />
            </JurisdictionFeatureGate>
              <QuickActionTile label={isRTL ? 'إنشاء تقرير' : 'Generate Report'} icon={BarChart3} href={createPageUrl('Reports')} accentIndex={5} />
            </>}
            {isFinance && !isHR && !isSchoolAdmin && <>
              <QuickActionTile label={isRTL ? 'الفواتير' : 'Invoices'} icon={FileText} href={createPageUrl('Fees')} accentIndex={0} />
              <QuickActionTile label={isRTL ? 'التحصيل' : 'Collections'} icon={Banknote} href={createPageUrl('Collections')} accentIndex={1} />
              <QuickActionTile label={isRTL ? 'قيود يومية' : 'Journals'} icon={Briefcase} href={createPageUrl('JournalEntries')} accentIndex={2} />
              <JurisdictionFeatureGate featureKeys={EINVOICING_FEATURES}>
                <QuickActionTile label={isRTL ? 'ملف زاتكا' : 'ZATCA Filing'} icon={Receipt} href={createPageUrl('VATManagement')} accentIndex={3} />
              </JurisdictionFeatureGate>
              <QuickActionTile label={isRTL ? 'إنشاء تقرير' : 'Generate Report'} icon={BarChart3} href={createPageUrl('Reports')} accentIndex={4} />
            </>}
          </div>
        </div>
      )}

      {/* ANALYTICS */}
      {hasAnyKpiBlock && (
        <DashboardAnalytics students={students} invoices={invoices} employees={employees} payRuns={payRuns} attendanceRecords={[]} isRTL={isRTL} />
      )}

      {/* RECENT ACTIVITY */}
      {hasAnyKpiBlock && (
        <ActivityPanel
          leaveRequests={leaveRequests}
          applications={applications}
          invoices={invoices}
          isHR={isHR}
          isSchoolAdmin={isSchoolAdmin}
          isFinance={isFinance}
          isRTL={isRTL}
        />
      )}
    </div>
  );
}
