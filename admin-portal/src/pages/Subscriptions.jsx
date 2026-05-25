import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { CreditCard } from 'lucide-react';

const PLAN_COLORS = {
  trial: 'bg-amber-100 text-amber-700',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-emerald-100 text-emerald-700',
};

export default function Subscriptions() {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => fetchData(supabase.from('tenants').select('*').order('created_date', { ascending: false })),
  });

  const plans = tenants.reduce((acc, t) => {
    const plan = t.plan || 'trial';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Subscription Management</h1>
        <p className="text-sm text-slate-500">Manage tenant plans and billing</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(plans).map(([plan, count]) => (
          <Card key={plan}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{count}</p>
              <Badge className={PLAN_COLORS[plan] || 'bg-slate-100 text-slate-700'}>{plan}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Tenant</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Students</th>
                <th className="text-left px-4 py-3">Employees</th>
                <th className="text-left px-4 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">{t.name_en || t.name_ar}</p>
                    <p className="text-xs text-slate-500">{t.tenant_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={PLAN_COLORS[t.plan] || PLAN_COLORS.trial}>{t.plan || 'trial'}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.current_students || 0} / {t.max_students || '∞'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.current_employees || 0} / {t.max_employees || '∞'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.monthly_revenue ? `${t.monthly_revenue} SAR` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
