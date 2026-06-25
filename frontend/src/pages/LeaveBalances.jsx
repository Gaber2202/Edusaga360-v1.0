import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { Search, Edit2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function LeaveBalances() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId: _selectedBranchId, filterByBranch: _filterByBranch } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [search, setSearch] = useState('');
  const [showAdjustment, setShowAdjustment] = useState(null);
  const [adjustmentDays, setAdjustmentDays] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: balances = [], isLoading: loadingBalances } = useQuery({
    queryKey: ['leaveBalances', tenantId],
    queryFn: () => fetchData(tenantQuery('leave_balances').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const isLoading = loadingBalances || loadingEmployees;

  const searchTerm = search.trim().toLowerCase();

  // Build enriched rows: one per employee × leave type (from balances), 
  // but also show employees that have no balance record yet
  const enrichedRows = balances.map(b => {
    const emp = employees.find(e => e.id === b.employee_id);
    return { ...b, _emp: emp };
  });

  const filteredBalances = enrichedRows.filter(row => {
    if (!searchTerm) return true;
    const emp = row._emp;
    if (!emp) return false;
    return (
      emp.name_ar?.includes(search.trim()) ||
      emp.name_en?.toLowerCase().includes(searchTerm) ||
      emp.employee_id?.toLowerCase().includes(searchTerm)
    );
  });

  const handleAdjustment = async () => {
    if (!adjustmentDays || !adjustmentReason) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }

    setSaving(true);
    try {
      const balance = showAdjustment;
      const newValue = parseFloat(balance.remaining_days) + parseFloat(adjustmentDays);

      await tenantQuery('leave_balances').update({
        remaining_days: newValue,
        last_updated: new Date().toISOString()
      });

      const tid = getTenantIdForCreate();
      await tenantQuery('leave_balance_audits').insert({
        ...(tid && { tenant_id: tid }),
        leave_balance_id: balance.id,
        employee_id: balance.employee_id,
        leave_type_id: balance.leave_type_id,
        action: 'manual_adjustment',
        old_value: balance.remaining_days,
        new_value: newValue,
        reason: adjustmentReason,
        changed_by: 'admin', // Current user
        timestamp: new Date().toISOString()
      });

      await queryClient.invalidateQueries({ queryKey: ['leaveBalances'] });
      setShowAdjustment(null);
      setAdjustmentDays('');
      setAdjustmentReason('');
      toast.success(isRTL ? 'تم التعديل بنجاح' : 'Adjusted successfully');
    } catch (error) {
      toast.error(error.message || (isRTL ? 'خطأ' : 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      header: isRTL ? 'الموظف' : 'Employee',
      cell: (row) => {
        const emp = row._emp;
        if (!emp) return <span className="text-slate-400 text-xs">{row.employee_id || '-'}</span>;
        return (
          <div>
            <p className="font-medium">{isRTL ? (emp.name_ar || emp.name_en) : (emp.name_en || emp.name_ar)}</p>
            {emp.name_en && emp.name_ar && <p className="text-xs text-slate-400">{isRTL ? emp.name_en : emp.name_ar}</p>}
          </div>
        );
      }
    },
    {
      header: isRTL ? 'نوع الإجازة' : 'Leave Type',
      cell: (row) => <span className="text-sm">{isRTL ? (row.leave_type_name_ar || row.leave_type_name_en) : (row.leave_type_name_en || row.leave_type_name_ar)}</span>
    },
    {
      header: isRTL ? 'الاستحقاق' : 'Entitlement',
      cell: (row) => <span className="font-semibold">{row.entitlement_days}</span>
    },
    {
      header: isRTL ? 'المستخدم' : 'Used',
      cell: (row) => <span className="text-red-600">{row.used_days}</span>
    },
    {
      header: isRTL ? 'قيد الانتظار' : 'Pending',
      cell: (row) => <span className="text-yellow-600">{row.pending_days}</span>
    },
    {
      header: isRTL ? 'المتبقي' : 'Remaining',
      cell: (row) => (
        <span className={`font-bold ${parseFloat(row.remaining_days) > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {row.remaining_days}
        </span>
      )
    },
    {
      header: t('actions'),
      cell: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setShowAdjustment(row)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'رصيد الإجازات' : 'Leave Balances'}
        subtitle={isRTL ? 'عرض والتحكم في أرصدة الإجازات' : 'View and manage employee leave balances'}
      />

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input
          placeholder={isRTL ? 'بحث عن موظف...' : 'Search employee...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
        />
      </div>

      {employees.length === 0 && !loadingEmployees && (
        <div className="text-center py-6 text-slate-400 text-sm border border-dashed rounded-lg">
          {isRTL ? 'لا يوجد موظفون. يرجى إضافة موظفين أولاً.' : 'No employees found. Please add employees first.'}
        </div>
      )}
      {employees.length > 0 && filteredBalances.length === 0 && !isLoading && searchTerm && (
        <div className="text-center py-6 text-slate-400 text-sm border border-dashed rounded-lg">
          {isRTL ? `لا نتائج لـ "${search}"` : `No results for "${search}"`}
        </div>
      )}
      {(employees.length > 0 || isLoading) && (
        <DataTable columns={columns} data={filteredBalances} loading={isLoading} emptyMessage={isRTL ? 'لا توجد أرصدة إجازات مسجلة' : 'No leave balance records found'} />
      )}

      {/* Adjustment Dialog */}
      {showAdjustment && (
        <Dialog open={!!showAdjustment} onOpenChange={() => setShowAdjustment(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isRTL ? 'تعديل الرصيد' : 'Adjust Balance'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Card className="bg-slate-50">
                <CardContent className="pt-4 text-sm">
                  <p><span className="text-slate-600">{isRTL ? 'نوع الإجازة' : 'Leave Type'}:</span> <span className="font-medium">{showAdjustment.leave_type_name_ar}</span></p>
                  <p><span className="text-slate-600">{isRTL ? 'الرصيد الحالي' : 'Current Balance'}:</span> <span className="font-semibold text-green-600">{showAdjustment.remaining_days}</span></p>
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Label>{isRTL ? 'عدد الأيام' : 'Days'} (+/-)</Label>
                <Input
                  type="number"
                  value={adjustmentDays}
                  onChange={(e) => setAdjustmentDays(e.target.value)}
                  placeholder={isRTL ? 'مثلاً: 2 أو -1' : 'e.g. 2 or -1'}
                />
              </div>

              <div className="space-y-2">
                <Label>{isRTL ? 'السبب' : 'Reason'} *</Label>
                <Input
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder={isRTL ? 'مثلاً: تصحيح خطأ' : 'e.g. Correction'}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdjustment(null)}>{t('cancel')}</Button>
              <Button onClick={handleAdjustment} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {t('save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}