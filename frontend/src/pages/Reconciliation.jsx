import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { getCurrencySymbol } from '../lib/localization';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Checkbox } from '../components/ui/checkbox';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { CheckCircle, AlertCircle, RefreshCw, Loader2, FileCheck } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { useTenant } from '../components/TenantContext';

export default function Reconciliation() {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [saving, setSaving] = useState(false);
  const [reconcileDate, setReconcileDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('payments').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: _reconciliations = [] } = useQuery({
    queryKey: ['reconciliations', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('payment_reconciliations').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const filteredPayments = filterByBranch(payments).filter(p => {
    const matchesStatus = statusFilter === 'all' || p.reconciliation_status === statusFilter;
    return matchesStatus;
  });

  // Stats
  const stats = React.useMemo(() => {
    const branchPayments = filterByBranch(payments);
    const total = branchPayments.length;
    const matched = branchPayments.filter(p => p.reconciliation_status === 'matched').length;
    const pending = branchPayments.filter(p => p.reconciliation_status === 'pending' || !p.reconciliation_status).length;
    const exceptions = branchPayments.filter(p => p.reconciliation_status === 'exception').length;
    const totalAmount = branchPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const reconciledAmount = branchPayments.filter(p => p.reconciliation_status === 'matched').reduce((sum, p) => sum + (p.amount || 0), 0);
    
    return { total, matched, pending, exceptions, totalAmount, reconciledAmount };
  }, [payments, filterByBranch]);

  const togglePaymentSelection = (paymentId) => {
    setSelectedPayments(prev => 
      prev.includes(paymentId) 
        ? prev.filter(id => id !== paymentId) 
        : [...prev, paymentId]
    );
  };

  const selectAllPending = () => {
    const pendingIds = filteredPayments
      .filter(p => p.reconciliation_status === 'pending' || !p.reconciliation_status)
      .map(p => p.id);
    setSelectedPayments(pendingIds);
  };

  const handleReconcile = async () => {
    if (selectedPayments.length === 0) {
      toast.error(isRTL ? 'يرجى اختيار دفعات للتسوية' : 'Please select payments to reconcile');
      return;
    }

    setSaving(true);
    try {
      const reconciliationNumber = `REC-${Date.now().toString(36).toUpperCase()}`;
      
      // Get selected payment details
      const selectedPaymentData = payments.filter(p => selectedPayments.includes(p.id));
      const totalAmount = selectedPaymentData.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Create reconciliation record first
      const tid = getTenantIdForCreate();
      const reconciliation = await tenantQuery('payment_reconciliations').insert({
        ...(tid && { tenant_id: tid }),
        reconciliation_number: reconciliationNumber,
        branch_id: selectedBranchId || 'all',
        reconciliation_date: reconcileDate,
        payment_count: selectedPayments.length,
        total_amount: totalAmount,
        status: 'completed',
        payment_ids: selectedPayments
      });

      // The reconciliation record in payment_reconciliations is the source of
      // truth for which payments are matched; per-payment reconciliation_status
      // columns do not exist on payments.

      await logAuditEvent({
        action: AuditActions.CREATE,
        entityType: 'PaymentReconciliation',
        entityId: reconciliation.id,
        newValues: { payment_count: selectedPayments.length, total_amount: totalAmount }
      });

      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      
      setShowReconcileDialog(false);
      setSelectedPayments([]);
      toast.success(isRTL ? `تم تسوية ${selectedPayments.length} دفعة بنجاح` : `${selectedPayments.length} payments reconciled successfully`);
    } catch (error) {
      console.error('Reconciliation error:', error);
      toast.error(isRTL ? 'حدث خطأ في التسوية' : 'Failed to reconcile');
    } finally {
      setSaving(false);
    }
  };

  const markAsException = async (payment) => {
    try {
      const tid = getTenantIdForCreate();
      await tenantQuery('payment_reconciliations').insert({
        ...(tid && { tenant_id: tid }),
        reconciliation_number: `EXC-${(payment.id || '').slice(0, 8)}-${Date.now()}`,
        branch_id: payment.branch_id || selectedBranchId || 'all',
        reconciliation_date: new Date().toISOString().split('T')[0],
        payment_count: 1,
        total_amount: payment.amount || 0,
        status: 'exception',
        payment_ids: [payment.id]
      });
      await logAuditEvent({ action: 'MARK_EXCEPTION', entityType: 'Payment', entityId: payment.id });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success(isRTL ? 'تم تحديد الدفعة كاستثناء' : 'Payment marked as exception');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const columns = [
    { header: '', cell: (row) => (
      (row.reconciliation_status === 'pending' || !row.reconciliation_status) && (
        <Checkbox 
          checked={selectedPayments.includes(row.id)} 
          onCheckedChange={() => togglePaymentSelection(row.id)} 
        />
      )
    )},
    { header: isRTL ? 'رقم الدفعة' : 'Payment #', cell: (row) => <span className="font-mono text-sm">{row.payment_number}</span> },
    { header: t('studentName'), accessorKey: 'student_name' },
    { header: isRTL ? 'الفاتورة' : 'Invoice', accessorKey: 'invoice_number' },
    { header: t('amount'), cell: (row) => <span className="font-semibold">{row.amount?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span> },
    { header: isRTL ? 'طريقة الدفع' : 'Method', cell: (row) => {
      const methods = { cash: 'نقداً', bank_transfer: 'تحويل', mada: 'مدى', visa: 'فيزا', mastercard: 'ماستر', cheque: 'شيك' };
      return isRTL ? (methods[row.payment_method] || row.payment_method) : row.payment_method;
    }},
    { header: t('date'), cell: (row) => row.payment_date ? format(new Date(row.payment_date), 'dd/MM/yyyy') : '-' },
    { header: isRTL ? 'حالة التسوية' : 'Reconciliation', cell: (row) => {
      const status = row.reconciliation_status || 'pending';
      const colors = { matched: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700', exception: 'bg-red-100 text-red-700' };
      const labels = { matched: isRTL ? 'مطابق' : 'Matched', pending: isRTL ? 'معلق' : 'Pending', exception: isRTL ? 'استثناء' : 'Exception' };
      return <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status]}`}>{labels[status]}</span>;
    }},
    { header: t('actions'), cell: (row) => (
      (row.reconciliation_status === 'pending' || !row.reconciliation_status) && (
        <Button size="sm" variant="ghost" onClick={() => markAsException(row)} className="text-red-600">
          <AlertCircle className="w-4 h-4" />
        </Button>
      )
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'تسوية المدفوعات' : 'Payment Reconciliation'}
        subtitle={isRTL ? 'مطابقة المدفوعات مع الفواتير' : 'Match payments with invoices'}
      >
        <Button onClick={() => setShowReconcileDialog(true)} disabled={selectedPayments.length === 0} className="gap-2">
          <FileCheck className="w-4 h-4" />
          {isRTL ? `تسوية (${selectedPayments.length})` : `Reconcile (${selectedPayments.length})`}
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title={isRTL ? 'إجمالي الدفعات' : 'Total Payments'} value={stats.total} icon={RefreshCw} iconClassName="bg-sand-alt" />
        <StatCard title={isRTL ? 'مطابق' : 'Matched'} value={stats.matched} icon={CheckCircle} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'معلق' : 'Pending'} value={stats.pending} icon={RefreshCw} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'استثناءات' : 'Exceptions'} value={stats.exceptions} icon={AlertCircle} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'إجمالي المبلغ' : 'Total Amount'} value={`${stats.totalAmount.toLocaleString()}`} icon={RefreshCw} iconClassName="bg-najdi-50" />
        <StatCard title={isRTL ? 'المبلغ المسوى' : 'Reconciled'} value={`${stats.reconciledAmount.toLocaleString()}`} icon={CheckCircle} iconClassName="bg-purple-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="bg-white border">
            <TabsTrigger value="all">{t('all')}</TabsTrigger>
            <TabsTrigger value="pending">{isRTL ? 'معلق' : 'Pending'}</TabsTrigger>
            <TabsTrigger value="matched">{isRTL ? 'مطابق' : 'Matched'}</TabsTrigger>
            <TabsTrigger value="exception">{isRTL ? 'استثناء' : 'Exception'}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={selectAllPending}>
          {isRTL ? 'تحديد الكل المعلق' : 'Select All Pending'}
        </Button>
      </div>

      <DataTable columns={columns} data={filteredPayments} loading={isLoading} emptyMessage={t('noData')} />

      {/* Reconcile Dialog */}
      <Dialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تأكيد التسوية' : 'Confirm Reconciliation'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-sand p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isRTL ? 'عدد الدفعات' : 'Payment Count'}</span>
                <span className="font-semibold">{selectedPayments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isRTL ? 'إجمالي المبلغ' : 'Total Amount'}</span>
                <span className="font-semibold text-emerald-600">
                  {payments.filter(p => selectedPayments.includes(p.id)).reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'تاريخ التسوية' : 'Reconciliation Date'}</Label>
              <Input type="date" value={reconcileDate} onChange={(e) => setReconcileDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReconcileDialog(false)}>{t('cancel')}</Button>
            <Button onClick={handleReconcile} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تأكيد التسوية' : 'Confirm Reconciliation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}