import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Search, Users, Edit2, Pause, Play, X, Check, RefreshCw } from 'lucide-react';

const ROLES = ['admin', 'hr_manager', 'hr_officer', 'finance', 'accountant', 'teacher', 'staff', 'parent'];

export default function PlatformUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin-all-users', tenantFilter],
    queryFn: () => callApi(`/api/admin/users${tenantFilter ? `?tenant_id=${tenantFilter}` : ''}`, {}, { method: 'GET' }),
  });
  const users = usersData?.users ?? [];

  const { data: tenantsData } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const tenants = tenantsData?.tenants ?? [];
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      u.email?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q);
    const matchRole = !roleFilter || u.user_role === roleFilter;
    return matchSearch && matchRole;
  });

  const startEdit = (user) => {
    setEditingId(user.id);
    setEditForm({ user_role: user.user_role || '', first_name: user.first_name || '', last_name: user.last_name || '', job_title: user.job_title || '' });
  };

  const saveEdit = async (userId) => {
    try {
      await callApi(`/api/admin/users/${userId}`, editForm);
      toast.success('User updated');
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['admin-all-users'] });
    } catch (e) {
      toast.error(e.message || 'Failed to update');
    }
  };

  const toggleActive = async (user) => {
    try {
      await callApi(`/api/admin/users/${user.id}`, { is_active: user.is_active === false });
      toast.success(user.is_active !== false ? 'User deactivated' : 'User activated');
      qc.invalidateQueries({ queryKey: ['admin-all-users'] });
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">All Users</h1>
        <p className="text-sm text-slate-500">{users.length} users across all schools</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
        </div>
        <select
          className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
        >
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
          value={tenantFilter}
          onChange={e => setTenantFilter(e.target.value)}
        >
          <option value="">All Schools</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name_en || t.name_ar}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><Users className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-400">No users found</p></CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Name', 'Email', 'Role', 'School', 'Status', 'Joined', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(user => {
                const tenant = tenantMap[user.tenant_id];
                const isEditing = editingId === user.id;
                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <input className="h-7 w-24 rounded border border-slate-200 px-2 text-xs" value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} placeholder="First" />
                          <input className="h-7 w-24 rounded border border-slate-200 px-2 text-xs" value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} placeholder="Last" />
                        </div>
                      ) : (
                        <p className="font-medium text-slate-800">
                          {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{user.email}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <select
                          className="h-7 rounded border border-slate-200 px-2 text-xs bg-white"
                          value={editForm.user_role}
                          onChange={e => setEditForm(f => ({ ...f, user_role: e.target.value }))}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <Badge variant="outline" className="text-xs">{user.user_role || '—'}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {tenant ? (tenant.name_en || tenant.name_ar) : user.is_platform_owner ? 'Platform Owner' : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {user.is_active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit(user.id)}>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(user)} title="Edit">
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleActive(user)} title={user.is_active !== false ? 'Deactivate' : 'Activate'}>
                              {user.is_active !== false
                                ? <Pause className="w-3.5 h-3.5 text-amber-500" />
                                : <Play className="w-3.5 h-3.5 text-emerald-500" />}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400 text-center">
              Showing {filtered.length} of {users.length} users
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
