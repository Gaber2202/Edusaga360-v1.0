import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import { CheckCircle, XCircle, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function HRApprovalsInbox() {
  const { isRTL } = useLanguage();
  const { user } = useRole();
  const qc = useQueryClient();
  const { tenantId } = useTenantFilter();
  const [actionDialog, setActionDialog] = useState(null); // { item, type, action }
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: leaveRequests = [], isLoading: loadingLeave } = useQuery({
    queryKey: ['leaveRequestsInbox', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match({ status: 'pending' })),
  });

  const { data: essRequests = [], isLoading: loadingESS } = useQuery({
    queryKey: ['essRequestsInbox', tenantId],
    queryFn: () => fetchData(tenantQuery('ess_requests').select('*').match({ status: 'pending' })),
  });

  const pendingLeave = leaveRequests.filter(r => ['pending', 'pending_manager', 'pending_hr'].includes(r.status));
  const pendingESS = essRequests.filter(r => ['pending', 'pending_manager', 'pending_hr'].includes(r.status));

  const handleAction = async () => {
    if (!actionDialog) return;
    setSaving(true);
    const { item, type, action } = actionDialog;
    const isApprove = action === 'approve';
    const newStatus = isApprove ? 'approved' : 'rejected';

    try {
      const updateData = {
        status: newStatus,
        workflow_stage: newStatus,
        reviewed_by: user?.email,
        reviewed_date: new Date().toISOString(),
        review_comment: comment
      };

      if (type === 'leave') {
        await tenantQuery('leave_requests').update(updateData);
        qc.invalidateQueries({ queryKey: ['leaveRequestsInbox'] });
        qc.invalidateQueries({ queryKey: ['leaveRequests'] });
      } else {
        await tenantQuery('ess_requests').update(updateData);
        qc.invalidateQueries({ queryKey: ['essRequestsInbox'] });
        qc.invalidateQueries({ queryKey: ['essRequests'] });
      }

      toast.success(isRTL
        ? (isApprove ? 'تم الاعتماد' : 'تم الرفض')
        : (isApprove ? 'Approved' : 'Rejected'));
      setActionDialog(null);
      setComment('');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const typeLabels = {
    leave: isRTL ? 'إجازة' : 'Leave',
    salary_advance: isRTL ? 'سلفة' : 'Advance',
    permission: isRTL ? 'استئذان' : 'Permission',
    salary_certificate: isRTL ? 'شهادة راتب' : 'Salary Cert',
    experience_certificate: isRTL ? 'شهادة خبرة' : 'Exp. Cert',
    other: isRTL ? 'أخرى' : 'Other',
  };

  const RequestCard = ({ item, type }) => {
    const hasMissingManager = item.routing_note === 'Manager Missing - routed to HR';
    return (
      <div className="border rounded-lg p-4 bg-white space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">{item.employee_name}</span>
              <Badge className="bg-najdi-50 text-najdi-900 text-xs">
                {type === 'leave' ? (item.leave_type_name || typeLabels.leave) : typeLabels[item.request_type] || item.request_type}
              </Badge>
              {hasMissingManager && (
                <Badge className="bg-amber-100 text-amber-700 text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {isRTL ? 'لا مدير مباشر' : 'No Line Manager'}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {type === 'leave'
                ? `${item.start_date} → ${item.end_date} (${item.total_days} ${isRTL ? 'يوم' : 'days'})`
                : item.reason}
            </p>
            {item.amount > 0 && (
              <p className="text-sm text-emerald-600 font-medium">{item.amount?.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {isRTL ? 'مقدم في:' : 'Submitted:'} {item.submitted_date ? format(new Date(item.submitted_date), 'dd/MM/yyyy HH:mm') : item.created_at ? format(new Date(item.created_at), 'dd/MM/yyyy') : '—'}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setActionDialog({ item, type, action: 'approve' })}>
              <CheckCircle className="w-4 h-4 me-1" />{isRTL ? 'اعتماد' : 'Approve'}
            </Button>
            <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setActionDialog({ item, type, action: 'reject' })}>
              <XCircle className="w-4 h-4 me-1" />{isRTL ? 'رفض' : 'Reject'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'صندوق الموافقات' : 'HR Approvals Inbox'}
        subtitle={isRTL ? 'مراجعة واعتماد طلبات الموظفين' : 'Review and approve employee requests'}
      />

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-600" />
            <div>
              <div className="text-2xl font-bold text-amber-700">{pendingLeave.length + pendingESS.length}</div>
              <div className="text-sm text-amber-600">{isRTL ? 'طلبات معلقة' : 'Pending Requests'}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-najdi-100 bg-najdi-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-najdi-700" />
            <div>
              <div className="text-2xl font-bold text-najdi-900">
                {[...pendingLeave, ...pendingESS].filter(r => r.routing_note?.includes('Manager Missing')).length}
              </div>
              <div className="text-sm text-najdi-700">{isRTL ? 'بدون مدير مباشر' : 'No Line Manager'}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="leave">
        <TabsList>
          <TabsTrigger value="leave">
            {isRTL ? 'طلبات الإجازة' : 'Leave Requests'}
            {pendingLeave.length > 0 && <Badge className="ms-2 bg-red-100 text-red-700">{pendingLeave.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ess">
            {isRTL ? 'طلبات ESS' : 'ESS Requests'}
            {pendingESS.length > 0 && <Badge className="ms-2 bg-red-100 text-red-700">{pendingESS.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leave" className="space-y-3 mt-4">
          {loadingLeave ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : pendingLeave.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-300" />
              <p>{isRTL ? 'لا توجد طلبات إجازة معلقة' : 'No pending leave requests'}</p>
            </div>
          ) : pendingLeave.map(r => <RequestCard key={r.id} item={r} type="leave" />)}
        </TabsContent>

        <TabsContent value="ess" className="space-y-3 mt-4">
          {loadingESS ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : pendingESS.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-300" />
              <p>{isRTL ? 'لا توجد طلبات معلقة' : 'No pending ESS requests'}</p>
            </div>
          ) : pendingESS.map(r => <RequestCard key={r.id} item={r} type="ess" />)}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => { setActionDialog(null); setComment(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.action === 'approve'
                ? (isRTL ? 'تأكيد الاعتماد' : 'Confirm Approval')
                : (isRTL ? 'تأكيد الرفض' : 'Confirm Rejection')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className={`p-3 rounded-lg text-sm ${actionDialog?.action === 'approve' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
              {actionDialog?.item?.employee_name} — {actionDialog?.item?.leave_type_name || actionDialog?.item?.request_type}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink">{isRTL ? 'تعليق (اختياري)' : 'Comment (optional)'}</label>
              <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} placeholder={isRTL ? 'أضف تعليقاً...' : 'Add a comment...'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setComment(''); }}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              onClick={handleAction}
              disabled={saving}
              className={actionDialog?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {actionDialog?.action === 'approve' ? (isRTL ? 'اعتماد' : 'Approve') : (isRTL ? 'رفض' : 'Reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}