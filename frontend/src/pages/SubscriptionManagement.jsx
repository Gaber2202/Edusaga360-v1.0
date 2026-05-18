import React, { useState } from 'react';
import { tenantQuery, callApi } from '../api/supabaseClient';
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('hr_officer');
  const [inviting, setInviting] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['subscription-users'],
    queryFn: () => tenantQuery('users').select('*').order(),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }) => tenantQuery('users').update({ user_role: role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-users'] });
      toast.success(isRTL ? 'تم تحديث الدور' : 'Role updated');
      setEditUser(null);
    },
  });

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      toast.error(isRTL ? 'البريد الإلكتروني غير صحيح' : 'Invalid email');
      return;
    }
    setInviting(true);
    try {
      await callApi('/api/auth/invite', { email: inviteEmail.trim(), role: inviteRole === 'admin' ? 'admin' : 'user' });
      // Also set user_role on the user record after invite
      toast.success(isRTL ? `تم إرسال دعوة إلى ${inviteEmail}` : `Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('hr_officer');
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['subscription-users'] });
    } catch (e) {
      toast.error(e.message || (isRTL ? 'فشل الإرسال' : 'Failed to invite'));
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
              {isRTL ? 'إرسال الدعوة' : 'Send Invite'}
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

export default function SubscriptionManagement() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { user: _user, userRole } = useRole();
  const [tab, setTab] = useState('overview');
  
  // Check if user is a creator (platform admin) or tenant admin
  const isCreator = userRole === 'creator';

  if (!tenant) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500">{isRTL ? 'لا توجد معلومات اشتراك' : 'No subscription info available'}</p>
      </div>
    );
  }

  const currentPlan = PLAN_DEFINITIONS[tenant.plan_code] || PLAN_DEFINITIONS.free_trial;
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