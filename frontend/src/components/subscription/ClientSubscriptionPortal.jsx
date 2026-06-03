import React, { useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { submitClientTenantRequest } from '../../api/tenantRequest';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import {
  Crown, Users, Check, AlertCircle, Zap, CheckCircle, Lock, ArrowUpRight, ArrowDownRight, Loader2
} from 'lucide-react';
import { PLAN_DEFINITIONS } from '../../hooks/useModuleAccess';

export default function ClientSubscriptionPortal() {
  const { isRTL } = useLanguage();
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [addUsersDialogOpen, setAddUsersDialogOpen] = useState(false);
  const [additionalUsers, setAdditionalUsers] = useState(1);
  const [requestReason, setRequestReason] = useState('');

  // Fetch upgrade requests
  const { data: upgradeRequests = [] } = useQuery({
    queryKey: ['upgrade-requests', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await tenantQuery('tenant_requests').select('*').match({
        tenant_id: tenant.id,
        request_type: 'plan_upgrade'
      });
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  // Fetch user requests
  const { data: userRequests = [] } = useQuery({
    queryKey: ['user-requests', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await tenantQuery('tenant_requests').select('*').match({
        tenant_id: tenant.id,
        request_type: 'additional_users'
      });
      return data || [];
    },
    enabled: !!tenant?.id,
  });

  const PLAN_ORDER = ['free_trial', 'startup', 'enterprise'];

  // Upgrade or downgrade plan mutation
  const upgradeMutation = useMutation({
    mutationFn: async (planCode) => {
      const currentTier = PLAN_ORDER.indexOf(tenant?.plan_code);
      const requestedTier = PLAN_ORDER.indexOf(planCode);
      const request_type = requestedTier >= currentTier ? 'plan_upgrade' : 'plan_downgrade';
      return await submitClientTenantRequest({ request_type, requested_plan: planCode });
    },
    onSuccess: (_, planCode) => {
      queryClient.invalidateQueries({ queryKey: ['upgrade-requests'] });
      setUpgradeDialogOpen(false);
      setSelectedPlan(null);
      const currentTier = PLAN_ORDER.indexOf(tenant?.plan_code);
      const requestedTier = PLAN_ORDER.indexOf(planCode);
      const isDowngrade = requestedTier < currentTier;
      toast.success(isRTL
        ? (isDowngrade ? 'تم إرسال طلب التخفيض' : 'تم إرسال طلب الترقية')
        : (isDowngrade ? 'Downgrade request submitted' : 'Upgrade request submitted')
      );
    },
    onError: () => {
      toast.error(isRTL ? 'فشل الطلب' : 'Request failed');
    }
  });

  // Request additional users mutation. Auto-approval and seat-bumping are
  // decided server-side; the response tells us which path the request took.
  const requestUsersMutation = useMutation({
    mutationFn: async () => {
      return await submitClientTenantRequest({
        request_type: 'additional_users',
        additional_users: additionalUsers,
        reason: requestReason,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['user-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tenant'] });

      if (result?.request?.auto_approved) {
        toast.success(isRTL ? 'تمت الموافقة - تمت إضافة المستخدمين' : 'Approved - Users added');
      } else {
        toast.success(isRTL ? 'تم إرسال الطلب للموافقة' : 'Request sent for approval');
      }

      setAddUsersDialogOpen(false);
      setAdditionalUsers(1);
      setRequestReason('');
    },
    onError: () => {
      toast.error(isRTL ? 'فشل الطلب' : 'Request failed');
    }
  });

  const pendingUpgrade = upgradeRequests.find(r => r.status === 'pending');
  const pendingUserRequest = userRequests.find(r => r.status === 'pending');

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-900 rounded-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500">{isRTL ? 'لا توجد معلومات اشتراك' : 'No subscription info'}</p>
      </div>
    );
  }

  const currentPlan = PLAN_DEFINITIONS[tenant.plan_code] || PLAN_DEFINITIONS.free_trial;
  const availableUsers = (tenant.max_users || 0) - (tenant.current_users || 0);

  const currentTier = currentPlan.tier ?? 0;
  const availableChangePlans = Object.entries(PLAN_DEFINITIONS).filter(
    ([code]) => code !== 'government' && code !== 'free_trial' && code !== tenant.plan_code
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" />
          {isRTL ? 'خطتك الحالية' : 'Your Subscription'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isRTL ? 'عرض وإدارة خطتك وطلبات المستخدمين' : 'View and manage your plan and user requests'}
        </p>
      </div>

      {/* Current Plan Card */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-slate-600">{isRTL ? 'الخطة الحالية' : 'Current Plan'}</p>
              <h2 className="text-3xl font-bold text-slate-900 mt-2">
                {isRTL ? currentPlan.nameAr : currentPlan.nameEn}
              </h2>
              <Badge className="mt-3">
                {tenant.plan_code === 'enterprise' ? (isRTL ? 'مؤسسات' : 'Enterprise') :
                 tenant.plan_code === 'professional' ? (isRTL ? 'احترافية' : 'Professional') :
                 tenant.plan_code === 'starter' ? (isRTL ? 'انطلاق' : 'Starter') :
                 isRTL ? 'تجربة — باقة المؤسسات' : 'Trial — Enterprise Package'}
              </Badge>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-600 mb-1">{isRTL ? 'المستخدمين' : 'Users'}</p>
                <p className="text-2xl font-bold text-slate-900">
                  {tenant.current_users || 0}/{tenant.max_users || '∞'}
                </p>
                <Progress value={(tenant.current_users || 0) / (tenant.max_users || 1) * 100} className="mt-2" />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-600 mb-1">{isRTL ? 'الموظفين' : 'Employees'}</p>
                <p className="text-2xl font-bold text-slate-900">
                  {tenant.current_employees || 0}/{tenant.max_employees || '∞'}
                </p>
                <Progress value={(tenant.current_employees || 0) / (tenant.max_employees || 1) * 100} className="mt-2" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Request Additional Users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              {isRTL ? 'طلب مستخدمين إضافيين' : 'Request Additional Users'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              {isRTL 
                ? `لديك ${availableUsers} مقعد متاح في خطتك الحالية`
                : `You have ${availableUsers} available seats in your current plan`}
            </p>
            {pendingUserRequest && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-amber-700">
                  {isRTL ? 'لديك طلب قيد الانتظار' : 'You have a pending request'}
                </span>
              </div>
            )}
            <Button
              onClick={() => setAddUsersDialogOpen(true)}
              disabled={pendingUserRequest}
              className="w-full"
            >
              {isRTL ? 'طلب مستخدمين' : 'Request Users'}
            </Button>
          </CardContent>
        </Card>

        {/* Change Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              {isRTL ? 'تغيير الخطة' : 'Change Plan'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              {isRTL ? 'ترقية أو تخفيض خطتك — تتم الموافقة من قبل المسؤول' : 'Upgrade or downgrade — requires admin approval'}
            </p>
            {pendingUpgrade && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-amber-700">
                  {isRTL ? 'لديك طلب تغيير خطة قيد الانتظار' : 'You have a pending plan change request'}
                </span>
              </div>
            )}
            <Button
              onClick={() => setUpgradeDialogOpen(true)}
              disabled={!!pendingUpgrade}
              variant={pendingUpgrade ? 'outline' : 'default'}
              className="w-full"
            >
              <ArrowUpRight className="w-4 h-4 me-1" />
              {isRTL ? 'استكشاف الخطط' : 'Explore Plans'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Plan Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isRTL ? 'مقارنة الخطط' : 'Plan Comparison'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className={`text-left py-3 px-3 font-semibold ${isRTL ? 'text-right' : ''}`}>
                    {isRTL ? 'الميزة' : 'Feature'}
                  </th>
                  {Object.entries(PLAN_DEFINITIONS).filter(([c]) => c !== 'government').map(([code, plan]) => (
                    <th key={code} className={`text-center py-3 px-3 font-semibold ${tenant.plan_code === code ? 'bg-blue-50' : ''}`}>
                      {isRTL ? plan.nameAr : plan.nameEn}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className={`py-3 px-3 text-slate-600 ${isRTL ? 'text-right' : ''}`}>
                    {isRTL ? 'المستخدمين' : 'Users'}
                  </td>
                  {Object.entries(PLAN_DEFINITIONS).filter(([c]) => c !== 'government').map(([code, plan]) => (
                    <td key={code} className={`text-center py-3 px-3 ${tenant.plan_code === code ? 'bg-blue-50' : ''}`}>
                      {plan.maxUsers}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className={`py-3 px-3 text-slate-600 ${isRTL ? 'text-right' : ''}`}>
                    {isRTL ? 'الموظفين' : 'Employees'}
                  </td>
                  {Object.entries(PLAN_DEFINITIONS).filter(([c]) => c !== 'government').map(([code, plan]) => (
                    <td key={code} className={`text-center py-3 px-3 ${tenant.plan_code === code ? 'bg-blue-50' : ''}`}>
                      {plan.maxEmployees}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <td className={`py-3 px-3 text-slate-600 ${isRTL ? 'text-right' : ''}`}>
                    {isRTL ? 'الفروع' : 'Branches'}
                  </td>
                  {Object.entries(PLAN_DEFINITIONS).filter(([c]) => c !== 'government').map(([code, plan]) => (
                    <td key={code} className={`text-center py-3 px-3 ${tenant.plan_code === code ? 'bg-blue-50' : ''}`}>
                      {plan.maxBranches}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className={`py-3 px-3 text-slate-600 ${isRTL ? 'text-right' : ''}`}>
                    {isRTL ? 'الذكاء الاصطناعي' : 'AI'}
                  </td>
                  {Object.entries(PLAN_DEFINITIONS).filter(([c]) => c !== 'government').map(([code, plan]) => (
                    <td key={code} className={`text-center py-3 px-3 ${tenant.plan_code === code ? 'bg-blue-50' : ''}`}>
                      {plan.aiEnabled ? (
                        <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                      ) : (
                        <Lock className="w-5 h-5 text-slate-300 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Subscription History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isRTL ? 'سجل الطلبات' : 'Request History'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {[...(upgradeRequests || []), ...(userRequests || [])].length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">{isRTL ? 'لا يوجد سجل طلبات بعد' : 'No request history yet'}</p>
              <p className="text-xs text-slate-400 mt-1">
                {isRTL ? 'ستظهر هنا طلبات الترقية وإضافة المستخدمين' : 'Upgrade and user requests will appear here'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...(upgradeRequests || []), ...(userRequests || [])].map(req => (
                <div key={req.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {req.request_type === 'plan_upgrade'
                        ? (isRTL ? 'طلب ترقية الخطة' : 'Plan Upgrade Request')
                        : (isRTL ? 'طلب مستخدمين إضافيين' : 'Additional Users Request')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {req.created_date ? new Date(req.created_date).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <Badge variant={req.status === 'approved' ? 'default' : req.status === 'pending' ? 'outline' : 'secondary'}>
                    {req.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Note about billing */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-4">
          <p className="text-sm text-amber-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {isRTL
              ? 'تتم معالجة تغييرات الخطة خلال 24 ساعة. للاستفسارات حول الفواتير تواصل مع info@edusaga360.com'
              : 'Plan changes are processed within 24 hours. For billing inquiries contact info@edusaga360.com'}
          </p>
        </CardContent>
      </Card>

      {/* Upgrade Plan Dialog */}
      <Dialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              {isRTL ? 'اختر خطة جديدة' : 'Choose a Plan'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {availableChangePlans.map(([code, plan]) => {
              const planTier = plan.tier ?? 0;
              const isUpgrade = planTier > currentTier;
              const isDowngrade = planTier < currentTier;
              return (
                <Card
                  key={code}
                  className={`cursor-pointer border-2 transition-all ${
                    selectedPlan === code ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:border-purple-300'
                  }`}
                  onClick={() => setSelectedPlan(code)}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-bold text-slate-900">
                        {isRTL ? plan.nameAr : plan.nameEn}
                      </h3>
                      {isUpgrade && (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <ArrowUpRight className="w-3 h-3 me-1" />
                          {isRTL ? 'ترقية' : 'Upgrade'}
                        </Badge>
                      )}
                      {isDowngrade && (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          <ArrowDownRight className="w-3 h-3 me-1" />
                          {isRTL ? 'تخفيض' : 'Downgrade'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 mb-3">
                      {plan.priceMonthly > 0
                        ? `${plan.priceMonthly.toLocaleString()} ${isRTL ? 'ر.س/شهر' : 'SAR/mo'}`
                        : (isRTL ? 'مجاناً' : 'Free')}
                    </p>
                    <ul className="space-y-2 text-sm text-slate-600">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        {isRTL ? `${plan.maxUsers} مستخدم` : `${plan.maxUsers} users`}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        {isRTL ? `${plan.maxEmployees} موظف` : `${plan.maxEmployees} employees`}
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-600" />
                        {isRTL ? `${plan.maxBranches} فرع` : `${plan.maxBranches} branches`}
                      </li>
                      {plan.aiEnabled ? (
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-600" />
                          {isRTL ? 'ذكاء اصطناعي' : 'AI Features'}
                        </li>
                      ) : (
                        <li className="flex items-center gap-2 text-slate-400">
                          <Lock className="w-4 h-4" />
                          {isRTL ? 'بدون ذكاء اصطناعي' : 'No AI'}
                        </li>
                      )}
                    </ul>
                    {isDowngrade && (
                      <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded p-2">
                        {isRTL ? 'التخفيض يتطلب موافقة المسؤول وقد يقلل الحدود المتاحة' : 'Downgrade requires admin approval and may reduce limits'}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpgradeDialogOpen(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={() => upgradeMutation.mutate(selectedPlan)}
              disabled={!selectedPlan || upgradeMutation.isPending}
            >
              {upgradeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {selectedPlan && (PLAN_DEFINITIONS[selectedPlan]?.tier ?? 0) < currentTier
                ? (isRTL ? 'طلب التخفيض' : 'Request Downgrade')
                : (isRTL ? 'طلب الترقية' : 'Request Upgrade')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Users Dialog */}
      <Dialog open={addUsersDialogOpen} onOpenChange={setAddUsersDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              {isRTL ? 'طلب مستخدمين إضافيين' : 'Request Additional Users'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              {isRTL 
                ? `المقاعد المتاحة: ${availableUsers} | ستتم الموافقة تلقائياً على ما يصل إلى ${availableUsers} مستخدم`
                : `Available seats: ${availableUsers} | Auto-approved up to ${availableUsers} users`}
            </div>

            <div className="space-y-1.5">
              <Label>{isRTL ? 'عدد المستخدمين الإضافيين *' : 'Number of Users *'}</Label>
              <Input
                type="number"
                min="1"
                value={additionalUsers}
                onChange={e => setAdditionalUsers(parseInt(e.target.value) || 1)}
              />
              {additionalUsers > availableUsers && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  {isRTL ? 'سيتطلب موافقة يدوية من الإدارة' : 'Will require manual approval'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{isRTL ? 'سبب الطلب' : 'Reason for Request'}</Label>
              <Textarea
                placeholder={isRTL ? 'اشرح لماذا تحتاج مستخدمين إضافيين...' : 'Explain why you need additional users...'}
                value={requestReason}
                onChange={e => setRequestReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUsersDialogOpen(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={() => requestUsersMutation.mutate()}
              disabled={requestUsersMutation.isPending}
            >
              {requestUsersMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إرسال الطلب' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}