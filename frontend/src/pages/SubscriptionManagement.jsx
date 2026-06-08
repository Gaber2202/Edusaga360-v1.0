import React, { useState } from 'react';
import { tenantQuery, fetchData, callApi, supabase } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { useRole } from '../components/RoleContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Crown, Users, Building2, GraduationCap, Bot, CheckCircle,
  AlertTriangle, ArrowUpRight, Calendar, Shield, Lock, Zap,
  BarChart3, Link2, UserPlus, Mail, Edit2, Search
} from 'lucide-react';
import { PLAN_DEFINITIONS, ALL_MODULES } from '../hooks/useModuleAccess';
import AdminRequestsTab from '../components/subscription/AdminRequestsTab';

const TABS = [
  { key: 'overview', labelEn: 'Overview', labelAr: 'نظرة عامة' },
  { key: 'users', labelEn: 'Users', labelAr: 'المستخدمون' },
  { key: 'requests', labelEn: 'Requests', labelAr: 'الطلبات', adminOnly: true },
];

const ROLES = [
  { value: 'admin', labelEn: 'Admin', labelAr: 'مدير' },
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

function UsersTab({ isRTL, tenant }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('hr_officer');
  const [inviting, setInviting] = useState(false);

  const isTrial = tenant?.status === 'trial';
  const maxUsers = tenant?.max_users || 999;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['subscription-users'],
    queryFn: () => fetchData(tenantQuery('users').select('*').order('created_date', { ascending: false })),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }) => tenantQuery('users').update({ user_role: role }).eq('id', userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-users'] });
      toast.success(isRTL ? 'تم تحديث الدور' : 'Role updated');
      setEditUser(null);
    },
  });

  const atLimit = users.length >= maxUsers;

  const handleInvite = async () => {
    if (!inviteName.trim()) {
      toast.error(isRTL ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      toast.error(isRTL ? 'البريد الإلكتروني غير صحيح' : 'Invalid email');
      return;
    }
    setInviting(true);
    try {
      await callApi('/api/tenant-users/request', {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        requested_role: inviteRole,
      });
      toast.success(
        isTrial
          ? (isRTL ? 'تم إرسال طلب إضافة المستخدم للمراجعة' : 'User request submitted for admin review')
          : (isRTL ? `تم إرسال دعوة إلى ${inviteEmail}` : `Invitation sent to ${inviteEmail}`)
      );
      setInviteName('');
      setInviteEmail('');
      setInviteRole('hr_officer');
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['subscription-users'] });
    } catch (e) {
      if (e.body?.code === 'LIMIT_REACHED') {
        toast.error(isRTL ? 'وصلت إلى الحد الأقصى من المستخدمين في الخطة التجريبية' : 'You have reached the maximum users allowed on the trial plan');
      } else if (e.body?.code === 'DUPLICATE') {
        toast.error(isRTL ? 'هناك طلب معلق بالفعل لهذا البريد الإلكتروني' : 'A pending request already exists for this email');
      } else {
        toast.error(e.message || (isRTL ? 'فشل الإرسال' : 'Failed to submit request'));
      }
    } finally {
      setInviting(false);
    }
  };

  const filtered = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getRoleBadge = (u) => {
    const r = u.user_role || u.role || 'user';
    const roleMap = {
      admin: 'bg-red-100 text-red-700',
      hr_admin: 'bg-purple-100 text-purple-700',
      hr_officer: 'bg-purple-50 text-purple-600',
      finance: 'bg-blue-100 text-blue-700',
      accountant: 'bg-blue-50 text-blue-600',
      branch_manager: 'bg-amber-100 text-amber-700',
      teacher: 'bg-green-100 text-green-700',
      creator: 'bg-slate-800 text-white',
    };
    return roleMap[r] || 'bg-slate-100 text-slate-600';
  };

  const getRoleLabel = (u) => {
    const r = u.user_role || u.role || 'user';
    const found = ROLES.find(x => x.value === r);
    if (found) return isRTL ? found.labelAr : found.labelEn;
    return r;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            className={isRTL ? 'pr-9' : 'pl-9'}
            placeholder={isRTL ? 'بحث عن مستخدم...' : 'Search users...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2 shrink-0">
          <UserPlus className="w-4 h-4" />
          {isRTL ? 'دعوة مستخدم' : 'Invite User'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">{isRTL ? 'لا يوجد مستخدمون' : 'No users found'}</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(u => (
                <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm shrink-0">
                      {(u.full_name || u.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate">{u.full_name || '—'}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={`text-xs ${getRoleBadge(u)}`}>{getRoleLabel(u)}</Badge>
                    <p className="text-xs text-slate-400 hidden sm:block">
                      {u.created_date ? format(new Date(u.created_date), 'dd/MM/yyyy') : '—'}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-blue-600"
                      onClick={() => setEditUser(u)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-slate-400 text-end">
        {filtered.length} / {tenant?.max_users || '—'} {isRTL ? 'مستخدم' : 'users'}
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              {isRTL ? 'إضافة مستخدم' : 'Add User'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isTrial && atLimit && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                <div>
                  {isRTL
                    ? `لقد وصلت إلى الحد الأقصى (${maxUsers} مستخدمين) في الخطة التجريبية. سيُعامَل هذا الطلب كاشتراك مدفوع ويحتاج موافقة الإدارة.`
                    : `You've reached the trial limit (${maxUsers} users). Adding more users is a paid subscription request that requires admin approval.`}
                </div>
              </div>
            )}
            {isTrial && !atLimit && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
                <Shield className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
                {isRTL
                  ? `الخطة التجريبية تسمح بـ ${maxUsers} مستخدمين. حاليًا لديك ${users.length}.`
                  : `Trial plan allows ${maxUsers} users. You currently have ${users.length}.`}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{isRTL ? 'الاسم الكامل *' : 'Full Name *'}</Label>
              <Input
                placeholder={isRTL ? 'محمد أحمد' : 'John Smith'}
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
              />
            </div>
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
              <Label>{isRTL ? 'الدور' : 'Role'}</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
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
              {inviting && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isTrial && atLimit
                ? (isRTL ? 'إرسال طلب مدفوع' : 'Submit Paid Request')
                : (isRTL ? 'إرسال الطلب' : 'Submit Request')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-600" />
              {isRTL ? 'تعديل دور المستخدم' : 'Edit User Role'}
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-sm">
                  {(editUser.full_name || editUser.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-sm">{editUser.full_name || '—'}</p>
                  <p className="text-xs text-slate-500">{editUser.email}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{isRTL ? 'الدور الجديد' : 'New Role'}</Label>
                <Select
                  value={editUser.user_role || editUser.role || 'user'}
                  onValueChange={val => setEditUser(p => ({ ...p, user_role: val }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => (
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
            <Button
              onClick={() => updateRoleMutation.mutate({ userId: editUser.id, role: editUser.user_role || editUser.role })}
              disabled={updateRoleMutation.isPending}
            >
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlatformOwnerSubscriptions({ isRTL }) {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['platform-tenants-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    },
  });

  const getPlanBadge = (planCode, status) => {
    if (status === 'trial') return <Badge className="bg-amber-100 text-amber-800">{isRTL ? 'فترة تجريبية' : 'Trial'}</Badge>;
    const plan = PLAN_DEFINITIONS[planCode];
    if (!plan) return <Badge variant="secondary">{planCode || '—'}</Badge>;
    return <Badge className="bg-blue-100 text-blue-800">{isRTL ? plan.nameAr : plan.nameEn}</Badge>;
  };

  const getDaysLeft = (t) => {
    if (t.status !== 'trial' || !t.trial_end_date) return null;
    const days = Math.max(0, Math.ceil((new Date(t.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24)));
    return days;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><p className="text-slate-500">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 text-amber-500" />
        <h1 className="text-2xl font-bold">{isRTL ? 'إدارة الاشتراكات' : 'Subscription Management'}</h1>
      </div>
      <p className="text-slate-500">{isRTL ? 'نظرة عامة على اشتراكات جميع المدارس المسجلة' : 'Overview of subscriptions for all registered schools'}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{tenants.length}</p>
                <p className="text-sm text-slate-500">{isRTL ? 'إجمالي المدارس' : 'Total Schools'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{tenants.filter(t => t.status === 'active').length}</p>
                <p className="text-sm text-slate-500">{isRTL ? 'نشط' : 'Active'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{tenants.filter(t => t.status === 'trial').length}</p>
                <p className="text-sm text-slate-500">{isRTL ? 'فترة تجريبية' : 'Trial'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'المدارس والاشتراكات' : 'Schools & Subscriptions'}</CardTitle>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{isRTL ? 'لا توجد مدارس مسجلة بعد' : 'No schools registered yet'}</p>
          ) : (
            <div className="space-y-3">
              {tenants.map(t => {
                const daysLeft = getDaysLeft(t);
                return (
                  <div key={t.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="font-medium">{isRTL ? (t.name_ar || t.name) : (t.name || t.name_ar)}</p>
                        <p className="text-sm text-slate-500">{t.city || '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getPlanBadge(t.plan_code, t.status)}
                      {daysLeft !== null && (
                        <span className="text-sm text-amber-600">
                          {daysLeft} {isRTL ? 'يوم متبقي' : 'days left'}
                        </span>
                      )}
                      <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>
                        {t.status === 'active' ? (isRTL ? 'نشط' : 'Active') :
                         t.status === 'trial' ? (isRTL ? 'تجريبي' : 'Trial') :
                         t.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SubscriptionManagement() {
  const { isRTL } = useLanguage();
  const { tenant, tenantLoading } = useTenant();
  const { user: _user, userRole } = useRole();
  const [tab, setTab] = useState('overview');
  
  const isCreator = userRole === 'creator';

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full" />
      </div>
    );
  }

  if (!tenant && isCreator) {
    return <PlatformOwnerSubscriptions isRTL={isRTL} />;
  }

  if (!tenant) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500">{isRTL ? 'لا توجد معلومات اشتراك' : 'No subscription info available'}</p>
      </div>
    );
  }

  const planKey = tenant.plan_code || (tenant.plan === 'trial' ? 'free_trial' : tenant.plan);
  const currentPlan = PLAN_DEFINITIONS[planKey] || PLAN_DEFINITIONS.free_trial;
  const isTrialExpired = tenant.status === 'trial' && tenant.trial_end_date && new Date(tenant.trial_end_date) < new Date();
  const daysLeft = tenant.trial_end_date
    ? Math.max(0, Math.ceil((new Date(tenant.trial_end_date) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  const usageBars = [
    { label: isRTL ? 'المستخدمين' : 'Users', current: tenant.current_users || 0, max: tenant.max_users || 999, icon: Users },
    { label: isRTL ? 'الموظفين' : 'Employees', current: tenant.current_employees || 0, max: tenant.max_employees || 999, icon: Users },
    { label: isRTL ? 'الطلاب' : 'Students', current: tenant.current_students || 0, max: tenant.max_students || 999, icon: GraduationCap },
    { label: isRTL ? 'الفروع' : 'Branches', current: tenant.current_branches || 0, max: tenant.max_branches || 99, icon: Building2 },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" />
          {isRTL ? 'إدارة الاشتراك' : 'Subscription Management'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isRTL ? 'عرض تفاصيل اشتراكك وإدارة المستخدمين' : 'View your subscription details and manage users'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {TABS.filter(t => !t.adminOnly || isCreator).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {isRTL ? t.labelAr : t.labelEn}
          </button>
        ))}
      </div>

      {/* Users Tab */}
      {tab === 'users' && <UsersTab isRTL={isRTL} tenant={tenant} />}

      {/* Requests Tab (Admin Only) */}
      {tab === 'requests' && isCreator && <AdminRequestsTab isRTL={isRTL} />}

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Trial Warning */}
          {tenant.status === 'trial' && (
            <Card className={isTrialExpired ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}>
              <CardContent className="pt-4 flex items-center gap-3">
                {isTrialExpired ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <Calendar className="w-5 h-5 text-amber-600" />}
                <div className="flex-1">
                  <p className={`font-semibold ${isTrialExpired ? 'text-red-800' : 'text-amber-800'}`}>
                    {isTrialExpired
                      ? (isRTL ? 'انتهت الفترة التجريبية' : 'Trial Period Expired')
                      : (isRTL ? `الفترة التجريبية — ${daysLeft} يوم متبقي` : `Trial Period — ${daysLeft} days remaining`)}
                  </p>
                  <p className={`text-sm ${isTrialExpired ? 'text-red-600' : 'text-amber-600'}`}>
                    {isTrialExpired
                      ? (isRTL ? 'يرجى ترقية الخطة للاستمرار' : 'Please upgrade to continue')
                      : (isRTL ? `ينتهي في: ${format(new Date(tenant.trial_end_date), 'dd/MM/yyyy')}` : `Ends: ${format(new Date(tenant.trial_end_date), 'dd/MM/yyyy')}`)}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                {isRTL ? 'الخطة الحالية' : 'Current Plan'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900">{isRTL ? currentPlan.nameAr : currentPlan.nameEn}</h3>
                  <p className="text-slate-500 text-sm">
                    {isRTL ? 'تواصل مع فريق المبيعات للتسعير' : 'Contact sales for pricing'}
                  </p>
                </div>
                <Badge className={
                  tenant.plan_code === 'enterprise' ? 'bg-purple-100 text-purple-700' :
                  tenant.plan_code === 'government' ? 'bg-green-100 text-green-700' :
                  tenant.plan_code === 'startup' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-600'
                }>
                  {tenant.plan_code === 'enterprise' ? (isRTL ? 'مؤسسات' : 'Enterprise') :
                   tenant.plan_code === 'government' ? (isRTL ? 'حكومي' : 'Government') :
                   tenant.plan_code === 'startup' ? (isRTL ? 'انطلاق' : 'Startup') :
                   isRTL ? 'تجربة مجانية' : 'Free Trial'}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3">
                <Badge variant="outline" className="gap-1">
                  <Bot className="w-3 h-3" />
                  {tenant.ai_enabled ? (isRTL ? 'AI مفعل' : 'AI Enabled') : (isRTL ? 'AI غير مفعل' : 'AI Disabled')}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Building2 className="w-3 h-3" />
                  {currentPlan.multiBranch ? (isRTL ? 'فروع متعددة' : 'Multi-Branch') : (isRTL ? 'فرع واحد' : 'Single Branch')}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'استخدام الحدود' : 'Usage Limits'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {usageBars.map((bar, i) => {
                const pct = bar.max > 0 ? Math.min(100, (bar.current / bar.max) * 100) : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <bar.icon className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">{bar.label}</span>
                      </div>
                      <span className="text-slate-500">{bar.current} / {bar.max}</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Enabled Modules */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'الوحدات المتاحة' : 'Available Modules'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {ALL_MODULES.map(mod => {
                  const isEnabled = (tenant.enabled_modules || []).includes(mod.key) || (tenant.enabled_modules || []).length === 0;
                  return (
                    <div
                      key={mod.key}
                      className={`flex items-center gap-2 p-3 rounded-lg border ${isEnabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-50'}`}
                    >
                      <CheckCircle className={`w-4 h-4 ${isEnabled ? 'text-emerald-600' : 'text-slate-300'}`} />
                      <span className={`text-sm font-medium ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                        {isRTL ? mod.nameAr : mod.nameEn}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Plan Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-slate-500" />
                {isRTL ? 'ميزات الخطة' : 'Plan Features'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: isRTL ? 'فروع متعددة' : 'Multi-Branch', enabled: currentPlan.multiBranch, icon: Building2 },
                  { label: isRTL ? 'تقارير متقدمة' : 'Advanced Reports', enabled: currentPlan.advancedReporting, icon: BarChart3 },
                  { label: isRTL ? 'التكاملات' : 'Integrations', enabled: currentPlan.integrationsEnabled, icon: Link2 },
                  { label: isRTL ? 'الذكاء الاصطناعي' : 'AI Features', enabled: currentPlan.aiEnabled, icon: Bot },
                ].map((f, i) => (
                  <div key={i} className={`flex items-center gap-2 p-3 rounded-lg border ${f.enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                    <f.icon className={`w-4 h-4 ${f.enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className={`text-sm font-medium ${f.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{f.label}</span>
                    {f.enabled
                      ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 ms-auto" />
                      : <Lock className="w-3.5 h-3.5 text-slate-300 ms-auto" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upgrade */}
          {tenant.plan_code !== 'enterprise' && tenant.plan_code !== 'government' && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6 space-y-4">
                <div className="text-center space-y-2">
                  <ArrowUpRight className="w-8 h-8 text-blue-600 mx-auto" />
                  <h3 className="text-lg font-bold text-blue-900">
                    {isRTL ? 'قم بترقية خطتك' : 'Upgrade Your Plan'}
                  </h3>
                  <p className="text-sm text-blue-700">
                    {isRTL ? 'احصل على المزيد من المزايا والوحدات' : 'Get more features and modules'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(PLAN_DEFINITIONS).filter(([k]) => k !== 'government' && k !== tenant.plan_code).map(([code, plan]) => (
                    <div key={code} className={`bg-white rounded-xl border-2 p-4 space-y-3 ${code === 'enterprise' ? 'border-purple-300' : 'border-slate-200'}`}>
                      <h4 className="font-bold text-slate-900">{isRTL ? plan.nameAr : plan.nameEn}</h4>

                      <ul className="text-xs space-y-1 text-slate-600">
                        <li>• {isRTL ? `${plan.maxUsers} مستخدم` : `${plan.maxUsers} users`}</li>
                        <li>• {isRTL ? `${plan.maxEmployees} موظف` : `${plan.maxEmployees} employees`}</li>
                        <li>• {isRTL ? `${plan.maxBranches} فرع` : `${plan.maxBranches} branches`}</li>
                        <li>• {plan.aiEnabled ? (isRTL ? '✓ ذكاء اصطناعي' : '✓ AI Enabled') : (isRTL ? '✗ بدون AI' : '✗ No AI')}</li>
                      </ul>
                      <Button
                        className={`w-full ${code === 'enterprise' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
                        onClick={() => toast.info(isRTL ? 'تم إرسال طلب الترقية للمراجعة' : 'Upgrade request submitted for review')}
                      >
                        <Zap className="w-4 h-4 me-1" />
                        {isRTL ? 'طلب ترقية' : 'Request Upgrade'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}