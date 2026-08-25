import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Badge } from '../ui/badge';
import { AlertTriangle, Clock, CheckCircle, XCircle, Users, HeartPulse, Target, ShieldAlert, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { differenceInDays } from 'date-fns';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import JurisdictionFeatureGate from '../JurisdictionFeatureGate';
import { useJurisdictionFeatures } from '../JurisdictionFeatureContext';
import { PAGE_FEATURE_KEYS, NATIONALISATION_FEATURES, GOVERNMENT_RELATIONS_FEATURES } from '../../lib/jurisdictionFeatures.js';
import DashboardKPICard from '../dashboard/DashboardKPICard';
import { YamenSection, YamenPanelEmpty } from './YamenShellParts';
import { yamenLayout } from '../../lib/yamenDesign';

function riskColor(score) {
  if (score >= 70) return { dot: 'bg-red-500', text: 'text-red-600', label: { ar: 'عالي', en: 'High' }, badge: 'bg-red-50 text-red-700 border-red-200' };
  if (score >= 40) return { dot: 'bg-amber-500', text: 'text-amber-600', label: { ar: 'متوسط', en: 'Medium' }, badge: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { dot: 'bg-emerald-500', text: 'text-emerald-600', label: { ar: 'منخفض', en: 'Low' }, badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

export default function YamenDashboard({ isRTL, onNavigateTab }) {
  const { areAnyEnabled, isFeatureEnabled } = useJurisdictionFeatures();
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const governmentRelationsEnabled = areAnyEnabled(GOVERNMENT_RELATIONS_FEATURES);
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at, basic_salary, iban').match(tenantFilter())),
    enabled: hasTenantAccess,
  });
  const { data: attendance = [] } = useQuery({
    queryKey: ['employeeAttendance', tenantId],
    queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').match(tenantFilter()).order('date', { ascending: false }).limit(200)),
    enabled: false,
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ['leaveRequests', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(100)),
    enabled: hasTenantAccess,
  });
  const { data: iqamaRecords = [] } = useQuery({
    queryKey: ['iqamaRecords', tenantId],
    queryFn: () => fetchData(tenantQuery('iqama_records').select('*').match(tenantFilter())),
    enabled: false,
  });
  const { data: evaluations = [] } = useQuery({
    queryKey: ['performanceEvals', tenantId],
    queryFn: () => fetchData(tenantQuery('performance_evaluations').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(100)),
    enabled: false,
  });

  const today = new Date();

  const riskEmployees = useMemo(() => {
    return employees.filter((e) => e.status === 'active').map((emp) => {
      const empAtt = attendance.filter((a) => a.employee_id === emp.id);
      const absences = empAtt.filter((a) => a.status === 'absent').length;
      const lates = empAtt.filter((a) => a.status === 'late').length;
      const attRisk = Math.min(100, absences * 15 + lates * 5);

      const iqama = iqamaRecords.find((i) => i.employee_id === emp.id);
      let compRisk = 0;
      if (governmentRelationsEnabled) {
        if (!iqama && !emp.is_saudi) compRisk = 60;
        else if (iqama?.expiry_date) {
          const daysLeft = differenceInDays(new Date(iqama.expiry_date), today);
          if (daysLeft < 0) compRisk = 100;
          else if (daysLeft < 30) compRisk = 80;
          else if (daysLeft < 90) compRisk = 40;
        }
      }

      const payRisk = !emp.basic_salary ? 50 : !emp.iban ? 30 : 0;

      const empEvals = evaluations.filter((e) => e.employee_id === emp.id);
      let perfRisk = 0;
      if (empEvals.length > 0) {
        const avg = empEvals.reduce((s, e) => s + (e.overall_score || 0), 0) / empEvals.length;
        if (avg < 40) perfRisk = 80;
        else if (avg < 60) perfRisk = 40;
      }

      const overall = Math.round(attRisk * 0.35 + compRisk * 0.3 + payRisk * 0.15 + perfRisk * 0.2);
      return { ...emp, attRisk, compRisk, payRisk, perfRisk, overallRisk: overall, iqama };
    }).sort((a, b) => b.overallRisk - a.overallRisk);
  }, [employees, attendance, iqamaRecords, evaluations, governmentRelationsEnabled]);

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
  const saudizationPct = activeEmployees > 0 ? Math.round((saudiCount / activeEmployees) * 100) : 0;
  const hrHealthScore = Math.max(0, 100 - highRisk * 8 - iqamaExpired.length * 5 - Math.round(pendingLeaves * 0.5));

  const topRisk = riskEmployees.filter((e) => e.overallRisk > 10).slice(0, 8);

  return (
    <div className={yamenLayout.page}>
      <div className={yamenLayout.kpiGrid}>
        <DashboardKPICard
          id="yamen-health"
          title={isRTL ? 'صحة الموارد البشرية' : 'HR Health Score'}
          value={`${hrHealthScore}%`}
          icon={HeartPulse}
          color={hrHealthScore >= 70 ? 'emerald' : hrHealthScore >= 50 ? 'amber' : 'red'}
          sub={isRTL ? 'من 100' : 'out of 100'}
        />
        <DashboardKPICard
          id="yamen-headcount"
          title={isRTL ? 'موظفون نشطون' : 'Active Employees'}
          value={activeEmployees}
          icon={Users}
          color="blue"
          href={createPageUrl('Employees')}
          sub={isRTL ? 'إجمالي النشطين' : 'Total active'}
        />
        {nationalisationEnabled && (
          <DashboardKPICard
            id="yamen-saudization"
            title={isRTL ? 'نسبة السعودة' : 'Saudization %'}
            value={`${saudizationPct}%`}
            icon={Target}
            color={saudizationPct >= 40 ? 'emerald' : 'amber'}
            href={createPageUrl('GovernmentRelations')}
            sub={`${saudiCount} / ${activeEmployees}`}
          />
        )}
        <button type="button" className="text-start w-full" onClick={() => onNavigateTab?.('risk')}>
          <DashboardKPICard
            id="yamen-high-risk"
            title={isRTL ? 'موظفون عالي المخاطر' : 'High Risk Employees'}
            value={highRisk}
            icon={ShieldAlert}
            color={highRisk > 0 ? 'red' : 'emerald'}
            alert={highRisk > 0}
            sub={`${medRisk} ${isRTL ? 'متوسط المخاطر' : 'medium risk'}`}
          />
        </button>
        {governmentRelationsEnabled && (
          <DashboardKPICard
            id="yamen-iqama"
            title={isRTL ? 'إقامات منتهية/قريبة' : 'Iqama Alerts'}
            value={iqamaExpired.length + iqamaExpiringSoon.length}
            icon={AlertTriangle}
            color={(iqamaExpired.length + iqamaExpiringSoon.length) > 0 ? 'amber' : 'emerald'}
            href={createPageUrl('GovernmentRelations')}
            sub={`${iqamaExpired.length} ${isRTL ? 'منتهية' : 'expired'}`}
          />
        )}
        <DashboardKPICard
          id="yamen-leave"
          title={isRTL ? 'إجازات معلقة' : 'Pending Leave'}
          value={pendingLeaves}
          icon={Clock}
          color={pendingLeaves > 0 ? 'amber' : 'emerald'}
          href={createPageUrl('HRApprovalsInbox')}
          alert={pendingLeaves > 0}
        />
      </div>

      <YamenSection
        title={isRTL ? 'مركز التنبيهات والإجراءات' : 'Action Center'}
        subtitle={isRTL ? 'انقر للانتقال إلى الإجراء المناسب' : 'Click through to the right workspace'}
        icon={AlertTriangle}
      >
        <div className="space-y-2">
          <JurisdictionFeatureGate featureKeys={PAGE_FEATURE_KEYS.GovernmentRelations}>
            {iqamaExpired.length > 0 && (
              <Link to={createPageUrl('GovernmentRelations')} className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 hover:border-red-400 hover:bg-red-100/80 transition-colors group">
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700">
                    {isRTL ? `${iqamaExpired.length} إقامة منتهية الصلاحية` : `${iqamaExpired.length} expired Iqama(s)`}
                  </p>
                  <p className="text-xs text-red-500/70">{isRTL ? 'العلاقات الحكومية' : 'Government Relations'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
            {iqamaExpiringSoon.length > 0 && (
              <Link to={createPageUrl('GovernmentRelations')} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 hover:border-amber-400 hover:bg-amber-100/80 transition-colors group">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-700">
                    {isRTL ? `${iqamaExpiringSoon.length} إقامة تنتهي خلال 90 يوم` : `${iqamaExpiringSoon.length} Iqama(s) expiring within 90 days`}
                  </p>
                  <p className="text-xs text-amber-500/70">{isRTL ? 'العلاقات الحكومية' : 'Government Relations'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
          </JurisdictionFeatureGate>
          {pendingLeaves > 0 && (
            <Link to={createPageUrl('HRApprovalsInbox')} className="flex items-center gap-3 p-3 rounded-xl bg-najdi-50 border border-najdi-100 hover:border-najdi-400 transition-colors group">
              <Clock className="w-5 h-5 text-najdi-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-najdi-900">
                  {isRTL ? `${pendingLeaves} طلب إجازة معلق` : `${pendingLeaves} pending leave request(s)`}
                </p>
                <p className="text-xs text-najdi-600/70">{isRTL ? 'صندوق الموافقات' : 'Approvals Inbox'}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-najdi-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          )}
          {highRisk > 0 && (
            <button
              type="button"
              onClick={() => onNavigateTab?.('risk')}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 hover:border-red-400 hover:bg-red-100/80 transition-colors group text-start"
            >
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700">
                  {isRTL ? `${highRisk} موظف في منطقة المخاطر العالية` : `${highRisk} employee(s) in high-risk zone`}
                </p>
                <p className="text-xs text-red-500/70">{isRTL ? 'مراقبة المخاطر' : 'Open Risk Monitor'}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
          {highRisk === 0 && iqamaExpired.length === 0 && pendingLeaves === 0 && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <p className="text-sm text-emerald-700">{isRTL ? 'لا توجد تنبيهات عاجلة' : 'No urgent alerts at this time'}</p>
            </div>
          )}
        </div>
      </YamenSection>

      <YamenSection
        title={isRTL ? 'أعلى موظفين في درجة المخاطر' : 'Top Risk Employees'}
        subtitle={isRTL ? 'مرتّبون حسب درجة المخاطر الإجمالية' : 'Ranked by composite risk score'}
        icon={ShieldAlert}
        action={onNavigateTab ? (
          <button type="button" onClick={() => onNavigateTab('risk')} className="text-xs font-medium text-najdi-700 hover:underline">
            {isRTL ? 'عرض الكل' : 'View all'}
          </button>
        ) : null}
      >
        {topRisk.length === 0 ? (
          <YamenPanelEmpty
            icon={CheckCircle}
            title={isRTL ? 'لا توجد مخاطر مرتفعة' : 'No elevated risk employees'}
          />
        ) : (
          <div className="space-y-3">
            {topRisk.map((emp) => {
              const rc = riskColor(emp.overallRisk);
              return (
                <div key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-sand-alt/60 transition-colors">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${rc.dot}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-ink">{isRTL ? emp.name_ar : emp.name_en || emp.name_ar}</p>
                    <p className="text-xs text-muted-foreground">{emp.employee_id}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-24 bg-sand rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${rc.dot}`} style={{ width: `${emp.overallRisk}%` }} />
                    </div>
                    <span className={`text-xs font-bold w-8 text-end tabular-nums ${rc.text}`}>{emp.overallRisk}%</span>
                    <Badge className={`text-[10px] border ${rc.badge}`}>{isRTL ? rc.label.ar : rc.label.en}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </YamenSection>
    </div>
  );
}
