import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Check, X, Loader2, Edit2, Trash2, AlertCircle } from 'lucide-react';
import YamenHRInsights from '../components/hr/YamenHRInsights';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { calculateDeductibleDays, canApplyUnpaidLeave, calculateBalanceAfter } from '../components/leaves/leaveCalculationUtils';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { fireEvent } from '../lib/integrationBus';

export default function Leaves() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [validationWarning, setValidationWarning] = useState('');

  const [formData, setFormData] = useState({
    employee_id: '',
    leave_type_id: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    is_unpaid_leave: false
  });

  const { data: leaves = [], isLoading } = useQuery({
    queryKey: ['leaveRequests', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('leave_requests').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leaveTypes', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_types').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ['holidays', tenantId],
    queryFn: () => fetchData(tenantQuery('holidays').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: leaveBalances = [] } = useQuery({
    queryKey: ['leaveBalances', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_balances').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredLeaves = filterByBranch(leaves).filter(l => 
    statusFilter === 'all' || l.status === statusFilter
  );

  const getEmployeeLeaveBalance = (employeeId, leaveTypeId) => {
    return leaveBalances.find(lb => lb.employee_id === employeeId && lb.leave_type_id === leaveTypeId);
  };

  const handleSubmit = async () => {
    if (!formData.employee_id || !formData.leave_type_id || !formData.start_date || !formData.end_date) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    setSaving(true);
    try {
      const employee = employees.find(e => e.id === formData.employee_id);
      const leaveType = leaveTypes.find(lt => lt.id === formData.leave_type_id);
      const leaveBalance = getEmployeeLeaveBalance(formData.employee_id, formData.leave_type_id);
      
      const { deductibleDays, overlappingHolidays, totalDays } = calculateDeductibleDays(
        formData.start_date, 
        formData.end_date, 
        holidays
      );

      const currentBalance = leaveBalance?.remaining_days || 0;
      const needsUnpaid = canApplyUnpaidLeave(deductibleDays, currentBalance) && !formData.is_unpaid_leave;

      if (needsUnpaid && !formData.is_unpaid_leave) {
        setValidationWarning(isRTL 
          ? `الرصيد المتاح: ${currentBalance} أيام، الأيام المطلوبة: ${deductibleDays} أيام` 
          : `Available balance: ${currentBalance} days, Requested: ${deductibleDays} days`
        );
        setSaving(false);
        return;
      }

      const data = {
        ...formData,
        request_number: editingLeave ? editingLeave.request_number : `LVR-${Date.now().toString(36).toUpperCase()}`,
        employee_name: employee?.name_ar,
        branch_id: selectedBranchId || employee?.branch_id,
        department_id: employee?.department_id,
        leave_type_name: leaveType?.name_ar,
        total_days: totalDays,
        deductible_days: deductibleDays,
        overlapping_holidays: overlappingHolidays,
        current_balance: currentBalance,
        balance_after: calculateBalanceAfter(currentBalance, deductibleDays, formData.is_unpaid_leave),
        status: editingLeave ? 'edited' : 'pending'
      };

      if (editingLeave) {
        await tenantQuery('leave_requests').update(data);
        await logAuditEvent({ 
          action: 'EDIT', 
          entityType: 'LeaveRequest', 
          entityId: editingLeave.id, 
          oldValues: editingLeave,
          newValues: data 
        });
      } else {
        const created = await tenantQuery('leave_requests').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'LeaveRequest', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      setShowForm(false);
      setEditingLeave(null);
      setValidationWarning('');
      resetForm();
      toast.success(isRTL ? 'تم بنجاح' : 'Success');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (leave) => {
    setEditingLeave(leave);
    setFormData({
      employee_id: leave.employee_id,
      leave_type_id: leave.leave_type_id,
      start_date: leave.start_date,
      end_date: leave.end_date,
      reason: leave.reason || '',
      is_unpaid_leave: leave.is_unpaid_leave || false
    });
    setShowForm(true);
  };

  const handleCancel = async (leave) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('leave_requests').update({ 
        status: 'cancelled',
        cancelled_by: user?.email || '',
        cancelled_date: new Date().toISOString()
      });
      await logAuditEvent({ action: 'CANCEL', entityType: 'LeaveRequest', entityId: leave.id });
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      toast.success(isRTL ? 'تم الإلغاء' : 'Cancelled');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handleApprove = async (leave, role) => {
    try {
      const isFinalApproval = role === 'hr';
      const updates = role === 'manager' 
        ? { manager_action: 'approved', manager_action_date: new Date().toISOString(), status: 'manager_approved' }
        : { hr_action: 'approved', hr_action_date: new Date().toISOString(), status: 'approved' };
      
      await tenantQuery('leave_requests').update(updates);
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'LeaveRequest', entityId: leave.id, newValues: updates });
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      toast.success(isRTL ? 'تم الاعتماد' : 'Approved');

      // 🔌 Integration Bus: notify employee on final HR approval
      if (isFinalApproval) {
        const emp = employees.find(e => e.id === leave.employee_id);
        fireEvent('leave_approved', {
          tenant_id: leave.tenant_id,
          employee_id: leave.employee_id,
          employee_name: leave.employee_name,
          employee_phone: emp?.phone || emp?.whatsapp_number || '',
          employee_email: emp?.email || '',
          start_date: leave.start_date,
          end_date: leave.end_date,
          leave_type: leave.leave_type_name,
        }, { sourceModule: 'HR', tenantId: leave.tenant_id });
      }
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handleReject = async (leave, role) => {
    try {
      const updates = role === 'manager'
        ? { manager_action: 'rejected', manager_action_date: new Date().toISOString(), status: 'rejected' }
        : { hr_action: 'rejected', hr_action_date: new Date().toISOString(), status: 'rejected' };

      await tenantQuery('leave_requests').update(updates);
      await logAuditEvent({ action: AuditActions.REJECT, entityType: 'LeaveRequest', entityId: leave.id, newValues: updates });
      queryClient.invalidateQueries({ queryKey: ['leaveRequests'] });
      toast.success(isRTL ? 'تم الرفض' : 'Rejected');

      // 🔌 Integration Bus: notify employee
      const emp = employees.find(e => e.id === leave.employee_id);
      fireEvent('leave_rejected', {
        tenant_id: leave.tenant_id,
        employee_id: leave.employee_id,
        employee_name: leave.employee_name,
        employee_phone: emp?.phone || emp?.whatsapp_number || '',
        reason: 'Rejected by management',
      }, { sourceModule: 'HR', tenantId: leave.tenant_id });
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '', 
      leave_type_id: '', 
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(new Date(), 'yyyy-MM-dd'), 
      reason: '',
      is_unpaid_leave: false
    });
    setValidationWarning('');
  };

  const columns = [
    { header: isRTL ? 'رقم الطلب' : 'Request #', cell: (row) => <span className="font-mono text-sm">{row.request_number}</span> },
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: isRTL ? 'نوع الإجازة' : 'Leave Type', accessorKey: 'leave_type_name' },
    { header: isRTL ? 'من - إلى' : 'Period', cell: (row) => `${format(new Date(row.start_date), 'dd/MM')} - ${format(new Date(row.end_date), 'dd/MM')}` },
    { header: isRTL ? 'الأيام' : 'Days', accessorKey: 'total_days' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {row.status === 'pending' || row.status === 'edited' ? (
          <>
            {row.status === 'pending' && (
              <>
                <Button size="sm" variant="ghost" onClick={() => handleApprove(row, 'manager')} className="text-emerald-600">
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleReject(row, 'manager')} className="text-red-600">
                  <X className="w-4 h-4" />
                </Button>
              </>
            )}
            {row.status === 'edited' && (
              <Button size="sm" variant="ghost" onClick={() => handleEdit(row)} className="text-blue-600">
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => handleCancel(row)} className="text-orange-600">
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        ) : row.status === 'manager_approved' ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => handleApprove(row, 'hr')} className="text-emerald-600">
              {isRTL ? 'اعتماد HR' : 'HR Approve'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleReject(row, 'hr')} className="text-red-600">
              <X className="w-4 h-4" />
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => handleCancel(row)} className="text-orange-600">
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'طلبات الإجازات' : 'Leave Requests'}
        subtitle={isRTL ? 'إدارة طلبات الإجازات والموافقات' : 'Manage leave requests and approvals'}
        action
        actionLabel={isRTL ? 'طلب جديد' : 'New Request'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="pending">{t('pending')}</TabsTrigger>
          <TabsTrigger value="manager_approved">{isRTL ? 'معتمد من المدير' : 'Manager Approved'}</TabsTrigger>
          <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
          <TabsTrigger value="rejected">{t('rejected')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable columns={columns} data={filteredLeaves} loading={isLoading} emptyMessage={t('noData')} />

      {/* Yamen AI */}
      <YamenHRInsights
        module="leaves"
        data={{
          total: leaves.length,
          pending: leaves.filter(l => l.status === 'pending').length,
          approved: leaves.filter(l => l.status === 'approved').length,
          rejected: leaves.filter(l => l.status === 'rejected').length,
          byType: leaveTypes.reduce((acc, lt) => { acc[lt.name_ar] = leaves.filter(l => l.leave_type_id === lt.id).length; return acc; }, {})
        }}
        isRTL={isRTL}
      />

      {/* Leave Request Form */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setEditingLeave(null); resetForm(); } setShowForm(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLeave ? (isRTL ? 'تعديل الطلب' : 'Edit Request') : (isRTL ? 'طلب إجازة جديد' : 'New Leave Request')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {validationWarning && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">{isRTL ? 'تنبيه' : 'Warning'}</p>
                  <p className="text-sm text-amber-700">{validationWarning}</p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <Checkbox 
                      checked={formData.is_unpaid_leave}
                      onCheckedChange={(checked) => setFormData(p => ({...p, is_unpaid_leave: checked}))}
                    />
                    <span className="text-sm text-amber-700">{isRTL ? 'طلب إجازة بدون راتب' : 'Request Unpaid Leave'}</span>
                  </label>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select value={formData.employee_id} onValueChange={(v) => setFormData(p => ({...p, employee_id: v}))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'نوع الإجازة' : 'Leave Type'} *</Label>
              <Select value={formData.leave_type_id} onValueChange={(v) => setFormData(p => ({...p, leave_type_id: v}))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map(lt => <SelectItem key={lt.id} value={lt.id}>{lt.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'من تاريخ' : 'Start Date'} *</Label>
                <Input type="date" value={formData.start_date} onChange={(e) => setFormData(p => ({...p, start_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'إلى تاريخ' : 'End Date'} *</Label>
                <Input type="date" value={formData.end_date} onChange={(e) => setFormData(p => ({...p, end_date: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'السبب' : 'Reason'}</Label>
              <Textarea value={formData.reason} onChange={(e) => setFormData(p => ({...p, reason: e.target.value}))} rows={3} />
            </div>
            {formData.start_date && formData.end_date && (
              <div className="bg-slate-50 p-3 rounded-lg space-y-2">
                {(() => {
                  const leaveBalance = getEmployeeLeaveBalance(formData.employee_id, formData.leave_type_id);
                  const { deductibleDays, overlappingHolidays } = calculateDeductibleDays(formData.start_date, formData.end_date, holidays);
                  const totalDays = differenceInDays(new Date(formData.end_date), new Date(formData.start_date)) + 1;
                  const balanceAfter = calculateBalanceAfter(leaveBalance?.remaining_days || 0, deductibleDays, formData.is_unpaid_leave);

                  return (
                    <>
                      <p className="text-sm"><span className="font-medium">{isRTL ? 'إجمالي الأيام:' : 'Total Days:'}</span> {totalDays}</p>
                      <p className="text-sm"><span className="font-medium">{isRTL ? 'الأيام المخصومة:' : 'Deductible Days:'}</span> {deductibleDays}</p>
                      {overlappingHolidays.length > 0 && (
                        <p className="text-sm text-blue-600"><span className="font-medium">{isRTL ? 'أيام عطل رسمية:' : 'Holidays:'}</span> {overlappingHolidays.length}</p>
                      )}
                      <p className="text-sm"><span className="font-medium">{isRTL ? 'الرصيد الحالي:' : 'Current Balance:'}</span> {leaveBalance?.remaining_days || 0}</p>
                      <p className={`text-sm font-medium ${balanceAfter < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isRTL ? 'الرصيد بعد الإجازة:' : 'Balance After:'} {balanceAfter}
                      </p>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تقديم الطلب' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}