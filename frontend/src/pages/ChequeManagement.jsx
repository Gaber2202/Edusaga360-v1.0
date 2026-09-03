import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callApi, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { formatCurrency } from '../lib/localization';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, Banknote, AlertTriangle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const OPEN_STATES = ['received', 'pending_deposit', 'deposited'];

const STATUS_META = {
  received: { ar: 'مستلم', en: 'Received', cls: 'bg-sand-alt text-ink' },
  pending_deposit: { ar: 'بانتظار الإيداع', en: 'Pending Deposit', cls: 'bg-amber-100 text-amber-700' },
  deposited: { ar: 'مودع', en: 'Deposited', cls: 'bg-najdi-50 text-najdi-900' },
  cleared: { ar: 'محصّل', en: 'Cleared', cls: 'bg-emerald-100 text-emerald-700' },
  bounced: { ar: 'مرتجع', en: 'Bounced', cls: 'bg-red-100 text-red-700' },
  reconciled: { ar: 'مسوّى', en: 'Reconciled', cls: 'bg-emerald-100 text-emerald-800' },
  cancelled: { ar: 'ملغي', en: 'Cancelled', cls: 'bg-sand-alt text-muted-foreground' },
};

// Mirrors backend services/chequeLifecycle.ts — UI only offers legal moves.
const NEXT_ACTIONS = {
  received: [
    { to: 'pending_deposit', ar: 'تحديد للإيداع', en: 'Mark Pending' },
    { to: 'deposited', ar: 'إيداع', en: 'Deposit' },
    { to: 'cancelled', ar: 'إلغاء', en: 'Cancel' },
  ],
  pending_deposit: [
    { to: 'deposited', ar: 'إيداع', en: 'Deposit' },
    { to: 'cancelled', ar: 'إلغاء', en: 'Cancel' },
  ],
  deposited: [
    { to: 'cleared', ar: 'تم التحصيل', en: 'Mark Cleared' },
    { to: 'bounced', ar: 'ارتجاع', en: 'Mark Bounced' },
  ],
  cleared: [
    { to: 'reconciled', ar: 'تسوية', en: 'Reconcile' },
    { to: 'bounced', ar: 'ارتجاع', en: 'Mark Bounced' },
  ],
  bounced: [
    { to: 'pending_deposit', ar: 'إعادة تقديم', en: 'Re-present' },
    { to: 'cancelled', ar: 'إلغاء', en: 'Cancel' },
  ],
  reconciled: [],
  cancelled: [],
};

const EMPTY_FORM = {
  cheque_number: '', bank_name: '', drawer_name: '', amount: '',
  issue_date: format(new Date(), 'yyyy-MM-dd'), due_date: '', invoice_id: '', notes: '',
};

