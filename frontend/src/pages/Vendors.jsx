import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
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
import { Plus, Search, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Vendors() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    vendor_code: '',
    name_ar: '',
    name_en: '',
    vendor_type: 'supplier',
    cr_number: '',
    vat_number: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    bank_name: '',
    bank_account: '',
    iban: '',
    payment_terms: 30,
    credit_limit: 0,
    is_active: true
  });

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', tenantId],
    queryFn: () => fetchData(tenantQuery('vendors').select('*').match(tenantFilter(), '-created_date')),
    enabled: hasTenantAccess,
  });

  const filteredVendors = vendors.filter(v => {
    const matchesSearch = v.name_ar?.includes(search) || v.name_en?.toLowerCase().includes(search.toLowerCase()) || v.vendor_code?.includes(search);
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSave = async () => {
    if (!formData.name_ar) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill in required fields');
      return;
    }
    
    setSaving(true);
    try {
      const vendorCode = formData.vendor_code || `VND-${Date.now().toString(36).toUpperCase()}`;
      const tid = getTenantIdForCreate();
      const data = { ...formData, vendor_code: vendorCode, branch_id: selectedBranchId, status: 'pending_approval', ...(tid && { tenant_id: tid }) };
      
      if (editingVendor?.id) {
        await tenantQuery('vendors').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Vendor', entityId: editingVendor.id, oldValues: editingVendor, newValues: data });
      } else {
        const created = await tenantQuery('vendors').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Vendor', entityId: created.id, newValues: data });
      }
      
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      toast.error(isRTL ? 'حدث خطأ: ' + (error.message || 'خطأ غير معروف') : 'Error: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (vendor) => {
    try {
      await tenantQuery('vendors').update({ status: 'approved', approved_date: new Date().toISOString().split('T')[0] });
      await logAuditEvent({ action: AuditActions.APPROVE, entityType: 'Vendor', entityId: vendor.id, newValues: { status: 'approved' } });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(isRTL ? 'تم الاعتماد' : 'Approved');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    // CRITICAL FIX: Properly load vendor data for editing
    setFormData({
      vendor_code: vendor.vendor_code || '',
      name_ar: vendor.name_ar || '',
      name_en: vendor.name_en || '',
      vendor_type: vendor.vendor_type || 'supplier',
      cr_number: vendor.cr_number || '',
      vat_number: vendor.vat_number || '',
      contact_person: vendor.contact_person || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || '',
      city: vendor.city || '',
      bank_name: vendor.bank_name || '',
      bank_account: vendor.bank_account || '',
      iban: vendor.iban || '',
      payment_terms: vendor.payment_terms || 30,
      credit_limit: vendor.credit_limit || 0,
      is_active: vendor.is_active !== false
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingVendor(null);
    setFormData({
      vendor_code: '', name_ar: '', name_en: '', vendor_type: 'supplier', cr_number: '', vat_number: '',
      contact_person: '', phone: '', email: '', address: '', city: '', bank_name: '', bank_account: '',
      iban: '', payment_terms: 30, credit_limit: 0, is_active: true
    });
  };

  const columns = [
    { header: isRTL ? 'الرمز' : 'Code', cell: (row) => <span className="font-mono text-sm">{row.vendor_code}</span> },
    { header: t('vendor'), cell: (row) => <div><p className="font-medium">{row.name_ar}</p>{row.name_en && <p className="text-sm text-slate-500">{row.name_en}</p>}</div> },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => t(row.vendor_type) || row.vendor_type },
    { header: t('phone'), accessorKey: 'phone' },
    { header: isRTL ? 'الرقم الضريبي' : 'VAT', accessorKey: 'vat_number' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-2">
        {row.status === 'pending_approval' && (
          <Button size="sm" variant="ghost" onClick={() => handleApprove(row)} className="text-emerald-600">
            <Check className="w-4 h-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
          {t('edit')}
        </Button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('vendors')}
        subtitle={isRTL ? 'إدارة الموردين' : 'Manage vendors'}
        action
        actionLabel={isRTL ? 'إضافة مورد' : 'Add Vendor'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-white border">
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="pending_approval">{t('pending')}</TabsTrigger>
          <TabsTrigger value="approved">{t('approved')}</TabsTrigger>
          <TabsTrigger value="suspended">{isRTL ? 'موقوف' : 'Suspended'}</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredVendors} loading={isLoading} emptyMessage={t('noData')} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? (isRTL ? 'تعديل المورد' : 'Edit Vendor') : (isRTL ? 'إضافة مورد' : 'Add Vendor')}</DialogTitle>
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
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع المورد' : 'Vendor Type'}</Label>
                <Select value={formData.vendor_type} onValueChange={(v) => setFormData(p => ({...p, vendor_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier">{isRTL ? 'مورد' : 'Supplier'}</SelectItem>
                    <SelectItem value="contractor">{isRTL ? 'مقاول' : 'Contractor'}</SelectItem>
                    <SelectItem value="service_provider">{isRTL ? 'مزود خدمة' : 'Service Provider'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'السجل التجاري' : 'CR Number'}</Label>
                <Input value={formData.cr_number} onChange={(e) => setFormData(p => ({...p, cr_number: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الرقم الضريبي' : 'VAT Number'}</Label>
                <Input value={formData.vat_number} onChange={(e) => setFormData(p => ({...p, vat_number: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'جهة الاتصال' : 'Contact Person'}</Label>
                <Input value={formData.contact_person} onChange={(e) => setFormData(p => ({...p, contact_person: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{t('phone')}</Label>
                <Input value={formData.phone} onChange={(e) => setFormData(p => ({...p, phone: e.target.value}))} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('email')}</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData(p => ({...p, email: e.target.value}))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('address')}</Label>
              <Textarea value={formData.address} onChange={(e) => setFormData(p => ({...p, address: e.target.value}))} rows={2} />
            </div>
            <h4 className="font-semibold border-t pt-4">{isRTL ? 'البيانات البنكية' : 'Bank Details'}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم البنك' : 'Bank Name'}</Label>
                <Input value={formData.bank_name} onChange={(e) => setFormData(p => ({...p, bank_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>IBAN</Label>
                <Input value={formData.iban} onChange={(e) => setFormData(p => ({...p, iban: e.target.value}))} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'شروط الدفع (أيام)' : 'Payment Terms (days)'}</Label>
                <Input type="number" value={formData.payment_terms} onChange={(e) => setFormData(p => ({...p, payment_terms: parseInt(e.target.value) || 30}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحد الائتماني' : 'Credit Limit'}</Label>
                <Input type="number" value={formData.credit_limit} onChange={(e) => setFormData(p => ({...p, credit_limit: parseFloat(e.target.value) || 0}))} />
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