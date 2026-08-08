import React, { useMemo } from 'react';
import { useLanguage } from '../LanguageContext';
import { getCurrencySymbol } from '../../lib/localization';
import { useTenant } from '../TenantContext';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { differenceInDays, parseISO } from 'date-fns';
import { AlertTriangle, XCircle, Clock, DollarSign } from 'lucide-react';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const _COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

export default function GovReports() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const today = new Date();

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order()) });
  const { data: iqamas = [] } = useQuery({ queryKey: ['iqamas'], queryFn: () => fetchData(tenantQuery('iqama_records').select('*').order()) });
  const { data: violations = [] } = useQuery({ queryKey: ['violations'], queryFn: () => fetchData(tenantQuery('govi_violations').select('*').order()) });
  const { data: mudad = [] } = useQuery({ queryKey: ['mudad'], queryFn: () => fetchData(tenantQuery('mudad_submissions').select('*').order()) });

  const stats = useMemo(() => {
    const active = employees.filter(e => e.status === 'active');
    const saudis = active.filter(e => e.is_saudi);
    const saudizationPct = active.length ? Math.round((saudis.length / active.length) * 100) : 0;

    const expiredIqama = iqamas.filter(i => i.expiry_date && differenceInDays(parseISO(i.expiry_date), today) < 0);
    const expiring30 = iqamas.filter(i => {
      if (!i.expiry_date) return false;
      const d = differenceInDays(parseISO(i.expiry_date), today);
      return d >= 0 && d <= 30;
    });
    const expiring90 = iqamas.filter(i => {
      if (!i.expiry_date) return false;
      const d = differenceInDays(parseISO(i.expiry_date), today);
      return d >= 0 && d <= 90;
    });

    const openViolations = violations.filter(v => v.status === 'open');
    const totalFines = openViolations.reduce((s, v) => s + (v.amount_sar || 0), 0);

    const lastMudad = [...mudad].sort((a, b) => b.period_year - a.period_year || b.period_month - a.period_month)[0];
    const wpsPct = lastMudad?.compliance_percentage ?? 0;

    const iqamaCompliancePct = iqamas.length ? Math.round(((iqamas.length - expiredIqama.length) / iqamas.length) * 100) : 100;

    return { active: active.length, saudizationPct, expiredIqama: expiredIqama.length, expiring30: expiring30.length, expiring90: expiring90.length, openViolations: openViolations.length, totalFines, wpsPct, iqamaCompliancePct };
  }, [employees, iqamas, violations, mudad]);

  const saudizationData = [
    { name: isRTL ? 'سعودي' : 'Saudi', value: stats.saudizationPct, fill: '#10b981' },
    { name: isRTL ? 'غير سعودي' : 'Non-Saudi', value: 100 - stats.saudizationPct, fill: '#334155' },
  ];

  const iqamaStatusData = [
    { name: isRTL ? 'منتهية' : 'Expired', value: stats.expiredIqama, fill: '#ef4444' },
    { name: isRTL ? 'تنتهي 30 يوم' : 'Exp. 30d', value: stats.expiring30, fill: '#f59e0b' },
    { name: isRTL ? 'تنتهي 90 يوم' : 'Exp. 90d', value: stats.expiring90 - stats.expiring30, fill: '#eab308' },
    { name: isRTL ? 'سارية' : 'Valid', value: Math.max(0, iqamas.length - stats.expiring90 - stats.expiredIqama), fill: '#10b981' },
  ].filter(d => d.value > 0);

  const complianceMetrics = [
    { label: isRTL ? 'امتثال الإقامة' : 'Iqama Compliance', value: stats.iqamaCompliancePct, color: stats.iqamaCompliancePct >= 90 ? 'text-emerald-400' : 'text-red-400', threshold: 90 },
    { label: isRTL ? 'نسبة السعودة' : 'Saudization', value: stats.saudizationPct, color: stats.saudizationPct >= 30 ? 'text-emerald-400' : 'text-red-400', threshold: 30 },
    { label: isRTL ? 'امتثال WPS' : 'WPS Compliance', value: stats.wpsPct, color: stats.wpsPct >= 90 ? 'text-emerald-400' : 'text-red-400', threshold: 90 },
  ];

  return (
    <div className="space-y-6 mt-4">
      {/* Compliance Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {complianceMetrics.map((m, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className={`text-4xl font-bold ${m.color} mb-1`}>{m.value}%</div>
              <div className="text-muted-foreground text-sm">{m.label}</div>
              <div className="mt-3 w-full bg-ink rounded-full h-2">
                <div className="h-2 rounded-full transition-all" style={{ width: `${m.value}%`, backgroundColor: m.value >= m.threshold ? '#10b981' : '#ef4444' }} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">{isRTL ? `الهدف: ${m.threshold}%` : `Target: ${m.threshold}%`}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alert Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-8 h-8 text-red-400 flex-shrink-0" />
          <div>
            <div className="text-2xl font-bold text-red-400">{stats.expiredIqama}</div>
            <div className="text-xs text-muted-foreground">{isRTL ? 'إقامات منتهية' : 'Expired Iqamas'}</div>
          </div>
        </div>
        <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-8 h-8 text-amber-400 flex-shrink-0" />
          <div>
            <div className="text-2xl font-bold text-amber-400">{stats.expiring30}</div>
            <div className="text-xs text-muted-foreground">{isRTL ? 'تنتهي خلال 30 يوم' : 'Expiring 30 days'}</div>
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-red-400 flex-shrink-0" />
          <div>
            <div className="text-2xl font-bold text-red-400">{stats.openViolations}</div>
            <div className="text-xs text-muted-foreground">{isRTL ? 'مخالفات مفتوحة' : 'Open Violations'}</div>
          </div>
        </div>
        <div className="bg-red-900/10 border border-red-800/40 rounded-xl p-4 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-red-400 flex-shrink-0" />
          <div>
            <div className="text-xl font-bold text-red-400">{stats.totalFines.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{isRTL ? `غرامات مفتوحة (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Open Fines (${getCurrencySymbol(tenant?.localization, isRTL)})`}</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm text-white">{isRTL ? 'توزيع الجنسيات' : 'Nationality Distribution'}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={saudizationData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}%`}>
                  {saudizationData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip formatter={v => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm text-white">{isRTL ? 'حالة الإقامات' : 'Iqama Status'}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={iqamaStatusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {iqamaStatusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}