export default function ChequeManagement() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { tenantId } = useTenantFilter();
  const queryClient = useQueryClient();
  const tt = (ar, en) => (isRTL ? ar : en);

  const [tab, setTab] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, setPending] = useState(null); // { cheque, to }
  const [note, setNote] = useState('');

  const { data: cheques = [], isLoading } = useQuery({
    queryKey: ['cheques', tenantId],
    queryFn: () => callApi('/api/cheques', null, { method: 'GET' }),
  });

  // Unpaid/partial invoices available to link a cheque to.
  const { data: invoices = [] } = useQuery({
    queryKey: ['openInvoices', tenantId],
    queryFn: () => fetchData(tenantQuery('invoices').select('id, invoice_number, student_name, total_amount, paid_amount, status')),
  });
  const openInvoices = invoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled');

  const today = format(new Date(), 'yyyy-MM-dd');
  const isOverdue = (c) => c.due_date && c.due_date < today && OPEN_STATES.includes(c.status);
  const isUpcomingPDC = (c) => c.due_date && c.due_date >= today && OPEN_STATES.includes(c.status);

  const visible = cheques.filter((c) => {
    if (tab === 'pdc') return isUpcomingPDC(c);
    if (tab === 'overdue') return isOverdue(c);
    return true;
  });

  const createMutation = useMutation({
    mutationFn: (payload) => callApi('/api/cheques', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      toast.success(tt('تم تسجيل الشيك', 'Cheque recorded'));
      setShowCreate(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error(tt('فشل تسجيل الشيك', 'Failed to record cheque')),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, to, bounce_reason, note: n }) =>
      callApi(`/api/cheques/${id}/transition`, { to_status: to, bounce_reason, note: n }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['cheques'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (res?.invoice_sync) {
        toast.success(tt('تم تحديث حالة الفاتورة المرتبطة', 'Linked invoice payment status updated'));
      } else {
        toast.success(tt('تم تحديث حالة الشيك', 'Cheque status updated'));
      }
      if (res?.follow_up_required) {
        toast.warning(tt('شيك مرتجع — يتطلب متابعة', 'Bounced cheque — follow-up required'));
      }
      setPending(null);
      setNote('');
    },
    onError: (e) => toast.error(e?.message || tt('فشل تحديث الحالة', 'Transition failed')),
  });

  const submitCreate = () => {
    if (!form.cheque_number || !form.amount) {
      toast.error(tt('رقم الشيك والمبلغ مطلوبان', 'Cheque number and amount are required'));
      return;
    }
    createMutation.mutate({
      cheque_number: form.cheque_number,
      bank_name: form.bank_name || undefined,
      drawer_name: form.drawer_name || undefined,
      amount: parseFloat(form.amount),
      issue_date: form.issue_date || undefined,
      due_date: form.due_date || undefined,
      invoice_id: form.invoice_id || undefined,
      notes: form.notes || undefined,
    });
  };

  const confirmTransition = () => {
    if (!pending) return;
    transitionMutation.mutate({
      id: pending.cheque.id,
      to: pending.to,
      bounce_reason: pending.to === 'bounced' ? (note || undefined) : undefined,
      note: pending.to !== 'bounced' ? (note || undefined) : undefined,
    });
  };

  const statusBadge = (s) => {
    const m = STATUS_META[s] || { ar: s, en: s, cls: 'bg-sand-alt text-ink' };
    return <Badge className={m.cls}>{tt(m.ar, m.en)}</Badge>;
  };

  const counts = {
    pdc: cheques.filter(isUpcomingPDC).length,
    overdue: cheques.filter(isOverdue).length,
  };

  return (
    <div className="w-full max-w-none p-4 md:p-6 space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="w-6 h-6" />
            {tt('إدارة الشيكات', 'Cheque Management')}
          </h1>
          <p className="text-sm text-muted-foreground">{tt('تتبع دورة حياة الشيكات والشيكات الآجلة', 'Track cheque lifecycle and post-dated cheques (PDCs)')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {tt('تسجيل شيك', 'Record Cheque')}
        </Button>
      </div>

      {counts.overdue > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-800">
              {tt(`${counts.overdue} شيك متأخر عن تاريخ الاستحقاق ولم يتم تحصيله`, `${counts.overdue} cheque(s) past due and not yet cleared`)}
            </span>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{tt('الكل', 'All')} ({cheques.length})</TabsTrigger>
          <TabsTrigger value="pdc">{tt('شيكات آجلة', 'Upcoming PDCs')} ({counts.pdc})</TabsTrigger>
          <TabsTrigger value="overdue">{tt('متأخرة', 'Overdue')} ({counts.overdue})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tt('الشيكات', 'Cheques')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : visible.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">{tt('لا توجد شيكات', 'No cheques')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tt('رقم الشيك', 'Cheque #')}</TableHead>
                  <TableHead>{tt('البنك', 'Bank')}</TableHead>
                  <TableHead>{tt('الساحب', 'Drawer')}</TableHead>
                  <TableHead>{tt('المبلغ', 'Amount')}</TableHead>
                  <TableHead>{tt('تاريخ الاستحقاق', 'Due Date')}</TableHead>
                  <TableHead>{tt('الحالة', 'Status')}</TableHead>
                  <TableHead>{tt('إجراءات', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => (
                  <TableRow key={c.id} className={isOverdue(c) ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{c.cheque_number}</TableCell>
                    <TableCell>{c.bank_name || '-'}</TableCell>
                    <TableCell>{c.drawer_name || '-'}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(c.amount, tenant?.localization, isRTL)}</TableCell>
                    <TableCell className={isOverdue(c) ? 'text-red-600 font-medium' : ''}>{c.due_date || '-'}</TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(NEXT_ACTIONS[c.status] || []).map((a) => (
                          <Button
                            key={a.to}
                            variant="outline"
                            size="sm"
                            className={a.to === 'bounced' ? 'text-red-600 border-red-200' : ''}
                            onClick={() => { setPending({ cheque: c, to: a.to }); setNote(''); }}
                          >
                            {tt(a.ar, a.en)}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Record cheque dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{tt('تسجيل شيك جديد', 'Record New Cheque')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>{tt('رقم الشيك', 'Cheque Number')} *</Label>
              <Input value={form.cheque_number} onChange={(e) => setForm({ ...form, cheque_number: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{tt('المبلغ', 'Amount')} *</Label>
              <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{tt('البنك', 'Bank')}</Label>
              <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{tt('الساحب', 'Drawer')}</Label>
              <Input value={form.drawer_name} onChange={(e) => setForm({ ...form, drawer_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{tt('تاريخ الإصدار', 'Issue Date')}</Label>
              <Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{tt('تاريخ الاستحقاق', 'Due / Clearing Date')}</Label>
              <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{tt('ربط بفاتورة (اختياري)', 'Link to Invoice (optional)')}</Label>
              <Select value={form.invoice_id} onValueChange={(v) => setForm({ ...form, invoice_id: v })}>
                <SelectTrigger><SelectValue placeholder={tt('بدون', 'None')} /></SelectTrigger>
                <SelectContent>
                  {openInvoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.invoice_number} — {i.student_name} ({formatCurrency((i.total_amount || 0) - (i.paid_amount || 0), tenant?.localization, isRTL)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{tt('ملاحظات', 'Notes')}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{tt('إلغاء', 'Cancel')}</Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {tt('حفظ', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transition confirm dialog */}
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>
              {pending && tt(
                `تغيير حالة الشيك إلى: ${STATUS_META[pending.to]?.ar || pending.to}`,
                `Change cheque status to: ${STATUS_META[pending.to]?.en || pending.to}`
              )}
            </DialogTitle>
          </DialogHeader>
          {pending?.to === 'cleared' && pending?.cheque?.invoice_id && (
            <p className="text-sm text-emerald-700">{tt('سيتم تسجيل دفعة وتحديث حالة الفاتورة المرتبطة.', 'A payment will be recorded and the linked invoice updated.')}</p>
          )}
          {pending?.to === 'bounced' && (
            <p className="text-sm text-red-700">{tt('سيتم عكس أي دفعة سابقة ووضع علامة للمتابعة.', 'Any prior payment will be reversed and flagged for follow-up.')}</p>
          )}
          <div className="space-y-1">
            <Label>{pending?.to === 'bounced' ? tt('سبب الارتجاع', 'Bounce Reason') : tt('ملاحظة (اختياري)', 'Note (optional)')}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>{tt('إلغاء', 'Cancel')}</Button>
            <Button onClick={confirmTransition} disabled={transitionMutation.isPending}>
              {transitionMutation.isPending && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {tt('تأكيد', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
