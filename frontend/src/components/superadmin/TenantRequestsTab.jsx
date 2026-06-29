import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Search, Eye, Clock, Loader2, FileText, CheckCircle, XCircle, MapPin, User, Mail, Phone
} from 'lucide-react';
import TenantRequestReviewDialog from './TenantRequestReviewDialog';

export default function TenantRequestsTab() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['subscription-requests-unified'],
    queryFn: async () => {
      const response = await callApi('/api/functions/listSubscriptionRequests', {});
      return response.data;
    },
  });

  const allRequests = requestsData?.requests || [];
  const pendingCount = requestsData?.pending_count || 0;

  const filtered = allRequests.filter(r => {
    const matchSearch = !search ||
      r.schoolName?.toLowerCase().includes(search.toLowerCase()) ||
      r.contactEmail?.toLowerCase().includes(search.toLowerCase()) ||
      r.contactName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Actions ─────────────────────────────────────────────────────────────────
  const handleAction = async (req, action) => {
    setProcessingId(req.id);
    try {
      if (req._type === 'tenant') {
        const response = await callApi('/api/functions/approveTenantRequest', {
          request_id: req.id,
          action,
          assigned_plan: 'free_trial',
          rejection_reason: action === 'reject' ? 'Rejected by admin' : undefined,
        });
        if (response.data?.success) {
          toast.success(action === 'approve'
            ? (isRTL ? `تمت الموافقة — ${response.data.tenant_code}` : `Approved — ${response.data.tenant_code}`)
            : (isRTL ? 'تم الرفض' : 'Rejected'));
          queryClient.invalidateQueries({ queryKey: ['subscription-requests-unified'] });
          queryClient.invalidateQueries({ queryKey: ['subscription-requests-summary'] });
          queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
        } else {
          toast.error(response.data?.error || 'Unknown error');
        }
      } else {
        // RegistrationRequest
        const res = await callApi('/api/functions/processRegistrationRequest', {
          request_id: req.id,
          action: action === 'approve' ? 'approve' : 'reject',
        });
        const data = res.data || {};
        if (data.success) {
          toast.success(action === 'approve'
            ? (isRTL ? 'تمت الموافقة — تم إرسال رابط الإعداد' : 'Approved — setup link sent')
            : (isRTL ? 'تم الرفض' : 'Rejected'));
          queryClient.invalidateQueries({ queryKey: ['subscription-requests-unified'] });
          queryClient.invalidateQueries({ queryKey: ['subscription-requests-summary'] });
          queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
        } else {
          toast.error(data.error || 'Unknown error');
        }
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
    pending: isRTL ? 'بانتظار المراجعة' : 'Pending',
    approved: isRTL ? 'تمت الموافقة' : 'Approved',
    rejected: isRTL ? 'مرفوض' : 'Rejected',
  };

  const schoolTypeLabel = (t) => {
    if (!t) return null;
    if (t === 'government') return isRTL ? 'حكومية' : 'Government';
    if (t === 'private') return isRTL ? 'أهلية' : 'Private';
    return isRTL ? 'دولية' : 'International';
  };

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-amber-800">
              {isRTL
                ? `${pendingCount} طلب بانتظار المراجعة`
                : `${pendingCount} request(s) pending review`}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
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
                <tr className="bg-sand border-b">
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'اسم المؤسسة' : 'School Name'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'المسؤول' : 'Contact'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'المنطقة / النوع' : 'City / Type'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'الطلاب' : 'Students'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'تاريخ الإرسال' : 'Submitted'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="p-8 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {isRTL ? 'لا توجد طلبات' : 'No requests'}
                  </td></tr>
                ) : filtered.map(r => {
                  const isProcessing = processingId === r.id;
                  const isPending = r.status === 'pending';
                  return (
                    <tr key={`${r._type}-${r.id}`} className="border-b hover:bg-sand transition-colors">
                      <td className="p-3">
                        <p className="font-medium text-ink">{r.schoolName}</p>
                        <span className="text-xs text-muted-foreground">{r._type === 'registration' ? (isRTL ? 'طلب تسجيل' : 'Registration') : (isRTL ? 'طلب اشتراك' : 'Subscription')}</span>
                      </td>
                      <td className="p-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm text-ink">{r.contactName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-xs text-muted-foreground">{r.contactEmail}</span>
                          </div>
                          {r.contactPhone && r.contactPhone !== '-' && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <span className="text-xs text-muted-foreground">{r.contactPhone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                          {r.city}
                        </div>
                        {r.schoolType && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            r.schoolType === 'government' ? 'bg-najdi-50 text-najdi-900' :
                            r.schoolType === 'private' ? 'bg-purple-100 text-purple-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{schoolTypeLabel(r.schoolType)}</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-sm">
                        {r.estimatedStudents || '-'}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {r.submittedAt ? format(new Date(r.submittedAt), 'dd/MM/yyyy HH:mm') : '-'}
                      </td>
                      <td className="p-3">
                        <Badge className={statusColors[r.status] || 'bg-sand-alt'}>
                          {statusLabels[r.status] || r.status}
                        </Badge>
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
                          {r._type === 'tenant' && (
                            <Button size="sm" variant="ghost" onClick={() => setSelectedRequest(r.raw)} title={isRTL ? 'عرض التفاصيل' : 'View Details'}>
                              <Eye className="w-3.5 h-3.5" />
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

      {selectedRequest && (
        <TenantRequestReviewDialog
          request={selectedRequest}
          open={!!selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['tenant-requests'] });
            queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
            setSelectedRequest(null);
          }}
        />
      )}
    </div>
  );
}