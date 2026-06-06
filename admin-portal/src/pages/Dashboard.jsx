import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Building2, Users, CreditCard, Activity } from 'lucide-react';
import { format } from 'date-fns';

function KPICard({ title, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">{title}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{value ?? '—'}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callApi('/api/admin/stats', {}, { method: 'GET' }),
  });

  const { data: tenantsData } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });

  const tenants = tenantsData?.tenants ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Platform Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time metrics across all tenants</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Tenants" value={stats?.totalTenants} icon={Building2} color="blue" />
        <KPICard title="Active Tenants" value={stats?.activeTenants} icon={Activity} color="emerald" />
        <KPICard title="Trial Tenants" value={stats?.trialTenants} icon={CreditCard} color="amber" />
        <KPICard title="Total Users" value={stats?.totalUsers} icon={Users} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Recent Tenants</h3>
            {tenants.length === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No tenants yet</p>
            ) : (
              <div className="space-y-3">
                {tenants.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                    <div>
                      <p className="font-medium text-sm text-slate-800">{t.name_en || t.name_ar}</p>
                      <p className="text-xs text-slate-500">{t.admin_email || t.tenant_code}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      t.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      t.status === 'trial' ? 'bg-amber-100 text-amber-700' :
                      t.status === 'suspended' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Platform Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Active Users</span>
                <span className="font-semibold text-slate-800">{stats?.activeUsers ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Inactive Users</span>
                <span className="font-semibold text-slate-800">
                  {stats ? (stats.totalUsers - stats.activeUsers) : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Trial Tenants</span>
                <span className="font-semibold text-slate-800">{stats?.trialTenants ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Active Tenants</span>
                <span className="font-semibold text-slate-800">{stats?.activeTenants ?? '—'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
