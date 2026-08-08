import React, { useState } from 'react';
import { tenantQuery, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { formatCurrency } from '../../lib/localization';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import {
  Crown, Users, Check, AlertCircle, Zap, CheckCircle, Lock, ArrowUpRight, ArrowDownRight, Loader2,
  CreditCard, Building2, Upload, Copy, FileText
} from 'lucide-react';
import { PLAN_DEFINITIONS } from '../../hooks/useModuleAccess';
import AttachmentUploader from '../ui/AttachmentUploader';

const VAT_RATE = 0.15;
const PER_SEAT_PRICE = 500;


export default function ClientSubscriptionPortal() {
  const { isRTL } = useLanguage();
  const { tenant, loading: tenantLoading } = useTenant();
  const queryClient = useQueryClient();
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [addUsersDialogOpen, setAddUsersDialogOpen] = useState(false);
  const [additionalUsers, setAdditionalUsers] = useState(1);
  const [requestReason, setRequestReason] = useState('');
  // Payment flow state
  const [paymentStep, setPaymentStep] = useState(null); // null | 'choose_method' | 'wire_details' | 'proof_uploaded'
  const [paymentMethod, setPaymentMethod] = useState(null); // 'online' | 'wire_transfer'
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [transferRef, setTransferRef] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [proofAttachments, setProofAttachments] = useState([]);
  const [orderContext, setOrderContext] = useState(null); // { type, plan_code, seats, total }

  // Fetch subscription orders
  const { data: subscriptionOrders = [] } = useQuery({
    queryKey: ['subscription-orders', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const data = await callApi('/api/subscription/orders', {}, { method: 'GET' });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!tenant?.id,
  });

  // Fetch bank details
  const { data: bankDetails } = useQuery({
    queryKey: ['bank-details'],
    queryFn: () => callApi('/api/subscription/bank-details', {}, { method: 'GET' }),
  });

  // Fetch upgrade requests (legacy)
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

  // Fetch user requests (legacy)
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

  const PLAN_ORDER = ['free_trial', 'starter', 'growth', 'enterprise'];

  // Create subscription order + proceed to payment
  const createOrderMutation = useMutation({
    mutationFn: async ({ orderType, planCode, seats, method }) => {
      const payload = {
        order_type: orderType,
        plan_code: planCode,
        additional_seats: seats,
        payment_method: method,
      };
      return await callApi('/api/subscription/orders', payload);
    },
    onSuccess: (result, vars) => {
      const orderId = result?.order?.id;
      setCurrentOrderId(orderId);
      queryClient.invalidateQueries({ queryKey: ['subscription-orders'] });

      if (vars.method === 'online') {
        // Generate payment link
        generatePaymentLink(orderId);
      } else {
        setPaymentStep('wire_details');
      }
    },
    onError: () => {
      toast.error(isRTL ? 'فشل إنشاء الطلب' : 'Failed to create order');
    },
  });

  // Generate Moyasar payment link
  const generatePaymentLink = async (orderId) => {
    try {
      const result = await callApi(`/api/subscription/orders/${orderId}/payment-link`, {
        callback_url: `${window.location.origin}/subscription?order_id=${orderId}&payment=complete`,
      });
      if (result?.payment_url) {
        window.open(result.payment_url, '_blank');
        toast.success(isRTL ? 'تم فتح رابط الدفع' : 'Payment link opened');
        resetPaymentFlow();
      } else {
        toast.error(isRTL ? 'فشل إنشاء رابط الدفع' : 'Failed to generate payment link');
      }
    } catch {
      toast.error(isRTL ? 'بوابة الدفع غير متاحة حالياً' : 'Payment gateway not available');
    }
  };

  // Upload transfer proof
  const uploadProofMutation = useMutation({
    mutationFn: async () => {
      if (!proofAttachments.length || !currentOrderId) throw new Error('Missing proof');
      return await callApi(`/api/subscription/orders/${currentOrderId}/upload-proof`, {
        proof_url: proofAttachments[0]?.url || proofAttachments[0]?.path,
        proof_file_name: proofAttachments[0]?.name,
        transfer_reference: transferRef || undefined,
        transfer_date: transferDate || undefined,
      });
    },
    onSuccess: () => {
      toast.success(isRTL ? 'تم رفع إيصال التحويل — سيتم المراجعة خلال 24 ساعة' : 'Transfer proof uploaded — will be reviewed within 24 hours');
      queryClient.invalidateQueries({ queryKey: ['subscription-orders'] });
      resetPaymentFlow();
    },
    onError: () => {
      toast.error(isRTL ? 'فشل رفع الإيصال' : 'Failed to upload proof');
    },
  });

  // Legacy upgrade mutation (for plan downgrade only)
  const upgradeMutation = useMutation({
    mutationFn: async (planCode) => {
      const currentTier = PLAN_ORDER.indexOf(tenant?.plan_code);
      const requestedTier = PLAN_ORDER.indexOf(planCode);
      if (requestedTier < currentTier) {
        // Downgrade — legacy request
        const { submitClientTenantRequest } = await import('../../api/tenantRequest');
        return await submitClientTenantRequest({ request_type: 'plan_downgrade', requested_plan: planCode });
      }
      // For upgrades, use the new payment flow
      return null;
    },
    onSuccess: (_, planCode) => {
      queryClient.invalidateQueries({ queryKey: ['upgrade-requests'] });
      setUpgradeDialogOpen(false);
      setSelectedPlan(null);
      toast.success(isRTL ? 'تم إرسال طلب التخفيض' : 'Downgrade request submitted');
    },
    onError: () => {
      toast.error(isRTL ? 'فشل الطلب' : 'Request failed');
    }
  });

  function resetPaymentFlow() {
    setPaymentStep(null);
    setPaymentMethod(null);
    setCurrentOrderId(null);
    setTransferRef('');
    setTransferDate('');
    setProofAttachments([]);
    setOrderContext(null);
    setUpgradeDialogOpen(false);
    setAddUsersDialogOpen(false);
    setSelectedPlan(null);
  }

  function startPaymentFlow(orderType, planCode, seats) {
    let subtotal = 0;
    if (orderType === 'plan_upgrade' && planCode && PLAN_DEFINITIONS[planCode]) {
      subtotal = PLAN_DEFINITIONS[planCode].priceYearly;
    } else if (orderType === 'add_seats' && seats) {
      subtotal = seats * PER_SEAT_PRICE;
    }
    const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
    setOrderContext({ type: orderType, plan_code: planCode, seats, subtotal, vat, total: subtotal + vat });
    setPaymentStep('choose_method');
  }

  function confirmPaymentMethod() {
    if (!paymentMethod || !orderContext) return;
    createOrderMutation.mutate({
      orderType: orderContext.type,
      planCode: orderContext.plan_code,
      seats: orderContext.seats,
      method: paymentMethod,
    });
  }

  const pendingUpgrade = upgradeRequests.find(r => r.status === 'pending')
    || subscriptionOrders.find(o => (o.order_type === 'plan_upgrade') && ['pending_payment', 'awaiting_verification'].includes(o.status));
  const pendingUserRequest = userRequests.find(r => r.status === 'pending')
    || subscriptionOrders.find(o => (o.order_type === 'add_seats') && ['pending_payment', 'awaiting_verification'].includes(o.status));

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-border border-t-najdi-900 rounded-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">{isRTL ? 'لا توجد معلومات اشتراك' : 'No subscription info'}</p>
      </div>
    );
  }

  const currentPlan = PLAN_DEFINITIONS[tenant.plan_code] || PLAN_DEFINITIONS.free_trial;
  const availableUsers = (tenant.max_users || 0) - (tenant.current_users || 0);

  const currentTier = currentPlan.tier ?? 0;
  // Only show the 3 published tiers; exclude legacy/internal codes
  const VISIBLE_PLAN_CODES = ['starter', 'growth', 'enterprise'];
  const availableChangePlans = Object.entries(PLAN_DEFINITIONS).filter(
    ([code]) => VISIBLE_PLAN_CODES.includes(code) && code !== tenant.plan_code
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <Crown className="w-6 h-6 text-amber-500" />
          {isRTL ? 'خطتك الحالية' : 'Your Subscription'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isRTL ? 'عرض وإدارة خطتك وطلبات المستخدمين' : 'View and manage your plan and user requests'}
        </p>
      </div>

      {/* Current Plan Card */}
      <Card className="border-najdi-100 bg-gradient-to-br from-najdi-50 to-blue-100">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">{isRTL ? 'الخطة الحالية' : 'Current Plan'}</p>
              <h2 className="text-3xl font-bold text-ink mt-2">
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
                <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'المستخدمين' : 'Users'}</p>
                <p className="text-2xl font-bold text-ink">
                  {tenant.current_users || 0}/{tenant.max_users || '∞'}
                </p>
                <Progress value={(tenant.current_users || 0) / (tenant.max_users || 1) * 100} className="mt-2" />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'الموظفين' : 'Employees'}</p>
                <p className="text-2xl font-bold text-ink">
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
              <Users className="w-5 h-5 text-najdi-700" />
              {isRTL ? 'إضافة مقاعد' : 'Add Seats'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isRTL 
                ? `لديك ${availableUsers} مقعد متاح | ${formatCurrency(PER_SEAT_PRICE, tenant?.localization, isRTL)} / مقعد / سنة`
                : `${availableUsers} seats available | ${formatCurrency(PER_SEAT_PRICE, tenant?.localization, isRTL)} / seat / yr`}
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
              {isRTL ? 'إضافة مقاعد' : 'Add Seats'}
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
            <p className="text-sm text-muted-foreground">
              {isRTL ? 'ترقية أو تخفيض خطتك — دفع إلكتروني أو تحويل بنكي' : 'Upgrade or downgrade — pay online or wire transfer'}
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
                <tr className="border-b border-border">
                  <th className={`py-3 px-3 font-semibold text-start text-muted-foreground w-40`}>{isRTL ? 'الميزة' : 'Feature'}</th>
                  {[
                    { code: 'starter',    label: isRTL ? 'الانطلاق' : 'Starter',    price: '120,000' },
                    { code: 'growth',     label: isRTL ? 'النمو'     : 'Growth',     price: '190,000' },
                    { code: 'enterprise', label: isRTL ? 'المؤسسات' : 'Enterprise', price: '342,000' },
                  ].map(({ code, label: lbl, price }) => (
                    <th key={code} className={`text-center py-3 px-3 font-semibold ${tenant.plan_code === code ? 'bg-najdi-50 text-najdi-900' : 'text-ink'}`}>
                      <div>{lbl}</div>
                      <div className="text-xs font-normal text-muted-foreground">{formatCurrency(Number(String(price).replace(/,/g, '')), tenant?.localization, isRTL)} / {isRTL ? 'سنة' : 'yr'}</div>
                      {tenant.plan_code === code && (
                        <div className="mt-1 inline-block text-[10px] bg-najdi-700 text-white rounded-full px-2 py-0.5">
                          {isRTL ? 'خطتك' : 'Your plan'}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  {
                    label: isRTL ? 'موظفو النظام (مستخدمون كاملون)' : 'Staff users (full access)',
                    values: ['15', '30', '100'],
                  },
                  {
                    label: isRTL ? 'وصول عام (أولياء / بوابة)' : 'General access (parents/portal)',
                    values: ['500', '2,000', '6,000'],
                  },
                  {
                    label: isRTL ? 'الفروع' : 'Branches',
                    values: ['1', 'حتى 3 / Up to 3', 'حتى 10 / Up to 10'],
                  },
                  {
                    label: isRTL ? 'منصة أساسية + أكاديمية' : 'Core Platform + Academic',
                    values: [true, true, true],
                  },
                  {
                    label: isRTL ? 'الموارد البشرية والرواتب' : 'HR & Payroll',
                    values: [false, true, true],
                  },
                  {
                    label: isRTL ? 'المالية Standard ERP' : 'Financials Standard ERP',
                    values: [false, true, true],
                  },
                  {
                    label: isRTL ? 'قدرات الذكاء الاصطناعي' : 'AI Capabilities',
                    values: [false, isRTL ? 'محدودة (مالية + تنبؤات)' : 'Limited (finance + predictions)', isRTL ? 'حد رمز أعلى' : 'Higher token limit'],
                  },
                  {
                    label: isRTL ? 'الدعم' : 'Support',
                    values: [isRTL ? 'إضافي' : 'Add-on', isRTL ? 'إضافي' : 'Add-on', isRTL ? 'مخصص + SLA' : 'Dedicated + SLA'],
                  },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-sand">
                    <td className="py-3 px-3 text-muted-foreground text-xs font-medium">{row.label}</td>
                    {row.values.map((v, j) => {
                      const codes = ['starter', 'growth', 'enterprise'];
                      const isActive = tenant.plan_code === codes[j];
                      return (
                        <td key={j} className={`text-center py-3 px-3 text-xs ${isActive ? 'bg-najdi-50' : ''}`}>
                          {v === true
                            ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                            : v === false
                              ? <Lock className="w-4 h-4 text-najdi-100 mx-auto" />
                              : <span className="text-ink font-medium">{v}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">{isRTL ? `* الأسعار سنوية بـ${tenant?.currency_code || 'XXX'}، لا تشمل ضريبة القيمة المضافة.` : `* Prices are annual in ${tenant?.currency_code || 'XXX'}, excluding VAT.`}</p>
        </CardContent>
      </Card>

      {/* Subscription Orders History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-najdi-700" />
            {isRTL ? 'أوامر الاشتراك' : 'Subscription Orders'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {[...subscriptionOrders, ...(upgradeRequests || []), ...(userRequests || [])].length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm">{isRTL ? 'لا يوجد سجل طلبات بعد' : 'No order history yet'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subscriptionOrders.map(order => {
                const statusColors = {
                  pending_payment: 'bg-amber-100 text-amber-800',
                  awaiting_verification: 'bg-blue-100 text-blue-800',
                  paid: 'bg-emerald-100 text-emerald-800',
                  verified: 'bg-emerald-100 text-emerald-800',
                  rejected: 'bg-red-100 text-red-800',
                };
                const statusLabels = {
                  pending_payment: isRTL ? 'في انتظار الدفع' : 'Pending Payment',
                  awaiting_verification: isRTL ? 'في انتظار التحقق' : 'Awaiting Verification',
                  paid: isRTL ? 'مدفوع' : 'Paid',
                  verified: isRTL ? 'تم التحقق' : 'Verified',
                  rejected: isRTL ? 'مرفوض' : 'Rejected',
                };
                return (
                  <div key={order.id} className="flex items-center justify-between bg-sand rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {(order.order_type || order.type) === 'plan_upgrade'
                          ? (isRTL ? `ترقية إلى ${order.plan_code}` : `Upgrade to ${order.plan_code}`)
                          : (isRTL ? `إضافة ${order.additional_seats || '—'} مقعد` : `Add ${order.additional_seats || '—'} seats`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.total_amount ? formatCurrency(order.total_amount, tenant?.localization, isRTL) : '—'} &middot; {order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <Badge className={statusColors[order.status] || 'bg-sand-alt text-ink'}>
                      {statusLabels[order.status] || order.status}
                    </Badge>
                  </div>
                );
              })}
              {[...(upgradeRequests || []), ...(userRequests || [])].map(req => (
                <div key={req.id} className="flex items-center justify-between bg-sand rounded-lg p-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {req.request_type === 'plan_upgrade'
                        ? (isRTL ? 'طلب ترقية الخطة' : 'Plan Upgrade Request')
                        : (isRTL ? 'طلب مستخدمين إضافيين' : 'Additional Users Request')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString() : '—'}
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
              ? 'للاستفسارات حول الفواتير تواصل مع info@edusaga360.com'
              : 'For billing inquiries contact info@edusaga360.com'}
          </p>
        </CardContent>
      </Card>

      {/* Upgrade Plan Dialog — with payment flow */}
      <Dialog open={upgradeDialogOpen} onOpenChange={(open) => { if (!open) resetPaymentFlow(); else setUpgradeDialogOpen(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              {paymentStep === 'choose_method'
                ? (isRTL ? 'اختر طريقة الدفع' : 'Choose Payment Method')
                : paymentStep === 'wire_details'
                  ? (isRTL ? 'تحويل بنكي' : 'Wire Transfer')
                  : (isRTL ? 'اختر خطة جديدة' : 'Choose a Plan')}
            </DialogTitle>
          </DialogHeader>

          {/* Step 1: Plan selection */}
          {!paymentStep && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                {availableChangePlans.map(([code, plan]) => {
                  const planTier = plan.tier ?? 0;
                  const isUpgrade = planTier > currentTier;
                  const isDowngrade = planTier < currentTier;
                  return (
                    <Card
                      key={code}
                      className={`cursor-pointer border-2 transition-all ${
                        selectedPlan === code ? 'border-najdi-700 bg-najdi-50' : 'border-border hover:border-najdi-300'
                      }`}
                      onClick={() => setSelectedPlan(code)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-bold text-ink">
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
                        <p className="text-sm font-semibold text-ink mb-3">
                          {plan.priceYearly > 0
                            ? `${formatCurrency(plan.priceYearly, tenant?.localization, isRTL)} / {isRTL ? 'سنة' : 'yr'}`
                            : (isRTL ? 'حسب الطلب' : 'Custom')}
                        </p>
                        <ul className="space-y-2 text-xs text-muted-foreground">
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                            {isRTL ? `${plan.maxEmployees} موظف` : `${plan.maxEmployees} staff users`}
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                            {isRTL ? `${plan.maxUsers.toLocaleString()} وصول عام` : `${plan.maxUsers.toLocaleString()} general access`}
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                            {isRTL ? `حتى ${plan.maxBranches} فرع` : `Up to ${plan.maxBranches} branches`}
                          </li>
                        </ul>
                        {isDowngrade && (
                          <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded p-2">
                            {isRTL ? 'التخفيض يتطلب موافقة المسؤول' : 'Downgrade requires admin approval'}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetPaymentFlow}>
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  disabled={!selectedPlan}
                  onClick={() => {
                    const plan = PLAN_DEFINITIONS[selectedPlan];
                    const planTier = plan?.tier ?? 0;
                    if (planTier < currentTier) {
                      upgradeMutation.mutate(selectedPlan);
                    } else {
                      startPaymentFlow('plan_upgrade', selectedPlan, null);
                    }
                  }}
                >
                  {selectedPlan && (PLAN_DEFINITIONS[selectedPlan]?.tier ?? 0) < currentTier
                    ? (isRTL ? 'طلب التخفيض' : 'Request Downgrade')
                    : (isRTL ? 'متابعة للدفع' : 'Continue to Payment')}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Step 2: Payment method selection */}
          {paymentStep === 'choose_method' && orderContext && (
            <>
              <div className="py-4 space-y-4">
                {/* Order summary */}
                <div className="bg-sand rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-ink">
                    {isRTL ? 'ملخص الطلب' : 'Order Summary'}
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {orderContext.type === 'plan_upgrade'
                        ? (isRTL ? `ترقية إلى ${orderContext.plan_code}` : `Upgrade to ${orderContext.plan_code}`)
                        : (isRTL ? `${orderContext.seats} مقعد إضافي` : `${orderContext.seats} additional seats`)}
                    </span>
                    <span className="text-ink">{formatCurrency(orderContext.subtotal, tenant?.localization, isRTL)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{isRTL ? `ضريبة القيمة المضافة (${Math.round(VAT_RATE * 100)}%)` : `VAT (${Math.round(VAT_RATE * 100)}%)`}</span>
                    <span className="text-ink">{formatCurrency(orderContext.vat, tenant?.localization, isRTL)}</span>
                  </div>
                  <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
                    <span className="text-ink">{isRTL ? 'الإجمالي' : 'Total'}</span>
                    <span className="text-najdi-900">{formatCurrency(orderContext.total, tenant?.localization, isRTL)}</span>
                  </div>
                </div>

                {/* Payment method cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Card
                    className={`cursor-pointer border-2 transition-all ${paymentMethod === 'online' ? 'border-najdi-700 bg-najdi-50' : 'border-border hover:border-najdi-300'}`}
                    onClick={() => setPaymentMethod('online')}
                  >
                    <CardContent className="pt-5 text-center">
                      <CreditCard className="w-8 h-8 mx-auto text-najdi-700 mb-2" />
                      <p className="font-semibold text-ink text-sm">{isRTL ? 'دفع إلكتروني' : 'Pay Online'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isRTL ? 'مدى / فيزا / ماستركارد / Apple Pay' : 'Mada / Visa / MC / Apple Pay'}
                      </p>
                    </CardContent>
                  </Card>
                  <Card
                    className={`cursor-pointer border-2 transition-all ${paymentMethod === 'wire_transfer' ? 'border-najdi-700 bg-najdi-50' : 'border-border hover:border-najdi-300'}`}
                    onClick={() => setPaymentMethod('wire_transfer')}
                  >
                    <CardContent className="pt-5 text-center">
                      <Building2 className="w-8 h-8 mx-auto text-najdi-700 mb-2" />
                      <p className="font-semibold text-ink text-sm">{isRTL ? 'تحويل بنكي' : 'Wire Transfer'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isRTL ? 'حوالة مصرفية إلى حساب الشركة' : 'Bank transfer to company account'}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPaymentStep(null); setPaymentMethod(null); }}>
                  {isRTL ? 'رجوع' : 'Back'}
                </Button>
                <Button
                  disabled={!paymentMethod || createOrderMutation.isPending}
                  onClick={confirmPaymentMethod}
                >
                  {createOrderMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  {paymentMethod === 'online'
                    ? (isRTL ? 'ادفع الآن' : 'Pay Now')
                    : (isRTL ? 'عرض تفاصيل الحساب' : 'Show Account Details')}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Step 3: Wire transfer details + proof upload */}
          {paymentStep === 'wire_details' && (
            <>
              <div className="py-4 space-y-4">
                {/* Bank details */}
                {bankDetails && (
                  <div className="bg-najdi-50 border border-najdi-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-semibold text-najdi-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      {isRTL ? 'تفاصيل الحساب البنكي' : 'Bank Account Details'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{isRTL ? 'اسم الحساب' : 'Account Name'}</p>
                        <p className="font-medium text-ink">{isRTL ? bankDetails.account_name_ar : bankDetails.account_name}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{isRTL ? 'البنك' : 'Bank'}</p>
                        <p className="font-medium text-ink">{isRTL ? bankDetails.bank_name_ar : bankDetails.bank_name}</p>
                      </div>
                      {bankDetails.iban && (
                        <div className="col-span-2">
                          <p className="text-muted-foreground">IBAN</p>
                          <p className="font-mono font-medium text-ink flex items-center gap-2">
                            {bankDetails.iban}
                            <button
                              onClick={() => { navigator.clipboard.writeText(bankDetails.iban); toast.success(isRTL ? 'تم النسخ' : 'Copied'); }}
                              className="text-najdi-700 hover:text-najdi-900"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </p>
                        </div>
                      )}
                      {bankDetails.swift && (
                        <div>
                          <p className="text-muted-foreground">SWIFT</p>
                          <p className="font-mono font-medium text-ink">{bankDetails.swift}</p>
                        </div>
                      )}
                    </div>
                    {orderContext && (
                      <div className="border-t border-najdi-200 pt-2">
                        <p className="text-xs font-semibold text-najdi-900">
                          {isRTL ? 'المبلغ المطلوب تحويله:' : 'Amount to transfer:'} {formatCurrency(orderContext.total, tenant?.localization, isRTL)}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-najdi-700">
                      {isRTL ? bankDetails.notes_ar : bankDetails.notes_en}
                    </p>
                  </div>
                )}

                {/* Transfer details */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{isRTL ? 'رقم مرجع التحويل' : 'Transfer Reference'}</Label>
                    <Input
                      value={transferRef}
                      onChange={e => setTransferRef(e.target.value)}
                      placeholder={isRTL ? 'رقم العملية / المرجع البنكي' : 'Transaction / bank reference number'}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isRTL ? 'تاريخ التحويل' : 'Transfer Date'}</Label>
                    <Input
                      type="date"
                      value={transferDate}
                      onChange={e => setTransferDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isRTL ? 'إيصال التحويل *' : 'Transfer Receipt *'}</Label>
                    <AttachmentUploader
                      attachments={proofAttachments}
                      onChange={setProofAttachments}
                      maxFiles={3}
                      storageBucket="attachments"
                      storagePath={`subscription-proofs/${tenant?.id}`}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPaymentStep('choose_method'); setProofAttachments([]); }}>
                  {isRTL ? 'رجوع' : 'Back'}
                </Button>
                <Button
                  disabled={!proofAttachments.length || uploadProofMutation.isPending}
                  onClick={() => uploadProofMutation.mutate()}
                >
                  {uploadProofMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  <Upload className="w-4 h-4 me-1" />
                  {isRTL ? 'إرسال الإيصال للمراجعة' : 'Submit Proof for Review'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Request Users Dialog — with payment */}
      <Dialog open={addUsersDialogOpen} onOpenChange={(open) => { if (!open) resetPaymentFlow(); else setAddUsersDialogOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-najdi-700" />
              {isRTL ? 'إضافة مقاعد' : 'Add Seats'}
            </DialogTitle>
          </DialogHeader>

          {!paymentStep && (
            <>
              <div className="space-y-4 py-4">
                <div className="p-3 bg-najdi-50 border border-najdi-100 rounded-lg text-xs text-najdi-900">
                  {isRTL
                    ? `المقاعد المتاحة: ${availableUsers} | السعر لكل مقعد: ${formatCurrency(PER_SEAT_PRICE, tenant?.localization, isRTL)} / سنة`
                    : `Available seats: ${availableUsers} | Price per seat: ${formatCurrency(PER_SEAT_PRICE, tenant?.localization, isRTL)} / yr`}
                </div>

                <div className="space-y-1.5">
                  <Label>{isRTL ? 'عدد المقاعد الإضافية *' : 'Number of Additional Seats *'}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={additionalUsers}
                    onChange={e => setAdditionalUsers(parseInt(e.target.value) || 1)}
                  />
                </div>

                {additionalUsers > 0 && (
                  <div className="bg-sand rounded-lg p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{additionalUsers} {isRTL ? 'مقعد' : 'seats'} × {formatCurrency(PER_SEAT_PRICE, tenant?.localization, isRTL)}</span>
                      <span className="text-ink">{formatCurrency(additionalUsers * PER_SEAT_PRICE, tenant?.localization, isRTL)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isRTL ? `ض.ق.م ${Math.round(VAT_RATE * 100)}%` : `VAT ${Math.round(VAT_RATE * 100)}%`}</span>
                      <span className="text-ink">{formatCurrency(Math.round(additionalUsers * PER_SEAT_PRICE * VAT_RATE * 100) / 100, tenant?.localization, isRTL)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t border-border pt-1">
                      <span className="text-ink">{isRTL ? 'الإجمالي' : 'Total'}</span>
                      <span className="text-najdi-900">{formatCurrency(Math.round(additionalUsers * PER_SEAT_PRICE * (1 + VAT_RATE) * 100) / 100, tenant?.localization, isRTL)}</span>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetPaymentFlow}>
                  {isRTL ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button
                  disabled={!additionalUsers || additionalUsers < 1}
                  onClick={() => startPaymentFlow('add_seats', null, additionalUsers)}
                >
                  {isRTL ? 'متابعة للدفع' : 'Continue to Payment'}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Reuse payment method + wire details steps from upgrade dialog context */}
          {paymentStep === 'choose_method' && orderContext && (
            <>
              <div className="py-4 space-y-4">
                <div className="bg-sand rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-ink">{isRTL ? 'الإجمالي' : 'Total'}</span>
                    <span className="text-najdi-900">{formatCurrency(orderContext.total, tenant?.localization, isRTL)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Card
                    className={`cursor-pointer border-2 transition-all ${paymentMethod === 'online' ? 'border-najdi-700 bg-najdi-50' : 'border-border hover:border-najdi-300'}`}
                    onClick={() => setPaymentMethod('online')}
                  >
                    <CardContent className="pt-4 text-center">
                      <CreditCard className="w-6 h-6 mx-auto text-najdi-700 mb-1" />
                      <p className="font-semibold text-ink text-xs">{isRTL ? 'دفع إلكتروني' : 'Pay Online'}</p>
                    </CardContent>
                  </Card>
                  <Card
                    className={`cursor-pointer border-2 transition-all ${paymentMethod === 'wire_transfer' ? 'border-najdi-700 bg-najdi-50' : 'border-border hover:border-najdi-300'}`}
                    onClick={() => setPaymentMethod('wire_transfer')}
                  >
                    <CardContent className="pt-4 text-center">
                      <Building2 className="w-6 h-6 mx-auto text-najdi-700 mb-1" />
                      <p className="font-semibold text-ink text-xs">{isRTL ? 'تحويل بنكي' : 'Wire Transfer'}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPaymentStep(null); setPaymentMethod(null); }}>
                  {isRTL ? 'رجوع' : 'Back'}
                </Button>
                <Button disabled={!paymentMethod || createOrderMutation.isPending} onClick={confirmPaymentMethod}>
                  {createOrderMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  {paymentMethod === 'online' ? (isRTL ? 'ادفع الآن' : 'Pay Now') : (isRTL ? 'عرض تفاصيل الحساب' : 'Show Account Details')}
                </Button>
              </DialogFooter>
            </>
          )}

          {paymentStep === 'wire_details' && (
            <>
              <div className="py-4 space-y-4">
                {bankDetails && (
                  <div className="bg-najdi-50 border border-najdi-200 rounded-lg p-3 space-y-2 text-xs">
                    <p className="font-semibold text-najdi-900">{isRTL ? bankDetails.bank_name_ar : bankDetails.bank_name}</p>
                    <p className="text-ink">{isRTL ? bankDetails.account_name_ar : bankDetails.account_name}</p>
                    {bankDetails.iban && <p className="font-mono text-ink">IBAN: {bankDetails.iban}</p>}
                    {orderContext && (
                      <p className="font-semibold text-najdi-900 pt-1 border-t border-najdi-200">
                        {isRTL ? 'المبلغ:' : 'Amount:'} {formatCurrency(orderContext.total, tenant?.localization, isRTL)}
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'إيصال التحويل *' : 'Transfer Receipt *'}</Label>
                  <AttachmentUploader
                    attachments={proofAttachments}
                    onChange={setProofAttachments}
                    maxFiles={3}
                    storageBucket="attachments"
                    storagePath={`subscription-proofs/${tenant?.id}`}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPaymentStep('choose_method'); setProofAttachments([]); }}>
                  {isRTL ? 'رجوع' : 'Back'}
                </Button>
                <Button disabled={!proofAttachments.length || uploadProofMutation.isPending} onClick={() => uploadProofMutation.mutate()}>
                  {uploadProofMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                  {isRTL ? 'إرسال الإيصال' : 'Submit Proof'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}