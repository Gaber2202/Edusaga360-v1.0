import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Loader2, MapPin, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Branches() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name_ar: '',
    name_en: '',
    city: '',
    address: '',
    phone: '',
    email: '',
    vat_number: '',
    cr_number: '',
    is_active: true
  });

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => tenantQuery('branchs').select('*').match(tenantFilter()),
    enabled: hasTenantAccess,
  });

  const handleSave = async () => {
    if (!formData.name_ar) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill in required fields');
      return;
    }
    
    setSaving(true);
    try {
      const branchCode = formData.code || `BR-${Date.now().toString(36).toUpperCase()}`;
      const data = { ...formData, code: branchCode, tenant_id: tenantId };

      if (editingBranch?.id) {
        await tenantQuery('branchs').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Branch', entityId: editingBranch.id, oldValues: editingBranch, newValues: data });
      } else {
        const created = await tenantQuery('branchs').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Branch', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['branches'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      toast.error(isRTL ? 'حدث خطأ: ' + (error.message || 'خطأ غير معروف') : 'Error: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (branch) => {
    setEditingBranch(branch);
    // CRITICAL FIX: Properly load branch data for editing
    setFormData({
      code: branch.code || '',
      name_ar: branch.name_ar || '',
      name_en: branch.name_en || '',
      city: branch.city || '',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      vat_number: branch.vat_number || '',
      cr_number: branch.cr_number || '',
      is_active: branch.is_active !== false
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingBranch(null);
    setFormData({
      code: '', name_ar: '', name_en: '', city: '', address: '', phone: '',
      email: '', vat_number: '', cr_number: '', is_active: true
    });
  };

  const columns = [
    { header: isRTL ? 'الرمز' : 'Code', cell: (row) => <span className="font-mono text-sm">{row.code}</span> },
    { header: isRTL ? 'اسم الفرع' : 'Branch Name', cell: (row) => <div><p className="font-medium">{row.name_ar}</p><p className="text-sm text-slate-500">{row.name_en}</p></div> },
    { header: isRTL ? 'المدينة' : 'City', cell: (row) => <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /><span>{row.city}</span></div> },
    { header: isRTL ? 'الهاتف' : 'Phone', cell: (row) => row.phone ? <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400" /><span>{row.phone}</span></div> : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.is_active ? 'active' : 'inactive'} /> },
    { header: t('actions'), cell: (row) => (
      <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
        {t('edit')}
      </Button>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'الفروع' : 'Branches'}
        subtitle={isRTL ? 'إدارة فروع المدرسة' : 'Manage school branches'}
        action
        actionLabel={isRTL ? 'إضافة فرع' : 'Add Branch'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <DataTable columns={columns} data={branches} loading={isLoading} emptyMessage={t('noData')} />

      {/* Branch Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBranch ? (isRTL ? 'تعديل الفرع' : 'Edit Branch') : (isRTL ? 'إضافة فرع' : 'Add Branch')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'رمز الفرع' : 'Branch Code'}</Label>
                <Input value={formData.code} onChange={(e) => setFormData(p => ({...p, code: e.target.value}))} placeholder="BR-001" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المدينة' : 'City'}</Label>
                <Input value={formData.city} onChange={(e) => setFormData(p => ({...p, city: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData(p => ({...p, name_ar: e.target.value}))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData(p => ({...p, name_en: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('phone')}</Label>
                <Input value={formData.phone} onChange={(e) => setFormData(p => ({...p, phone: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('email')}</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData(p => ({...p, email: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الرقم الضريبي' : 'VAT Number'}</Label>
                <Input value={formData.vat_number} onChange={(e) => setFormData(p => ({...p, vat_number: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'السجل التجاري' : 'CR Number'}</Label>
                <Input value={formData.cr_number} onChange={(e) => setFormData(p => ({...p, cr_number: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('address')}</Label>
              <Textarea value={formData.address} onChange={(e) => setFormData(p => ({...p, address: e.target.value}))} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData(p => ({...p, is_active: v}))} />
              <Label>{t('active')}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !formData.name_ar}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}