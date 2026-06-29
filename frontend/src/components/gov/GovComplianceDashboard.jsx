import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { differenceInDays, parseISO } from 'date-fns';
import {
  Users, Shield, AlertTriangle, FileText, TrendingUp,
  CheckCircle, Clock, DollarSign, RefreshCw } from
'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function GovComplianceDashboard() {
  const { isRTL } = useLanguage();

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order()) });
  const { data: iqamas = [] } = useQuery({ queryKey: ['iqamas'], queryFn: () => fetchData(tenantQuery('iqama_records').select('*').order()) });
  const { data: visas = [] } = useQuery({ queryKey: ['visas'], queryFn: () => fetchData(tenantQuery('visa_records').select('*').order()) });
  const { data: violations = [] } = useQuery({ queryKey: ['violations'], queryFn: () => fetchData(tenantQuery('govi_violations').select('*').order()) });
  const { data: govDocs = [] } = useQuery({ queryKey: ['govDocs'], queryFn: () => fetchData(tenantQuery('gov_documents').select('*').order()) });
  const { data: mudad = [] } = useQuery({ queryKey: ['mudad'], queryFn: () => fetchData(tenantQuery('mudad_submissions').select('*').order()) });
  const { data: gosiRecords = [] } = useQuery({ queryKey: ['gosiRecords'], queryFn: () => fetchData(tenantQuery('gosi_records').select('*').order()) });
  const { data: _payRuns = [] } = useQuery({ queryKey: ['payRuns'], queryFn: () => fetchData(tenantQuery('pay_runs').select('*').order('created_at', { ascending: false }).limit()) });

  const today = new Date();

  const kpis = useMemo(() => {
    const totalEmp = employees.length;
    const saudiEmp = employees.filter((e) => e.nationality === 'Saudi' || e.nationality === 'سعودي').length;
    const saudizationPct = totalEmp > 0 ? Math.round(saudiEmp / totalEmp * 100) : 0;

    const iqamasExpiring60 = iqamas.filter((i) => {
      if (!i.expiry_date) return false;
      const days = differenceInDays(parseISO(i.expiry_date), today);
      return days >= 0 && days <= 60;
    }).length;

    const visasExpiring = visas.filter((v) => {
      if (!v.expiry_date) return false;
      const days = differenceInDays(parseISO(v.expiry_date), today);
      return days >= 0 && days <= 60;
    }).length;

    const openViolations = violations.filter((v) => v.status === 'open');
    const totalViolationSAR = openViolations.reduce((s, v) => s + (v.amount_sar || 0), 0);

    const expiringDocs = govDocs.filter((d) => {
      if (!d.expiry_date) return false;
      const days = differenceInDays(parseISO(d.expiry_date), today);
      return days >= 0 && days <= 60;
    }).length;

    const lastMudad = mudad.sort((a, b) => b.period_year - a.period_year || b.period_month - a.period_month)[0];
    const wpsPct = lastMudad?.compliance_percentage ?? 0;

    const gosiMismatches = gosiRecords.filter((g) => {
      const emp = employees.find((e) => e.id === g.employee_id);
      return emp && Math.abs((g.registered_salary || 0) - (emp.basic_salary || 0)) > 100;
    }).length;

    return { totalEmp, saudizationPct, iqamasExpiring60, visasExpiring, totalViolationSAR, openViolationsCount: openViolations.length, expiringDocs, wpsPct, gosiMismatches };
  }, [employees, iqamas, visas, violations, govDocs, mudad, gosiRecords]);

  const riskScore = useMemo(() => {
    let score = 100;
    if (kpis.saudizationPct < 25) score -= 20;else
    if (kpis.saudizationPct < 30) score -= 10;
    if (kpis.iqamasExpiring60 > 10) score -= 15;else
    if (kpis.iqamasExpiring60 > 5) score -= 8;
    if (kpis.openViolationsCount > 0) score -= Math.min(25, kpis.openViolationsCount * 5);
    if (kpis.gosiMismatches > 0) score -= Math.min(15, kpis.gosiMismatches * 3);
    if (kpis.wpsPct < 90) score -= 10;
    return Math.max(0, score);
  }, [kpis]);

  const riskColor = riskScore >= 75 ? '#10b981' : riskScore >= 50 ? '#f59e0b' : '#ef4444';
  const riskLabel = riskScore >= 75 ? isRTL ? 'منخفض' : 'Low Risk' : riskScore >= 50 ? isRTL ? 'متوسط' : 'Medium Risk' : isRTL ? 'مرتفع' : 'High Risk';

  const saudizationData = [
  { name: isRTL ? 'سعودي' : 'Saudi', value: kpis.saudizationPct },
  { name: isRTL ? 'غير سعودي' : 'Non-Saudi', value: 100 - kpis.saudizationPct }];


  const violationData = [
  { name: isRTL ? 'إقامة' : 'Iqama', value: violations.filter((v) => v.violation_type === 'iqama').length },
  { name: isRTL ? 'غوزي' : 'GOSI', value: violations.filter((v) => v.violation_type === 'gosi').length },
  { name: isRTL ? 'أجور' : 'WPS', value: violations.filter((v) => v.violation_type === 'wps').length },
  { name: isRTL ? 'عمالة' : 'Labor', value: violations.filter((v) => v.violation_type === 'labor_law').length },
  { name: isRTL ? 'أخرى' : 'Other', value: violations.filter((v) => !['iqama', 'gosi', 'wps', 'labor_law'].includes(v.violation_type)).length }].
  filter((d) => d.value > 0);

  const kpiCards = [
  { icon: Users, label: isRTL ? 'إجمالي الموظفين' : 'Total Employees', value: kpis.totalEmp, color: 'text-ink', bg: 'bg-white' },
  { icon: Shield, label: isRTL ? 'نسبة السعودة' : 'Saudization %', value: `${kpis.saudizationPct}%`, color: kpis.saudizationPct >= 30 ? 'text-emerald-600' : 'text-red-500', bg: 'bg-white' },
  { icon: Clock, label: isRTL ? 'إقامات تنتهي (60 يوم)' : 'Iqamas Expiring (60d)', value: kpis.iqamasExpiring60, color: kpis.iqamasExpiring60 > 5 ? 'text-amber-600' : 'text-ink', bg: 'bg-white' },
  { icon: FileText, label: isRTL ? 'تأشيرات تنتهي' : 'Visas Expiring', value: kpis.visasExpiring, color: kpis.visasExpiring > 3 ? 'text-amber-600' : 'text-ink', bg: 'bg-white' },
  { icon: AlertTriangle, label: isRTL ? 'تناقضات غوزي' : 'GOSI Mismatches', value: kpis.gosiMismatches, color: kpis.gosiMismatches > 0 ? 'text-red-500' : 'text-ink', bg: 'bg-white' },
  { icon: TrendingUp, label: isRTL ? 'امتثال WPS %' : 'WPS Compliance %', value: `${kpis.wpsPct}%`, color: kpis.wpsPct >= 90 ? 'text-emerald-600' : 'text-red-500', bg: 'bg-white' },
  { icon: DollarSign, label: isRTL ? 'قيمة المخالفات المفتوحة' : 'Open Violations (SAR)', value: kpis.totalViolationSAR.toLocaleString(), color: kpis.totalViolationSAR > 0 ? 'text-red-500' : 'text-ink', bg: 'bg-white' },
  { icon: FileText, label: isRTL ? 'مستندات تنتهي' : 'Expiring Documents', value: kpis.expiringDocs, color: kpis.expiringDocs > 0 ? 'text-amber-600' : 'text-ink', bg: 'bg-white' }];


  return (
    <div className="bg-sand p-6 rounded-xl space-y-6 min-h-screen">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) =>
        <div key={i} className={`rounded-xl p-4 border border-border ${kpi.bg} shadow-sm`}>
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              <span className="text-muted-foreground text-xs font-medium">{kpi.label}</span>
            </div>
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
          </div>
        )}
      </div>

      {/* Risk Meter + Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Risk Meter */}
        <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex flex-col items-center justify-center">
          <h3 className="text-ink font-semibold mb-4">{isRTL ? 'مؤشر الامتثال' : 'Compliance Risk Score'}</h3>
          <div className="relative w-36 h-36">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#1e293b" strokeWidth="12" />
              <circle cx="60" cy="60" r="50" fill="none" stroke={riskColor} strokeWidth="12"
              strokeDasharray={`${riskScore / 100 * 314} 314`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold" style={{ color: riskColor }}>{riskScore}</span>
              <span className="text-muted-foreground text-xs">{isRTL ? 'من 100' : '/ 100'}</span>
            </div>
          </div>
          <div className="mt-3 px-4 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: riskColor + '20', color: riskColor }}>
            {riskLabel}
          </div>
          <div className="mt-4 space-y-1 w-full">
            {[{ label: isRTL ? 'جيد' : 'Good', min: 75, color: '#10b981' }, { label: isRTL ? 'تحذير' : 'Warning', min: 50, color: '#f59e0b' }, { label: isRTL ? 'خطر' : 'Critical', min: 0, color: '#ef4444' }].map((r) =>
            <div key={r.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                <span>{r.label}: {r.min}+</span>
              </div>
            )}
          </div>
        </div>

        {/* Saudization Chart */}
        <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-ink font-semibold mb-4">{isRTL ? 'نسبة التوطين' : 'Saudization Breakdown'}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={saudizationData} cx="50%" cy="45%" innerRadius={45} outerRadius={70} dataKey="value" label={false} labelLine={false}>
                <Cell fill="#10b981" />
                <Cell fill="#94a3b8" />
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-2">
            <span className="text-emerald-400 text-sm font-semibold">{isRTL ? 'الهدف: 30%' : 'Target: 30%'}</span>
            <span className={`text-sm font-semibold ${kpis.saudizationPct >= 30 ? 'text-emerald-400' : 'text-red-400'}`}>{isRTL ? 'الفعلي:' : 'Actual:'} {kpis.saudizationPct}%</span>
          </div>
        </div>

        {/* Violations Breakdown */}
        <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-ink font-semibold mb-4">{isRTL ? 'المخالفات حسب النوع' : 'Violations by Type'}</h3>
          {violationData.length > 0 ?
          <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={violationData} cx="50%" cy="45%" outerRadius={65} dataKey="value" label={false} labelLine={false}>
                  {violationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>} />
              </PieChart>
            </ResponsiveContainer> :

          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <CheckCircle className="w-10 h-10 text-emerald-600 mb-2" />
              <span className="text-sm">{isRTL ? 'لا توجد مخالفات مفتوحة' : 'No open violations'}</span>
            </div>
          }
        </div>
      </div>

      {/* Action Center */}
      <div className="bg-white p-6 rounded-xl border border-border shadow-sm">
        <h3 className="text-ink font-semibold mb-4">{isRTL ? 'مركز الإجراءات' : 'Action Center'}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
          { label: isRTL ? 'تجديد الإقامات' : 'Renew Iqamas', count: kpis.iqamasExpiring60, color: 'border-border text-amber-600 hover:bg-amber-50' },
          { label: isRTL ? 'تصحيح التأمينات' : 'Fix GOSI Issues', count: kpis.gosiMismatches, color: 'border-border text-red-500 hover:bg-red-50' },
          { label: isRTL ? 'رفع ملف الأجور' : 'Submit Mudad', count: null, color: 'border-border text-muted-foreground hover:bg-sand' },
          { label: isRTL ? 'معالجة المخالفات' : 'Resolve Violations', count: kpis.openViolationsCount, color: 'border-border text-muted-foreground hover:bg-sand' }].
          map((action, i) =>
          <div key={i} className={`border rounded-lg p-4 cursor-pointer transition-all bg-white ${action.color}`}>
              <div className="text-sm font-medium">{action.label}</div>
              {action.count !== null &&
            <div className="text-2xl font-bold mt-1">{action.count}</div>
            }
              {action.count === null &&
            <div className="flex items-center gap-1 mt-2 text-xs">
                  <RefreshCw className="w-3 h-3" />
                  {isRTL ? 'انتقل للتبويب' : 'Go to tab'}
                </div>
            }
            </div>
          )}
        </div>
      </div>
    </div>);

}