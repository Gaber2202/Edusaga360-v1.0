import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { PLAN_COLORS, STATUS_COLORS, planLabel, formatMoney, PLANS } from '../lib/plans';
import ConvertToPaidDialog from '../components/ConvertToPaidDialog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { format } from 'date-fns';
import { DollarSign, TrendingUp, Users, CreditCard, Sparkles } from 'lucide-react';

function KPI({ label, value, sub, icon: Icon, color }) {
  const colors = { emerald: 'bg-emerald-50 text-emerald-600', blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', amber: 'bg-amber-50 text-amber-600' };
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}><Icon className="w-5 h-5" /></div>
        <div><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>{sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}</div>
      </CardContent>
    </Card>
  );
}

export default function Subscriptions() {
  const [convertTenant, setConvertTenant] = useState(null);

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callApi('/api/admin/stats', {}, { method: 'GET' }),
  });

  const tenants = tenantsData?.tenants ?? [];
  const paying = tenants.filter((t) => t.status === 'active' && (Number(t.monthly_revenue) > 0 || t.converted_from_trial));
  const mrr = stats?.mrr ?? paying.reduce((s, t) => s + (Number(t.monthly_revenue) || 0), 0);
  const arpu = paying.length ? mrr / paying.length : 0;

  // Plan distribution across all tenants.
  const dist = tenants.reduce((acc, t) => { const p = t.plan_code || t.plan || 'free_trial'; acc[p] = (acc[p] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Subscriptions & Revenue</h1>
        <p className="text-sm text-slate-500">Plans, recurring revenue, and trial conversions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="MRR" value={formatMoney(mrr)} sub={`${formatMoney((stats?.arr ?? mrr * 12))} ARR`} icon={DollarSign} color="emerald" />
        <KPI label="Paying customers" value={paying.length} icon={CreditCard} color="blue" />
        <KPI label="ARPU" value={formatMoney(Math.round(arpu))} sub="per customer / mo" icon={Users} color="purple" />
        <KPI label="Converted this month" value={stats?.conversionsThisMonth ?? 0} icon={TrendingUp} color="amber" />
      </div>

      {/* Plan distribution */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([plan, count]) => (
          <Card key={plan} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{count}</p>
              <Badge className={`text-xs ${PLAN_COLORS[plan] || 'bg-slate-100 text-slate-700'}`}>{planLabel(plan)}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan reference */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">List pricing (SAR / month)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PLANS.map((p) => (
            <div key={p.code} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between"><span className="font-semibold text-slate-800">{p.name}</span><Badge className={`text-xs ${PLAN_COLORS[p.code]}`}>{p.max_users} seats</Badge></div>
              <p className="text-lg font-bold text-slate-800 mt-1">{p.monthly ? formatMoney(p.monthly) : 'Custom'}</p>
              <p className="text-[11px] text-slate-400">{p.blurb}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Billing table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-2"><CardTitle className="text-base">Customer Billing</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-400 uppercase tracking-wide border-y border-slate-100">
                <tr>{['School', 'Plan', 'Status', 'Cycle', 'MRR', 'Seats', 'Renews', ''].map((h) => <th key={h} className="text-left px-4 py-2.5">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => {
                  const isPaid = t.status === 'active' && (Number(t.monthly_revenue) > 0 || t.converted_from_trial);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><p className="font-medium text-slate-800">{t.name_en || t.name_ar}</p><p className="text-xs text-slate-400">{t.tenant_code}</p></td>
                      <td className="px-4 py-3"><Badge className={`text-xs ${PLAN_COLORS[t.plan_code || t.plan] || 'bg-slate-100'}`}>{planLabel(t.plan_code || t.plan)}</Badge></td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-600'}`}>{t.status?.replace('_', ' ')}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500 capitalize">{isPaid ? (t.billing_cycle || 'monthly') : '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-700">{isPaid && t.monthly_revenue ? formatMoney(t.monthly_revenue) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{t.user_count ?? 0}/{t.max_users ?? 5}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{t.plan_renews_at ? format(new Date(t.plan_renews_at), 'MMM d, yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {!isPaid && t.status !== 'suspended' && (
                          <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConvertTenant(t)}><Sparkles className="w-3.5 h-3.5" /> Convert</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConvertToPaidDialog tenant={convertTenant} open={!!convertTenant} onOpenChange={(v) => !v && setConvertTenant(null)} onConverted={() => setConvertTenant(null)} />
    </div>
  );
}
