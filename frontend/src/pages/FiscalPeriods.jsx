import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { Plus, Lock, Unlock, Calendar, Loader2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function FiscalPeriods() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    period_name: '',
    fiscal_year: new Date().getFullYear().toString(),
    start_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end_date: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['fiscalPeriods', tenantId],
    queryFn: () => fetchData(tenantQuery('fiscal_periods').select('*').match(tenantFilter()).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = {
        ...formData,
        branch_id: selectedBranchId,
        status: 'open',
        ...(tid && { tenant_id: tid })
      };

      const created = await tenantQuery('fiscal_periods').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'FiscalPeriod', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['fiscalPeriods'] });
      setShowForm(false);
      toast.success(isRTL ? 'تم إنشاء الفترة بنجاح' : 'Period created successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async (period) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('fiscal_periods').update({
        status: 'closed',
        closed_by: user?.email,
        closed_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: 'CLOSE', entityType: 'FiscalPeriod', entityId: period.id });
      queryClient.invalidateQueries({ queryKey: ['fiscalPeriods'] });
      toast.success(isRTL ? 'تم إغلاق الفترة' : 'Period closed');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    }
  };

  const handleReopen = async (period) => {
    try {
      await tenantQuery('fiscal_periods').update({
        status: 'open',
        closed_by: null,
        closed_date: null
      });
      await logAuditEvent({ action: 'REOPEN', entityType: 'FiscalPeriod', entityId: period.id });
      queryClient.invalidateQueries({ queryKey: ['fiscalPeriods'] });
      toast.success(isRTL ? 'تم إعادة فتح الفترة' : 'Period reopened');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    }
  };

  const generateMonthlyPeriods = async () => {
    setSaving(true);
    try {
      const year = new Date().getFullYear();
      const periodsToCreate = [];
      
      const tid = getTenantIdForCreate();
      for (let month = 0; month < 12; month++) {
        const date = new Date(year, month, 1);
        periodsToCreate.push({
          period_name: format(date, 'MMMM yyyy'),
          fiscal_year: year.toString(),
          start_date: format(startOfMonth(date), 'yyyy-MM-dd'),
          end_date: format(endOfMonth(date), 'yyyy-MM-dd'),
          branch_id: selectedBranchId,
          status: month <= new Date().getMonth() ? 'open' : 'future',
          ...(tid && { tenant_id: tid })
        });
      }

      await supabase.FiscalPeriod.bulkCreate(periodsToCreate);
      queryClient.invalidateQueries({ queryKey: ['fiscalPeriods'] });
      toast.success(isRTL ? 'تم إنشاء الفترات الشهرية' : 'Monthly periods created');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: isRTL ? 'اسم الفترة' : 'Period Name', accessorKey: 'period_name' },
    { header: isRTL ? 'السنة المالية' : 'Fiscal Year', accessorKey: 'fiscal_year' },
    { header: isRTL ? 'من تاريخ' : 'Start Date', cell: (row) => format(new Date(row.start_date), 'dd/MM/yyyy') },
    { header: isRTL ? 'إلى تاريخ' : 'End Date', cell: (row) => format(new Date(row.end_date), 'dd/MM/yyyy') },
    { header: t('status'), cell: (row) => {
      const colors = { open: 'bg-emerald-100 text-emerald-700', closed: 'bg-red-100 text-red-700', future: 'bg-slate-100 text-slate-700' };
      const labels = { open: isRTL ? 'مفتوحة' : 'Open', closed: isRTL ? 'مغلقة' : 'Closed', future: isRTL ? 'مستقبلية' : 'Future' };
      return <Badge className={colors[row.status]}>{labels[row.status]}</Badge>;
    }},
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {row.status === 'open' && (
          <Button size="sm" variant="ghost" onClick={() => handleClose(row)} className="text-red-600">
            <Lock className="w-4 h-4 me-1" /> {isRTL ? 'إغلاق' : 'Close'}
          </Button>
        )}
        {row.status === 'closed' && (
          <Button size="sm" variant="ghost" onClick={() => handleReopen(row)} className="text-emerald-600">
            <Unlock className="w-4 h-4 me-1" /> {isRTL ? 'إعادة فتح' : 'Reopen'}
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'الفترات المالية' : 'Fiscal Periods'}
        subtitle={isRTL ? 'إدارة الفترات المحاسبية' : 'Manage accounting periods'}
        action
        actionLabel={isRTL ? 'إضافة فترة' : 'Add Period'}
        actionIcon={Plus}
        onAction={() => setShowForm(true)}
      >
        <Button variant="outline" onClick={generateMonthlyPeriods} disabled={saving} className="gap-2">
          <Calendar className="w-4 h-4" />
          {isRTL ? 'إنشاء فترات شهرية' : 'Generate Monthly'}
        </Button>
      </PageHeader>

      <DataTable columns={columns} data={periods} loading={isLoading} emptyMessage={t('noData')} />

      {/* Period Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إضافة فترة مالية' : 'Add Fiscal Period'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'اسم الفترة' : 'Period Name'} *</Label>
              <Input value={formData.period_name} onChange={(e) => setFormData(p => ({...p, period_name: e.target.value}))} placeholder={isRTL ? 'مثال: يناير 2024' : 'e.g., January 2024'} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'السنة المالية' : 'Fiscal Year'}</Label>
              <Input value={formData.fiscal_year} onChange={(e) => setFormData(p => ({...p, fiscal_year: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'من تاريخ' : 'Start Date'}</Label>
                <Input type="date" value={formData.start_date} onChange={(e) => setFormData(p => ({...p, start_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'إلى تاريخ' : 'End Date'}</Label>
                <Input type="date" value={formData.end_date} onChange={(e) => setFormData(p => ({...p, end_date: e.target.value}))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}