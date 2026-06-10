/**
 * Leave Workflow — AC#5: employee requests leave → manager approves → balance updated
 * Zero paper, zero email
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useBranch } from '../BranchContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Plus, Calendar, Loader2 } from 'lucide-react';

const LEAVE_STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function LeaveWorkflow({ isRTL, viewMode = 'hr' }) {
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const { branchFilter, selectedBranchId } = useBranch();

  const [activeTab, setActiveTab] = useState('pending');
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '',
  });

  const { data: leaveRequests = [], isLoading } = useQuery({
    queryKey: ['leaveRequests', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter(branchFilter())).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
    refetchInterval: 30000,
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leaveTypes', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_types').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ['leaveBalances', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_balances').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredRequests = useMemo(() => {
    if (activeTab === 'all') return leaveRequests;
    return leaveRequests.filter(r => r.status === activeTab);
  }, [leaveRequests, activeTab]);

  const pendingCount = leaveRequests.filter(r => r.status === 'pending').length;

  const calcDays = () => {
    if (!form.start_date || !form.end_date) return 0;
    return Math.max(0, differenceInDays(new Date(form.end_date), new Date(form.start_date)) + 1);
  };

  const handleApprove = async (request) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('leave_requests').update({
        status: 'approved',
        approved_by: user.email,
        approved_date: new Date().toISOString(),
        approved_by_name: user.full_name,
      });

      // Auto-update leave balance
      const balance = leaveBalances.find(b => b.employee_id === request.employee_id && b.leave_type_id === request.leave_type_id);
      if (balance) {
        await tenantQuery('leave_balances').update({
          used_days: (balance.used_days || 0) + (request.total_days || 0),
          pending_days: Math.max(0, (balance.pending_days || 0) - (request.total_days || 0)),
        });
      }

      // Auto-update employee attendance
      await tenantQuery('employee_attendances').insert({
        employee_id: request.employee_id,
        employee_name: request.employee_name,
        date: request.start_date,
        status: 'on_leave',
        leave_request_id: request.id,
        leave_type: request.leave_type_name,
      });

      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['leaveBalances'] });
      toast.success(isRTL ? 'تم اعتماد الإجازة' : 'Leave approved');
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error');
    }
  };

  const handleReject = async (request) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('leave_requests').update({
        status: 'rejected',
        rejected_by: user.email,
        rejected_date: new Date().toISOString(),
      });
      // Return pending days to balance
      const balance = leaveBalances.find(b => b.employee_id === request.employee_id && b.leave_type_id === request.leave_type_id);
      if (balance) {
        await tenantQuery('leave_balances').update({
          pending_days: Math.max(0, (balance.pending_days || 0) - (request.total_days || 0)),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['leaveBalances'] });
      toast.success(isRTL ? 'تم رفض الإجازة' : 'Leave rejected');
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error');
    }
  };

  const handleCreate = async () => {
    if (!form.employee_id || !form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === form.employee_id);
      const lt = leaveTypes.find(t => t.id === form.leave_type_id);
      const days = calcDays();
      const tid = getTenantIdForCreate();
      await tenantQuery('leave_requests').insert({
        ...(tid && { tenant_id: tid }),
        employee_id: form.employee_id,
        employee_name: emp?.name_ar,
        department_id: emp?.department_id,
        branch_id: emp?.branch_id || selectedBranchId,
        leave_type_id: form.leave_type_id,
        leave_type_name: lt?.name_ar,
        start_date: form.start_date,
        end_date: form.end_date,
        total_days: days,
        reason: form.reason,
        status: 'pending',
        submitted_date: new Date().toISOString(),
        request_number: `LR-${Date.now().toString(36).toUpperCase()}`,
      });

      // Reserve balance
      const balance = leaveBalances.find(b => b.employee_id === form.employee_id && b.leave_type_id === form.leave_type_id);
      if (balance) {
        await tenantQuery('leave_balances').update({ pending_days: (balance.pending_days || 0) + days });
      }

      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      queryClient.invalidateQueries({ queryKey: ['leaveBalances'] });
      setShowNewRequest(false);
      setForm({ employee_id: '', leave_type_id: '', start_date: '', end_date: '', reason: '' });
      toast.success(isRTL ? 'تم تقديم طلب الإجازة' : 'Leave request submitted');
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">{isRTL ? 'إدارة الإجازات' : 'Leave Management'}</h2>
          {pendingCount > 0 && (
            <p className="text-sm text-amber-600">{pendingCount} {isRTL ? 'طلب بانتظار الاعتماد' : 'requests pending approval'}</p>
          )}
        </div>
        <Button onClick={() => setShowNewRequest(true)} className="gap-1">
          <Plus className="w-4 h-4" />
          {isRTL ? 'طلب إجازة' : 'New Request'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="pending" className="relative">
            {isRTL ? 'معلق' : 'Pending'}
            {pendingCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="approved">{isRTL ? 'مقبول' : 'Approved'}</TabsTrigger>
          <TabsTrigger value="rejected">{isRTL ? 'مرفوض' : 'Rejected'}</TabsTrigger>
          <TabsTrigger value="all">{isRTL ? 'الكل' : 'All'}</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Calendar className="w-10 h-10 mb-2" />
              <p className="text-sm">{isRTL ? 'لا توجد طلبات' : 'No requests'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRequests.map(req => {
                return (
                  <Card key={req.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-slate-800">{req.employee_name}</p>
                            <Badge className={LEAVE_STATUS_COLORS[req.status] || 'bg-slate-100 text-slate-600'}>
                              {req.status === 'pending' ? (isRTL ? 'معلق' : 'Pending') :
                               req.status === 'approved' ? (isRTL ? 'مقبول' : 'Approved') :
                               req.status === 'rejected' ? (isRTL ? 'مرفوض' : 'Rejected') : req.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-blue-600 font-medium">{req.leave_type_name}</p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {req.start_date && format(new Date(req.start_date), 'dd/MM/yyyy')} → {req.end_date && format(new Date(req.end_date), 'dd/MM/yyyy')}
                            <span className="mx-2">•</span>
                            <strong>{req.total_days}</strong> {isRTL ? 'يوم' : 'days'}
                          </p>
                          {req.reason && <p className="text-sm text-slate-400 mt-1 truncate">{req.reason}</p>}
                        </div>
                        {req.status === 'pending' && viewMode === 'hr' && (
                          <div className="flex gap-2 flex-shrink-0">
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => handleApprove(req)}>
                              <CheckCircle className="w-4 h-4" />
                              {isRTL ? 'اعتماد' : 'Approve'}
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 gap-1" onClick={() => handleReject(req)}>
                              <XCircle className="w-4 h-4" />
                              {isRTL ? 'رفض' : 'Reject'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Request Dialog */}
      <Dialog open={showNewRequest} onOpenChange={setShowNewRequest}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'طلب إجازة جديد' : 'New Leave Request'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الموظف' : 'Select employee'} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar} ({e.employee_id})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'نوع الإجازة' : 'Leave Type'} *</Label>
              <Select value={form.leave_type_id} onValueChange={v => setForm(p => ({ ...p, leave_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر النوع' : 'Select type'} /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'من تاريخ' : 'From'} *</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'إلى تاريخ' : 'To'} *</Label>
                <Input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            {calcDays() > 0 && (
              <div className="bg-blue-50 rounded-lg p-2 text-sm text-blue-700 text-center">
                {isRTL ? `الأيام المطلوبة: ${calcDays()} يوم` : `Days requested: ${calcDays()} days`}
              </div>
            )}
            <div className="space-y-2">
              <Label>{isRTL ? 'السبب' : 'Reason'}</Label>
              <Textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewRequest(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إرسال الطلب' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}