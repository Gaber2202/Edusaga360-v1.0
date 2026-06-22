import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { CreditCard, Plus, Loader2, BarChart3, ArrowUpDown } from 'lucide-react';

export default function CorporateCards() {
  const { isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('cards');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    card_type: 'virtual', cardholder_name: '', employee_id: '',
    spend_limit: 5000, currency: 'SAR', vendor_restrictions: '',
    category_restrictions: '', status: 'active'
  });

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ['corporate_cards', tenantId],
    queryFn: () => fetchData(tenantQuery('corporate_cards').select('*').match(tenantFilter()).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['card_transactions', tenantId],
    queryFn: () => fetchData(tenantQuery('card_transactions').select('*').match(tenantFilter()).order('transaction_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const handleSave = async () => {
    if (!form.cardholder_name) { toast.error(isRTL ? 'الاسم مطلوب' : 'Name required'); return; }
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = {
        ...form,
        ...(tid && { tenant_id: tid }),
        card_number: `****-****-****-${Math.floor(1000 + Math.random() * 9000)}`,
        card_code: `CC-${Date.now().toString(36).toUpperCase()}`,
        issued_date: format(new Date(), 'yyyy-MM-dd')
      };
      await tenantQuery('corporate_cards').insert(data);
      queryClient.invalidateQueries({ queryKey: ['corporate_cards'] });
      setShowForm(false);
      toast.success(isRTL ? 'تم إصدار البطاقة' : 'Card issued');
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };

  const totalSpend = transactions.reduce((s, t) => s + (t.amount || 0), 0);
  const totalLimit = cards.filter(c => c.status === 'active').reduce((s, c) => s + (c.spend_limit || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'البطاقات المؤسسية' : 'Corporate Cards'}
        subtitle={isRTL ? 'إصدار وإدارة البطاقات الافتراضية والفعلية' : 'Issue and manage virtual/physical cards'}
        actionLabel={isRTL ? 'إصدار بطاقة' : 'Issue Card'}
        actionIcon={Plus}
        onAction={() => setShowForm(true)}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'بطاقات نشطة' : 'Active Cards'}</p><p className="text-2xl font-bold text-blue-600">{cards.filter(c => c.status === 'active').length}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'إجمالي الحد' : 'Total Limit'}</p><p className="text-2xl font-bold text-emerald-600">{totalLimit.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'إجمالي الإنفاق' : 'Total Spend'}</p><p className="text-2xl font-bold text-amber-600">{totalSpend.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'معاملات' : 'Transactions'}</p><p className="text-2xl font-bold">{transactions.length}</p></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="cards" className="gap-1"><CreditCard className="w-4 h-4" />{isRTL ? 'البطاقات' : 'Cards'}</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1"><ArrowUpDown className="w-4 h-4" />{isRTL ? 'المعاملات' : 'Transactions'}</TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-1"><BarChart3 className="w-4 h-4" />{isRTL ? 'التسوية' : 'Reconciliation'}</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'حامل البطاقة' : 'Cardholder'}</TableHead>
                  <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{isRTL ? 'رقم البطاقة' : 'Card Number'}</TableHead>
                  <TableHead>{isRTL ? 'الحد' : 'Limit'}</TableHead>
                  <TableHead>{isRTL ? 'القيود' : 'Restrictions'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : cards.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{isRTL ? 'لا توجد بطاقات' : 'No cards'}</TableCell></TableRow>
                ) : cards.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.cardholder_name}</TableCell>
                    <TableCell><Badge variant="outline">{c.card_type === 'virtual' ? (isRTL ? 'افتراضية' : 'Virtual') : (isRTL ? 'فعلية' : 'Physical')}</Badge></TableCell>
                    <TableCell className="font-mono text-sm">{c.card_number}</TableCell>
                    <TableCell>{c.spend_limit?.toLocaleString()} {c.currency || 'SAR'}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{c.vendor_restrictions || c.category_restrictions || '-'}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{isRTL ? 'حامل البطاقة' : 'Cardholder'}</TableHead>
                  <TableHead>{isRTL ? 'التاجر' : 'Merchant'}</TableHead>
                  <TableHead>{isRTL ? 'الفئة' : 'Category'}</TableHead>
                  <TableHead>{isRTL ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{isRTL ? 'لا توجد معاملات' : 'No transactions'}</TableCell></TableRow>
                ) : transactions.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>{t.transaction_date ? format(new Date(t.transaction_date), 'dd/MM/yyyy') : '-'}</TableCell>
                    <TableCell>{t.cardholder_name}</TableCell>
                    <TableCell>{t.merchant || '-'}</TableCell>
                    <TableCell><Badge variant="outline">{t.category || '-'}</Badge></TableCell>
                    <TableCell className="font-medium">{t.amount?.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</TableCell>
                    <TableCell><StatusBadge status={t.status || 'completed'} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <Card className="p-6 text-center">
            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="font-semibold">{isRTL ? 'تسوية المعاملات' : 'Transaction Reconciliation'}</h4>
            <p className="text-sm text-slate-500 mt-2">{isRTL ? 'مطابقة معاملات البطاقات مع القيود المحاسبية تلقائياً' : 'Automatically match card transactions with GL entries'}</p>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="p-3 bg-slate-50 rounded-lg"><p className="text-sm text-slate-500">{isRTL ? 'معاملات مطابقة' : 'Matched'}</p><p className="text-xl font-bold text-emerald-600">{transactions.filter(t => t.reconciled).length}</p></div>
              <div className="p-3 bg-slate-50 rounded-lg"><p className="text-sm text-slate-500">{isRTL ? 'غير مطابقة' : 'Unmatched'}</p><p className="text-xl font-bold text-amber-600">{transactions.filter(t => !t.reconciled).length}</p></div>
              <div className="p-3 bg-slate-50 rounded-lg"><p className="text-sm text-slate-500">{isRTL ? 'مشبوهة' : 'Flagged'}</p><p className="text-xl font-bold text-red-600">{transactions.filter(t => t.flagged).length}</p></div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isRTL ? 'إصدار بطاقة جديدة' : 'Issue New Card'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم حامل البطاقة' : 'Cardholder Name'} *</Label>
                <Input value={form.cardholder_name} onChange={(e) => setForm(p => ({...p, cardholder_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النوع' : 'Card Type'}</Label>
                <Select value={form.card_type} onValueChange={(v) => setForm(p => ({...p, card_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="virtual">{isRTL ? 'افتراضية' : 'Virtual'}</SelectItem>
                    <SelectItem value="physical">{isRTL ? 'فعلية' : 'Physical'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'حد الإنفاق (ر.س)' : 'Spend Limit (SAR)'}</Label>
                <Input type="number" min="0" value={form.spend_limit} onChange={(e) => setForm(p => ({...p, spend_limit: parseFloat(e.target.value) || 0}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'قيود الموردين' : 'Vendor Restrictions'}</Label>
              <Input value={form.vendor_restrictions} onChange={(e) => setForm(p => ({...p, vendor_restrictions: e.target.value}))} placeholder={isRTL ? 'اختياري' : 'Optional'} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'قيود الفئات' : 'Category Restrictions'}</Label>
              <Input value={form.category_restrictions} onChange={(e) => setForm(p => ({...p, category_restrictions: e.target.value}))} placeholder={isRTL ? 'اختياري' : 'Optional'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إصدار' : 'Issue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
