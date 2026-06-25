import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Search, UserPlus, Mail, Edit2, Loader2, Building2, Shield, Users } from 'lucide-react';

const PLATFORM_ROLES = [
  { value: 'admin', labelEn: 'Tenant Admin', labelAr: 'مدير المؤسسة' },
  { value: 'hr_admin', labelEn: 'HR Admin', labelAr: 'مدير HR' },
  { value: 'hr_officer', labelEn: 'HR Officer', labelAr: 'موظف HR' },
  { value: 'finance', labelEn: 'Finance', labelAr: 'المالية' },
  { value: 'accountant', labelEn: 'Accountant', labelAr: 'محاسب' },
  { value: 'procurement', labelEn: 'Procurement', labelAr: 'المشتريات' },
  { value: 'admissions', labelEn: 'Admissions', labelAr: 'القبول' },
  { value: 'collections', labelEn: 'Collections', labelAr: 'التحصيل' },
  { value: 'branch_manager', labelEn: 'Branch Manager', labelAr: 'مدير فرع' },
  { value: 'teacher', labelEn: 'Teacher', labelAr: 'معلم' },
  { value: 'auditor', labelEn: 'Auditor', labelAr: 'مدقق' },
];

const ROLE_COLORS = {
  admin: 'bg-red-100 text-red-700',
  creator: 'bg-slate-800 text-white',
  hr_admin: 'bg-purple-100 text-purple-700',
  hr_officer: 'bg-purple-50 text-purple-600',
  finance: 'bg-blue-100 text-blue-700',
  accountant: 'bg-blue-50 text-blue-600',
  branch_manager: 'bg-amber-100 text-amber-700',
  teacher: 'bg-green-100 text-green-700',
  admissions: 'bg-teal-100 text-teal-700',
  collections: 'bg-orange-100 text-orange-700',
};

