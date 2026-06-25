import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import DataTable from '../ui/DataTable';

const TARGET_PCT = 30;

export default function SaudizationTracker() {
  const { isRTL } = useLanguage();

  const { data: employees = [], isLoading: _isLoading } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order()) });
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => fetchData(tenantQuery('branches').select('*').match({ is_active: true })) });

  const isSaudi = (emp) => emp.nationality === 'Saudi' || emp.nationality === 'سعودي';

  const stats = useMemo(() => {
    const total = employees.length;
    const saudi = employees.filter(isSaudi).length;
    const nonSaudi = total - saudi;
    const pct = total > 0 ? Math.round((saudi / total) * 100) : 0;
    const gap = Math.max(0, TARGET_PCT - pct);
    const needed = Math.ceil((TARGET_PCT / 100) * total) - saudi;
    return { total, saudi, nonSaudi, pct, gap, needed: Math.max(0, needed) };
  }, [employees]);

  const branchBreakdown = useMemo(() => {
    return branches.map(b => {
      const branchEmps = employees.filter(e => e.branch_id === b.id);
      const saudiCount = branchEmps.filter(isSaudi).length;
      const pct = branchEmps.length > 0 ? Math.round((saudiCount / branchEmps.length) * 100) : 0;
      return { ...b, total: branchEmps.length, saudi: saudiCount, nonSaudi: branchEmps.length - saudiCount, pct };
    }).filter(b => b.total > 0);
  }, [branches, employees]);

  const pieData = [
    { name: isRTL ? 'سعودي' : 'Saudi', value: stats.saudi },
    { name: isRTL ? 'غير سعودي' : 'Non-Saudi', value: stats.nonSaudi },
  ];

  const riskLevel = stats.pct >= TARGET_PCT ? 'compliant' : stats.pct >= TARGET_PCT - 5 ? 'warning' : 'non_compliant';
  const riskConfig = {
    compliant: { label: isRTL ? 'متوافق' : 'Compliant', color: '#10b981', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800' },
    warning: { label: isRTL ? 'تحذير' : 'Warning', color: '#f59e0b', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800' },
    non_compliant: { label: isRTL ? 'غير متوافق' : 'Non-Compliant', color: '#ef4444', bg: 'bg-red-50 border-red-200', text: 'text-red-800' },
  }[riskLevel];

  const branchColumns = [
    { header: isRTL ? 'الفرع' : 'Branch', cell: r => isRTL ? r.name_ar : (r.name_en || r.name_ar) },
    { header: isRTL ? 'الإجمالي' : 'Total', accessorKey: 'total' },
    { header: isRTL ? 'سعودي' : 'Saudi', cell: r => <span className="text-emerald-600 font-semibold">{r.saudi}</span> },
    { header: isRTL ? 'غير سعودي' : 'Non-Saudi', accessorKey: 'nonSaudi' },
    { header: isRTL ? 'نسبة التوطين' : 'Saudization %', cell: r => (
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-slate-200 rounded-full h-2 min-w-16">
          <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, r.pct)}%`, backgroundColor: r.pct >= TARGET_PCT ? '#10b981' : '#ef4444' }} />
        </div>
        <span className={`text-sm font-semibold ${r.pct >= TARGET_PCT ? 'text-emerald-600' : 'text-red-600'}`}>{r.pct}%</span>
      </div>
    )},
    { header: isRTL ? 'الحالة' : 'Status', cell: r => (
      <Badge className={r.pct >= TARGET_PCT ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
        {r.pct >= TARGET_PCT ? (isRTL ? 'متوافق' : 'Compliant') : (isRTL ? 'أقل من الهدف' : 'Below Target')}
      </Badge>
    )},
  ];

  return (
    <div className="space-y-6 mt-4">
      {/* Gauge + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={`border-2 ${riskConfig.bg}`}>
          <CardHeader><CardTitle className={riskConfig.text}>{isRTL ? 'مؤشر نسبة التوطين' : 'Saudization Gauge'}</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="relative w-48 h-48">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="14" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e2e8f0" strokeWidth="14"
                  strokeDasharray={`${(TARGET_PCT / 100) * 314} 314`} className="opacity-30" />
                <circle cx="60" cy="60" r="50" fill="none" stroke={riskConfig.color} strokeWidth="14"
                  strokeDasharray={`${Math.min(1, stats.pct / 100) * 314} 314`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold" style={{ color: riskConfig.color }}>{stats.pct}%</span>
                <span className="text-slate-500 text-xs mt-1">{isRTL ? 'الفعلي' : 'Actual'}</span>
              </div>
            </div>
            <div className="mt-4 text-center space-y-1">
              <div className="flex items-center gap-2 justify-center">
                <div className="w-3 h-3 rounded-full bg-slate-300" />
                <span className="text-sm text-slate-600">{isRTL ? `الهدف: ${TARGET_PCT}%` : `Target: ${TARGET_PCT}%`}</span>
              </div>
              <Badge className={`text-base px-4 py-1 ${riskConfig.text} ${riskConfig.bg}`}>{riskConfig.label}</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: isRTL ? 'الإجمالي' : 'Total Employees', value: stats.total, color: 'text-slate-900' },
              { label: isRTL ? 'موظفون سعوديون' : 'Saudi Employees', value: stats.saudi, color: 'text-emerald-600' },
              { label: isRTL ? 'غير سعوديين' : 'Non-Saudi', value: stats.nonSaudi, color: 'text-blue-600' },
              { label: isRTL ? 'مطلوب لتحقيق الهدف' : 'Needed to Hit Target', value: stats.needed, color: 'text-amber-600' },
            ].map((item, i) => (
              <Card key={i}><CardContent className="p-4">
                <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                <div className="text-sm text-slate-500">{item.label}</div>
              </CardContent></Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-4">
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    <Cell fill="#10b981" />
                    <Cell fill="#3b82f6" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Branch Breakdown */}
      {branchBreakdown.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-800 mb-3">{isRTL ? 'التوطين حسب الفرع' : 'Saudization by Branch'}</h3>
          <DataTable columns={branchColumns} data={branchBreakdown} loading={false} emptyMessage="" />
        </div>
      )}
    </div>
  );
}