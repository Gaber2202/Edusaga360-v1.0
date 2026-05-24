import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
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
import StatCard from '../components/ui/StatCard';
import { Search, DollarSign, CreditCard, Banknote, CheckCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { createJournalEntry } from '../api/journalEntry';

const PAYMENT_METHODS = [
  { value: 'cash', label_ar: 'نقداً', label_en: 'Cash' },
  { value: 'mada', label_ar: 'مدى', label_en: 'Mada' },
  { value: 'visa', label_ar: 'فيزا', label_en: 'Visa' },
  { value: 'mastercard', label_ar: 'ماستركارد', label_en: 'Mastercard' },
  { value: 'bank_transfer', label_ar: 'تحويل بنكي', label_en: 'Bank Transfer' },
  { value: 'sadad', label_ar: 'سداد', label_en: 'SADAD' },
  { value: 'stc_pay', label_ar: 'STC Pay', label_en: 'STC Pay' },
  { value: 'apple_pay', label_ar: 'Apple Pay', label_en: 'Apple Pay' },
  { value: 'cheque', label_ar: 'شيك', label_en: 'Cheque' },
  { value: 'advance_applied', label_ar: 'تطبيق دفعة مقدمة', label_en: 'Advance Applied' },
];

export default function Collections() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'cash',
    reference_number: '',
    notes: ''
  });

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', tenantId, selectedBranchId],
    queryFn: () => tenantQuery('invoices').select('*').match(tenantFilter(branchFilter()), '-created_date'),
    enabled: hasTenantAccess,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', tenantId, selectedBranchId],
    queryFn: () => tenantQuery('payments').select('*').match(tenantFilter(branchFilter()), '-created_date'),
    enabled: hasTenantAccess,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chartOfAccounts', tenantId],
    queryFn: () => tenantQuery('chart_of_accounts').select('*').match(tenantFilter({ is_active: true })),
    enabled: hasTenantAccess,
  });

  const filteredInvoices = filterByBranch(invoices).filter(inv => {
    const matchesSearch = inv.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'unpaid' && ['issued', 'partial', 'overdue'].includes(inv.status)) ||
      inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate collection stats
  const stats = React.useMemo(() => {
    const branchInvoices = filterByBranch(invoices);
    const total = branchInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
    const collected = branchInvoices.reduce((sum, i) => sum + (i.paid_amount || 0), 0);
    const pending = total - collected;
    const overdue = branchInvoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + ((i.total_amount || 0) - (i.paid_amount || 0)), 0);
    
    const todayPayments = payments.filter(p => p.payment_date === format(new Date(), 'yyyy-MM-dd'));
    const todayCollected = todayPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    return { total, collected, pending, overdue, todayCollected, collectionRate: total > 0 ? (collected / total * 100).toFixed(1) : 0 };
  }, [invoices, payments, filterByBranch]);

  const openPaymentDialog = (invoice) => {
    setSelectedInvoice(invoice);
    setPaymentData({
      amount: (invoice.total_amount || 0) - (invoice.paid_amount || 0),
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: 'cash',
      reference_number: '',
      notes: ''
    });
    setShowPaymentForm(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || paymentData.amount <= 0) {
      toast.error(isRTL ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const paymentNumber = `PAY-${Date.now().toString(36).toUpperCase()}`;
      
      // Create payment record
      const tid = getTenantIdForCreate();
      const payment = await tenantQuery('payments').insert({
        ...(tid && { tenant_id: tid }),
        payment_number: paymentNumber,
        invoice_id: selectedInvoice.id,
        invoice_number: selectedInvoice.invoice_number,
        student_id: selectedInvoice.student_id,
        student_name: selectedInvoice.student_name,
        guardian_id: selectedInvoice.guardian_id,
        branch_id: selectedInvoice.branch_id,
        amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number,
        notes: paymentData.notes,
        status: 'completed',
        reconciliation_status: 'pending',
        received_by: user?.email
      });

      // Update invoice
      const newPaidAmount = (selectedInvoice.paid_amount || 0) + parseFloat(paymentData.amount);
      let newStatus = selectedInvoice.status;
      
      if (newPaidAmount >= selectedInvoice.total_amount) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      await tenantQuery('invoices').update({
        paid_amount: newPaidAmount,
        balance: selectedInvoice.total_amount - newPaidAmount,
        status: newStatus
      });

      // Create journal entry for payment
      const cashAccount = accounts.find(a => a.is_bank_account || a.account_code?.startsWith('1101'));
      const arAccount = accounts.find(a => a.account_code?.startsWith('1201') || a.name_en?.includes('Receivable'));
      
      if (cashAccount && arAccount) {
        const journalNumber = `JE-REC-${Date.now().toString(36).toUpperCase()}`;
        await createJournalEntry({
          journal_number: journalNumber,
          journal_type: 'receipts',
          branch_id: selectedInvoice.branch_id,
          date: paymentData.payment_date,
          reference: paymentNumber,
          description: isRTL
            ? `تحصيل فاتورة ${selectedInvoice.invoice_number} - ${selectedInvoice.student_name}`
            : `Collection for Invoice ${selectedInvoice.invoice_number} - ${selectedInvoice.student_name}`,
          lines: [
            { line_number: 1, account_id: cashAccount.id, account_code: cashAccount.account_code, account_name: cashAccount.name_ar, debit: parseFloat(paymentData.amount), credit: 0, description: 'Cash/Bank Receipt' },
            { line_number: 2, account_id: arAccount.id, account_code: arAccount.account_code, account_name: arAccount.name_ar, debit: 0, credit: parseFloat(paymentData.amount), description: 'A/R Settlement' },
          ],
          source_document_type: 'Payment',
          source_document_id: payment.id,
          requested_status: 'posted',
        });
      }

      // Audit log
      await logAuditEvent({
        action: AuditActions.CREATE,
        entityType: 'Payment',
        entityId: payment.id,
        newValues: { ...paymentData, invoice_id: selectedInvoice.id }
      });

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      
      setShowPaymentForm(false);
      toast.success(isRTL ? 'تم تسجيل الدفعة بنجاح' : 'Payment recorded successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: isRTL ? 'رقم الفاتورة' : 'Invoice #', cell: (row) => <span className="font-mono text-sm">{row.invoice_number}</span> },
    { header: t('studentName'), cell: (row) => <div><p className="font-medium">{row.student_name}</p><p className="text-sm text-slate-500">{t(row.grade)}</p></div> },
    { header: t('total'), cell: (row) => <span className="font-semibold">{row.total_amount?.toLocaleString()} {t('sar')}</span> },
    { header: t('paid'), cell: (row) => <span className="text-emerald-600">{(row.paid_amount || 0).toLocaleString()} {t('sar')}</span> },
    { header: isRTL ? 'المتبقي' : 'Balance', cell: (row) => {
      const balance = (row.total_amount || 0) - (row.paid_amount || 0);
      return <span className={balance > 0 ? 'text-red-600 font-medium' : 'text-slate-500'}>{balance.toLocaleString()} {t('sar')}</span>;
    }},
    { header: t('dueDate'), cell: (row) => row.due_date ? format(new Date(row.due_date), 'dd/MM/yyyy') : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      row.status !== 'paid' && row.status !== 'cancelled' && (
        <Button size="sm" onClick={() => openPaymentDialog(row)} className="bg-emerald-600 hover:bg-emerald-700">
          <CreditCard className="w-4 h-4 me-1" />
          {isRTL ? 'تحصيل' : 'Collect'}
        </Button>
      )
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'التحصيل' : 'Collections'}
        subtitle={isRTL ? 'تحصيل المدفوعات من أولياء الأمور' : 'Collect payments from guardians'}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard title={isRTL ? 'إجمالي الرسوم' : 'Total Fees'} value={`${stats.total.toLocaleString()}`} icon={DollarSign} iconClassName="bg-slate-100" />
        <StatCard title={isRTL ? 'المحصل' : 'Collected'} value={`${stats.collected.toLocaleString()}`} icon={CheckCircle} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'المتبقي' : 'Pending'} value={`${stats.pending.toLocaleString()}`} icon={Banknote} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'المتأخر' : 'Overdue'} value={`${stats.overdue.toLocaleString()}`} icon={CreditCard} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'تحصيل اليوم' : "Today's Collection"} value={`${stats.todayCollected.toLocaleString()}`} icon={DollarSign} iconClassName="bg-blue-50" />
        <StatCard title={isRTL ? 'نسبة التحصيل' : 'Collection Rate'} value={`${stats.collectionRate}%`} icon={CheckCircle} iconClassName="bg-purple-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-1">
          <TabsList className="bg-white border">
            <TabsTrigger value="all">{t('all')}</TabsTrigger>
            <TabsTrigger value="unpaid">{isRTL ? 'غير مدفوع' : 'Unpaid'}</TabsTrigger>
            <TabsTrigger value="partial">{t('partial')}</TabsTrigger>
            <TabsTrigger value="overdue">{t('overdue')}</TabsTrigger>
            <TabsTrigger value="paid">{t('paid')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
        </div>
      </div>

      <DataTable columns={columns} data={filteredInvoices} loading={isLoading} emptyMessage={t('noData')} />

      {/* Payment Dialog */}
      <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تسجيل دفعة' : 'Record Payment'}</DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-4">
              {/* Invoice Summary */}
              <Card className="bg-slate-50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between"><span className="text-slate-500">{isRTL ? 'الفاتورة' : 'Invoice'}</span><span className="font-mono">{selectedInvoice.invoice_number}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{t('studentName')}</span><span className="font-medium">{selectedInvoice.student_name}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{t('total')}</span><span>{selectedInvoice.total_amount?.toLocaleString()} {t('sar')}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">{t('paid')}</span><span className="text-emerald-600">{(selectedInvoice.paid_amount || 0).toLocaleString()} {t('sar')}</span></div>
                  <div className="flex justify-between border-t pt-2"><span className="text-slate-500 font-medium">{isRTL ? 'المتبقي' : 'Remaining'}</span><span className="font-bold text-red-600">{((selectedInvoice.total_amount || 0) - (selectedInvoice.paid_amount || 0)).toLocaleString()} {t('sar')}</span></div>
                </CardContent>
              </Card>

              {/* Payment Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('amount')} *</Label>
                  <Input type="number" value={paymentData.amount} onChange={(e) => setPaymentData(p => ({...p, amount: e.target.value}))} max={(selectedInvoice.total_amount || 0) - (selectedInvoice.paid_amount || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('date')} *</Label>
                  <Input type="date" value={paymentData.payment_date} onChange={(e) => setPaymentData(p => ({...p, payment_date: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'طريقة الدفع' : 'Payment Method'} *</Label>
                  <Select value={paymentData.payment_method} onValueChange={(v) => setPaymentData(p => ({...p, payment_method: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{isRTL ? m.label_ar : m.label_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'رقم المرجع' : 'Reference #'}</Label>
                  <Input value={paymentData.reference_number} onChange={(e) => setPaymentData(p => ({...p, reference_number: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('notes')}</Label>
                  <Textarea value={paymentData.notes} onChange={(e) => setPaymentData(p => ({...p, notes: e.target.value}))} rows={2} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleRecordPayment} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تسجيل الدفعة' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}