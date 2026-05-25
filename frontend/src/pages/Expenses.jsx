import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Receipt, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const EXPENSE_CATEGORIES = [
  'travel', 'fuel', 'meals', 'accommodation', 'stationery', 
  'software', 'training', 'marketing', 'utilities', 'other'
];

export default function Expenses() {
  const { t, isRTL } = useLanguage();
  const { user, userRole } = useRole();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('myExpenses');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    category: 'travel',
    amount: 0,
    expense_date: format(new Date(), 'yyyy-MM-dd'),
    merchant: '',
    description: '',
    receipt_url: '',
    payment_method: 'personal'
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('expenses').select('*').match(tenantFilter(branchFilter()), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const myExpenses = expenses.filter(e => e.created_by === user?.email);
  const allExpenses = filterByBranch(expenses);

  const currentExpenses = activeTab === 'myExpenses' ? myExpenses : allExpenses;

  // Stats
  const pendingApproval = currentExpenses.filter(e => e.status === 'pending').length;
  const totalPending = currentExpenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + (e.amount || 0), 0);
  const approved = currentExpenses.filter(e => e.status === 'approved').length;
  const totalApproved = currentExpenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + (e.amount || 0), 0);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      setFormData(p => ({ ...p, receipt_url: file_url }));
      toast.success(isRTL ? 'تم رفع الإيصال' : 'Receipt uploaded');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentEmp = employees.find(e => e.email === user?.email);
      
      const tid = getTenantIdForCreate();
      const data = {
        ...formData,
        ...(tid && { tenant_id: tid }),
        expense_number: `EXP-${Date.now().toString(36).toUpperCase()}`,
        employee_id: currentEmp?.id,
        employee_name: currentEmp?.name_ar,
        branch_id: currentEmp?.branch_id || selectedBranchId,
        department_id: currentEmp?.department_id,
        status: 'pending'
      };

      const created = await tenantQuery('expenses').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Expense', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم إرسال المصروف' : 'Expense submitted');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (expense) => {
    try {
      await tenantQuery('expenses').update({
        status: 'approved',
        approved_by: user?.email,
        approved_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: 'APPROVE', entityType: 'Expense', entityId: expense.id });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(isRTL ? 'تم الاعتماد' : 'Approved');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleReject = async (expense) => {
    try {
      await tenantQuery('expenses').update({
        status: 'rejected',
        approved_by: user?.email,
        approved_date: format(new Date(), 'yyyy-MM-dd')
      });
      await logAuditEvent({ action: 'REJECT', entityType: 'Expense', entityId: expense.id });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(isRTL ? 'تم الرفض' : 'Rejected');
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      category: 'travel',
      amount: 0,
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      merchant: '',
      description: '',
      receipt_url: '',
      payment_method: 'personal'
    });
  };

  const columns = [
    { header: isRTL ? 'الرقم' : 'Number', cell: (row) => <span className="font-mono text-sm">{row.expense_number}</span> },
    { header: isRTL ? 'التاريخ' : 'Date', cell: (row) => format(new Date(row.expense_date), 'dd/MM/yyyy') },
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: isRTL ? 'الفئة' : 'Category', cell: (row) => {
      const labels = {
        travel: isRTL ? 'سفر' : 'Travel',
        fuel: isRTL ? 'وقود' : 'Fuel',
        meals: isRTL ? 'وجبات' : 'Meals',
        accommodation: isRTL ? 'إقامة' : 'Accommodation',
        other: isRTL ? 'أخرى' : 'Other'
      };
      return labels[row.category] || row.category;
    }},
    { header: isRTL ? 'المبلغ' : 'Amount', cell: (row) => `${row.amount?.toLocaleString()} ${t('sar')}` },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {row.status === 'pending' && (userRole === 'admin' || userRole === 'finance') && (
          <>
            <Button size="sm" variant="ghost" onClick={() => handleApprove(row)} className="text-emerald-600">
              <CheckCircle className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleReject(row)} className="text-red-600">
              <XCircle className="w-4 h-4" />
            </Button>
          </>
        )}
        {row.receipt_url && (
          <Button size="sm" variant="ghost" asChild>
            <a href={row.receipt_url} target="_blank" rel="noopener noreferrer">
              <Receipt className="w-4 h-4" />
            </a>
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'المصروفات' : 'Expenses'}
        subtitle={isRTL ? 'إدارة مصروفات الموظفين' : 'Manage employee expenses'}
        action
        actionLabel={isRTL ? 'إضافة مصروف' : 'Add Expense'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'معلقة' : 'Pending'} value={pendingApproval} subtitle={`${totalPending.toLocaleString()} ${t('sar')}`} icon={Receipt} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'معتمدة' : 'Approved'} value={approved} subtitle={`${totalApproved.toLocaleString()} ${t('sar')}`} icon={CheckCircle} iconClassName="bg-emerald-50" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="myExpenses">{isRTL ? 'مصروفاتي' : 'My Expenses'}</TabsTrigger>
          {(userRole === 'admin' || userRole === 'finance' || userRole === 'branch_manager') && (
            <TabsTrigger value="allExpenses">{isRTL ? 'جميع المصروفات' : 'All Expenses'}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="myExpenses" className="mt-6">
          <DataTable columns={columns} data={myExpenses} loading={isLoading} emptyMessage={t('noData')} />
        </TabsContent>

        <TabsContent value="allExpenses" className="mt-6">
          <DataTable columns={columns} data={allExpenses} loading={isLoading} emptyMessage={t('noData')} />
        </TabsContent>
      </Tabs>

      {/* Expense Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إضافة مصروف' : 'Add Expense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الفئة' : 'Category'} *</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData(p => ({...p, category: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'travel' && (isRTL ? 'سفر' : 'Travel')}
                        {cat === 'fuel' && (isRTL ? 'وقود' : 'Fuel')}
                        {cat === 'meals' && (isRTL ? 'وجبات' : 'Meals')}
                        {cat === 'accommodation' && (isRTL ? 'إقامة' : 'Accommodation')}
                        {cat === 'stationery' && (isRTL ? 'قرطاسية' : 'Stationery')}
                        {cat === 'software' && (isRTL ? 'برمجيات' : 'Software')}
                        {cat === 'training' && (isRTL ? 'تدريب' : 'Training')}
                        {cat === 'marketing' && (isRTL ? 'تسويق' : 'Marketing')}
                        {cat === 'utilities' && (isRTL ? 'خدمات' : 'Utilities')}
                        {cat === 'other' && (isRTL ? 'أخرى' : 'Other')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المبلغ' : 'Amount'} *</Label>
                <Input type="number" value={formData.amount} onChange={(e) => setFormData(p => ({...p, amount: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'التاريخ' : 'Date'}</Label>
                <Input type="date" value={formData.expense_date} onChange={(e) => setFormData(p => ({...p, expense_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'التاجر' : 'Merchant'}</Label>
                <Input value={formData.merchant} onChange={(e) => setFormData(p => ({...p, merchant: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData(p => ({...p, description: e.target.value}))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'رفع الإيصال' : 'Upload Receipt'}</Label>
              <div className="flex gap-2">
                <Input type="file" accept="image/*,.pdf" onChange={handleFileUpload} disabled={uploading} />
                {uploading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
              </div>
              {formData.receipt_url && (
                <p className="text-xs text-emerald-600">{isRTL ? 'تم الرفع بنجاح' : 'Uploaded successfully'}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'طريقة الدفع' : 'Payment Method'}</Label>
              <Select value={formData.payment_method} onValueChange={(v) => setFormData(p => ({...p, payment_method: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">{isRTL ? 'شخصي' : 'Personal'}</SelectItem>
                  <SelectItem value="company_card">{isRTL ? 'بطاقة الشركة' : 'Company Card'}</SelectItem>
                  <SelectItem value="cash">{isRTL ? 'نقدي' : 'Cash'}</SelectItem>
                </SelectContent>
              </Select>
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