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
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Search, Package, Loader2, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const CATEGORIES = ['land', 'buildings', 'vehicles', 'furniture', 'equipment', 'computers', 'software', 'other'];
const _DEPRECIATION_METHODS = ['straight_line', 'declining_balance'];

export default function Assets() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    asset_code: '',
    name_ar: '',
    name_en: '',
    category: 'equipment',
    branch_id: '',
    location: '',
    acquisition_date: format(new Date(), 'yyyy-MM-dd'),
    acquisition_cost: 0,
    acquisition_source: 'manual',
    useful_life_years: 5,
    salvage_value: 0,
    depreciation_method: 'straight_line',
    serial_number: '',
    warranty_expiry: '',
    notes: '',
    status: 'active'
  });

  const { data: branchList = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('fixed_assets').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const filteredAssets = filterByBranch(assets).filter(a => {
    const matchesSearch = a.name_ar?.includes(search) || a.name_en?.toLowerCase().includes(search.toLowerCase()) || a.asset_code?.includes(search);
    const matchesCategory = categoryFilter === 'all' || a.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Calculate stats
  const totalCost = filteredAssets.reduce((sum, a) => sum + (a.acquisition_cost || 0), 0);
  const totalDepreciation = filteredAssets.reduce((sum, a) => sum + (a.accumulated_depreciation || 0), 0);
  const totalNBV = totalCost - totalDepreciation;

  const handleSave = async () => {
    if (!formData.name_ar) {
      toast.error(isRTL ? 'يرجى إدخال اسم الأصل' : 'Asset name is required');
      return;
    }
    if (saving) return; // prevent double-submit
    setSaving(true);
    try {
      const assetCode = formData.asset_code || `AST-${Date.now().toString(36).toUpperCase()}`;
      const depRate = formData.depreciation_method === 'straight_line' 
        ? (100 / (formData.useful_life_years || 5))
        : (200 / (formData.useful_life_years || 5));
      
      const branchId = formData.branch_id || (selectedBranchId && selectedBranchId !== 'all' ? selectedBranchId : null);
      if (!branchId) {
        toast.error(isRTL ? 'يرجى اختيار الفرع' : 'Please select a branch');
        setSaving(false);
        return;
      }

      const tid = getTenantIdForCreate();
      const data = {
        ...formData,
        ...(tid && { tenant_id: tid }),
        asset_code: assetCode,
        branch_id: branchId,
        depreciation_rate: depRate,
        acquisition_cost: parseFloat(formData.acquisition_cost) || 0,
        useful_life_years: parseInt(formData.useful_life_years) || 5,
        salvage_value: parseFloat(formData.salvage_value) || 0,
        net_book_value: (parseFloat(formData.acquisition_cost) || 0) - (formData.accumulated_depreciation || 0)
      };

      if (editingAsset?.id) {
        await tenantQuery('fixed_assets').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'FixedAsset', entityId: editingAsset.id, oldValues: editingAsset, newValues: data });
        toast.success(isRTL ? 'تم تحديث الأصل بنجاح' : 'Asset updated successfully');
      } else {
        const created = await tenantQuery('fixed_assets').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'FixedAsset', entityId: created.id, newValues: data });
        toast.success(isRTL ? 'تم إنشاء الأصل بنجاح' : 'Asset created successfully');
      }

      await queryClient.invalidateQueries({ queryKey: ['assets'] });
      setShowForm(false);
      resetForm();
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
      // Log to system error
      supabase.SystemError?.create({
        module: 'Assets',
        action: editingAsset?.id ? 'update' : 'create',
        error_message: error.message,
        timestamp: new Date().toISOString()
      }).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (asset) => {
    setEditingAsset(asset);
    setFormData({
      asset_code: asset.asset_code || '',
      name_ar: asset.name_ar || '',
      name_en: asset.name_en || '',
      category: asset.category || 'equipment',
      branch_id: asset.branch_id || '',
      location: asset.location || '',
      acquisition_date: asset.acquisition_date || format(new Date(), 'yyyy-MM-dd'),
      acquisition_cost: asset.acquisition_cost || 0,
      acquisition_source: asset.acquisition_source || 'manual',
      useful_life_years: asset.useful_life_years || 5,
      salvage_value: asset.salvage_value || 0,
      depreciation_method: asset.depreciation_method || 'straight_line',
      serial_number: asset.serial_number || '',
      warranty_expiry: asset.warranty_expiry || '',
      notes: asset.notes || '',
      status: asset.status || 'active'
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingAsset(null);
    setFormData({
      asset_code: '', name_ar: '', name_en: '', category: 'equipment',
      branch_id: (selectedBranchId && selectedBranchId !== 'all') ? selectedBranchId : '',
      location: '',
      acquisition_date: format(new Date(), 'yyyy-MM-dd'), acquisition_cost: 0, acquisition_source: 'manual',
      useful_life_years: 5, salvage_value: 0, depreciation_method: 'straight_line',
      serial_number: '', warranty_expiry: '', notes: '', status: 'active'
    });
  };

  const columns = [
    { header: isRTL ? 'الرمز' : 'Code', cell: (row) => <span className="font-mono text-sm">{row.asset_code}</span> },
    { header: isRTL ? 'الأصل' : 'Asset', cell: (row) => <div><p className="font-medium">{row.name_ar}</p><p className="text-sm text-slate-500">{t(row.category)}</p></div> },
    { header: isRTL ? 'تكلفة الاقتناء' : 'Cost', cell: (row) => <span>{row.acquisition_cost?.toLocaleString()} {t('sar')}</span> },
    { header: isRTL ? 'الإهلاك المتراكم' : 'Acc. Dep.', cell: (row) => <span className="text-red-600">{(row.accumulated_depreciation || 0).toLocaleString()} {t('sar')}</span> },
    { header: isRTL ? 'صافي القيمة' : 'NBV', cell: (row) => <span className="font-semibold">{(row.net_book_value || row.acquisition_cost)?.toLocaleString()} {t('sar')}</span> },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
        {t('edit')}
      </Button>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('assetRegister')}
        subtitle={isRTL ? 'إدارة الأصول الثابتة' : 'Manage fixed assets'}
        action
        actionLabel={isRTL ? 'إضافة أصل' : 'Add Asset'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={isRTL ? 'إجمالي التكلفة' : 'Total Cost'} value={`${(totalCost/1000).toFixed(0)}K`} icon={Package} iconClassName="bg-blue-50" />
        <StatCard title={isRTL ? 'إجمالي الإهلاك' : 'Total Depreciation'} value={`${(totalDepreciation/1000).toFixed(0)}K`} icon={TrendingDown} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'صافي القيمة الدفترية' : 'Net Book Value'} value={`${(totalNBV/1000).toFixed(0)}K`} icon={Package} iconClassName="bg-emerald-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48 bg-white">
            <SelectValue placeholder={t('category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('all')}</SelectItem>
            {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{t(cat) || cat}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} data={filteredAssets} loading={isLoading} emptyMessage={t('noData')} />

      {/* Asset Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAsset ? (isRTL ? 'تعديل الأصل' : 'Edit Asset') : (isRTL ? 'إضافة أصل' : 'Add Asset')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData(p => ({...p, name_ar: e.target.value}))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData(p => ({...p, name_en: e.target.value}))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>{isRTL ? 'الفرع' : 'Branch'} *</Label>
                <Select value={formData.branch_id} onValueChange={(v) => setFormData(p => ({...p, branch_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الفرع' : 'Select branch'} /></SelectTrigger>
                  <SelectContent>
                    {branchList.map(b => (
                      <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : (b.name_en || b.name_ar)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('category')}</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData(p => ({...p, category: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{t(cat) || cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الموقع' : 'Location'}</Label>
                <Input value={formData.location} onChange={(e) => setFormData(p => ({...p, location: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('acquisitionDate')}</Label>
                <Input type="date" value={formData.acquisition_date} onChange={(e) => setFormData(p => ({...p, acquisition_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('acquisitionCost')} *</Label>
                <Input type="number" value={formData.acquisition_cost} onChange={(e) => setFormData(p => ({...p, acquisition_cost: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('usefulLife')} ({isRTL ? 'سنوات' : 'years'})</Label>
                <Input type="number" value={formData.useful_life_years} onChange={(e) => setFormData(p => ({...p, useful_life_years: parseInt(e.target.value) || 5}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'القيمة التخريدية' : 'Salvage Value'}</Label>
                <Input type="number" value={formData.salvage_value} onChange={(e) => setFormData(p => ({...p, salvage_value: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('depreciationMethod')}</Label>
                <Select value={formData.depreciation_method} onValueChange={(v) => setFormData(p => ({...p, depreciation_method: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">{isRTL ? 'القسط الثابت' : 'Straight Line'}</SelectItem>
                    <SelectItem value="declining_balance">{isRTL ? 'القسط المتناقص' : 'Declining Balance'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الرقم التسلسلي' : 'Serial Number'}</Label>
                <Input value={formData.serial_number} onChange={(e) => setFormData(p => ({...p, serial_number: e.target.value}))} />
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