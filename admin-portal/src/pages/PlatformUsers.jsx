import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Search, Users } from 'lucide-react';

export default function PlatformUsers() {
  const [search, setSearch] = useState('');

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-all-users'],
    queryFn: () => callApi('/api/admin/users', {}, { method: 'GET' }),
  });
  const users = usersData?.users ?? [];

  const { data: tenantsData } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const tenants = tenantsData?.tenants ?? [];

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

  const filtered = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(s) ||
      u.first_name?.toLowerCase().includes(s) ||
      u.last_name?.toLowerCase().includes(s) ||
      u.user_role?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Platform Users</h1>
        <p className="text-sm text-slate-500">{users.length} total users across all tenants</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No users found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Tenant</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 50).map(user => {
                const tenant = tenantMap[user.tenant_id];
                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">
                        {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.email}
                      </p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{user.user_role || user.role || 'unassigned'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600">
                        {tenant ? (tenant.name_en || tenant.name_ar) : (user.is_platform_owner ? 'Platform Owner' : '—')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        user.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 50 && (
            <div className="px-4 py-3 border-t border-slate-200 text-sm text-slate-500 text-center">
              Showing 50 of {filtered.length} users
            </div>
          )}
        </div>
      )}
    </div>
  );
}
