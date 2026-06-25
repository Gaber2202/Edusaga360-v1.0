import React, { useState } from 'react';
import { callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  CheckCircle, XCircle, Loader2, Building2, Mail, Phone,
  MapPin, Users, Globe, Calendar
} from 'lucide-react';

export default function TenantRequestReviewDialog({ request, open, onClose, onUpdated }) {
  const { isRTL } = useLanguage();
  const [processing, setProcessing] = useState(false);
  const [assignedPlan, setAssignedPlan] = useState(request?.assigned_plan || 'free_trial');
  const [rejectionReason, setRejectionReason] = useState('');
  const [loadDemoData, setLoadDemoData] = useState(false);

  if (!request) return null;

  const isPending = request.status === 'pending_approval';

  const handleAction = async (action) => {
    if (action === 'reject' && !rejectionReason.trim()) {
      toast.error(isRTL ? 'يرجى إدخال سبب الرفض' : 'Please enter a rejection reason');
      return;
    }
    setProcessing(true);
    try {
      const response = await callApi('/api/functions/approveTenantRequest', {
        request_id: request.id,
        action,
        assigned_plan: assignedPlan,
        rejection_reason: rejectionReason,
        load_demo_data: loadDemoData,
      });

      if (response.data?.success) {
        toast.success(
          action === 'approve'
            ? (isRTL ? `تمت الموافقة — كود المؤسسة: ${response.data.tenant_code}` : `Approved — Tenant Code: ${response.data.tenant_code}`)
            : (isRTL ? 'تم رفض الطلب' : 'Request rejected')
        );
        onUpdated?.();
      } else {
        toast.error(response.data?.error || 'Unknown error');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const statusColors = {
    pending_approval: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Building2 className="w-5 h-5 text-blue-600" />
            {isRTL ? 'مراجعة طلب التسجيل' : 'Review Registration Request'}
            <Badge className={statusColors[request.status] || 'bg-slate-100'}>
              {request.status === 'pending_approval' ? (isRTL ? 'بانتظار الموافقة' : 'Pending') :
               request.status === 'approved' ? (isRTL ? 'مقبول' : 'Approved') :
               isRTL ? 'مرفوض' : 'Rejected'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Request Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'اسم المؤسسة' : 'School Name'}</p>
                <p className="font-medium">{request.school_name}</p>
                {request.school_name_ar && <p className="text-sm text-slate-600">{request.school_name_ar}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'البريد' : 'Email'}</p>
                <p className="font-medium">{request.contact_email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'اسم التواصل' : 'Contact Name'}</p>
                <p className="font-medium">{request.contact_name || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'الهاتف' : 'Phone'}</p>
                <p className="font-medium">{request.contact_phone || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'الدولة' : 'Country'}</p>
                <p className="font-medium">{request.country === 'UAE' ? '🇦🇪 UAE' : '🇸🇦 Saudi Arabia'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'المدينة' : 'City'}</p>
                <p className="font-medium">{request.city || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'عدد الموظفين' : 'Employees'}</p>
                <p className="font-medium">{request.number_of_employees || '-'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'اللغة المفضلة' : 'Language'}</p>
                <p className="font-medium">{request.preferred_language === 'en' ? 'English' : 'العربية'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{isRTL ? 'تاريخ التقديم' : 'Submitted'}</p>
                <p className="font-medium">{request.created_at ? format(new Date(request.created_at), 'dd/MM/yyyy HH:mm') : '-'}</p>
              </div>
            </div>
          </div>

          {/* Approved Info */}
          {request.status === 'approved' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-emerald-800">
                <CheckCircle className="w-4 h-4 inline me-1" />
                {isRTL ? 'تمت الموافقة' : 'Approved'}
              </p>
              <p className="text-xs text-emerald-700">{isRTL ? 'بواسطة:' : 'By:'} {request.reviewed_by}</p>
              <p className="text-xs text-emerald-700">{isRTL ? 'كود المؤسسة:' : 'Tenant Code:'} <span className="font-mono font-bold">{request.created_tenant_code}</span></p>
            </div>
          )}

          {/* Rejected Info */}
          {request.status === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-red-800">
                <XCircle className="w-4 h-4 inline me-1" />
                {isRTL ? 'مرفوض' : 'Rejected'}
              </p>
              <p className="text-xs text-red-700">{isRTL ? 'بواسطة:' : 'By:'} {request.reviewed_by}</p>
              <p className="text-xs text-red-700">{isRTL ? 'السبب:' : 'Reason:'} {request.rejection_reason}</p>
            </div>
          )}

          {/* Action Panel — only for pending */}
          {isPending && (
            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold text-slate-900">
                {isRTL ? 'إجراء المراجعة' : 'Review Action'}
              </h3>

              {/* Plan Assignment */}
              <div className="space-y-2">
                <Label>{isRTL ? 'الخطة المعينة' : 'Assign Plan'}</Label>
                <Select value={assignedPlan} onValueChange={setAssignedPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free_trial">{isRTL ? 'تجربة مجانية (30 يوم)' : 'Free Trial (30 days)'}</SelectItem>
                    <SelectItem value="startup">{isRTL ? 'خطة الانطلاق' : 'Startup Plan'}</SelectItem>
                    <SelectItem value="enterprise">{isRTL ? 'خطة المؤسسات' : 'Enterprise Plan'}</SelectItem>
                    <SelectItem value="government">{isRTL ? 'الخطة الحكومية' : 'Government Plan'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Demo Data Toggle */}
              <div className="flex items-center gap-3">
                <Switch checked={loadDemoData} onCheckedChange={setLoadDemoData} />
                <Label>{isRTL ? 'تحميل بيانات تجريبية' : 'Load demo data'}</Label>
              </div>

              {/* Rejection Reason */}
              <div className="space-y-2">
                <Label>{isRTL ? 'سبب الرفض (مطلوب عند الرفض)' : 'Rejection Reason (required if rejecting)'}</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={isRTL ? 'أدخل سبب الرفض...' : 'Enter rejection reason...'}
                  className="h-20"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={() => handleAction('approve')}
                  disabled={processing}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {isRTL ? 'موافقة وإنشاء بيئة المؤسسة' : 'Approve & Provision Tenant'}
                </Button>
                <Button
                  onClick={() => handleAction('reject')}
                  disabled={processing}
                  variant="destructive"
                  className="gap-2"
                >
                  {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  {isRTL ? 'رفض' : 'Reject'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isRTL ? 'إغلاق' : 'Close'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}