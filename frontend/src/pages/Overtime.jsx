import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Check, Loader2 } from 'lucide-react';
import YamenHRInsights from '../components/hr/YamenHRInsights';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Overtime() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    employee_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '17:00',
    end_time: '20:00',
    total_hours: 3,
    reason: '',
    compensation_type: 'cash',
    hourly_rate: 0
  });

  const { data: overtimeRequests = [], isLoading } = useQuery({
    queryKey: ['overtimeRequests', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('overtime_requests').select('*').match(tenantFilter(branchFilter()), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const filteredOvertimes = filterByBranch(overtimeRequests).filter(ot => 
    statusFilter === 'all' || ot.status === statusFilter
  );

  const calculateAmount = () => {
    return formData.total_hours * formData.hourly_rate * 1.5;
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const employee = employees.find(e => e.id === formData.employee_id);
      const calculatedAmount = calculateAmount();

      const tid = getTenantIdForCreate();
      const data = {
        ...formData,
        ...(tid && { tenant_id: tid }),
        request_number: `OT-${Date.now().toString(36).toUpperCase()}`,
        employee_name: employee?.name_ar,
        branch_id: selectedBranchId || employee?.branch_id,
        department_id: employee?.department_id,
        calculated_amount: calculatedAmount,
        overtime_rate_multiplier: 1.5,
        status: 'pending'
      };

      const created = await tenantQuery('overtime_requests').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'OvertimeRequest', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['overtimeRequests'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم تقديم الطلب بنجاح' : 'Request submitted successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (ot, role) => {
    try {
      let updates = {};
      if (role === 'manager') {
        updates = { manager_action: 'approved', manager_action_date: new Date().toISOString(), status: 'manager_approved' };
      } else if (role === 'hr') {
        updates = { hr_action: 'approved', hr_action_date: new Date().toISOString(), status: 'hr_approved' };
      } else if (role === 'finance') {
        updates = { finance_action: 'approved', finance_action_date: new Date().toISOString(), status: 'approved' };
      }

      await tenantQuery('overtime_requests').update(updates);
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'OvertimeRequest', entityId: ot.id, newValues: updates });
      queryClient.invalidateQueries({ queryKey: ['overtimeRequests'] });
      toast.success(isRTL ? 'تم الاعتماد' : 'Approved');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const resetForm = () => {
    setFormData({
      employee_id: '', date: format(new Date(), 'yyyy-MM-dd'), start_time: '17:00', end_time: '20:00',
      total_hours: 3, reason: '', compensation_type: 'cash', hourly_rate: 0
    });
  };

  const columns = [
    { header: isRTL ? 'رقم الطلب' : 'Request #', cell: (row) => <span className="font-mono text-sm">{row.request_number}</span> },
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: t('date'), cell: (row) => format(new Date(row.date), 'dd/MM/yyyy') },
    { header: isRTL ? 'الساعات' : 'Hours', accessorKey: 'total_hours' },
    { header: isRTL ? 'المبلغ المحسوب' : 'Amount', cell: (row) => `${row.calculated_amount?.toLocaleString()} ${t('sar')}` },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {row.status === 'pending' && (
          <>
            <Button size="sm" variant="ghost" onClick={() => handleApprove(row, 'manager')} className="text-emerald-600"><Check className="w-4 h-4" /></Button>
          </>
        )}
        {row.status === 'manager_approved' && (
          <Button size="sm" variant="ghost" onClick={() => handleApprove(row, 'hr')} className="text-emerald-600">{isRTL ? 'HR' : 'HR'}</Button>
        )}
        {row.status === 'hr_approved' && (
          <Button size="sm" variant="ghost" onClick={() => handleApprove(row, 'finance')} className="text-emerald-600">{isRTL ? 'مالية' : 'Finance'}</Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'العمل الإضافي' : 'Overtime'}
        subtitle={isRTL ? 'إدارة طلبات العمل الإضافي والموافقات' : 'Manage overtime requests and approvals'}
        action
        actionLabel={isRTL ? 'طلب جديد' : 'New Request'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="pending">{t('pending')}</TabsTrigger>
          <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
          <TabsTrigger value="paid">{t('paid')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable columns={columns} data={filteredOvertimes} loading={isLoading} emptyMessage={t('noData')} />

      {/* Yamen AI */}
      <YamenHRInsights
        module="overtime"
        data={{
          total: overtimeRequests.length,
          pending: overtimeRequests.filter(o => o.status === 'pending').length,
          hours: overtimeRequests.reduce((s, o) => s + (o.total_hours || 0), 0),
          cost: overtimeRequests.reduce((s, o) => s + (o.calculated_amount || 0), 0),
          excessive: Object.values(overtimeRequests.reduce((acc, o) => { acc[o.employee_id] = (acc[o.employee_id] || 0) + (o.total_hours || 0); return acc; }, {})).filter(h => h >= 10).length
        }}
        isRTL={isRTL}
      />

      {/* Overtime Request Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'طلب عمل إضافي' : 'Overtime Request'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              <Label>{t('date')} *</Label>
              <Input type="date" value={formData.date} onChange={(e) => setFormData(p => ({...p, date: e.target.value}))} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'من' : 'Start'}</Label>
                <Input type="time" value={formData.start_time} onChange={(e) => setFormData(p => ({...p, start_time: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'إلى' : 'End'}</Label>
                <Input type="time" value={formData.end_time} onChange={(e) => setFormData(p => ({...p, end_time: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الساعات' : 'Hours'}</Label>
                <Input type="number" step="0.5" value={formData.total_hours} onChange={(e) => setFormData(p => ({...p, total_hours: parseFloat(e.target.value) || 0}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الأجر الساعي' : 'Hourly Rate'}</Label>
                <Input type="number" value={formData.hourly_rate} onChange={(e) => setFormData(p => ({...p, hourly_rate: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع التعويض' : 'Compensation'}</Label>
                <Select value={formData.compensation_type} onValueChange={(v) => setFormData(p => ({...p, compensation_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{isRTL ? 'نقدي (150%)' : 'Cash (150%)'}</SelectItem>
                    <SelectItem value="comp_leave">{isRTL ? 'إجازة تعويضية' : 'Comp Leave'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.compensation_type === 'cash' && formData.hourly_rate > 0 && (
              <div className="bg-emerald-50 p-3 rounded-lg">
                <p className="text-sm"><span className="font-medium">{isRTL ? 'المبلغ المحسوب (150%):' : 'Calculated (150%):'}</span> {calculateAmount().toLocaleString()} {t('sar')}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>{isRTL ? 'السبب' : 'Reason'}</Label>
              <Textarea value={formData.reason} onChange={(e) => setFormData(p => ({...p, reason: e.target.value}))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSubmit} disabled={saving || !formData.employee_id}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تقديم الطلب' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}