export default function PlatformUsersTab({ tenants = [] }) {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [editUser, setEditUser] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('hr_officer');
  const [inviteTenant, setInviteTenant] = useState('');
  const [inviting, setInviting] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['platform-all-users'],
    queryFn: () => fetchData(tenantQuery('users').select('*').order()),
  });

  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchTenant = tenantFilter === 'all' || u.tenant_id === tenantFilter || (!u.tenant_id && tenantFilter === 'unassigned');
    return matchSearch && matchTenant;
  });

  const getRoleLabel = (u) => {
    const r = u.user_role || u.role || 'user';
    if (r === 'creator') return isRTL ? 'مشرف المنصة' : 'Platform Creator';
    const found = PLATFORM_ROLES.find(x => x.value === r);
    return found ? (isRTL ? found.labelAr : found.labelEn) : r;
  };

  const getTenantName = (u) => {
    if (!u.tenant_id) return isRTL ? 'غير مُعين' : 'Unassigned';
    const t = tenantMap[u.tenant_id];
    return t ? (isRTL ? t.name_ar : t.name_en) : u.tenant_id.slice(-8);
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await tenantQuery('users').update({
        user_role: editUser.user_role,
        tenant_id: editUser.tenant_id || null,
      });
      toast.success(isRTL ? 'تم تحديث المستخدم' : 'User updated');
      queryClient.invalidateQueries({ queryKey: ['platform-all-users'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-sa'] });
      setEditUser(null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      toast.error(isRTL ? 'البريد الإلكتروني غير صحيح' : 'Invalid email');
      return;
    }
    if (!inviteTenant) {
      toast.error(isRTL ? 'يرجى اختيار مؤسسة' : 'Please select a tenant');
      return;
    }
    setInviting(true);
    try {
      // Invite the user into the platform
      await callApi('/api/auth/invite', { email: inviteEmail.trim(), role: inviteRole === 'admin' ? 'admin' : 'user' });

      // After invite, find the user record and stamp tenant info
      await new Promise(r => setTimeout(r, 1000)); // brief wait for user creation
      const { data: newUsers = [] } = await tenantQuery('users').select('*').match({ email: inviteEmail.trim() });
      if (newUsers.length > 0) {
        const selectedTenant = tenants.find(t => t.id === inviteTenant);
        await tenantQuery('users').update({
          user_role: inviteRole,
          tenant_id: inviteTenant,
          tenant_code: selectedTenant?.tenant_code || '',
        });
      }

      toast.success(isRTL ? `تم إرسال الدعوة إلى ${inviteEmail}` : `Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('hr_officer');
      setInviteTenant('');
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['platform-all-users'] });
    } catch (e) {
      toast.error(e.message || (isRTL ? 'فشل الإرسال' : 'Failed to invite'));
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            className={isRTL ? 'pr-9' : 'pl-9'}
            placeholder={isRTL ? 'بحث بالاسم أو البريد...' : 'Search by name or email...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={tenantFilter} onValueChange={setTenantFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={isRTL ? 'كل المؤسسات' : 'All Tenants'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'كل المستخدمين' : 'All Users'}</SelectItem>
            <SelectItem value="unassigned">{isRTL ? 'غير مُعينين' : 'Unassigned'}</SelectItem>
            {tenants.map(t => (
              <SelectItem key={t.id} value={t.id}>
                {isRTL ? t.name_ar : t.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setInviteOpen(true)} className="gap-2 shrink-0">
          <UserPlus className="w-4 h-4" />
          {isRTL ? 'دعوة مستخدم' : 'Invite User'}
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm text-slate-500">
        <span><strong className="text-slate-900">{users.length}</strong> {isRTL ? 'إجمالي المستخدمين' : 'total users'}</span>
        <span><strong className="text-slate-900">{users.filter(u => !u.tenant_id && u.role !== 'creator').length}</strong> {isRTL ? 'غير مُعينين' : 'unassigned'}</span>
        <span><strong className="text-slate-900">{filtered.length}</strong> {isRTL ? 'نتيجة' : 'shown'}</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'المستخدم' : 'User'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'الدور' : 'Role'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'المؤسسة' : 'Tenant'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'تاريخ الانضمام' : 'Joined'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'إجراء' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {isRTL ? 'لا يوجد مستخدمون' : 'No users found'}
                  </td></tr>
                ) : filtered.map(u => {
                  const role = u.user_role || u.role || 'user';
                  const isCreator = role === 'creator';
                  return (
                    <tr key={u.id} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xs shrink-0">
                            {(u.full_name || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{u.full_name || '—'}</p>
                            <p className="text-xs text-slate-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={`text-xs ${ROLE_COLORS[role] || 'bg-slate-100 text-slate-600'}`}>
                          {isCreator ? <Shield className="w-3 h-3 inline me-1" /> : null}
                          {getRoleLabel(u)}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {u.tenant_id ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-slate-700 text-xs">{getTenantName(u)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            {isCreator ? (isRTL ? 'مشرف المنصة' : 'Platform') : (isRTL ? 'غير مُعين' : 'Unassigned')}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        {u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="p-3">
                        {!isCreator && (
                          <Button size="sm" variant="ghost" onClick={() => setEditUser({ ...u })}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              {isRTL ? 'دعوة مستخدم جديد' : 'Invite New User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{isRTL ? 'البريد الإلكتروني *' : 'Email Address *'}</Label>
              <div className="relative">
                <Mail className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                <Input
                  type="email"
                  className={isRTL ? 'pr-9' : 'pl-9'}
                  placeholder="user@school.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{isRTL ? 'المؤسسة *' : 'Tenant *'}</Label>
              <Select value={inviteTenant} onValueChange={setInviteTenant}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر المؤسسة...' : 'Select tenant...'} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {isRTL ? t.name_ar : t.name_en} <span className="text-xs text-slate-400 ms-1">({t.tenant_code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{isRTL ? 'الدور' : 'Role'}</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORM_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      {isRTL ? r.labelAr : r.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleInvite} disabled={inviting} className="gap-2">
              {inviting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isRTL ? 'إرسال الدعوة' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-600" />
              {isRTL ? 'تعديل بيانات المستخدم' : 'Edit User'}
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold">
                  {(editUser.full_name || editUser.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm">{editUser.full_name || '—'}</p>
                  <p className="text-xs text-slate-500">{editUser.email}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isRTL ? 'المؤسسة' : 'Tenant'}</Label>
                <Select
                  value={editUser.tenant_id || 'none'}
                  onValueChange={val => setEditUser(p => ({ ...p, tenant_id: val === 'none' ? null : val }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isRTL ? 'غير مُعين' : 'Unassigned'}</SelectItem>
                    {tenants.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {isRTL ? t.name_ar : t.name_en} ({t.tenant_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{isRTL ? 'الدور' : 'Role'}</Label>
                <Select
                  value={editUser.user_role || editUser.role || 'user'}
                  onValueChange={val => setEditUser(p => ({ ...p, user_role: val }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>
                        {isRTL ? r.labelAr : r.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}