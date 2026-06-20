import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Search, Clock, Loader2, FileText, CheckCircle, XCircle, Phone, User, School, Mail, AlertTriangle
} from 'lucide-react';

export default function RegistrationRequestsTab() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [processingId, setProcessingId] = useState(null);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['registration-requests'],
    queryFn: () => fetchData(
      // registration_requests is a platform-level table — bypass tenant filter
      tenantQuery('registration_requests').select('*').order('created_date', { ascending: false })
    ),
  });

  const filtered = requests.filter(r => {
    const matchSearch = !search ||
      // DB columns are: school_name_en, contact_email, contact_name
      (r.school_name_en || r.school_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.contact_email || r.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (r.contact_name || r.full_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // Localised toast copy keyed off the server's `action` field, which can be
  // 'approved' (fresh approval), 'resent' (existing-token resend),
  // 'repaired' (orphan tenant deleted + fresh token issued), or 'rejected'.
  const successMessageFor = (serverAction) => {
    if (isRTL) {
      switch (serverAction) {
        case 'approved':
          return 'تمت الموافقة — تم إرسال رابط الإعداد للمدرسة';
        case 'resent':
          return 'تم إعادة إرسال رابط الإعداد إلى البريد الإلكتروني';
        case 'repaired':
          return 'تم إصلاح المستأجر اليتيم وإرسال رابط إعداد جديد';
        case 'rejected':
          return 'تم الرفض';
        default:
          return 'تم';
      }
    }
    switch (serverAction) {
      case 'approved':
        return 'Approved — setup link sent to school';
      case 'resent':
        return 'Setup link resent to school';
      case 'repaired':
        return 'Orphan tenant cleaned up; new setup link sent';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Done';
    }
  };

  // Server-side error codes from processRegistrationRequest. Anything not in
  // this map falls back to the raw error string.
  const errorMessageFor = (code) => {
    if (!code) return null;
    if (isRTL) {
      switch (code) {
        case 'ALREADY_COMPLETED':
          return 'تمت معالجة هذا الطلب بالكامل سابقاً';
        case 'ALREADY_REJECTED':
          return 'تم رفض هذا الطلب — يجب على المتقدم إعادة التقديم';
        case 'TENANT_HAS_USERS':
          return 'المستأجر مرتبط بمستخدمين بالفعل — تواصل مع مسؤول المنصة';
        case 'ORPHAN_DELETE_FAILED':
          return 'تعذر حذف المستأجر اليتيم — حاول مرة أخرى لاحقاً';
        case 'NOT_APPROVED_YET':
          return 'لا يمكن إعادة الإرسال قبل الموافقة على الطلب';
        case 'NOT_PENDING':
          return 'هذا الإجراء يعمل فقط على الطلبات المعلقة';
        default:
          return null;
      }
    }
    switch (code) {
      case 'ALREADY_COMPLETED':
        return 'This request was already onboarded';
      case 'ALREADY_REJECTED':
        return 'Request was rejected — applicant must re-submit';
      case 'TENANT_HAS_USERS':
        return 'Tenant already has linked users — contact platform admin';
      case 'ORPHAN_DELETE_FAILED':
        return 'Could not delete orphan tenant — please retry shortly';
      case 'NOT_APPROVED_YET':
        return 'Cannot resend before the request is approved';
      case 'NOT_PENDING':
        return 'Only pending requests can be acted on this way';
      default:
        return null;
    }
  };

  const handleAction = async (request, action) => {
    setProcessingId(request.id);
    try {
      // Map UI actions to backend REST endpoints on registrationRouter
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://edusaga-360-production.up.railway.app';
      let url;
      if (action === 'approve') {
        url = `${apiBase}/api/registration/approve/${request.id}`;
      } else if (action === 'reject' || action === 'deny') {
        url = `${apiBase}/api/registration/deny/${request.id}`;
      } else if (action === 'resend') {
        url = `${apiBase}/api/registration/resend/${request.id}`;
      } else {
        toast.error(`Unknown action: ${action}`);
        return;
      }

      // These endpoints accept either an HMAC-signed email link or an
      // authenticated platform-owner session — the dashboard uses the latter,
      // so send the current access token (without it the backend returns 403).
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(url, {
        method: 'GET',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (response.ok) {
        const serverAction = action === 'approve' ? 'approved' : action === 'resend' ? 'resent' : 'rejected';
        toast.success(successMessageFor(serverAction));
        queryClient.invalidateQueries({ queryKey: ['registration-requests'] });
      } else {
        const text = await response.text().catch(() => '');
        toast.error(text || `Error ${response.status}`);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setProcessingId(null);
    }
  };

  const statusColors = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  };

  const statusLabels = {
    pending: isRTL ? 'بانتظار المراجعة' : 'Pending Review',
    approved: isRTL ? 'تمت الموافقة' : 'Approved',
    rejected: isRTL ? 'مرفوض' : 'Rejected',
  };

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-amber-800">
              {isRTL ? `${pendingCount} طلب تسجيل بانتظار المراجعة` : `${pendingCount} registration request(s) pending review`}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
              className="text-xs"
            >
              {s === 'all' ? (isRTL ? 'الكل' : 'All') : statusLabels[s]}
              {s === 'pending' && pendingCount > 0 && (
                <Badge className="bg-red-500 text-white ms-1 text-xs px-1.5 py-0">{pendingCount}</Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'المدرسة' : 'School'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'المسؤول' : 'Contact'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'المدينة / النوع' : 'City / Type'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'الطلاب / المصدر' : 'Students / Source'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'تاريخ الإرسال' : 'Submitted'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="text-start p-3 font-medium text-slate-600">{isRTL ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-slate-400" />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {isRTL ? 'لا توجد طلبات' : 'No requests'}
                  </td></tr>
                ) : filtered.map(r => {
                  const isProcessing = processingId === r.id;
                  const isPending = r.status === 'pending';
                  return (
                    <tr key={r.id} className="border-b hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <School className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          {/* DB column: school_name_en */}
                          <p className="font-medium text-slate-900">{r.school_name_en || r.school_name || '-'}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                          <div>
                            {/* DB columns: contact_name, contact_email, contact_phone */}
                            <p className="text-sm text-slate-800">{r.contact_name || r.full_name || '-'}</p>
                            <p className="text-xs text-slate-400">{r.contact_email || r.email || '-'}</p>
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                              <Phone className="w-3 h-3" />{r.contact_phone || r.phone || '-'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <p className="text-slate-700">{r.city || '-'}</p>
                        {r.school_type && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            r.school_type === 'government' ? 'bg-blue-100 text-blue-700' :
                            r.school_type === 'private' ? 'bg-purple-100 text-purple-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {r.school_type === 'government' ? 'حكومية' : r.school_type === 'private' ? 'أهلية' : 'دولية'}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {/* DB column: student_count_range */}
                        <p className="text-slate-700">{r.student_count_range || r.estimated_students || '-'}</p>
                        {r.notes && <p className="text-xs text-slate-400 mt-0.5">{r.notes}</p>}
                      </td>
                      <td className="p-3 text-slate-500 text-xs">
                        {/* DB column: created_date (submitted_at not in schema) */}
                        {(r.created_date || r.submitted_at) ? format(new Date(r.created_date || r.submitted_at), 'dd/MM/yyyy HH:mm') : '-'}
                      </td>
                      <td className="p-3">
                        <Badge className={statusColors[r.status] || 'bg-slate-100'}>
                          {statusLabels[r.status] || r.status}
                        </Badge>
                        {r.status === 'approved' && r.setup_completed && (
                          <p className="text-xs text-emerald-600 mt-0.5">{isRTL ? '✓ تم الإعداد' : '✓ Setup done'}</p>
                        )}
                        {r.status === 'approved' && !r.setup_completed && !r.tenant_id_created && (
                          <p className="text-xs text-amber-600 mt-0.5">{isRTL ? '⏳ لم يكمل الإعداد' : '⏳ Awaiting setup'}</p>
                        )}
                        {r.status === 'approved' && !r.setup_completed && r.tenant_id_created && (
                          <p className="text-xs text-rose-600 mt-0.5 inline-flex items-center gap-1" title={isRTL ? 'تم إنشاء مستأجر خارج المسار الطبيعي. اضغط "إعادة الإرسال" للإصلاح وإصدار رابط جديد.' : 'A tenant was provisioned out-of-band. Click "Resend" to repair and issue a fresh setup link.'}>
                            <AlertTriangle className="w-3 h-3" />
                            {isRTL ? 'يحتاج إصلاح' : 'Needs repair'}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {isPending && (
                            <>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2 text-xs gap-1"
                                onClick={() => handleAction(r, 'approve')}
                                disabled={isProcessing}
                              >
                                {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                {isRTL ? 'قبول' : 'Approve'}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => handleAction(r, 'reject')}
                                disabled={isProcessing}
                              >
                                <XCircle className="w-3 h-3" />
                                {isRTL ? 'رفض' : 'Reject'}
                              </Button>
                            </>
                          )}
                          {r.status === 'approved' && !r.setup_completed && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => handleAction(r, 'resend')}
                              disabled={isProcessing}
                              title={r.tenant_id_created
                                ? (isRTL ? 'إصلاح المستأجر اليتيم وإعادة إرسال الرابط' : 'Repair orphan tenant and resend setup link')
                                : (isRTL ? 'إعادة إرسال رابط الإعداد' : 'Resend setup link')}
                            >
                              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                              {isRTL ? 'إعادة إرسال' : 'Resend'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}