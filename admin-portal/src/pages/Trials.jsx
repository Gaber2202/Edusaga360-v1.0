import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { trialDaysLeft, formatMoney, planLabel, PLAN_COLORS } from '../lib/plans';
import ConvertToPaidDialog from '../components/ConvertToPaidDialog';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Clock, Sparkles, Calendar, Building2, Users, AlertTriangle, TrendingUp, CheckCircle2 } from 'lucide-react';

function Stat({ label, value, icon: Icon, color }) {
  const colors = {
    amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600',
    emerald: 'bg-emerald-50 text-emerald-600', blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${colors[color]}`}><Icon className="w-5 h-5" /></div>
        <div><p className="text-2xl font-bold text-slate-800">{value}</p><p className="text-xs text-slate-400">{label}</p></div>
      </CardContent>
    </Card>
  );
}

export default function Trials() {
  const qc = useQueryClient();
  const [convertTenant, setConvertTenant] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callApi('/api/admin/stats', {}, { method: 'GET' }),
  });

  const all = data?.tenants ?? [];
  const trials = all
    .filter((t) => t.status === 'trial' || t.status === 'pending_approval')
    .map((t) => ({ ...t, daysLeft: trialDaysLeft(t.trial_end_date) }))
    .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));

  const converted = all.filter((t) => t.converted_from_trial);

  const extend = async (tenant, days = 14) => {
    try {
      await callApi(`/api/admin/tenants/${tenant.id}/extend-trial`, { days });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success(`Trial extended +${days} days`);
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  const urgency = (d) => {
    if (d == null) return { cls: 'bg-slate-100 text-slate-600', label: 'No end date' };
    if (d < 0) return { cls: 'bg-red-100 text-red-700', label: `Expired ${-d}d ago` };
    if (d <= 3) return { cls: 'bg-red-100 text-red-700', label: `${d}d left` };
    if (d <= 7) return { cls: 'bg-amber-100 text-amber-700', label: `${d}d left` };
    return { cls: 'bg-emerald-100 text-emerald-700', label: `${d}d left` };
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Trials Pipeline</h1>
        <p className="text-sm text-slate-500">Track every trial and convert them into paying customers</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Active trials" value={stats?.trialTenants ?? trials.length} icon={Clock} color="amber" />
        <Stat label="Expiring ≤ 7 days" value={stats?.trialsExpiringSoon ?? 0} icon={AlertTriangle} color="red" />
        <Stat label="Expired (action needed)" value={stats?.trialsExpired ?? 0} icon={Calendar} color="red" />
        <Stat label="Converted this month" value={stats?.conversionsThisMonth ?? 0} icon={TrendingUp} color="emerald" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" /></div>
      ) : trials.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><CheckCircle2 className="w-12 h-12 text-emerald-200 mx-auto mb-3" /><p className="text-slate-400">No active trials — all caught up</p></CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>{['School', 'Plan', 'Seats', 'Trial ends', 'Countdown', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trials.map((t) => {
                const u = urgency(t.daysLeft);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center"><Building2 className="w-4 h-4 text-slate-500" /></div>
                        <div>
                          <p className="font-medium text-slate-800">{t.name_en || t.name_ar}</p>
                          <p className="text-xs text-slate-400">{t.admin_email || t.tenant_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge className={`text-xs ${PLAN_COLORS[t.plan_code || t.plan] || 'bg-slate-100 text-slate-600'}`}>{planLabel(t.plan_code || t.plan)}</Badge></td>
                    <td className="px-4 py-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{t.user_count ?? 0}/{t.max_users ?? 5}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{t.trial_end_date ? format(new Date(t.trial_end_date), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.cls}`}>{u.label}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConvertTenant(t)}><Sparkles className="w-3.5 h-3.5" /> Convert</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => extend(t)}><Calendar className="w-3.5 h-3.5" /> +14d</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Recently converted */}
      {converted.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Recently converted ({converted.length})</p>
            <div className="space-y-2">
              {converted.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-slate-700">{t.name_en || t.name_ar}</span>
                    <Badge className={`text-xs ${PLAN_COLORS[t.plan_code] || 'bg-slate-100'}`}>{planLabel(t.plan_code)}</Badge>
                  </div>
                  <div className="text-xs text-slate-400">
                    {t.monthly_revenue ? <span className="text-emerald-600 font-medium me-2">{formatMoney(t.monthly_revenue)}/mo</span> : null}
                    {t.converted_at ? format(new Date(t.converted_at), 'MMM d') : ''}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ConvertToPaidDialog tenant={convertTenant} open={!!convertTenant} onOpenChange={(v) => !v && setConvertTenant(null)} onConverted={() => setConvertTenant(null)} />
    </div>
  );
}
