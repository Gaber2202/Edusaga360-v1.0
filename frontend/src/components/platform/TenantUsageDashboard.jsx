import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import TenantUsageBar from './TenantUsageBar';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function TenantUsageDashboard({ isRTL }) {
  const label = (ar, en) => isRTL ? ar : en;

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['tenants-usage'],
    queryFn: () => fetchData(tenantQuery('tenants').select('*').order('created_at', { ascending: false })),
  });

  if (isLoading) return <div className="animate-pulse h-40 bg-sand-alt rounded-xl" />;

  const atRisk = tenants.filter(t => {
    const empPct  = t.max_employees   ? (t.current_employees   || 0) / t.max_employees   : 0;
    const stuPct  = t.max_students    ? (t.current_students    || 0) / t.max_students    : 0;
    const aiPct   = t.yamen_ai_monthly_limit ? (t.yamen_ai_used_this_month || 0) / t.yamen_ai_monthly_limit : 0;
    return Math.max(empPct, stuPct, aiPct) >= 0.8;
  });

  return (
    <div className="space-y-4">
      {/* At-Risk Summary */}
      {atRisk.length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {label(`${atRisk.length} مستأجر بالقرب من الحد الأقصى`, `${atRisk.length} tenant(s) near their limits`)}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {atRisk.map(t => isRTL ? t.name_ar : t.name_en).join('، ')}
            </p>
          </div>
        </div>
      )}

      {/* Tenant usage table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sand border-b border-border">
              <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{label('المستأجر', 'Tenant')}</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">{label('الموظفون', 'Employees')}</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">{label('الطلاب', 'Students')}</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">{label('يامن AI', 'Yamen AI')}</th>
              <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">{label('الحالة', 'Status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tenants.map(t => {
              const isActive = ['trial', 'active'].includes(t.status);

              return (
                <tr key={t.id} className="hover:bg-sand">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{isRTL ? t.name_ar : t.name_en}</div>
                    <div className="text-xs text-muted-foreground">{t.tenant_code}</div>
                  </td>
                  <td className="px-4 py-3 min-w-[120px]">
                    <TenantUsageBar label="" current={t.current_employees || 0} max={t.max_employees || 0} />
                  </td>
                  <td className="px-4 py-3 min-w-[120px]">
                    <TenantUsageBar label="" current={t.current_students || 0} max={t.max_students || 0} colorClass="bg-najdi-500" />
                  </td>
                  <td className="px-4 py-3 min-w-[120px]">
                    <TenantUsageBar label="" current={t.yamen_ai_used_this_month || 0} max={t.yamen_ai_monthly_limit || 0} colorClass="bg-purple-500" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {isActive
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <AlertTriangle className="w-4 h-4 text-red-500 mx-auto" />
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}