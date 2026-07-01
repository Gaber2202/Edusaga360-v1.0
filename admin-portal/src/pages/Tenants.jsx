import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { STATUS_COLORS, PLAN_COLORS, planLabel, trialDaysLeft, formatMoney, ROLES } from '../lib/plans';
import ConvertToPaidDialog from '../components/ConvertToPaidDialog';
import TenantAiDialog from '../components/TenantAiDialog';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Search, Pause, Play, Trash2, Calendar, Building2, ChevronDown, ChevronUp,
  Users, Edit2, X, Check, RefreshCw, Sparkles, Bot,
} from 'lucide-react';

function UserRow({ user, onRefresh }) {
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
      await callApi(`/api/admin/users/${user.id}/${user.status === 'active' ? 'deactivate' : 'activate'}`, { _: 1 });
      toast.success(user.status === 'active' ? 'User deactivated' : 'User activated');
      onRefresh();
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  return (
    <tr className="hover:bg-sand">
      <td className="px-4 py-2.5">
        <p className="text-sm font-medium text-ink">{user.full_name || '—'}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </td>
      <td className="px-4 py-2.5">
        {editing ? (
          <select className="h-7 rounded border border-border px-2 text-xs bg-white" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        ) : (
          <Badge variant="outline" className="text-xs">{user.user_role || '—'}</Badge>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[user.status] || 'bg-sand-alt text-muted-foreground'}`}>{user.status || 'active'}</span>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">{user.last_sign_in_at ? format(new Date(user.last_sign_in_at), 'MMM d') : 'Never'}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={save} disabled={saving}>
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)}><X className="w-3.5 h-3.5" /></Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)} title="Edit role"><Edit2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
              {!user.is_platform_owner && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={toggleActive} title={user.status === 'active' ? 'Deactivate' : 'Activate'}>
                  {user.status === 'active' ? <Pause className="w-3.5 h-3.5 text-amber-500" /> : <Play className="w-3.5 h-3.5 text-emerald-500" />}
                </Button>
              )}
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
  const [convertOpen, setConvertOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [form, setForm] = useState({
    status: tenant.status,
    plan_code: tenant.plan_code || tenant.plan || '',
    max_users: tenant.max_users ?? 5,
    max_students: tenant.max_students ?? '',
    monthly_revenue: tenant.monthly_revenue ?? '',
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
  const daysLeft = trialDaysLeft(tenant.trial_end_date);
  const isPaid = tenant.status === 'active' && tenant.converted_from_trial;

  const post = async (path, body, msg) => {
    try {
      await callApi(`/api/admin/tenants/${tenant.id}${path}`, body || { _: 1 });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      if (msg) toast.success(msg);
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, form);
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('School updated');
      setEditMode(false);
    } catch (e) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const deleteTenant = async () => {
    if (!confirm(`Permanently delete "${tenant.name_en || tenant.name_ar}"? This cannot be undone.`)) return;
    try {
      await callApi(`/api/admin/tenants/${tenant.id}`, {}, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('School deleted');
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center gap-4 p-4">
          <div className="w-10 h-10 bg-sand-alt rounded-xl flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-ink">{tenant.name_en || tenant.name_ar}</p>
              {tenant.name_ar && tenant.name_en && <p className="text-sm text-muted-foreground">{tenant.name_ar}</p>}
              <Badge className={`text-xs ${PLAN_COLORS[tenant.plan_code || tenant.plan] || 'bg-sand-alt text-muted-foreground'}`}>{planLabel(tenant.plan_code || tenant.plan)}</Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
              <span>{tenant.tenant_code} · {tenant.admin_email}</span>
              <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{tenant.user_count ?? 0}/{tenant.max_users ?? 5} seats</span>
              {isPaid && tenant.monthly_revenue ? <span className="text-emerald-600 font-medium">{formatMoney(tenant.monthly_revenue)}/mo</span> : null}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {tenant.status === 'trial' && daysLeft != null && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${daysLeft < 0 ? 'bg-red-100 text-red-700' : daysLeft <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-sand-alt text-muted-foreground'}`}>
                {daysLeft < 0 ? `Expired ${-daysLeft}d ago` : `${daysLeft}d left`}
              </span>
            )}
            <Badge className={`text-xs capitalize ${STATUS_COLORS[tenant.status] || 'bg-sand-alt text-ink'}`}>{tenant.status?.replace('_', ' ')}</Badge>

            {tenant.status === 'pending_approval' && (
              <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={() => post('/extend-trial', { days: 14 }, 'Approved — trial started')}>Approve</Button>
            )}
            {(tenant.status === 'trial' || !isPaid) && tenant.status !== 'suspended' && (
              <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1" onClick={() => setConvertOpen(true)} title="Convert to paid">
                <Sparkles className="w-3.5 h-3.5" /> Convert
              </Button>
            )}
            {tenant.status === 'trial' && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => post('/extend-trial', { days: 14 }, 'Trial extended +14 days')} title="Extend trial +14d"><Calendar className="w-4 h-4 text-muted-foreground" /></Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditMode(!editMode)} title="Edit"><Edit2 className="w-4 h-4 text-muted-foreground" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => post(tenant.status === 'suspended' ? '/reactivate' : '/suspend', null, tenant.status === 'suspended' ? 'Reactivated' : 'Suspended')} title={tenant.status === 'suspended' ? 'Reactivate' : 'Suspend'}>
              {tenant.status === 'suspended' ? <Play className="w-4 h-4 text-emerald-600" /> : <Pause className="w-4 h-4 text-amber-500" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExpanded(!expanded)} title="Manage users"><Users className="w-4 h-4 text-najdi-500" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAiOpen(true)} title="Yamen AI settings"><Bot className="w-4 h-4 text-najdi-500" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={deleteTenant} title="Delete"><Trash2 className="w-4 h-4 text-red-400" /></Button>
            <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-muted-foreground">{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
          </div>
        </div>

        {editMode && (
          <div className="border-t border-border bg-sand p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              {[
                { key: 'status', label: 'Status', type: 'select', opts: ['active', 'trial', 'suspended', 'pending_approval', 'inactive', 'denied'] },
                { key: 'plan_code', label: 'Plan', type: 'select', opts: ['free_trial', 'starter', 'professional', 'enterprise', 'government'] },
                { key: 'max_users', label: 'Seats', type: 'number' },
                { key: 'max_students', label: 'Max Students', type: 'number' },
                { key: 'monthly_revenue', label: 'MRR (SAR)', type: 'number' },
                { key: 'trial_end_date', label: 'Trial End', type: 'date' },
              ].map(({ key, label, type, opts }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                  {type === 'select' ? (
                    <select className="w-full h-8 rounded border border-border px-2 text-xs bg-white" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}>
                      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={type} className="w-full h-8 rounded border border-border px-2 text-xs" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Internal Notes</label>
              <input type="text" className="w-full h-8 rounded border border-border px-2 text-xs" placeholder="e.g. Spoke to principal on June 8" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdits} disabled={saving} className="h-8">{saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}</Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setEditMode(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {expanded && (
          <div className="border-t border-border">
            <div className="px-4 py-3 bg-sand flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Users ({users.length})</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetchUsers()}><RefreshCw className="w-3 h-3 me-1" /> Refresh</Button>
            </div>
            {users.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No users in this school</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>{['Name / Email', 'Role', 'Status', 'Last login', ''].map((h) => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {users.map((u) => <UserRow key={u.id} user={u} onRefresh={refetchUsers} />)}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>

      <ConvertToPaidDialog tenant={tenant} open={convertOpen} onOpenChange={setConvertOpen} />
      <TenantAiDialog tenant={tenant} open={aiOpen} onOpenChange={setAiOpen} />
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

  const filtered = tenants.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      t.name_en?.toLowerCase().includes(q) || t.name_ar?.includes(search) ||
      t.tenant_code?.toLowerCase().includes(q) || t.admin_email?.toLowerCase().includes(q) || t.city?.toLowerCase().includes(q);
    return matchSearch && (statusFilter === 'all' || t.status === statusFilter);
  });

  const counts = tenants.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Schools</h1>
        <p className="text-sm text-muted-foreground">{tenants.length} schools registered</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search schools…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-9" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'all', label: `All (${tenants.length})` },
            { key: 'active', label: `Active (${counts.active || 0})` },
            { key: 'trial', label: `Trial (${counts.trial || 0})` },
            { key: 'pending_approval', label: `Pending (${counts.pending_approval || 0})` },
            { key: 'suspended', label: `Suspended (${counts.suspended || 0})` },
          ].map(({ key, label }) => (
            <Button key={key} size="sm" variant={statusFilter === key ? 'default' : 'outline'} className="h-9 text-xs" onClick={() => setStatusFilter(key)}>{label}</Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-border border-t-najdi-700 rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><Building2 className="w-12 h-12 text-najdi-100 mx-auto mb-3" /><p className="text-muted-foreground">No schools found</p></CardContent></Card>
      ) : (
        <div className="space-y-3">{filtered.map((t) => <TenantCard key={t.id} tenant={t} qc={qc} />)}</div>
      )}
    </div>
  );
}
