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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Search, ArrowLeftRight, Check, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { createJournalEntry } from '../api/journalEntry';

const REFUND_REASONS = [
  { value: 'withdrawal', label_ar: 'انسحاب', label_en: 'Withdrawal' },
  { value: 'transfer', label_ar: 'نقل', label_en: 'Transfer' },
  { value: 'overpayment', label_ar: 'دفع زائد', label_en: 'Overpayment' },
  { value: 'discount_adjustment', label_ar: 'تعديل خصم', label_en: 'Discount Adjustment' },
  { value: 'service_cancellation', label_ar: 'إلغاء خدمة', label_en: 'Service Cancellation' },
  { value: 'other', label_ar: 'أخرى', label_en: 'Other' },
];

export default function Refunds() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    student_id: '',
    invoice_id: '',
    refund_amount: 0,
    refund_reason: 'withdrawal',
    refund_method: 'bank_transfer',
    bank_name: '',
    iban: '',
    notes: ''
  });

  const { data: refunds = [], isLoading } = useQuery({
    queryKey: ['refundRequests', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('refund_requests').select('*').match(tenantFilter(branchFilter())).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices', tenantId],
    queryFn: () => fetchData(tenantQuery('invoices').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chartOfAccounts', tenantId],
    queryFn: () => fetchData(tenantQuery('chart_of_accounts').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const filteredRefunds = filterByBranch(refunds).filter(r => {
    const matchesSearch = r.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.refund_number?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleStudentChange = (studentId) => {
    const student = students.find(s => s.id === studentId);
    const studentInvoices = invoices.filter(i => i.student_id === studentId && i.paid_amount > 0);
    setFormData(p => ({
      ...p,
      student_id: studentId,
      student_name: student?.name_ar,
      invoice_id: studentInvoices[0]?.id || ''
    }));
  };

  const handleSave = async () => {
    if (!formData.student_id || formData.refund_amount <= 0) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const student = students.find(s => s.id === formData.student_id);
      const invoice = invoices.find(i => i.id === formData.invoice_id);
      const refundNumber = `REF-${Date.now().toString(36).toUpperCase()}`;
      
      const tid = getTenantIdForCreate();
      const data = {
        ...(tid && { tenant_id: tid }),
        refund_number: refundNumber,
        student_id: formData.student_id,
        student_name: student?.name_ar,
        invoice_id: formData.invoice_id,
        invoice_number: invoice?.invoice_number,
        branch_id: selectedBranchId || student?.branch_id,
        refund_amount: parseFloat(formData.refund_amount),
        refund_reason: formData.refund_reason,
        refund_method: formData.refund_method,
        bank_name: formData.bank_name,
        iban: formData.iban,
        notes: formData.notes,
        status: 'pending',
        request_date: format(new Date(), 'yyyy-MM-dd')
      };

      const created = await tenantQuery('refund_requests').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'RefundRequest', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['refundRequests'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم إنشاء طلب الاسترداد' : 'Refund request created');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (refund) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('refund_requests').update({
        status: 'approved',
        approved_by: user?.email,
        approved_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'RefundRequest', entityId: refund.id });
      queryClient.invalidateQueries({ queryKey: ['refundRequests'] });
      toast.success(isRTL ? 'تم اعتماد الطلب' : 'Request approved');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleExecute = async (refund) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      
      // Update refund status
      await tenantQuery('refund_requests').update({
        status: 'executed',
        executed_by: user?.email,
        executed_date: format(new Date(), 'yyyy-MM-dd')
      });

      // Update invoice if linked
      if (refund.invoice_id) {
        const invoice = invoices.find(i => i.id === refund.invoice_id);
        if (invoice) {
          const newPaidAmount = Math.max(0, (invoice.paid_amount || 0) - refund.refund_amount);
          let newStatus = 'issued';
          if (newPaidAmount >= invoice.total_amount) newStatus = 'paid';
          else if (newPaidAmount > 0) newStatus = 'partial';
          
          await tenantQuery('invoices').update({
            paid_amount: newPaidAmount,
            balance: invoice.total_amount - newPaidAmount,
            status: newStatus
          });
        }
      }

      // Create journal entry for refund
      const cashAccount = accounts.find(a => a.is_bank_account || a.account_code?.startsWith('1101'));
      const arAccount = accounts.find(a => a.account_code?.startsWith('1201') || a.name_en?.includes('Receivable'));
      
      if (cashAccount && arAccount) {
        const journalNumber = `JE-REF-${Date.now().toString(36).toUpperCase()}`;
        await createJournalEntry({
          journal_number: journalNumber,
          journal_type: 'payments',
          branch_id: refund.branch_id,
          date: format(new Date(), 'yyyy-MM-dd'),
          reference: refund.refund_number,
          description: isRTL
            ? `استرداد رقم ${refund.refund_number} - ${refund.student_name}`
            : `Refund ${refund.refund_number} - ${refund.student_name}`,
          lines: [
            { line_number: 1, account_id: arAccount.id, account_code: arAccount.account_code, account_name: arAccount.name_ar, debit: refund.refund_amount, credit: 0, description: 'A/R Debit (Refund)' },
            { line_number: 2, account_id: cashAccount.id, account_code: cashAccount.account_code, account_name: cashAccount.name_ar, debit: 0, credit: refund.refund_amount, description: 'Cash/Bank Credit (Refund)' },
          ],
          source_document_type: 'RefundRequest',
          source_document_id: refund.id,
          requested_status: 'posted',
        });
      }

      await logAuditEvent({ action: 'EXECUTE', entityType: 'RefundRequest', entityId: refund.id });
      queryClient.invalidateQueries({ queryKey: ['refundRequests'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast.success(isRTL ? 'تم تنفيذ الاسترداد' : 'Refund executed');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handleReject = async (refund) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('refund_requests').update({
        status: 'rejected',
        rejected_by: user?.email,
        rejected_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: AuditActions.REJECT, entityType: 'RefundRequest', entityId: refund.id });
      queryClient.invalidateQueries({ queryKey: ['refundRequests'] });
      toast.success(isRTL ? 'تم رفض الطلب' : 'Request rejected');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      student_id: '',
      invoice_id: '',
      refund_amount: 0,
      refund_reason: 'withdrawal',
      refund_method: 'bank_transfer',
      bank_name: '',
      iban: '',
      notes: ''
    });
  };

  const columns = [
    { header: isRTL ? 'رقم الاسترداد' : 'Refund #', cell: (row) => <span className="font-mono text-sm">{row.refund_number}</span> },
    { header: t('studentName'), accessorKey: 'student_name' },
    { header: isRTL ? 'المبلغ' : 'Amount', cell: (row) => <span className="font-semibold text-red-600">{row.refund_amount?.toLocaleString()} {t('sar')}</span> },
    { header: isRTL ? 'السبب' : 'Reason', cell: (row) => {
      const reason = REFUND_REASONS.find(r => r.value === row.refund_reason);
      return reason ? (isRTL ? reason.label_ar : reason.label_en) : row.refund_reason;
    }},
    { header: t('date'), cell: (row) => row.request_date ? format(new Date(row.request_date), 'dd/MM/yyyy') : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {row.status === 'pending' && (
          <>
            <Button size="sm" variant="ghost" onClick={() => handleApprove(row)} className="text-emerald-600"><Check className="w-4 h-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => handleReject(row)} className="text-red-600"><X className="w-4 h-4" /></Button>
          </>
        )}
        {row.status === 'approved' && (
          <Button size="sm" onClick={() => handleExecute(row)} className="bg-blue-600 hover:bg-blue-700">
            <ArrowLeftRight className="w-4 h-4 me-1" />
            {isRTL ? 'تنفيذ' : 'Execute'}
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'المبالغ المستردة' : 'Refunds'}
        subtitle={isRTL ? 'إدارة طلبات الاسترداد' : 'Manage refund requests'}
        action
        actionLabel={isRTL ? 'طلب استرداد جديد' : 'New Refund Request'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="pending">{t('pending')}</TabsTrigger>
          <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
          <TabsTrigger value="executed">{isRTL ? 'منفذ' : 'Executed'}</TabsTrigger>
          <TabsTrigger value="rejected">{t('rejected')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredRefunds} loading={isLoading} emptyMessage={t('noData')} />

      {/* Refund Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'طلب استرداد جديد' : 'New Refund Request'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('studentName')} *</Label>
              <Select value={formData.student_id} onValueChange={handleStudentChange}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الطالب' : 'Select student'} /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'مبلغ الاسترداد' : 'Refund Amount'} *</Label>
                <Input type="number" value={formData.refund_amount} onChange={(e) => setFormData(p => ({...p, refund_amount: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'سبب الاسترداد' : 'Refund Reason'}</Label>
                <Select value={formData.refund_reason} onValueChange={(v) => setFormData(p => ({...p, refund_reason: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REFUND_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{isRTL ? r.label_ar : r.label_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم البنك' : 'Bank Name'}</Label>
                <Input value={formData.bank_name} onChange={(e) => setFormData(p => ({...p, bank_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>IBAN</Label>
                <Input value={formData.iban} onChange={(e) => setFormData(p => ({...p, iban: e.target.value}))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData(p => ({...p, notes: e.target.value}))} rows={2} />
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