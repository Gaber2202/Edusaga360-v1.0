import React, { useState } from 'react';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import { Building2, Users, Calendar, DollarSign, Shield, Loader2, UserPlus, Mail, Edit2, Trash2 } from 'lucide-react';
import { PLAN_DEFINITIONS, ALL_MODULES } from '../../hooks/useModuleAccess';
import { logAuditEvent, AuditActions } from '../AuditService';

const TENANT_ROLES = [
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
  hr_admin: 'bg-purple-100 text-purple-700',
  hr_officer: 'bg-purple-50 text-purple-600',
  finance: 'bg-blue-100 text-blue-700',
  accountant: 'bg-blue-50 text-blue-600',
  branch_manager: 'bg-amber-100 text-amber-700',
  teacher: 'bg-green-100 text-green-700',
};

function TenantUsersTab({ tenant, isRTL }) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('hr_officer');
  const [inviting, setInviting] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data: tenantUsers = [], isLoading } = useQuery({
    queryKey: ['tenant-users', tenant.id],
    queryFn: () => fetchData(tenantQuery('users').select('*').match({ tenant_id: tenant.id })),
  });

  const getRoleLabel = (u) => {
    const r = u.user_role || u.role || 'user';
    const found = TENANT_ROLES.find(x => x.value === r);
    return found ? (isRTL ? found.labelAr : found.labelEn) : r;
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      toast.error(isRTL ? 'البريد الإلكتروني غير صحيح' : 'Invalid email');
      return;
    }
    setInviting(true);
    try {
      await callApi('/api/auth/invite', { email: inviteEmail.trim(), role: inviteRole === 'admin' ? 'admin' : 'user' });
      // Give the platform a moment to create the user record, then stamp tenant
      await new Promise(r => setTimeout(r, 1200));
      const found = await tenantQuery('users').select('*').match({ email: inviteEmail.trim() });
      if (found.length > 0) {
        await tenantQuery('users').update({
          user_role: inviteRole,
          tenant_id: tenant.id,
          tenant_code: tenant.tenant_code,
        });
      }
      toast.success(isRTL ? `تم إرسال الدعوة إلى ${inviteEmail}` : `Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('hr_officer');
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenant.id] });
      queryClient.invalidateQueries({ queryKey: ['platform-all-users'] });
      queryClient.invalidateQueries({ queryKey: ['all-users-sa'] });
    } catch (e) {
      toast.error(e.message || (isRTL ? 'فشل الإرسال' : 'Failed'));
    } finally {
      setInviting(false);
    }
  };

  const handleSaveRole = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await tenantQuery('users').update({ user_role: editUser.user_role });
      toast.success(isRTL ? 'تم تحديث الدور' : 'Role updated');
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenant.id] });
      queryClient.invalidateQueries({ queryKey: ['platform-all-users'] });
      setEditUser(null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromTenant = async (u) => {
    if (!confirm(isRTL ? `هل تريد إزالة ${u.full_name || u.email} من هذه المؤسسة؟` : `Remove ${u.full_name || u.email} from this tenant?`)) return;
    try {
      await tenantQuery('users').update({ tenant_id: null, tenant_code: null });
      toast.success(isRTL ? 'تم إزالة المستخدم من المؤسسة' : 'User removed from tenant');
      queryClient.invalidateQueries({ queryKey: ['tenant-users', tenant.id] });
      queryClient.invalidateQueries({ queryKey: ['platform-all-users'] });
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {tenantUsers.length} / {tenant.max_users || '∞'} {isRTL ? 'مستخدم' : 'users'}
        </p>
        <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="w-4 h-4" />
          {isRTL ? 'دعوة مستخدم' : 'Invite User'}
        </Button>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
        {isLoading ? (
          <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" /></div>
        ) : tenantUsers.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">{isRTL ? 'لا يوجد مستخدمون' : 'No users'}</div>
        ) : tenantUsers.map(u => {
          const role = u.user_role || u.role || 'user';
          return (
            <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white hover:bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 shrink-0">
                  {(u.full_name || u.email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || '—'}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={`text-xs ${ROLE_COLORS[role] || 'bg-slate-100 text-slate-600'}`}>
                  {getRoleLabel(u)}
                </Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditUser({ ...u })}>
                  <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRemoveFromTenant(u)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              {isRTL ? 'دعوة مستخدم لـ' : 'Invite User to'} {isRTL ? tenant.name_ar : tenant.name_en}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{isRTL ? 'البريد الإلكتروني *' : 'Email *'}</Label>
              <div className="relative">
                <Mail className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                <Input type="email" className={isRTL ? 'pr-9' : 'pl-9'} placeholder="user@school.com"
                  value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{isRTL ? 'الدور' : 'Role'}</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TENANT_ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>{isRTL ? r.labelAr : r.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleInvite} disabled={inviting} className="gap-2">
              {inviting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isRTL ? 'إرسال' : 'Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تعديل دور المستخدم' : 'Edit User Role'}</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-600">{editUser.full_name || editUser.email}</p>
              <div className="space-y-1.5">
                <Label>{isRTL ? 'الدور' : 'Role'}</Label>
                <Select value={editUser.user_role || editUser.role || 'user'}
                  onValueChange={val => setEditUser(p => ({ ...p, user_role: val }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TENANT_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{isRTL ? r.labelAr : r.labelEn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveRole} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TenantDetailDialog({ tenant, users, open, onClose, onUpdated }) {
  const { isRTL } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [changePlan, setChangePlan] = useState(tenant?.plan_code || 'free_trial');

  if (!tenant) return null;

  const plan = PLAN_DEFINITIONS[tenant.plan_code] || PLAN_DEFINITIONS.free_trial;

  const handleChangePlan = async () => {
    setSaving(true);
    try {
      const newPlan = PLAN_DEFINITIONS[changePlan];
      const patch = {
        plan_code: changePlan,
        max_users: newPlan.maxUsers,
        max_employees: newPlan.maxEmployees,
        max_students: newPlan.maxStudents,
        max_branches: newPlan.maxBranches,
        max_modules: newPlan.maxSelectableModules,
        ai_enabled: newPlan.aiEnabled,
        yamen_ai_monthly_limit: newPlan.aiEnabled ? 100 : 0,
        enabled_modules: newPlan.includedModules,
        monthly_revenue: newPlan.priceMonthly,
        status: changePlan === 'free_trial' ? 'trial' : 'active',
      };
      await tenantQuery('tenants').update(patch);
      await logAuditEvent({
        action: AuditActions.CONFIGURE,
        entityType: 'Tenant',
        entityId: tenant.id,
        oldValues: { plan_code: tenant.plan_code, status: tenant.status },
        newValues: { plan_code: patch.plan_code, status: patch.status },
        notes: `Platform admin changed plan to ${changePlan} for tenant ${tenant.tenant_code || tenant.id}`,
      });
      toast.success(isRTL ? 'تم تغيير الخطة' : 'Plan changed');
      onUpdated?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleExtendTrial = async () => {
    const end = tenant.trial_end_date ? new Date(tenant.trial_end_date) : new Date();
    const patch = {
      trial_end_date: format(addDays(end, 14), 'yyyy-MM-dd'),
      status: 'trial',
    };
    await tenantQuery('tenants').update(patch);
    await logAuditEvent({
      action: AuditActions.CONFIGURE,
      entityType: 'Tenant',
      entityId: tenant.id,
      oldValues: { trial_end_date: tenant.trial_end_date, status: tenant.status },
      newValues: patch,
      notes: `Platform admin extended trial by 14 days for tenant ${tenant.tenant_code || tenant.id}`,
    });
    toast.success(isRTL ? 'تم تمديد الفترة التجريبية 14 يوم' : 'Trial extended by 14 days');
    onUpdated?.();
  };

  const statusColors = {
    trial: 'bg-amber-100 text-amber-700',
    active: 'bg-emerald-100 text-emerald-700',
    suspended: 'bg-red-100 text-red-700',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Building2 className="w-5 h-5 text-blue-600" />
            {isRTL ? tenant.name_ar : tenant.name_en}
            <Badge className={statusColors[tenant.status] || 'bg-slate-100'}>{tenant.status}</Badge>
            <span className="text-sm text-slate-400 font-mono">{tenant.tenant_code}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">
              <Shield className="w-4 h-4 me-1" />
              {isRTL ? 'نظرة عامة' : 'Overview'}
            </TabsTrigger>
            <TabsTrigger value="users" className="flex-1">
              <Users className="w-4 h-4 me-1" />
              {isRTL ? 'المستخدمون' : 'Users'}
            </TabsTrigger>
            <TabsTrigger value="plan" className="flex-1">
              <DollarSign className="w-4 h-4 me-1" />
              {isRTL ? 'الخطة' : 'Plan'}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: isRTL ? 'المستخدمين' : 'Users', value: `${users.length} / ${tenant.max_users || '∞'}`, icon: Users },
                { label: isRTL ? 'الموظفين' : 'Employees', value: `${tenant.current_employees || 0} / ${tenant.max_employees || '∞'}`, icon: Users },
                { label: isRTL ? 'الإيرادات' : 'Revenue', value: `${(tenant.monthly_revenue || 0).toLocaleString()} SAR`, icon: DollarSign },
                { label: isRTL ? 'الخطة' : 'Plan', value: isRTL ? plan.nameAr : plan.nameEn, icon: Shield },
              ].map((s, i) => (
                <Card key={i} className="bg-slate-50">
                  <CardContent className="p-3 flex items-center gap-2">
                    <s.icon className="w-4 h-4 text-slate-400" />
                    <div>
                      <p className="text-xs text-slate-500">{s.label}</p>
                      <p className="text-sm font-semibold">{s.value}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-lg p-4">
              <div><span className="text-slate-500">{isRTL ? 'البريد' : 'Email'}:</span> <span className="font-medium">{tenant.admin_email || '-'}</span></div>
              <div><span className="text-slate-500">{isRTL ? 'الهاتف' : 'Phone'}:</span> <span>{tenant.phone || '-'}</span></div>
              <div><span className="text-slate-500">{isRTL ? 'المدينة' : 'City'}:</span> <span>{tenant.city || '-'}</span></div>
              <div><span className="text-slate-500">{isRTL ? 'تاريخ الإنشاء' : 'Created'}:</span> <span>{tenant.created_date ? format(new Date(tenant.created_date), 'dd/MM/yyyy') : '-'}</span></div>
              {tenant.trial_end_date && (
                <div className="col-span-2">
                  <span className="text-slate-500">{isRTL ? 'انتهاء التجربة' : 'Trial Ends'}:</span>
                  <span className="font-medium ms-2">{format(new Date(tenant.trial_end_date), 'dd/MM/yyyy')}</span>
                  {new Date(tenant.trial_end_date) < new Date() && (
                    <Badge className="bg-red-100 text-red-600 ms-2">{isRTL ? 'منتهي' : 'Expired'}</Badge>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">{isRTL ? 'الوحدات المفعلة' : 'Enabled Modules'}</Label>
              <div className="flex flex-wrap gap-2">
                {(tenant.enabled_modules || []).map(m => {
                  const mod = ALL_MODULES.find(am => am.key === m);
                  return (
                    <Badge key={m} className="bg-blue-50 text-blue-700">
                      {mod ? (isRTL ? mod.nameAr : mod.nameEn) : m}
                    </Badge>
                  );
                })}
                {(!tenant.enabled_modules || tenant.enabled_modules.length === 0) && (
                  <span className="text-sm text-slate-400">{isRTL ? 'جميع الوحدات' : 'All modules'}</span>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="pt-2">
            <TenantUsersTab tenant={tenant} isRTL={isRTL} />
          </TabsContent>

          {/* Plan Tab */}
          <TabsContent value="plan" className="space-y-4 pt-2">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">{isRTL ? 'تغيير الخطة' : 'Change Plan'}</Label>
              <div className="flex gap-3">
                <Select value={changePlan} onValueChange={setChangePlan}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free_trial">{isRTL ? 'تجربة مجانية' : 'Free Trial'}</SelectItem>
                    <SelectItem value="startup">{isRTL ? 'انطلاق' : 'Startup'}</SelectItem>
                    <SelectItem value="enterprise">{isRTL ? 'مؤسسات' : 'Enterprise'}</SelectItem>
                    <SelectItem value="government">{isRTL ? 'حكومي' : 'Government'}</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleChangePlan} disabled={saving || changePlan === tenant.plan_code}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  {isRTL ? 'تغيير' : 'Change'}
                </Button>
              </div>
              <p className="text-xs text-slate-400">
                {isRTL ? 'تغيير الخطة يحدّث حدود الاستخدام والوحدات المتاحة تلقائياً' : 'Changing the plan automatically updates usage limits and available modules'}
              </p>
            </div>

            {tenant.status === 'trial' && (
              <div className="border-t pt-4">
                <Button variant="outline" onClick={handleExtendTrial} className="gap-2">
                  <Calendar className="w-4 h-4" />
                  {isRTL ? 'تمديد التجربة +14 يوم' : 'Extend Trial +14 days'}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isRTL ? 'إغلاق' : 'Close'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}