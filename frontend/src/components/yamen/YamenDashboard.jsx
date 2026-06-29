import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { AlertTriangle, Clock, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { differenceInDays } from 'date-fns';
import { useTenantFilter } from '../../hooks/useTenantFilter';

function riskColor(score) {
  if (score >= 70) return { dot: 'bg-red-500', text: 'text-red-400', label: { ar: 'عالي', en: 'High' }, badge: 'bg-red-900/40 text-red-300 border-red-700' };
  if (score >= 40) return { dot: 'bg-amber-500', text: 'text-amber-400', label: { ar: 'متوسط', en: 'Medium' }, badge: 'bg-amber-900/40 text-amber-300 border-amber-700' };
  return { dot: 'bg-emerald-500', text: 'text-emerald-400', label: { ar: 'منخفض', en: 'Low' }, badge: 'bg-emerald-900/40 text-emerald-300 border-emerald-700' };
}

export default function YamenDashboard({ isRTL }) {
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const { data: employees = [] } = useQuery({ queryKey: ['employees', tenantId], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter())), enabled: hasTenantAccess });
  const { data: attendance = [] } = useQuery({ queryKey: ['employeeAttendance', tenantId], queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').match(tenantFilter()).order('date', { ascending: false }).limit(200)), enabled: hasTenantAccess });
  const { data: leaves = [] } = useQuery({ queryKey: ['leaveRequests', tenantId], queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(100)), enabled: hasTenantAccess });
  const { data: iqamaRecords = [] } = useQuery({ queryKey: ['iqamaRecords', tenantId], queryFn: () => fetchData(tenantQuery('iqama_records').select('*').match(tenantFilter())), enabled: hasTenantAccess });
  const { data: evaluations = [] } = useQuery({ queryKey: ['performanceEvals', tenantId], queryFn: () => fetchData(tenantQuery('performance_evaluations').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(100)), enabled: hasTenantAccess });
  const { data: _payrollInputs = [] } = useQuery({ queryKey: ['payrollInputs', tenantId], queryFn: () => fetchData(tenantQuery('payroll_inputs').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(200)), enabled: hasTenantAccess });

  const today = new Date();

  const riskEmployees = useMemo(() => {
    return employees.filter((e) => e.status === 'active').map((emp) => {
      // Attendance risk
      const empAtt = attendance.filter((a) => a.employee_id === emp.id);
      const absences = empAtt.filter((a) => a.status === 'absent').length;
      const lates = empAtt.filter((a) => a.status === 'late').length;
      const attRisk = Math.min(100, absences * 15 + lates * 5);

      // Compliance risk (iqama)
      const iqama = iqamaRecords.find((i) => i.employee_id === emp.id);
      let compRisk = 0;
      if (!iqama && !emp.is_saudi) compRisk = 60;else
      if (iqama?.expiry_date) {
        const daysLeft = differenceInDays(new Date(iqama.expiry_date), today);
        if (daysLeft < 0) compRisk = 100;else
        if (daysLeft < 30) compRisk = 80;else
        if (daysLeft < 90) compRisk = 40;
      }

      // Payroll risk
      const payRisk = !emp.basic_salary ? 50 : !emp.iban ? 30 : 0;

      // Performance
      const empEvals = evaluations.filter((e) => e.employee_id === emp.id);
      let perfRisk = 0;
      if (empEvals.length > 0) {
        const avg = empEvals.reduce((s, e) => s + (e.overall_score || 0), 0) / empEvals.length;
        if (avg < 40) perfRisk = 80;else
        if (avg < 60) perfRisk = 40;
      }

      const overall = Math.round(attRisk * 0.35 + compRisk * 0.3 + payRisk * 0.15 + perfRisk * 0.2);
      return { ...emp, attRisk, compRisk, payRisk, perfRisk, overallRisk: overall, iqama };
    }).sort((a, b) => b.overallRisk - a.overallRisk);
  }, [employees, attendance, iqamaRecords, evaluations]);

  const highRisk = riskEmployees.filter((e) => e.overallRisk >= 70).length;
  const medRisk = riskEmployees.filter((e) => e.overallRisk >= 40 && e.overallRisk < 70).length;

  const iqamaExpiringSoon = iqamaRecords.filter((i) => {
    if (!i.expiry_date) return false;
    const d = differenceInDays(new Date(i.expiry_date), today);
    return d >= 0 && d <= 90;
  });
  const iqamaExpired = iqamaRecords.filter((i) => {
    if (!i.expiry_date) return false;
    return differenceInDays(new Date(i.expiry_date), today) < 0;
  });

  const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;
  const activeEmployees = employees.filter((e) => e.status === 'active').length;
  const saudiCount = employees.filter((e) => e.is_saudi).length;
  const saudizationPct = activeEmployees > 0 ? Math.round(saudiCount / activeEmployees * 100) : 0;

  const hrHealthScore = Math.max(0, 100 - highRisk * 8 - iqamaExpired.length * 5 - Math.round(pendingLeaves * 0.5));

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'صحة الموارد البشرية' : 'HR Health Score'}</p>
            <p className={`text-3xl font-bold ${hrHealthScore >= 70 ? 'text-emerald-400' : hrHealthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{hrHealthScore}%</p>
            <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'من 100' : 'out of 100'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'نسبة السعودة' : 'Saudization %'}</p>
            <p className={`text-3xl font-bold ${saudizationPct >= 40 ? 'text-emerald-400' : 'text-amber-400'}`}>{saudizationPct}%</p>
            <p className="text-xs text-muted-foreground mt-1">{saudiCount} / {activeEmployees}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'موظفون عالي المخاطر' : 'High Risk Employees'}</p>
            <p className="text-3xl font-bold text-red-400">{highRisk}</p>
            <p className="text-xs text-muted-foreground mt-1">{medRisk} {isRTL ? 'متوسط المخاطر' : 'medium risk'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'إقامات منتهية/قريبة' : 'Iqama Alerts'}</p>
            <p className="text-3xl font-bold text-amber-400">{iqamaExpired.length + iqamaExpiringSoon.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{iqamaExpired.length} {isRTL ? 'منتهية' : 'expired'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Center */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            {isRTL ? 'مركز التنبيهات والإجراءات' : 'Action Center'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {iqamaExpired.length > 0 && (
              <Link to={createPageUrl('GovernmentRelations')} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 hover:border-red-400 hover:bg-red-100 transition-colors group">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700">
                    {isRTL ? `${iqamaExpired.length} إقامة منتهية الصلاحية` : `${iqamaExpired.length} expired Iqama(s)`}
                  </p>
                  <p className="text-xs text-red-500/70">{isRTL ? 'انقر للانتقال إلى العلاقات الحكومية' : 'Click to go to Government Relations'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {iqamaExpiringSoon.length > 0 && (
              <Link to={createPageUrl('GovernmentRelations')} className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 hover:border-amber-400 hover:bg-amber-100 transition-colors group">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-700">
                    {isRTL ? `${iqamaExpiringSoon.length} إقامة تنتهي خلال 90 يوم` : `${iqamaExpiringSoon.length} Iqama(s) expiring within 90 days`}
                  </p>
                  <p className="text-xs text-amber-500/70">{isRTL ? 'انقر للانتقال إلى العلاقات الحكومية' : 'Click to go to Government Relations'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {pendingLeaves > 0 && (
              <Link to={createPageUrl('HRApprovalsInbox')} className="flex items-center gap-3 p-3 rounded-lg bg-najdi-50 border border-najdi-100 hover:border-najdi-500 hover:bg-najdi-50 transition-colors group">
                <Clock className="w-5 h-5 text-najdi-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-najdi-900">
                    {isRTL ? `${pendingLeaves} طلب إجازة معلق` : `${pendingLeaves} pending leave request(s)`}
                  </p>
                  <p className="text-xs text-najdi-500/70">{isRTL ? 'انقر للانتقال إلى صندوق الموافقات' : 'Click to go to Approvals Inbox'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-najdi-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {highRisk > 0 && (
              <Link to={createPageUrl('YamenAI')} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200 hover:border-red-400 hover:bg-red-100 transition-colors group">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-700">
                    {isRTL ? `${highRisk} موظف في منطقة المخاطر العالية` : `${highRisk} employee(s) in high-risk zone`}
                  </p>
                  <p className="text-xs text-red-500/70">{isRTL ? 'انقر لعرض مراقبة المخاطر' : 'Click to view Risk Monitor'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {highRisk === 0 && iqamaExpired.length === 0 && pendingLeaves === 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <p className="text-sm text-emerald-700">{isRTL ? 'لا توجد تنبيهات عاجلة' : 'No urgent alerts at this time'}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Risk Employees */}
      {riskEmployees.filter((e) => e.overallRisk > 0).length > 0 &&
      <Card>
          <CardHeader>
            <CardTitle className="text-base">{isRTL ? 'أعلى موظفين في درجة المخاطر' : 'Top Risk Employees'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {riskEmployees.filter((e) => e.overallRisk > 10).slice(0, 8).map((emp) => {
              const rc = riskColor(emp.overallRisk);
              return (
                <div key={emp.id} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${rc.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{isRTL ? emp.name_ar : emp.name_en || emp.name_ar}</p>
                      <p className="text-xs text-muted-foreground">{emp.employee_id}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="w-24 bg-ink rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${rc.dot}`} style={{ width: `${emp.overallRisk}%` }} />
                      </div>
                      <span className={`text-xs font-bold w-8 text-end ${rc.text}`}>{emp.overallRisk}%</span>
                      <Badge className={`text-xs border ${rc.badge}`}>{isRTL ? rc.label.ar : rc.label.en}</Badge>
                    </div>
                  </div>);

            })}
            </div>
          </CardContent>
        </Card>
      }
    </div>);

}