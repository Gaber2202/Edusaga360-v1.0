import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { callApi, apiGet } from '../lib/supabase';
import { ROLES, USER_STATUSES, STATUS_COLORS } from '../lib/plans';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from '../components/ui/dropdown-menu';
import UserFormDialog from '../components/UserFormDialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Search, Plus, Users, MoreVertical, Edit2, KeyRound, LogIn, Pause, Play, Ban,
  Trash2, Download, ChevronLeft, ChevronRight, X, Loader2, ShieldCheck, ShieldAlert, CheckCircle2, UserCog,
} from 'lucide-react';

const PAGE_SIZE = 50;

function StatusPill({ status }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[status] || 'bg-slate-100 text-slate-500'}`}>
      {status || 'active'}
    </span>
  );
}

function Stat({ label, value, color = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-2.5 shadow-sm">
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

export default function PlatformUsers() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [detailUser, setDetailUser] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Debounce the search box → server query.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setPage(1); setSelected(new Set()); }, [role, status, tenantFilter]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-users', { search, role, status, tenantFilter, page }],
    queryFn: () => apiGet('/api/admin/users', { search, role, status, tenant_id: tenantFilter, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: tenantsData } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const tenants = tenantsData?.tenants ?? [];
  const tenantMap = useMemo(() => Object.fromEntries(tenants.map((t) => [t.id, t])), [tenants]);

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callApi('/api/admin/stats', {}, { method: 'GET' }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  // ── Row actions ───────────────────────────────────────────────────────────
  const act = async (user, verb, run) => {
    setBusyId(user.id);
    try {
      const res = await run();
      refresh();
      return res;
    } catch (e) {
      toast.error(e.message || `Failed to ${verb}`);
    } finally {
      setBusyId(null);
    }
  };

  const setStatusAction = (user, action, label) =>
    act(user, label, async () => { await callApi(`/api/admin/users/${user.id}/${action}`, { _: 1 }); toast.success(`${user.full_name || user.email} ${label}`); });

  const resetPassword = (user) =>
    act(user, 'reset password', async () => {
      const res = await callApi(`/api/admin/users/${user.id}/reset-password`, { _: 1 });
      if (res.action_link) {
        const copied = await navigator.clipboard.writeText(res.action_link).then(() => true).catch(() => false);
        const headline = copied
          ? 'Reset link copied' + (res.email_sent ? ' & emailed' : '')
          : (res.email_sent ? 'Reset link emailed' : 'Reset link ready');
        // Surface the link in the toast too, so it can be grabbed manually
        // whenever the clipboard API is unavailable (e.g. insecure context).
        toast.success(headline, { description: res.action_link, duration: 12000 });
      } else {
        toast.success(res.email_sent ? 'Reset email sent' : 'Reset link generated');
      }
    });

  const magicLink = (user) =>
    act(user, 'generate link', async () => {
      const res = await callApi(`/api/admin/users/${user.id}/magic-link`, { _: 1 });
      if (res.action_link) { await navigator.clipboard.writeText(res.action_link).catch(() => {}); toast.success('Sign-in link copied to clipboard'); }
    });

  const deleteUser = (user) => {
    if (!confirm(`Deactivate ${user.full_name || user.email}? They will be unable to sign in. (User data is preserved.)`)) return;
    return act(user, 'delete', async () => { await callApi(`/api/admin/users/${user.id}`, {}, { method: 'DELETE' }); toast.success('User deactivated'); });
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const selectableIds = users.filter((u) => !u.is_platform_owner).map((u) => u.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));
  const toggleOne = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const bulk = async (action, user_role) => {
    const ids = [...selected];
    if (!ids.length) return;
    const verb = action === 'set_role' ? `set role → ${user_role}` : action;
    if (!confirm(`Apply "${verb}" to ${ids.length} user(s)?`)) return;
    try {
      const res = await callApi('/api/admin/users/bulk', { ids, action, user_role });
      toast.success(`${res.updated} user(s) updated`);
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast.error(e.message || 'Bulk action failed');
    }
  };

  const exportCsv = () => {
    const rows = [['Name', 'Email', 'Role', 'School', 'Status', 'Last login', 'Joined']];
    users.forEach((u) => rows.push([
      u.full_name || '', u.email || '', u.user_role || '',
      tenantMap[u.tenant_id]?.name_en || (u.is_platform_owner ? 'Platform' : ''),
      u.status || '', u.last_sign_in_at || 'never', u.created_at || '',
    ]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `edusaga-users-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-sm text-slate-500">Full visibility & control across every school</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={exportCsv}><Download className="w-4 h-4" /> Export</Button>
          <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> Add User</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total users" value={stats?.totalUsers ?? total ?? '—'} />
        <Stat label="Active" value={stats?.activeUsers ?? '—'} color="text-emerald-600" />
        <Stat label="Suspended" value={stats?.suspendedUsers ?? 0} color="text-red-600" />
        <Stat label="New this month" value={stats?.newUsersThisMonth ?? 0} color="text-blue-600" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Search name or email…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-10 h-9" />
          {isFetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-300" />}
        </div>
        <select className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="h-9 rounded-md border border-slate-200 px-3 text-sm bg-white" value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
          <option value="">All schools</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name_en || t.name_ar}</option>)}
        </select>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-slate-900 text-white rounded-lg px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-slate-500">·</span>
          <button className="hover:text-emerald-300 flex items-center gap-1" onClick={() => bulk('activate')}><Play className="w-3.5 h-3.5" /> Activate</button>
          <button className="hover:text-amber-300 flex items-center gap-1" onClick={() => bulk('deactivate')}><Pause className="w-3.5 h-3.5" /> Deactivate</button>
          <button className="hover:text-red-300 flex items-center gap-1" onClick={() => bulk('suspend')}><Ban className="w-3.5 h-3.5" /> Suspend</button>
          <select className="h-7 rounded bg-slate-800 border border-slate-700 px-2 text-xs" defaultValue="" onChange={(e) => { if (e.target.value) { bulk('set_role', e.target.value); e.target.value = ''; } }}>
            <option value="">Set role…</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="hover:text-red-300 flex items-center gap-1" onClick={() => bulk('delete')}><Trash2 className="w-3.5 h-3.5" /> Delete</button>
          <button className="ml-auto text-slate-400 hover:text-white" onClick={() => setSelected(new Set())}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" /></div>
      ) : users.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><Users className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-400">No users match your filters</p></CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-slate-300" /></th>
                  {['User', 'Role', 'School', 'Status', 'Last login', 'Joined', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const tenant = tenantMap[u.tenant_id];
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id} className={`hover:bg-slate-50 ${selected.has(u.id) ? 'bg-emerald-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        {!u.is_platform_owner && <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} className="rounded border-slate-300" />}
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-left group" onClick={() => setDetailUser(u)}>
                          <p className="font-medium text-slate-800 group-hover:text-emerald-700 flex items-center gap-1.5">
                            {u.full_name}
                            {u.is_platform_owner && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" title="Platform owner" />}
                          </p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </button>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{u.user_role || '—'}</Badge></td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {tenant ? (tenant.name_en || tenant.name_ar) : u.is_platform_owner ? 'Platform' : '—'}
                        {u.is_trial_user && <span className="ml-1 text-amber-500" title="Trial user">·trial</span>}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={u.status} />{u.email_confirmed === false && <span title="Email not confirmed" className="ml-1 text-amber-500">●</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{u.last_sign_in_at ? format(new Date(u.last_sign_in_at), 'MMM d, yyyy') : 'Never'}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {u.is_platform_owner ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : busy ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-300 inline" />
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><MoreVertical className="w-4 h-4 text-slate-400" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel className="text-xs">{u.full_name}</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => setDetailUser(u)}><UserCog className="w-4 h-4 mr-2" /> View details</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditUser(u)}><Edit2 className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => resetPassword(u)}><KeyRound className="w-4 h-4 mr-2" /> Reset password</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => magicLink(u)}><LogIn className="w-4 h-4 mr-2" /> Sign-in link</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {u.status === 'active' ? (
                                <>
                                  <DropdownMenuItem onClick={() => setStatusAction(u, 'deactivate', 'deactivated')}><Pause className="w-4 h-4 mr-2 text-amber-500" /> Deactivate</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setStatusAction(u, 'suspend', 'suspended')}><Ban className="w-4 h-4 mr-2 text-red-500" /> Suspend</DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem onClick={() => setStatusAction(u, 'activate', 'activated')}><Play className="w-4 h-4 mr-2 text-emerald-600" /> Activate</DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => deleteUser(u)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Deactivate (soft delete)</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
            <span>{total.toLocaleString()} user{total === 1 ? '' : 's'} · page {page} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" /></Button>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </Card>
      )}

      <UserFormDialog open={createOpen} onOpenChange={setCreateOpen} tenants={tenants} />
      <UserFormDialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)} user={editUser} tenants={tenants} />

      <UserDetailDrawer
        user={detailUser}
        tenant={detailUser ? tenantMap[detailUser.tenant_id] : null}
        onClose={() => setDetailUser(null)}
        onEdit={(u) => { setDetailUser(null); setEditUser(u); }}
        onResetPassword={resetPassword}
        onMagicLink={magicLink}
        onStatus={setStatusAction}
      />
    </div>
  );
}

// ── Slide-over user detail ────────────────────────────────────────────────────
function UserDetailDrawer({ user, tenant, onClose, onEdit, onResetPassword, onMagicLink, onStatus }) {
  if (!user) return null;
  const Row = ({ label, children }) => (
    <div className="flex items-start justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-slate-700 text-right max-w-[60%]">{children}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">User details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-semibold">
              {(user.full_name || user.email || '?').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">{user.full_name}{user.is_platform_owner && <ShieldCheck className="w-4 h-4 text-emerald-600" />}</p>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>

          <div>
            <Row label="Status"><StatusPill status={user.status} /></Row>
            <Row label="Role"><Badge variant="outline" className="text-xs">{user.user_role || '—'}</Badge></Row>
            <Row label="School">{tenant ? (tenant.name_en || tenant.name_ar) : user.is_platform_owner ? 'Platform' : '—'}</Row>
            <Row label="Phone">{user.phone || '—'}</Row>
            <Row label="Trial user">{user.is_trial_user ? 'Yes' : 'No'}</Row>
            <Row label="Email confirmed">{user.email_confirmed === false ? <span className="text-amber-600 flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5" /> No</span> : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Yes</span>}</Row>
            <Row label="Last sign-in">{user.last_sign_in_at ? format(new Date(user.last_sign_in_at), 'MMM d, yyyy HH:mm') : 'Never'}</Row>
            <Row label="Joined">{user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}</Row>
          </div>

          {!user.is_platform_owner && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-1.5" onClick={() => onEdit(user)}><Edit2 className="w-4 h-4" /> Edit</Button>
              <Button variant="outline" className="gap-1.5" onClick={() => onResetPassword(user)}><KeyRound className="w-4 h-4" /> Reset password</Button>
              <Button variant="outline" className="gap-1.5" onClick={() => onMagicLink(user)}><LogIn className="w-4 h-4" /> Sign-in link</Button>
              {user.status === 'active'
                ? <Button variant="outline" className="gap-1.5 text-amber-600" onClick={() => { onStatus(user, 'deactivate', 'deactivated'); onClose(); }}><Pause className="w-4 h-4" /> Deactivate</Button>
                : <Button variant="outline" className="gap-1.5 text-emerald-600" onClick={() => { onStatus(user, 'activate', 'activated'); onClose(); }}><Play className="w-4 h-4" /> Activate</Button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
