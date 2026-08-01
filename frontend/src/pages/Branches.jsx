import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
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

const INHERIT_VALUE = '__inherit__';

export default function Branches() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const { data: jurisdictions = [] } = useQuery({
    queryKey: ['jurisdictions'],
    queryFn: () => fetchData(tenantQuery('jurisdictions').select('code,name_en,name_ar').eq('status', 'ga').order('code')),
    enabled: hasTenantAccess,
  });

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
    status: 'active',
    jurisdiction_code: ''
  });

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const handleSave = async () => {
    if (!formData.name_ar) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill in required fields');
      return;
    }
    if (formData.jurisdiction_code === '') {
      toast.error(isRTL ? 'يرجى اختيار جهة صالحة' : 'Please select a jurisdiction or "Inherit from school"');
      return;
    }
    if (
      formData.jurisdiction_code !== INHERIT_VALUE &&
      !jurisdictions.some(j => j.code === formData.jurisdiction_code)
    ) {
      toast.error(isRTL ? 'الجهة المختارة غير مضبوطة' : 'Selected jurisdiction is not configured');
      return;
    }

    setSaving(true);
    try {
      const branchCode = formData.code || `BR-${Date.now().toString(36).toUpperCase()}`;
      const jurisdiction_code = formData.jurisdiction_code === INHERIT_VALUE ? null : formData.jurisdiction_code;
      const data = { ...formData, code: branchCode, tenant_id: tenantId, jurisdiction_code };

      if (editingBranch?.id) {
        await tenantQuery('branches').update(data).eq('id', editingBranch.id);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Branch', entityId: editingBranch.id, oldValues: editingBranch, newValues: data });
      } else {
        const { data: created, error } = await tenantQuery('branches').insert(data).select().single();
        if (error) throw error;
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Branch', entityId: created?.id, newValues: data });
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

  const handleEdit = (row) => {
    setEditingBranch(row);
    const { jurisdiction_code, ...rest } = row;
    setFormData({
      code: rest.code || '',
      name_ar: rest.name_ar || '',
      name_en: rest.name_en || '',
      city: rest.city || '',
      address: rest.address || '',
      phone: rest.phone || '',
      email: rest.email || '',
      status: rest.status || 'active',
      jurisdiction_code: jurisdiction_code || INHERIT_VALUE
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingBranch(null);
    setFormData({
      code: '', name_ar: '', name_en: '', city: '', address: '', phone: '',
      email: '', status: 'active', jurisdiction_code: INHERIT_VALUE
    });
  };

  const columns = [
    { header: isRTL ? 'الرمز' : 'Code', cell: (row) => <span className="font-mono text-sm">{row.code}</span> },
    { header: isRTL ? 'اسم الفرع' : 'Branch Name', cell: (row) => <div><p className="font-medium">{row.name_ar}</p><p className="text-sm text-muted-foreground">{row.name_en}</p></div> },
    { header: isRTL ? 'المدينة' : 'City', cell: (row) => <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span>{row.city}</span></div> },
    { header: isRTL ? 'الهاتف' : 'Phone', cell: (row) => row.phone ? <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>{row.phone}</span></div> : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status || 'inactive'} /> },
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
            </div>
            <div className="space-y-2">
              <Label>{t('address')}</Label>
              <Textarea value={formData.address} onChange={(e) => setFormData(p => ({...p, address: e.target.value}))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الاختصاص القضائي' : 'Jurisdiction'} *</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.jurisdiction_code}
                onChange={(e) => setFormData(p => ({...p, jurisdiction_code: e.target.value}))}
              >
                <option value="">{isRTL ? 'اختر الاختصاص' : 'Select jurisdiction'}</option>
                <option value={INHERIT_VALUE}>
                  {isRTL ? 'يرث من المدرسة' : 'Inherit from school'}
                </option>
                {jurisdictions.map(j => (
                  <option key={j.code} value={j.code}>{j.code}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.status === 'active'} onCheckedChange={(v) => setFormData(p => ({...p, status: v ? 'active' : 'inactive'}))} />
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