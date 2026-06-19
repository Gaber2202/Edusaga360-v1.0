import React, { useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle, X, AlertCircle, Users, Zap, Clock } from 'lucide-react';

export default function AdminRequestsTab({ isRTL }) {
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [tab, setTab] = useState('pending');

  // Fetch all requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['all-requests'],
    queryFn: async () => {
      const { data: reqs = [] } = await tenantQuery('tenant_requests').select('*').order();
      return reqs;
    },
  });

  // Approve/Reject mutation
  const decideMutation = useMutation({
    mutationFn: async ({ requestId, approved, notes }) => {
      // Update request status
      await tenantQuery('tenant_requests').update({
        status: approved ? 'approved' : 'rejected',
        admin_notes: notes,
        reviewed_at: new Date().toISOString()
      });

      // If approving users request, update tenant max_users
      const request = requests.find(r => r.id === requestId);
      if (approved && request?.request_type === 'additional_users' && request?.tenant_id) {
        const { data: tenant = [] } = await tenantQuery('tenants').select('*').match({ id: request.tenant_id });
        if (tenant && tenant.length > 0) {
          const t = tenant[0];
          await tenantQuery('tenants').update({
            max_users: (t.max_users || 0) + (request.additional_users || 0)
          });
        }
      }

      // If approving plan upgrade, update tenant plan
      if (approved && request?.request_type === 'plan_upgrade' && request?.tenant_id) {
        const { data: tenant = [] } = await tenantQuery('tenants').select('*').match({ id: request.tenant_id });
        if (tenant && tenant.length > 0) {
          const t = tenant[0];
          await tenantQuery('tenants').update({
            plan_code: request.requested_plan
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-requests'] });
      setSelectedRequest(null);
      setReviewDialogOpen(false);
      setReviewNotes('');
      toast.success(isRTL ? 'تم تحديث الطلب' : 'Request updated');
    },
    onError: () => {
      toast.error(isRTL ? 'فشل التحديث' : 'Update failed');
    }
  });

  const filterRequests = (status) => {
    return requests.filter(r => r.status === status).sort((a, b) => 
      new Date(b.created_at) - new Date(a.created_at)
    );
  };

  const getTenantName = (tenantId) => {
    return tenantId || 'Unknown Tenant';
  };

  const getTypeIcon = (type) => {
    if (type === 'additional_users') return <Users className="w-4 h-4" />;
    if (type === 'plan_upgrade') return <Zap className="w-4 h-4" />;
    return null;
  };

  const getTypeLabel = (type) => {
    if (type === 'additional_users') return isRTL ? 'مستخدمين إضافيين' : 'Additional Users';
    if (type === 'plan_upgrade') return isRTL ? 'ترقية الخطة' : 'Plan Upgrade';
    return type;
  };


  const RequestRow = ({ request }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 border-b last:border-b-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
          {getTypeIcon(request.request_type)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">
            {getTypeLabel(request.request_type)}
          </p>
          <p className="text-xs text-slate-500">
            {getTenantName(request.tenant_id)} • {format(new Date(request.created_at), 'dd/MM/yyyy HH:mm')}
          </p>
          {request.request_type === 'additional_users' && (
            <p className="text-xs text-slate-600 mt-1">
              {isRTL ? `طلب: ${request.additional_users} مستخدم` : `Requested: ${request.additional_users} users`}
            </p>
          )}
          {request.request_type === 'plan_upgrade' && (
            <p className="text-xs text-slate-600 mt-1">
              {isRTL ? `من ${request.current_plan} إلى ${request.requested_plan}` : `From ${request.current_plan} to ${request.requested_plan}`}
            </p>
          )}
          {request.reason && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-1">{request.reason}</p>
          )}
        </div>
      </div>
      {tab === 'pending' && (
        <Button
          size="sm"
          onClick={() => {
            setSelectedRequest(request);
            setReviewDialogOpen(true);
          }}
          className="flex-shrink-0"
        >
          {isRTL ? 'مراجعة' : 'Review'}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Tab Filter */}
      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map(status => {
          const count = filterRequests(status).length;
          const isActive = tab === status;
          return (
            <Button
              key={status}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab(status)}
              className="gap-2"
            >
              {status === 'pending' && <Clock className="w-4 h-4" />}
              {status === 'approved' && <CheckCircle className="w-4 h-4" />}
              {status === 'rejected' && <X className="w-4 h-4" />}
              {isRTL 
                ? (status === 'pending' ? 'قيد الانتظار' : status === 'approved' ? 'معتمدة' : 'مرفوضة')
                : (status.charAt(0).toUpperCase() + status.slice(1))
              }
              <Badge variant="outline" className="ms-1">{count}</Badge>
            </Button>
          );
        })}
      </div>

      {/* Requests List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>
          ) : filterRequests(tab).length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400">{isRTL ? 'لا توجد طلبات' : 'No requests'}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filterRequests(tab).map(req => (
                <RequestRow key={req.id} request={req} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getTypeIcon(selectedRequest?.request_type)}
              {getTypeLabel(selectedRequest?.request_type)}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-slate-50 rounded-lg space-y-2 text-sm">
                <div>
                  <p className="text-xs text-slate-500">{isRTL ? 'المؤسسة' : 'Tenant'}</p>
                  <p className="font-medium">{getTenantName(selectedRequest.tenant_id)}</p>
                </div>
                {selectedRequest.request_type === 'additional_users' && (
                  <div>
                    <p className="text-xs text-slate-500">{isRTL ? 'عدد المستخدمين' : 'Users Requested'}</p>
                    <p className="font-medium">{selectedRequest.additional_users}</p>
                  </div>
                )}
                {selectedRequest.request_type === 'plan_upgrade' && (
                  <div>
                    <p className="text-xs text-slate-500">{isRTL ? 'الخطة الجديدة' : 'Requested Plan'}</p>
                    <p className="font-medium">{selectedRequest.requested_plan}</p>
                  </div>
                )}
                {selectedRequest.reason && (
                  <div>
                    <p className="text-xs text-slate-500">{isRTL ? 'السبب' : 'Reason'}</p>
                    <p className="text-slate-700">{selectedRequest.reason}</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isRTL ? 'ملاحظات المراجعة' : 'Review Notes'}</label>
                <Textarea
                  placeholder={isRTL ? 'أضف ملاحظاتك...' : 'Add your notes...'}
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => decideMutation.mutate({ requestId: selectedRequest.id, approved: false, notes: reviewNotes })}
              disabled={decideMutation.isPending}
            >
              {isRTL ? 'رفض' : 'Reject'}
            </Button>
            <Button
              onClick={() => decideMutation.mutate({ requestId: selectedRequest.id, approved: true, notes: reviewNotes })}
              disabled={decideMutation.isPending}
            >
              {isRTL ? 'موافقة' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}