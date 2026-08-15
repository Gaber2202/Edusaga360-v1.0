import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { FileBarChart, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { differenceInDays } from 'date-fns';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { extractAiText, aiErrorMessage } from './yamenUtils';
import { useJurisdictionFeatures } from '../JurisdictionFeatureContext';
import { NATIONALISATION_FEATURES } from '../../lib/jurisdictionFeatures.js';
import { useTenant } from '../TenantContext';
import { getCurrencySymbol, formatCurrency } from '../../lib/localization';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function YamenExecutiveReport({ isRTL }) {
  const { tenant } = useTenant();
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [generating, setGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState('');

  const { data: employees = [] } = useQuery({ queryKey: ['employees', tenantId], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter())), enabled: hasTenantAccess });
  const { data: attendance = [] } = useQuery({ enabled: false /* employee_attendances table not built */, queryKey: ['employeeAttendance', tenantId], queryFn: () => fetchData(tenantQuery('employee_attendances').select('*').match(tenantFilter()).order('date', { ascending: false }).limit(200)), initialData: [] });
  const { data: leaves = [] } = useQuery({ queryKey: ['leaveRequests', tenantId], queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(100)), enabled: hasTenantAccess });
  const { data: iqamaRecords = [] } = useQuery({ enabled: false /* iqama_records table not built */, queryKey: ['iqamaRecords', tenantId], queryFn: () => fetchData(tenantQuery('iqama_records').select('*').match(tenantFilter())), initialData: [] });
  const { data: payrollInputs = [] } = useQuery({ enabled: false /* payroll_inputs table not built */, queryKey: ['payrollInputs', tenantId], queryFn: () => fetchData(tenantQuery('payroll_inputs').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit(100)), initialData: [] });
  const { data: evaluations = [] } = useQuery({ enabled: false /* performance_evaluations table not built */, queryKey: ['performanceEvals', tenantId], queryFn: () => fetchData(tenantQuery('performance_evaluations').select('*').match(tenantFilter())), initialData: [] });

  const today = new Date();

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.status === 'active');
    const saudis = active.filter((e) => e.is_saudi);
    const saudizationPct = active.length ? Math.round(saudis.length / active.length * 100) : 0;

    const expiredIqama = iqamaRecords.filter((i) => i.expiry_date && differenceInDays(new Date(i.expiry_date), today) < 0);
    const expiringSoon = iqamaRecords.filter((i) => i.expiry_date && differenceInDays(new Date(i.expiry_date), today) >= 0 && differenceInDays(new Date(i.expiry_date), today) <= 90);

    const monthlyPayroll = payrollInputs.filter((p) => {
      const period = p.period || '';
      const [y, m] = period.split('-');
      return y && m && new Date(`${y}-${m}-01`).getMonth() === today.getMonth();
    });
    const totalPayroll = monthlyPayroll.reduce((s, p) => s + (p.net_salary || 0), 0);

    const pendingLeaves = leaves.filter((l) => l.status === 'pending').length;
    const absentDays = attendance.filter((a) => a.status === 'absent').length;

    const highRiskCount = active.filter((emp) => {
      const absences = attendance.filter((a) => a.employee_id === emp.id && a.status === 'absent').length;
      const iq = iqamaRecords.find((i) => i.employee_id === emp.id);
      const compRisk = !emp.is_saudi && (!iq || iq.expiry_date && differenceInDays(new Date(iq.expiry_date), today) < 30) ? 80 : 0;
      const attRisk = absences * 15;
      return (attRisk + compRisk) / 2 >= 50;
    }).length;

    // Dept distribution
    const deptMap = {};
    active.forEach((e) => {
      const dept = e.department_id || 'other';
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });

    const healthScore = Math.max(0, 100 - highRiskCount * 8 - expiredIqama.length * 5 - Math.round(pendingLeaves * 0.5));

    return { active: active.length, saudis: saudis.length, saudizationPct, expiredIqama: expiredIqama.length, expiringSoon: expiringSoon.length, totalPayroll, pendingLeaves, absentDays, highRiskCount, healthScore };
  }, [employees, attendance, leaves, iqamaRecords, payrollInputs, evaluations]);

  const payrollChart = useMemo(() => {
    const monthly = {};
    payrollInputs.forEach((p) => {
      if (!p.period) return;
      monthly[p.period] = (monthly[p.period] || 0) + (p.net_salary || 0);
    });
    return Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([period, total]) => ({ period, total }));
  }, [payrollInputs]);

  const statusPie = [
  { name: isRTL ? 'سعودي' : 'Saudi', value: stats.saudis },
  { name: isRTL ? 'غير سعودي' : 'Non-Saudi', value: stats.active - stats.saudis }];


  const handleGenerateAI = async () => {
    setGenerating(true);
    setAiSummary('');
    try {
      const prompt = isRTL ?
      `أنت يامن، مساعد الموارد البشرية الذكي لنظام EduSaga. اكتب تقريراً تنفيذياً أسبوعياً لإدارة الموارد البشرية بأسلوب احترافي سعودي باللغة العربية.\n\nالبيانات:\n- إجمالي الموظفين النشطين: ${stats.active}\n- نسبة السعودة: ${stats.saudizationPct}%\n- موظفون عالي المخاطر: ${stats.highRiskCount}\n- إقامات منتهية: ${stats.expiredIqama}\n- طلبات إجازة معلقة: ${stats.pendingLeaves}\n- إجمالي الرواتب هذا الشهر: ${formatCurrency(stats.totalPayroll, tenant?.localization, isRTL)}\n- درجة صحة الموارد البشرية: ${stats.healthScore}%\n\nاكتب ملخصاً تنفيذياً من 3 فقرات يشمل: الوضع العام، المخاطر الرئيسية، التوصيات. لا تختلق أرقاماً خارج المعطيات.` :
      `You are YAMEN, the AI HR Companion for EduSaga. Write a professional weekly executive HR report summary in English.\n\nData:\n- Active employees: ${stats.active}\n- Saudization: ${stats.saudizationPct}%\n- High risk employees: ${stats.highRiskCount}\n- Expired Iqamas: ${stats.expiredIqama}\n- Pending leaves: ${stats.pendingLeaves}\n- Monthly payroll: ${formatCurrency(stats.totalPayroll, tenant?.localization, isRTL)}\n- HR Health Score: ${stats.healthScore}%\n\nWrite a 3-paragraph executive summary: overall status, key risks, recommendations. Use only the provided data.`;

      const res = await callApi('/api/ai/invoke-llm', { prompt, source: 'executive' });
      setAiSummary(extractAiText(res));
    } catch (e) {toast.error(aiErrorMessage(e, isRTL));} finally
    {setGenerating(false);}
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{isRTL ? 'صحة الموارد البشرية' : 'HR Health'}</p>
          <p className={`text-3xl font-bold ${stats.healthScore >= 70 ? 'text-emerald-400' : stats.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{stats.healthScore}%</p>
        </CardContent></Card>
        {nationalisationEnabled && (
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{isRTL ? 'السعودة' : 'Saudization'}</p>
          <p className={`text-3xl font-bold ${stats.saudizationPct >= 40 ? 'text-emerald-400' : 'text-amber-400'}`}>{stats.saudizationPct}%</p>
        </CardContent></Card>
        )}
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{isRTL ? 'إجمالي الرواتب' : 'Monthly Payroll'}</p>
          <p className="text-2xl font-bold text-white">{stats.totalPayroll > 0 ? (stats.totalPayroll / 1000).toFixed(0) + 'K' : '-'}</p>
          <p className="text-xs text-muted-foreground">{getCurrencySymbol(tenant?.localization, isRTL)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">{isRTL ? 'عالي المخاطر' : 'High Risk'}</p>
          <p className="text-3xl font-bold text-red-400">{stats.highRiskCount}</p>
          <p className="text-xs text-muted-foreground">{isRTL ? 'من' : 'of'} {stats.active}</p>
        </CardContent></Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{isRTL ? 'مسار الرواتب (آخر 6 أشهر)' : 'Payroll Trend (6 months)'}</CardTitle></CardHeader>
          <CardContent>
            {payrollChart.length > 0 ?
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={payrollChart}>
                  <XAxis dataKey="period" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: '#1e2535', border: '1px solid #334155', color: '#e2e8f0' }} />
                  <Bar dataKey="total" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer> :
            <p className="text-muted-foreground text-center py-10 text-sm">{isRTL ? 'لا توجد بيانات' : 'No data'}</p>}
          </CardContent>
        </Card>

        {nationalisationEnabled && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{isRTL ? 'توزيع الجنسية' : 'Nationality Distribution'}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={statusPie} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {statusPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e2535', border: '1px solid #334155', color: '#e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}
      </div>

      {/* AI Executive Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileBarChart className="w-4 h-4 text-emerald-400" />
              {isRTL ? 'الملخص التنفيذي — يامن' : 'Executive Summary — YAMEN'}
            </CardTitle>
            <Button size="sm" onClick={handleGenerateAI} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <RefreshCw className="w-4 h-4 me-2" />}
              {isRTL ? 'توليد التقرير' : 'Generate Report'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiSummary ?
          <div className="text-ink text-sm leading-7 whitespace-pre-wrap" dir={isRTL ? 'rtl' : 'ltr'}>{aiSummary}</div> :

          <p className="text-muted-foreground text-sm text-center py-6">
              {isRTL ? 'اضغط "توليد التقرير" للحصول على الملخص التنفيذي من يامن' : 'Click "Generate Report" to get YAMEN\'s executive summary'}
            </p>
          }
        </CardContent>
      </Card>
    </div>);

}