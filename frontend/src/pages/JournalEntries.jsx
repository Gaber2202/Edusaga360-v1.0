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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { createJournalEntry } from '../api/journalEntry';

const JOURNAL_TYPES = ['sales', 'receipts', 'purchases', 'payments', 'general', 'depreciation', 'adjustment'];

export default function JournalEntries() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    journal_type: 'general',
    date: format(new Date(), 'yyyy-MM-dd'),
    reference: '',
    description: '',
    lines: [{ account_id: '', debit: 0, credit: 0, description: '' }]
  });

  const { data: journalEntries = [], isLoading } = useQuery({
    queryKey: ['journalEntries', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('journal_entrys').select('*').match(tenantFilter(branchFilter())).order('created_date', { ascending: false }).limit(200)),
    enabled: hasTenantAccess,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['chartOfAccounts', tenantId],
    queryFn: () => fetchData(tenantQuery('chart_of_accounts').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const filteredJournals = filterByBranch(journalEntries).filter(j => 
    statusFilter === 'all' || j.status === statusFilter
  );

  const addLine = () => {
    setFormData(p => ({
      ...p,
      lines: [...p.lines, { account_id: '', debit: 0, credit: 0, description: '' }]
    }));
  };

  const removeLine = (index) => {
    setFormData(p => ({
      ...p,
      lines: p.lines.filter((_, i) => i !== index)
    }));
  };

  const updateLine = (index, field, value) => {
    setFormData(p => ({
      ...p,
      lines: p.lines.map((line, i) => i === index ? { ...line, [field]: value } : line)
    }));
  };

  const calculateTotals = () => {
    const totalDebit = formData.lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
    const totalCredit = formData.lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
    return { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  };

  const handleSave = async () => {
    const { totalDebit: _totalDebit, totalCredit: _totalCredit, isBalanced } = calculateTotals();
    
    if (!isBalanced) {
      toast.error(isRTL ? 'القيد غير متوازن' : 'Entry is not balanced');
      return;
    }
    const hasNegative = formData.lines.some(l => (parseFloat(l.debit) || 0) < 0 || (parseFloat(l.credit) || 0) < 0);
    if (hasNegative) {
      toast.error(isRTL ? 'لا يمكن أن تكون قيم المدين أو الدائن سالبة' : 'Debit and credit amounts cannot be negative');
      return;
    }

    setSaving(true);
    try {
      const journalNumber = `JE-${selectedBranchId?.substring(0, 3) || 'SYS'}-${Date.now().toString(36).toUpperCase()}`;
      
      const enrichedLines = formData.lines.map((line, idx) => {
        const account = accounts.find(a => a.id === line.account_id);
        return {
          ...line,
          line_number: idx + 1,
          account_code: account?.account_code,
          account_name: account?.name_ar
        };
      });

      const data = {
        journal_number: journalNumber,
        journal_type: formData.journal_type,
        branch_id: selectedBranchId,
        date: formData.date,
        reference: formData.reference,
        description: formData.description,
        lines: enrichedLines,
      };

      // Server enforces balance, tenant scoping, and forces status='draft'
      // for user-initiated entries. See supabase/functions/createJournalEntry.
      const created = await createJournalEntry(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'JournalEntry', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم إنشاء القيد بنجاح' : 'Journal entry created');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (journal) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('journal_entrys').update({
        status: 'approved',
        approved_by: user?.email,
        approved_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'JournalEntry', entityId: journal.id });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast.success(isRTL ? 'تم اعتماد القيد' : 'Entry approved');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handlePost = async (journal) => {
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      
      // Update journal entry status
      await tenantQuery('journal_entrys').update({
        status: 'posted',
        posted_by: user?.email,
        posted_date: format(new Date(), 'yyyy-MM-dd')
      });
      
      await logAuditEvent({ action: AuditActions.POST, entityType: 'JournalEntry', entityId: journal.id });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast.success(isRTL ? 'تم ترحيل القيد' : 'Entry posted');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const resetForm = () => {
    setFormData({
      journal_type: 'general',
      date: format(new Date(), 'yyyy-MM-dd'),
      reference: '',
      description: '',
      lines: [{ account_id: '', debit: 0, credit: 0, description: '' }]
    });
  };

  const { totalDebit, totalCredit, isBalanced } = calculateTotals();

  const columns = [
    { header: isRTL ? 'رقم القيد' : 'Journal #', cell: (row) => <span className="font-mono text-sm">{row.journal_number}</span> },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => t(row.journal_type) || row.journal_type },
    { header: t('date'), cell: (row) => format(new Date(row.date), 'dd/MM/yyyy') },
    { header: isRTL ? 'المرجع' : 'Reference', accessorKey: 'reference' },
    { header: isRTL ? 'المبلغ' : 'Amount', cell: (row) => `${row.total_debit?.toLocaleString()} ${t('sar')}` },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {row.status === 'draft' && (
          <Button size="sm" variant="ghost" onClick={() => handleApprove(row)} className="text-blue-600">
            <Check className="w-4 h-4 me-1" /> {t('approve')}
          </Button>
        )}
        {row.status === 'approved' && (
          <Button size="sm" variant="ghost" onClick={() => handlePost(row)} className="text-emerald-600">
            <Check className="w-4 h-4 me-1" /> {t('post')}
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('journalEntries')}
        subtitle={isRTL ? 'إدارة القيود اليومية' : 'Manage journal entries'}
        action
        actionLabel={isRTL ? 'قيد جديد' : 'New Entry'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="draft">{t('draft')}</TabsTrigger>
          <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
          <TabsTrigger value="posted">{t('posted')}</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable columns={columns} data={filteredJournals} loading={isLoading} emptyMessage={t('noData')} />

      {/* Journal Entry Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'قيد يومية جديد' : 'New Journal Entry'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع القيد' : 'Journal Type'}</Label>
                <Select value={formData.journal_type} onValueChange={(v) => setFormData(p => ({...p, journal_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOURNAL_TYPES.map(type => <SelectItem key={type} value={type}>{t(type) || type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('date')}</Label>
                <Input type="date" value={formData.date} onChange={(e) => setFormData(p => ({...p, date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المرجع' : 'Reference'}</Label>
                <Input value={formData.reference} onChange={(e) => setFormData(p => ({...p, reference: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('description')}</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData(p => ({...p, description: e.target.value}))} rows={2} />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>{isRTL ? 'البنود' : 'Lines'}</Label>
                <Button size="sm" onClick={addLine}><Plus className="w-4 h-4 me-1" /> {isRTL ? 'إضافة بند' : 'Add Line'}</Button>
              </div>
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-[300px]">{isRTL ? 'الحساب' : 'Account'}</TableHead>
                      <TableHead className="w-[200px]">{t('description')}</TableHead>
                      <TableHead className="w-[120px]">{t('debit')}</TableHead>
                      <TableHead className="w-[120px]">{t('credit')}</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={line.account_id} onValueChange={(v) => updateLine(idx, 'account_id', v)}>
                            <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الحساب' : 'Select account'} /></SelectTrigger>
                            <SelectContent>
                              {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.name_ar}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input value={line.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="0" step="0.01" value={line.debit} onChange={(e) => updateLine(idx, 'debit', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min="0" step="0.01" value={line.credit} onChange={(e) => updateLine(idx, 'credit', e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeLine(idx)} disabled={formData.lines.length === 1}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 font-semibold">
                      <TableCell colSpan={2}>{isRTL ? 'الإجمالي' : 'Total'}</TableCell>
                      <TableCell className={totalDebit !== totalCredit ? 'text-red-600' : 'text-emerald-600'}>{totalDebit.toFixed(2)}</TableCell>
                      <TableCell className={totalDebit !== totalCredit ? 'text-red-600' : 'text-emerald-600'}>{totalCredit.toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {!isBalanced && (
                <p className="text-sm text-red-600">{isRTL ? '⚠️ القيد غير متوازن' : '⚠️ Entry not balanced'}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !isBalanced}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}