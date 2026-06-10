import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Search, Edit2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function CostCenters() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [editingCC, setEditingCC] = useState(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name_ar: '',
    name_en: '',
    parent_id: '',
    is_active: true
  });

  const { data: costCenters = [], isLoading } = useQuery({
    queryKey: ['costCenters', tenantId],
    queryFn: () => fetchData(tenantQuery('cost_centers').select('*').match(tenantFilter()).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredCostCenters = costCenters.filter(cc =>
    cc.code?.includes(search) || cc.name_ar?.includes(search) || cc.name_en?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = { ...formData, branch_id: selectedBranchId, ...(tid && { tenant_id: tid }) };

      if (editingCC?.id) {
        await tenantQuery('cost_centers').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'CostCenter', entityId: editingCC.id, oldValues: editingCC, newValues: data });
      } else {
        const created = await tenantQuery('cost_centers').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'CostCenter', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['costCenters'] });
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
    setEditingCC(null);
    setFormData({
      code: '',
      name_ar: '',
      name_en: '',
      parent_id: '',
      is_active: true
    });
  };

  const handleEdit = (cc) => {
    setEditingCC(cc);
    // CRITICAL FIX: Properly load cost center data for editing
    setFormData({
      code: cc.code || '',
      name_ar: cc.name_ar || '',
      name_en: cc.name_en || '',
      parent_id: cc.parent_id || '',
      is_active: cc.is_active !== false
    });
    setShowForm(true);
  };

  const columns = [
    { header: isRTL ? 'الرمز' : 'Code', cell: (row) => <span className="font-mono">{row.code}</span> },
    { header: isRTL ? 'الاسم (عربي)' : 'Name (Arabic)', accessorKey: 'name_ar' },
    { header: isRTL ? 'الاسم (إنجليزي)' : 'Name (English)', accessorKey: 'name_en' },
    { header: isRTL ? 'الفرع' : 'Branch', cell: (row) => {
      const branch = branches.find(b => b.id === row.branch_id);
      return branch ? (isRTL ? branch.name_ar : branch.name_en) : '-';
    }},
    { header: t('status'), cell: (row) => <StatusBadge status={row.is_active ? 'active' : 'inactive'} /> },
    { header: t('actions'), cell: (row) => (
      <Button size="icon" variant="ghost" onClick={() => handleEdit(row)}>
        <Edit2 className="w-4 h-4" />
      </Button>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'مراكز التكلفة' : 'Cost Centers'}
        subtitle={isRTL ? 'إدارة مراكز التكلفة' : 'Manage cost centers'}
        action
        actionLabel={isRTL ? 'إضافة مركز تكلفة' : 'Add Cost Center'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredCostCenters} loading={isLoading} emptyMessage={t('noData')} />

      {/* Cost Center Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCC ? (isRTL ? 'تعديل مركز التكلفة' : 'Edit Cost Center') : (isRTL ? 'إضافة مركز تكلفة' : 'Add Cost Center')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الرمز' : 'Code'} *</Label>
              <Input value={formData.code} onChange={(e) => setFormData(p => ({...p, code: e.target.value}))} />
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
            <div className="space-y-2">
              <Label>{isRTL ? 'مركز التكلفة الرئيسي' : 'Parent Cost Center'}</Label>
              <Select value={formData.parent_id || 'none'} onValueChange={(v) => setFormData(p => ({...p, parent_id: v === 'none' ? '' : v}))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isRTL ? 'بدون' : 'None'}</SelectItem>
                  {costCenters.filter(cc => cc.id !== editingCC?.id).map(cc => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name_ar}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData(p => ({...p, is_active: v}))} />
              <Label>{t('active')}</Label>
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