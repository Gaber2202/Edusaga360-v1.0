import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import {
  Search, Pause, Play, Trash2, Calendar, Building2,
  ChevronDown, ChevronUp, Users, Edit2, X, Check, RefreshCw,
} from 'lucide-react';

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  pending_approval: 'bg-blue-100 text-blue-700',
  denied: 'bg-slate-100 text-slate-500',
};

const ROLES = ['admin', 'hr_manager', 'hr_officer', 'finance', 'accountant', 'teacher', 'staff', 'parent'];

function UserRow({ user, tenantId, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(user.user_role || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await callApi(`/api/admin/users/${user.id}`, { user_role: role });
      toast.success('Role updated');
      setEditing(false);
      onRefresh();
    } catch (e) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    try {
      await callApi(`/api/admin/users/${user.id}`, { is_active: !user.is_active });
      toast.success(user.is_active ? 'User deactivated' : 'User activated');
      onRefresh();
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2.5">
        <p className="text-sm font-medium text-slate-800">
          {[user.first_name, user.last_name].filter(Boolean).join(' ') || '—'}
        </p>
        <p className="text-xs text-slate-400">{user.email}</p>
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <select
            className="h-7 rounded border border-slate-300 px-2 text-xs bg-white"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <Badge variant="outline" className="text-xs">{user.user_role || '—'}</Badge>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${user.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {user.is_active !== false ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-400">
        {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={save} disabled={saving}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)} title="Edit role">
                <Edit2 className="w-3.5 h-3.5 text-slate-500" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={toggleActive} title={user.is_active !== false ? 'Deactivate' : 'Activate'}>
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
}

function TenantCard({ tenant, qc }) {
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    status: tenant.status,
    plan: tenant.plan || '',
    max_users: tenant.max_users ?? 3,
    trial_end_date: tenant.trial_end_date ? tenant.trial_end_date.slice(0, 10) : '',
    notes: tenant.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ['tenant-users', tenant.id],
    queryFn: () => callApi(`/api/admin/tenants/${tenant.id}/users`, {}, { method: 'GET' }),
    enabled: expanded,
  });
  const users = usersData?.users ?? [];

  const saveEdits = async () => {
    setSaving(true);
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, form);
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Tenant updated');
      setEditMode(false);
    } catch (e) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const extendTrial = async () => {
    const current = tenant.trial_end_date ? new Date(tenant.trial_end_date) : new Date();
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, {
        trial_end_date: format(addDays(current, 14), 'yyyy-MM-dd'),
        status: 'trial',
      });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Trial extended 14 days');
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  const toggleSuspend = async () => {
    const newStatus = tenant.status === 'suspended' ? 'active' : 'suspended';
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, { status: newStatus });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success(`Tenant ${newStatus}`);
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  const deleteTenant = async () => {
    if (!confirm(`Permanently delete "${tenant.name_en || tenant.name_ar}"? This cannot be undone.`)) return;
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, {}, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Tenant deleted');
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  const approveRegistration = async () => {
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, { status: 'trial' });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Tenant approved — set to trial');
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-800">{tenant.name_en || tenant.name_ar}</p>
              {tenant.name_ar && tenant.name_en && (
                <p className="text-sm text-slate-400">{tenant.name_ar}</p>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {tenant.tenant_code} · {tenant.admin_email}
              {tenant.city && ` · ${tenant.city}`}
              {tenant.trial_end_date && ` · Trial ends ${format(new Date(tenant.trial_end_date), 'MMM d')}`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={`text-xs ${STATUS_STYLES[tenant.status] || 'bg-slate-100 text-slate-700'}`}>
              {tenant.status?.replace('_', ' ')}
            </Badge>

            {tenant.status === 'pending_approval' && (
              <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={approveRegistration}>
                Approve
              </Button>
            )}
            {tenant.status === 'trial' && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={extendTrial} title="Extend trial +14d">
                <Calendar className="w-4 h-4 text-slate-500" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditMode(!editMode)} title="Edit">
              <Edit2 className="w-4 h-4 text-slate-500" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={toggleSuspend} title={tenant.status === 'suspended' ? 'Reactivate' : 'Suspend'}>
              {tenant.status === 'suspended'
                ? <Play className="w-4 h-4 text-emerald-600" />
                : <Pause className="w-4 h-4 text-amber-500" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setExpanded(!expanded); }} title="Manage users">
              <Users className="w-4 h-4 text-blue-500" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={deleteTenant} title="Delete">
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
            <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-600">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Inline edit form */}
        {editMode && (
          <div className="border-t border-slate-100 bg-slate-50 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {[
                { key: 'status', label: 'Status', type: 'select', opts: ['active', 'trial', 'suspended', 'pending_approval', 'denied'] },
                { key: 'plan', label: 'Plan', type: 'select', opts: ['free_trial', 'starter', 'professional', 'enterprise'] },
                { key: 'max_users', label: 'Max Users', type: 'number' },
                { key: 'trial_end_date', label: 'Trial End', type: 'date' },
              ].map(({ key, label, type, opts }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  {type === 'select' ? (
                    <select
                      className="w-full h-8 rounded border border-slate-200 px-2 text-xs bg-white"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    >
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={type}
                      className="w-full h-8 rounded border border-slate-200 px-2 text-xs"
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">Internal Notes</label>
              <input
                type="text"
                className="w-full h-8 rounded border border-slate-200 px-2 text-xs"
                placeholder="e.g. Spoke to principal on June 8"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdits} disabled={saving} className="h-8">
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setEditMode(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Expanded users panel */}
        {expanded && (
          <div className="border-t border-slate-100">
            <div className="px-4 py-3 bg-slate-50 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Users ({users.length})
              </p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetchUsers()}>
                <RefreshCw className="w-3 h-3 me-1" /> Refresh
              </Button>
            </div>
            {users.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No users in this tenant</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100">
                  <tr>
                    {['Name / Email', 'Role', 'Status', 'Joined', ''].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map(u => (
                    <UserRow key={u.id} user={u} tenantId={tenant.id} onRefresh={refetchUsers} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Tenants() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const tenants = tenantsData?.tenants ?? [];

  const filtered = tenants.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      t.name_en?.toLowerCase().includes(q) ||
      t.name_ar?.includes(search) ||
      t.tenant_code?.toLowerCase().includes(q) ||
      t.admin_email?.toLowerCase().includes(q) ||
      t.city?.toLowerCase().includes(q);
    return matchSearch && (statusFilter === 'all' || t.status === statusFilter);
  });

  const counts = tenants.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">School Management</h1>
        <p className="text-sm text-slate-500">{tenants.length} schools registered</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search schools…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'all', label: `All (${tenants.length})` },
            { key: 'active', label: `Active (${counts.active || 0})` },
            { key: 'trial', label: `Trial (${counts.trial || 0})` },
            { key: 'pending_approval', label: `Pending (${counts.pending_approval || 0})` },
            { key: 'suspended', label: `Suspended (${counts.suspended || 0})` },
          ].map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? 'default' : 'outline'}
              className="h-9 text-xs"
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><Building2 className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-400">No schools found</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => <TenantCard key={t.id} tenant={t} qc={qc} />)}
        </div>
      )}
    </div>
  );
}
