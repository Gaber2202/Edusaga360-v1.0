import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Search, Edit2, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];
const ACCOUNT_CATEGORIES = {
  asset: ['current_asset', 'fixed_asset'],
  liability: ['current_liability', 'long_term_liability'],
  equity: ['equity'],
  revenue: ['operating_revenue', 'other_revenue'],
  expense: ['operating_expense', 'other_expense']
};

export default function ChartOfAccounts() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch: _filterByBranch } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState({});

  const [formData, setFormData] = useState({
    account_code: '',
    name_ar: '',
    name_en: '',
    account_type: 'asset',
    account_category: 'current_asset',
    parent_account_id: '',
    normal_balance: 'debit',
    is_control_account: false,
    is_bank_account: false,
    is_active: true,
    opening_balance: 0
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['chartOfAccounts', tenantId],
    queryFn: () => fetchData(tenantQuery('chart_of_accounts').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const filteredAccounts = accounts.filter(acc => {
    const matchesSearch = acc.account_code?.includes(search) || 
      acc.name_ar?.includes(search) || 
      acc.name_en?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || acc.account_type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Build tree structure
  const buildTree = (accounts, parentId = null) => {
    return accounts
      .filter(acc => acc.parent_account_id === parentId || (!acc.parent_account_id && !parentId))
      .map(acc => ({
        ...acc,
        children: buildTree(accounts, acc.id)
      }));
  };

  const accountTree = buildTree(filteredAccounts);

  const handleSave = async () => {
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = { ...formData, branch_id: selectedBranchId, ...(tid && { tenant_id: tid }) };
      
      if (editingAccount?.id) {
        await tenantQuery('chart_of_accounts').update(data);
        await logAuditEvent({
          action: AuditActions.UPDATE,
          entityType: 'ChartOfAccounts',
          entityId: editingAccount.id,
          oldValues: editingAccount,
          newValues: data
        });
      } else {
        const created = await tenantQuery('chart_of_accounts').insert(data);
        await logAuditEvent({
          action: AuditActions.CREATE,
          entityType: 'ChartOfAccounts',
          entityId: created.id,
          newValues: data
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['chartOfAccounts'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingAccount(null);
    setFormData({
      account_code: '',
      name_ar: '',
      name_en: '',
      account_type: 'asset',
      account_category: 'current_asset',
      parent_account_id: '',
      normal_balance: 'debit',
      is_control_account: false,
      is_bank_account: false,
      is_active: true,
      opening_balance: 0
    });
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    // CRITICAL FIX: Properly load account data for editing
    setFormData({
      account_code: account.account_code || '',
      name_ar: account.name_ar || '',
      name_en: account.name_en || '',
      account_type: account.account_type || 'asset',
      account_category: account.account_category || 'current_asset',
      parent_account_id: account.parent_account_id || '',
      normal_balance: account.normal_balance || 'debit',
      is_control_account: account.is_control_account || false,
      is_bank_account: account.is_bank_account || false,
      is_active: account.is_active !== false,
      opening_balance: account.opening_balance || 0
    });
    setShowForm(true);
  };

  const toggleExpand = (id) => {
    setExpandedAccounts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const AccountRow = ({ account, level = 0 }) => {
    const hasChildren = account.children?.length > 0;
    const isExpanded = expandedAccounts[account.id];

    return (
      <>
        <TableRow className="hover:bg-sand">
          <TableCell style={{ paddingLeft: `${level * 24 + 16}px` }}>
            <div className="flex items-center gap-2">
              {hasChildren && (
                <button onClick={() => toggleExpand(account.id)} className="p-1 hover:bg-sand-alt rounded">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              {!hasChildren && <div className="w-6" />}
              <span className="font-mono text-sm">{account.account_code}</span>
            </div>
          </TableCell>
          <TableCell className="font-medium">{isRTL ? account.name_ar : account.name_en || account.name_ar}</TableCell>
          <TableCell>{t(account.account_type)}</TableCell>
          <TableCell>{t(account.normal_balance)}</TableCell>
          <TableCell>
            <StatusBadge status={account.is_active ? 'active' : 'inactive'} />
          </TableCell>
          <TableCell>
            <Button size="icon" variant="ghost" onClick={() => handleEdit(account)}>
              <Edit2 className="w-4 h-4" />
            </Button>
          </TableCell>
        </TableRow>
        {isExpanded && account.children?.map(child => (
          <AccountRow key={child.id} account={child} level={level + 1} />
        ))}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('chartOfAccounts')}
        subtitle={isRTL ? 'إدارة دليل الحسابات' : 'Manage chart of accounts'}
        action
        actionLabel={isRTL ? 'إضافة حساب' : 'Add Account'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48 bg-white">
            <SelectValue placeholder={isRTL ? 'نوع الحساب' : 'Account Type'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {ACCOUNT_TYPES.map(type => (
              <SelectItem key={type} value={type}>{t(type) || type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-sand">
              <TableHead>{t('accountCode')}</TableHead>
              <TableHead>{isRTL ? 'اسم الحساب' : 'Account Name'}</TableHead>
              <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
              <TableHead>{isRTL ? 'الطبيعة' : 'Normal Balance'}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : accountTree.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('noData')}</TableCell></TableRow>
            ) : (
              accountTree.map(account => <AccountRow key={account.id} account={account} />)
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAccount ? (isRTL ? 'تعديل الحساب' : 'Edit Account') : (isRTL ? 'إضافة حساب' : 'Add Account')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('accountCode')} *</Label>
                <Input value={formData.account_code} onChange={(e) => setFormData(p => ({...p, account_code: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الحساب' : 'Account Type'}</Label>
                <Select value={formData.account_type} onValueChange={(v) => setFormData(p => ({...p, account_type: v, account_category: ACCOUNT_CATEGORIES[v][0], normal_balance: ['asset','expense'].includes(v) ? 'debit' : 'credit'}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(type => <SelectItem key={type} value={type}>{t(type) || type}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData(p => ({...p, name_ar: e.target.value}))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData(p => ({...p, name_en: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الحساب الرئيسي' : 'Parent Account'}</Label>
                <Select value={formData.parent_account_id || 'none'} onValueChange={(v) => setFormData(p => ({...p, parent_account_id: v === 'none' ? '' : v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isRTL ? 'بدون' : 'None'}</SelectItem>
                    {accounts.filter(a => a.id !== editingAccount?.id).map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>{acc.account_code} - {acc.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الرصيد الافتتاحي' : 'Opening Balance'}</Label>
                <Input type="number" value={formData.opening_balance} onChange={(e) => setFormData(p => ({...p, opening_balance: parseFloat(e.target.value) || 0}))} />
              </div>
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={formData.is_control_account} onCheckedChange={(v) => setFormData(p => ({...p, is_control_account: v}))} />
                <Label>{isRTL ? 'حساب تحكم' : 'Control Account'}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.is_bank_account} onCheckedChange={(v) => setFormData(p => ({...p, is_bank_account: v}))} />
                <Label>{isRTL ? 'حساب بنكي' : 'Bank Account'}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData(p => ({...p, is_active: v}))} />
                <Label>{t('active')}</Label>
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