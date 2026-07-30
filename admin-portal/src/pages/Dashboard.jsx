import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { callApi, apiGet } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Building2, Users, TrendingUp, Clock, UserPlus, Mail, AlertCircle, DollarSign, Sparkles, Zap, Brain } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { formatMoney, planLabel } from '../lib/plans';

function KPI({ title, value, sub, icon: Icon, color, to }) {
  const colors = {
    blue: 'bg-najdi-50 text-najdi-700',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-sand-alt text-muted-foreground',
  };
  const inner = (
    <CardContent className="p-5 flex items-start gap-4">
      <div className={`p-3 rounded-xl ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-ink mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </CardContent>
  );
  return (
    <Card className={`border-0 shadow-sm ${to ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      {to ? <Link to={to}>{inner}</Link> : inner}
    </Card>
  );
}

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  pending_approval: 'bg-najdi-50 text-najdi-900',
};

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callApi('/api/admin/stats', {}, { method: 'GET' }),
  });
  const { data: tenantsData } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const tenants = (tenantsData?.tenants ?? []).slice(0, 6);

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data: aiUsage } = useQuery({
    queryKey: ['admin-ai-usage', currentPeriod],
    queryFn: () => apiGet('/api/admin/ai-usage', { period: currentPeriod }),
  });
  const aiCost = aiUsage?.summary?.cost_usd ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time metrics across all schools</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Total Schools" value={stats?.totalTenants} sub={`+${stats?.newTenantsThisMonth ?? 0} this month`} icon={Building2} color="blue" to="/tenants" />
        <KPI title="Active Schools" value={stats?.activeTenants} icon={TrendingUp} color="emerald" to="/tenants" />
        <KPI title="On Trial" value={stats?.trialTenants} icon={Clock} color="amber" to="/trials" />
        <KPI title="Total Users" value={stats?.totalUsers} sub={`${stats?.activeUsers ?? 0} active`} icon={Users} color="purple" to="/users" />
      </div>

      {/* Revenue & conversion KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="MRR" value={formatMoney(stats?.mrr ?? 0)} sub={`${formatMoney(stats?.arr ?? 0)} ARR`} icon={DollarSign} color="emerald" to="/subscriptions" />
        <KPI title="Trials Expiring ≤7d" value={stats?.trialsExpiringSoon ?? 0} sub={`${stats?.trialsExpired ?? 0} expired`} icon={Zap} color="red" to="/trials" />
        <KPI title="Converted This Month" value={stats?.conversionsThisMonth ?? 0} icon={Sparkles} color="emerald" to="/trials" />
        <KPI title="Yamen AI Cost" value={`$${(aiCost ?? 0).toFixed(4)}`} sub={`${(aiUsage?.summary?.total_tokens ?? 0).toLocaleString()} tokens`} icon={Brain} color="purple" to="/yamen-ai-usage" />
      </div>

      {/* Alert row */}
      {((stats?.pendingUserRequests ?? 0) > 0 || (stats?.pendingInvitations ?? 0) > 0 || (stats?.pendingTenants ?? 0) > 0 || (stats?.trialsExpiringSoon ?? 0) > 0) && (
        <div className="flex gap-3 flex-wrap">
          {(stats?.trialsExpiringSoon ?? 0) > 0 && (
            <Link to="/trials" className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 hover:bg-red-100">
              <Zap className="w-4 h-4" />
              {stats.trialsExpiringSoon} trial{stats.trialsExpiringSoon > 1 ? 's' : ''} expiring within 7 days
            </Link>
          )}
          {(stats?.pendingTenants ?? 0) > 0 && (
            <Link to="/tenants" className="flex items-center gap-2 bg-najdi-50 border border-najdi-100 rounded-lg px-4 py-2 text-sm text-najdi-900 hover:bg-najdi-50">
              <AlertCircle className="w-4 h-4" />
              {stats.pendingTenants} tenant{stats.pendingTenants > 1 ? 's' : ''} awaiting approval
            </Link>
          )}
          {(stats?.pendingUserRequests ?? 0) > 0 && (
            <Link to="/user-requests" className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700 hover:bg-amber-100">
              <UserPlus className="w-4 h-4" />
              {stats.pendingUserRequests} pending user request{stats.pendingUserRequests > 1 ? 's' : ''}
            </Link>
          )}
          {(stats?.pendingInvitations ?? 0) > 0 && (
            <Link to="/invitations" className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-sm text-purple-700 hover:bg-purple-100">
              <Mail className="w-4 h-4" />
              {stats.pendingInvitations} open invitation{stats.pendingInvitations > 1 ? 's' : ''}
            </Link>
          )}
        </div>
      )}

      {/* Recent tenants */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-ink">Recent Schools</CardTitle>
            <Link to="/tenants" className="text-sm text-najdi-700 hover:underline">View all</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No schools registered yet</p>
          ) : (
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  {['School', 'Plan', 'Status', 'Joined'].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tenants.map(t => (
                  <tr key={t.id} className="hover:bg-sand">
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-ink">{t.name_en || t.name_ar}</p>
                      <p className="text-xs text-muted-foreground">{t.admin_email || t.tenant_code}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{planLabel(t.plan_code || t.plan)}</td>
                    <td className="px-5 py-3">
                      <Badge className={`text-xs ${STATUS_STYLES[t.status] || 'bg-sand-alt text-ink'}`}>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">
                      {t.created_at ? format(new Date(t.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
