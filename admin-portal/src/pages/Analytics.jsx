import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { callApi, apiGet } from '../lib/supabase';
import { planLabel, formatMoney } from '../lib/plans';
import { Card, CardContent } from '../components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Activity } from 'lucide-react';

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#64748b'];

function ChartCard({ title, children, hasData }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5">
        <h3 className="font-semibold text-slate-800 mb-4">{title}</h3>
        {hasData ? children : (
          <div className="flex flex-col items-center py-10 text-slate-400"><Activity className="w-8 h-8 mb-2" /><p className="text-sm">No data yet</p></div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { data: tenantsData } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const { data: usersData } = useQuery({
    queryKey: ['admin-users', { analytics: true }],
    queryFn: () => apiGet('/api/admin/users', { pageSize: 200, page: 1 }),
  });
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callApi('/api/admin/stats', {}, { method: 'GET' }),
  });

  const tenants = tenantsData?.tenants ?? [];
  const users = usersData?.users ?? [];

  const statusData = Object.entries(tenants.reduce((acc, t) => { const s = t.status || 'unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));

  const planData = Object.entries(tenants.reduce((acc, t) => { const p = planLabel(t.plan_code || t.plan); acc[p] = (acc[p] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));

  const mrrByPlan = Object.entries(tenants.filter((t) => t.status === 'active').reduce((acc, t) => { const p = planLabel(t.plan_code || t.plan); acc[p] = (acc[p] || 0) + (Number(t.monthly_revenue) || 0); return acc; }, {})).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);

  const roleData = Object.entries(users.reduce((acc, u) => { const r = u.user_role || 'unassigned'; acc[r] = (acc[r] || 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Platform Analytics</h1>
        <p className="text-sm text-slate-500">Growth, revenue, and usage across all schools</p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'MRR', value: formatMoney(stats?.mrr ?? 0) },
          { label: 'ARR', value: formatMoney(stats?.arr ?? 0) },
          { label: 'Active schools', value: stats?.activeTenants ?? 0 },
          { label: 'Trials', value: stats?.trialTenants ?? 0 },
        ].map((k) => (
          <Card key={k.label} className="border-0 shadow-sm"><CardContent className="p-5"><p className="text-sm text-slate-500">{k.label}</p><p className="text-2xl font-bold text-slate-800 mt-0.5">{k.value}</p></CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="School Status Distribution" hasData={statusData.length > 0}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend /><Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Plan Distribution" hasData={planData.length > 0}>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={planData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" label>
                {planData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend /><Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="MRR by Plan (SAR)" hasData={mrrByPlan.length > 0}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={mrrByPlan}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatMoney(v)} />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Users by Role" hasData={roleData.length > 0}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={roleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
