import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import { Plus, Edit2, Building2, Loader2 } from 'lucide-react';
import { logAuditEvent } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function Companies() {
  const { t: _t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('parent');
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name_ar: '',
    name_en: '',
    legal_name: '',
    cr_number: '',
    vat_number: '',
    address_ar: '',
    address_en: '',
    city: '',
    phone: '',
    email: '',
    company_type: 'parent',
    parent_company_id: '',
    is_active: true
  });

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies', tenantId],
    queryFn: () => fetchData(tenantQuery('companys').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const parentCompanies = companies.filter(c => c.company_type === 'parent');
  const subsidiaries = companies.filter(c => c.company_type === 'subsidiary');

  const handleSave = async () => {
    if (!formData.name_ar || !formData.name_en) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        company_code: editingCompany?.company_code || `COMP-${Date.now().toString(36).toUpperCase()}`
      };

      if (editingCompany) {
        await tenantQuery('companys').update(data);
        await logAuditEvent({ action: 'UPDATE', entityType: 'Company', entityId: editingCompany.id });
        toast.success(isRTL ? 'تم التحديث' : 'Company updated');
      } else {
        const created = await tenantQuery('companys').insert(data);
        await logAuditEvent({ action: 'CREATE', entityType: 'Company', entityId: created.id });
        toast.success(isRTL ? 'تم الإنشاء' : 'Company created');
      }

      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setShowForm(false);
      setEditingCompany(null);
      resetForm();
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name_ar: '', name_en: '', legal_name: '', cr_number: '', vat_number: '',
      address_ar: '', address_en: '', city: '', phone: '', email: '',
      company_type: 'parent', parent_company_id: '', is_active: true
    });
  };

  const openEdit = (company) => {
    setEditingCompany(company);
    // CRITICAL FIX: Properly load company data for editing
    setFormData({
      name_ar: company.name_ar || '',
      name_en: company.name_en || '',
      legal_name: company.legal_name || '',
      cr_number: company.cr_number || '',
      vat_number: company.vat_number || '',
      address_ar: company.address_ar || '',
      address_en: company.address_en || '',
      city: company.city || '',
      phone: company.phone || '',
      email: company.email || '',
      company_type: company.company_type || 'parent',
      parent_company_id: company.parent_company_id || '',
      is_active: company.is_active !== false
    });
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'الشركات' : 'Companies'}
        subtitle={isRTL ? 'إدارة الشركات والشركات التابعة' : 'Manage companies and subsidiaries'}
        action
        actionLabel={isRTL ? 'شركة جديدة' : 'New Company'}
        actionIcon={Plus}
        onAction={() => setShowForm(true)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="parent">
            <Building2 className="w-4 h-4 me-2" />
            {isRTL ? 'الشركات الأم' : 'Parent Companies'}
          </TabsTrigger>
          <TabsTrigger value="subsidiary">
            <Building2 className="w-4 h-4 me-2" />
            {isRTL ? 'الشركات التابعة' : 'Subsidiaries'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parent">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الرمز' : 'Code'}</TableHead>
                  <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{isRTL ? 'رقم السجل' : 'CR Number'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : (
                  parentCompanies.map(company => (
                    <TableRow key={company.id}>
                      <TableCell className="font-mono text-xs">{company.company_code}</TableCell>
                      <TableCell className="font-medium">{isRTL ? company.name_ar : company.name_en}</TableCell>
                      <TableCell>{company.cr_number || '-'}</TableCell>
                      <TableCell>
                        <Badge className={company.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}>
                          {company.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(company)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="subsidiary">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الرمز' : 'Code'}</TableHead>
                  <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{isRTL ? 'الشركة الأم' : 'Parent Company'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subsidiaries.map(sub => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-mono text-xs">{sub.company_code}</TableCell>
                    <TableCell className="font-medium">{isRTL ? sub.name_ar : sub.name_en}</TableCell>
                    <TableCell>
                      {companies.find(c => c.id === sub.parent_company_id)?.[isRTL ? 'name_ar' : 'name_en'] || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={sub.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}>
                        {sub.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(sub)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Company Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingCompany ? (isRTL ? 'تعديل الشركة' : 'Edit Company') : (isRTL ? 'شركة جديدة' : 'New Company')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>{isRTL ? 'نوع الشركة' : 'Company Type'}</Label>
              <Select value={formData.company_type} onValueChange={(v) => setFormData({...formData, company_type: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">{isRTL ? 'شركة أم' : 'Parent Company'}</SelectItem>
                  <SelectItem value="subsidiary">{isRTL ? 'شركة تابعة' : 'Subsidiary'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.company_type === 'subsidiary' && (
              <div>
                <Label>{isRTL ? 'الشركة الأم' : 'Parent Company'}</Label>
                <Select value={formData.parent_company_id} onValueChange={(v) => setFormData({...formData, parent_company_id: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {parentCompanies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{isRTL ? c.name_ar : c.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={formData.name_ar} onChange={(e) => setFormData({...formData, name_ar: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'} *</Label>
                <Input value={formData.name_en} onChange={(e) => setFormData({...formData, name_en: e.target.value})} />
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'الاسم القانوني' : 'Legal Name'}</Label>
              <Input value={formData.legal_name} onChange={(e) => setFormData({...formData, legal_name: e.target.value})} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'رقم السجل التجاري' : 'CR Number'}</Label>
                <Input value={formData.cr_number} onChange={(e) => setFormData({...formData, cr_number: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'الرقم الضريبي' : 'VAT Number'}</Label>
                <Input value={formData.vat_number} onChange={(e) => setFormData({...formData, vat_number: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الهاتف' : 'Phone'}</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'}</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}