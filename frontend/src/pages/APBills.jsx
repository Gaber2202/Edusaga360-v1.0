import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { getCurrencySymbol, formatCurrency } from '../lib/localization';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { DataTable } from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import StatCard from '../components/ui/StatCard';
import { Search, Check, CreditCard, Loader2, DollarSign, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import BillActions from '../components/procurement/BillActions';
import AttachmentUploader from '../components/ui/AttachmentUploader';
import jsPDF from 'jspdf';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { createJournalEntry } from '../api/journalEntry';
import { useTenant } from '../components/TenantContext';

export default function APBills() {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: '',
    attachments: []
  });

  const { data: bills = [], isLoading } = useQuery({ enabled: false /* ap_bills table not built */, queryKey: ['apBills', tenantId, selectedBranchId], queryFn: () => fetchData(tenantQuery('ap_bills').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })), initialData: [] });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chartOfAccounts', tenantId],
    queryFn: () => fetchData(tenantQuery('chart_of_accounts').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors', tenantId],
    queryFn: () => fetchData(tenantQuery('vendors').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredBills = filterByBranch(bills).filter(bill => {
    const matchesSearch = bill.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
      bill.vendor_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || bill.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const stats = React.useMemo(() => {
    const branchBills = filterByBranch(bills);
    const total = branchBills.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const paid = branchBills.reduce((sum, b) => sum + (b.paid_amount || 0), 0);
    const pending = total - paid;
    const overdue = branchBills.filter(b => b.status === 'overdue' || (b.due_date && new Date(b.due_date) < new Date() && b.status !== 'paid'))
      .reduce((sum, b) => sum + ((b.total_amount || 0) - (b.paid_amount || 0)), 0);
    
    return { total, paid, pending, overdue, billCount: branchBills.length };
  }, [bills, filterByBranch]);

  const openPaymentDialog = (bill) => {
    setSelectedBill(bill);
    setPaymentData({
      amount: (bill.total_amount || 0) - (bill.paid_amount || 0),
      payment_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: 'bank_transfer',
      reference_number: '',
      notes: '',
      attachments: []
    });
    setShowPaymentDialog(true);
  };

  const handleApproveBill = async (bill) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('ap_bills').update({
        status: 'approved',
        approved_by: user?.email,
        approved_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'APBill', entityId: bill.id });
      queryClient.invalidateQueries({ queryKey: ['apBills'] });
      toast.success(isRTL ? 'تم اعتماد الفاتورة' : 'Bill approved');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleDownloadBill = (bill) => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text(isRTL ? 'فاتورة مورد' : 'Vendor Bill', 20, 20);
    
    doc.setFontSize(12);
    doc.text(`${isRTL ? 'رقم الفاتورة' : 'Bill #'}: ${bill.bill_number}`, 20, 35);
    doc.text(`${isRTL ? 'المورد' : 'Vendor'}: ${bill.vendor_name}`, 20, 42);
    doc.text(`${isRTL ? 'التاريخ' : 'Date'}: ${format(new Date(bill.bill_date), 'dd/MM/yyyy')}`, 20, 49);
    
    doc.setFontSize(14);
    doc.text(isRTL ? 'تفاصيل المبلغ' : 'Amount Details', 20, 65);
    doc.setFontSize(11);
    doc.text(`${isRTL ? 'المجموع' : 'Total'}: $<Currency amount={bill.total_amount} />`, 20, 75);
    doc.text(`${isRTL ? 'المدفوع' : 'Paid'}: ${formatCurrency((bill.paid_amount || 0).toLocaleString(), tenant?.localization, isRTL)}`, 20, 82);
    doc.text(`${isRTL ? 'المتبقي' : 'Balance'}: ${formatCurrency(((bill.total_amount || 0) - (bill.paid_amount || 0)).toLocaleString(), tenant?.localization, isRTL)}`, 20, 89);
    
    doc.save(`bill_${bill.bill_number}.pdf`);
    toast.success(isRTL ? 'تم التنزيل' : 'Downloaded');
  };

  const handlePrintBill = (bill) => {
    const printContent = `
      <html>
        <head><title>Bill ${bill.bill_number}</title>
        <style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#1e293b}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #cbd5e1;padding:8px;text-align:left}</style>
        </head>
        <body>
          <h1>${isRTL ? 'فاتورة مورد' : 'Vendor Bill'}</h1>
          <p><strong>${isRTL ? 'رقم الفاتورة' : 'Bill #'}:</strong> ${bill.bill_number}</p>
          <p><strong>${isRTL ? 'المورد' : 'Vendor'}:</strong> ${bill.vendor_name}</p>
          <p><strong>${isRTL ? 'التاريخ' : 'Date'}:</strong> ${format(new Date(bill.bill_date), 'dd/MM/yyyy')}</p>
          <table>
            <tr><td>${isRTL ? 'المجموع' : 'Total'}</td><td>$<Currency amount={bill.total_amount} /></td></tr>
            <tr><td>${isRTL ? 'المدفوع' : 'Paid'}</td><td>${formatCurrency((bill.paid_amount || 0).toLocaleString(), tenant?.localization, isRTL)}</td></tr>
            <tr><td>${isRTL ? 'المتبقي' : 'Balance'}</td><td>${formatCurrency(((bill.total_amount || 0) - (bill.paid_amount || 0)).toLocaleString(), tenant?.localization, isRTL)}</td></tr>
          </table>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleEmailBill = (bill) => {
    const vendor = vendors.find(v => v.id === bill.vendor_id);
    if (!vendor?.email) {
      toast.error(isRTL ? 'بريد المورد غير متوفر' : 'Vendor email not available');
      return;
    }
    const subject = `Bill ${bill.bill_number}`;
    const body = `Dear ${bill.vendor_name},\n\nPlease find the details of Bill ${bill.bill_number}\nTotal: $<Currency amount={bill.total_amount} />\n\nThank you.`;
    window.open(`mailto:${vendor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleRecordPayment = async () => {
    if (!selectedBill || paymentData.amount <= 0) {
      toast.error(isRTL ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const paymentNumber = `AP-PAY-${Date.now().toString(36).toUpperCase()}`;
      
      // Create AP Payment record
      const tid = getTenantIdForCreate();
      const payment = await tenantQuery('ap_payments').insert({
        ...(tid && { tenant_id: tid }),
        payment_number: paymentNumber,
        bill_id: selectedBill.id,
        bill_number: selectedBill.bill_number,
        vendor_id: selectedBill.vendor_id,
        vendor_name: selectedBill.vendor_name,
        branch_id: selectedBill.branch_id,
        amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        reference_number: paymentData.reference_number,
        notes: paymentData.notes,
        attachments: paymentData.attachments,
        status: 'completed',
        paid_by: user?.email
      });

      // Update bill
      const newPaidAmount = (selectedBill.paid_amount || 0) + parseFloat(paymentData.amount);
      let newStatus = selectedBill.status;
      
      if (newPaidAmount >= selectedBill.total_amount) {
        newStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newStatus = 'partial';
      }

      await tenantQuery('ap_bills').update({
        paid_amount: newPaidAmount,
        status: newStatus
      });

      // Create journal entry
      const cashAccount = accounts.find(a => a.is_bank_account || a.account_code?.startsWith('1101'));
      const apAccount = accounts.find(a => a.account_code?.startsWith('2101') || a.name_en?.includes('Payable'));
      
      if (cashAccount && apAccount) {
        const journalNumber = `JE-AP-${Date.now().toString(36).toUpperCase()}`;
        await createJournalEntry({
          journal_number: journalNumber,
          journal_type: 'payments',
          branch_id: selectedBill.branch_id,
          date: paymentData.payment_date,
          reference: paymentNumber,
          description: isRTL
            ? `دفع فاتورة ${selectedBill.bill_number} - ${selectedBill.vendor_name}`
            : `Payment for Bill ${selectedBill.bill_number} - ${selectedBill.vendor_name}`,
          lines: [
            { line_number: 1, account_id: apAccount.id, account_code: apAccount.account_code, account_name: apAccount.name_ar, debit: parseFloat(paymentData.amount), credit: 0, description: 'A/P Settlement' },
            { line_number: 2, account_id: cashAccount.id, account_code: cashAccount.account_code, account_name: cashAccount.name_ar, debit: 0, credit: parseFloat(paymentData.amount), description: 'Cash/Bank Payment' },
          ],
          source_document_type: 'APPayment',
          source_document_id: payment.id,
          requested_status: 'posted',
        });
      }

      await logAuditEvent({
        action: AuditActions.CREATE,
        entityType: 'APPayment',
        entityId: payment.id,
        newValues: { ...paymentData, bill_id: selectedBill.id }
      });

      queryClient.invalidateQueries({ queryKey: ['apBills'] });
      queryClient.invalidateQueries({ queryKey: ['apPayments'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      
      setShowPaymentDialog(false);
      toast.success(isRTL ? 'تم تسجيل الدفعة بنجاح' : 'Payment recorded successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: isRTL ? 'رقم الفاتورة' : 'Bill #', cell: (row) => <span className="font-mono text-sm">{row.bill_number}</span> },
    { header: t('vendor'), accessorKey: 'vendor_name' },
    { header: isRTL ? 'رقم أمر الشراء' : 'PO #', cell: (row) => row.po_number || '-' },
    { header: t('total'), cell: (row) => <span className="font-semibold">{row.total_amount?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span> },
    { header: t('paid'), cell: (row) => <span className="text-emerald-600">{(row.paid_amount || 0).toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span> },
    { header: isRTL ? 'المتبقي' : 'Balance', cell: (row) => {
      const balance = (row.total_amount || 0) - (row.paid_amount || 0);
      return <span className={balance > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{balance.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span>;
    }},
    { header: t('dueDate'), cell: (row) => row.due_date ? format(new Date(row.due_date), 'dd/MM/yyyy') : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <BillActions
        bill={row}
        vendor={vendors.find(v => v.id === row.vendor_id)}
        onApprove={handleApproveBill}
        onPay={openPaymentDialog}
        onView={(_bill) => toast.info(isRTL ? 'قريباً' : 'Coming soon')}
        onDownload={handleDownloadBill}
        onPrint={handlePrintBill}
        onEmail={handleEmailBill}
      />
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'فواتير الموردين' : 'AP Bills'}
        subtitle={isRTL ? 'إدارة فواتير الموردين والمدفوعات' : 'Manage vendor bills and payments'}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title={isRTL ? 'إجمالي الفواتير' : 'Total Bills'} value={`${stats.total.toLocaleString()} ${getCurrencySymbol(tenant?.localization, isRTL)}`} icon={DollarSign} iconClassName="bg-najdi-50" />
        <StatCard title={isRTL ? 'المدفوع' : 'Paid'} value={`${stats.paid.toLocaleString()} ${getCurrencySymbol(tenant?.localization, isRTL)}`} icon={Check} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'المستحق' : 'Due'} value={`${stats.pending.toLocaleString()} ${getCurrencySymbol(tenant?.localization, isRTL)}`} icon={Clock} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'المتأخر' : 'Overdue'} value={`${stats.overdue.toLocaleString()} ${getCurrencySymbol(tenant?.localization, isRTL)}`} icon={AlertCircle} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'عدد الفواتير' : 'Count'} value={stats.billCount.toString()} icon={CreditCard} iconClassName="bg-sand" />
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="bg-sand-alt p-1 h-auto rounded-lg">
              <TabsTrigger value="all" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium">{t('all')}</TabsTrigger>
              <TabsTrigger value="pending" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium">{t('pending')}</TabsTrigger>
              <TabsTrigger value="approved" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium">{t('approved')}</TabsTrigger>
              <TabsTrigger value="partial" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium">{t('partial')}</TabsTrigger>
              <TabsTrigger value="paid" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md px-4 py-2 text-sm font-medium">{t('paid')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} edu-input shadow-sm`} />
      </div>

      <DataTable columns={columns} data={filteredBills} loading={isLoading} emptyMessage={t('noData')} />

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تسجيل دفعة' : 'Record Payment'}</DialogTitle>
          </DialogHeader>
          
          {selectedBill && (
            <div className="space-y-4">
              <Card className="bg-sand">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">{isRTL ? 'الفاتورة' : 'Bill'}</span><span className="font-mono">{selectedBill.bill_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('vendor')}</span><span className="font-medium">{selectedBill.vendor_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('total')}</span><span>{selectedBill.total_amount?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('paid')}</span><span className="text-emerald-600">{(selectedBill.paid_amount || 0).toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span></div>
                  <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground font-medium">{isRTL ? 'المتبقي' : 'Remaining'}</span><span className="font-bold text-red-600">{((selectedBill.total_amount || 0) - (selectedBill.paid_amount || 0)).toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span></div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('amount')} *</Label>
                  <Input type="number" value={paymentData.amount} onChange={(e) => setPaymentData(p => ({...p, amount: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('date')} *</Label>
                  <Input type="date" value={paymentData.payment_date} onChange={(e) => setPaymentData(p => ({...p, payment_date: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'طريقة الدفع' : 'Payment Method'}</Label>
                  <Select value={paymentData.payment_method} onValueChange={(v) => setPaymentData(p => ({...p, payment_method: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">{isRTL ? 'تحويل بنكي' : 'Bank Transfer'}</SelectItem>
                      <SelectItem value="cheque">{isRTL ? 'شيك' : 'Cheque'}</SelectItem>
                      <SelectItem value="cash">{isRTL ? 'نقداً' : 'Cash'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'رقم المرجع' : 'Reference #'}</Label>
                  <Input value={paymentData.reference_number} onChange={(e) => setPaymentData(p => ({...p, reference_number: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'إثبات الدفع / المرفقات' : 'Payment Proof / Attachments'}</Label>
                  <AttachmentUploader
                    attachments={paymentData.attachments}
                    onChange={(atts) => setPaymentData(p => ({...p, attachments: atts}))}
                    compact
                    maxFiles={5}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>{t('cancel')}</Button>
            <Button onClick={handleRecordPayment} disabled={saving} className="bg-najdi-700 hover:bg-najdi-900">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تسجيل الدفعة' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}