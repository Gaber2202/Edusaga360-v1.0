import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import { Plus, Trash2, Edit2, Loader2 } from 'lucide-react';
import { logAuditEvent } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function BankFileTemplates() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    template_code: '',
    template_name_ar: '',
    template_name_en: '',
    bank_code: '',
    bank_name_ar: '',
    bank_name_en: '',
    template_type: 'payroll_wps',
    export_formats: ['csv'],
    file_encoding: 'utf-8',
    delimiter: ',',
    include_header: true,
    version: '1.0',
    is_active: true
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['bankFileTemplates', tenantId],
    queryFn: () => fetchData(tenantQuery('bank_file_templates').select('*').match(tenantFilter()).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const banks = [
    { code: 'SNB', name_ar: 'البنك الأهلي السعودي', name_en: 'Saudi National Bank' },
    { code: 'RAJHI', name_ar: 'مصرف الراجحي', name_en: 'Al Rajhi Bank' },
    { code: 'RIYAD', name_ar: 'بنك الرياض', name_en: 'Riyad Bank' },
    { code: 'SABB', name_ar: 'ساب', name_en: 'SABB' },
    { code: 'BSF', name_ar: 'بنك السعودي الفرنسي', name_en: 'Banque Saudi Fransi' },
    { code: 'ANB', name_ar: 'البنك العربي الوطني', name_en: 'Arab National Bank' },
    { code: 'ALINMA', name_ar: 'بنك الإنماء', name_en: 'Alinma Bank' },
    { code: 'ALBILAD', name_ar: 'بنك البلاد', name_en: 'Bank Albilad' },
    { code: 'OTHER', name_ar: 'بنك آخر', name_en: 'Other Bank' }
  ];

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      template_code: template.template_code,
      template_name_ar: template.template_name_ar,
      template_name_en: template.template_name_en,
      bank_code: template.bank_code,
      bank_name_ar: template.bank_name_ar,
      bank_name_en: template.bank_name_en,
      template_type: template.template_type,
      export_formats: template.export_formats || ['csv'],
      file_encoding: template.file_encoding || 'utf-8',
      delimiter: template.delimiter || ',',
      include_header: template.include_header !== false,
      version: template.version || '1.0',
      is_active: template.is_active !== false
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.template_code || !formData.template_name_ar || !formData.template_name_en || !formData.bank_code) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...formData,
        last_modified_by: user.email,
        last_modified_date: new Date().toISOString(),
        created_by: editingTemplate ? undefined : user.email
      };

      if (editingTemplate) {
        await tenantQuery('bank_file_templates').update(data);
        await logAuditEvent({ action: 'UPDATE', entityType: 'BankFileTemplate', entityId: editingTemplate.id, newValues: data });
        toast.success(isRTL ? 'تم التحديث' : 'Template updated');
      } else {
        const created = await tenantQuery('bank_file_templates').insert(data);
        await logAuditEvent({ action: 'CREATE', entityType: 'BankFileTemplate', entityId: created.id, newValues: data });
        toast.success(isRTL ? 'تم الإنشاء' : 'Template created');
      }

      queryClient.invalidateQueries({ queryKey: ['bankFileTemplates'] });
      setShowForm(false);
      setEditingTemplate(null);
      setFormData({
        template_code: '', template_name_ar: '', template_name_en: '', bank_code: '',
        bank_name_ar: '', bank_name_en: '', template_type: 'payroll_wps',
        export_formats: ['csv'], file_encoding: 'utf-8', delimiter: ',',
        include_header: true, version: '1.0', is_active: true
      });
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template) => {
    if (!confirm(isRTL ? 'هل أنت متأكد من الحذف؟' : 'Are you sure you want to delete?')) return;

    try {
      await tenantQuery('bank_file_templates').delete().eq('id', template.id);
      await logAuditEvent({ action: 'DELETE', entityType: 'BankFileTemplate', entityId: template.id });
      queryClient.invalidateQueries({ queryKey: ['bankFileTemplates'] });
      toast.success(isRTL ? 'تم الحذف' : 'Template deleted');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handleBankChange = (bankCode) => {
    const bank = banks.find(b => b.code === bankCode);
    if (bank) {
      setFormData({
        ...formData,
        bank_code: bankCode,
        bank_name_ar: bank.name_ar,
        bank_name_en: bank.name_en
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('bankFileTemplates')}
        subtitle={isRTL ? 'إدارة قوالب ملفات البنوك' : 'Manage bank file templates'}
        action
        actionLabel={isRTL ? 'قالب جديد' : 'New Template'}
        actionIcon={Plus}
        onAction={() => setShowForm(true)}
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'رمز القالب' : 'Template Code'}</TableHead>
              <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
              <TableHead>{isRTL ? 'البنك' : 'Bank'}</TableHead>
              <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
              <TableHead>{isRTL ? 'الصيغ' : 'Formats'}</TableHead>
              <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                  {isRTL ? 'لا توجد قوالب' : 'No templates found'}
                </TableCell>
              </TableRow>
            ) : (
              templates.map(template => (
                <TableRow key={template.id}>
                  <TableCell className="font-mono text-sm">{template.template_code}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{isRTL ? template.template_name_ar : template.template_name_en}</p>
                      <p className="text-xs text-slate-500">v{template.version}</p>
                    </div>
                  </TableCell>
                  <TableCell>{isRTL ? template.bank_name_ar : template.bank_name_en}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {template.template_type === 'payroll_wps' ? (isRTL ? 'رواتب WPS' : 'Payroll WPS') :
                       template.template_type === 'vendor_payments' ? (isRTL ? 'دفعات موردين' : 'Vendor Payments') :
                       (isRTL ? 'تحصيلات' : 'Collections')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {template.export_formats?.map(format => (
                        <Badge key={format} variant="secondary" className="uppercase text-xs">
                          {format}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={template.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                      {template.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(template)}>
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? (isRTL ? 'تعديل القالب' : 'Edit Template') : (isRTL ? 'قالب جديد' : 'New Template')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'رمز القالب' : 'Template Code'}</Label>
                <Input value={formData.template_code} onChange={(e) => setFormData({...formData, template_code: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'الإصدار' : 'Version'}</Label>
                <Input value={formData.version} onChange={(e) => setFormData({...formData, version: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input value={formData.template_name_ar} onChange={(e) => setFormData({...formData, template_name_ar: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={formData.template_name_en} onChange={(e) => setFormData({...formData, template_name_en: e.target.value})} />
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'البنك' : 'Bank'}</Label>
              <Select value={formData.bank_code} onValueChange={handleBankChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {banks.map(bank => (
                    <SelectItem key={bank.code} value={bank.code}>
                      {isRTL ? bank.name_ar : bank.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'نوع القالب' : 'Template Type'}</Label>
                <Select value={formData.template_type} onValueChange={(v) => setFormData({...formData, template_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payroll_wps">{isRTL ? 'رواتب WPS' : 'Payroll WPS'}</SelectItem>
                    <SelectItem value="vendor_payments">{isRTL ? 'دفعات موردين' : 'Vendor Payments'}</SelectItem>
                    <SelectItem value="fees_collections">{isRTL ? 'تحصيلات الرسوم' : 'Fees Collections'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isRTL ? 'الترميز' : 'Encoding'}</Label>
                <Select value={formData.file_encoding} onValueChange={(v) => setFormData({...formData, file_encoding: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utf-8">UTF-8</SelectItem>
                    <SelectItem value="windows-1256">Windows-1256</SelectItem>
                    <SelectItem value="iso-8859-6">ISO-8859-6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'صيغ التصدير' : 'Export Formats'}</Label>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {['csv', 'xlsx', 'pdf', 'txt', 'xml'].map(format => (
                  <label key={format} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.export_formats.includes(format)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData({...formData, export_formats: [...formData.export_formats, format]});
                        } else {
                          setFormData({...formData, export_formats: formData.export_formats.filter(f => f !== format)});
                        }
                      }}
                    />
                    <span className="text-sm uppercase">{format}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'الفاصل' : 'Delimiter'}</Label>
                <Input value={formData.delimiter} onChange={(e) => setFormData({...formData, delimiter: e.target.value})} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  checked={formData.include_header}
                  onCheckedChange={(checked) => setFormData({...formData, include_header: checked})}
                />
                <Label>{isRTL ? 'تضمين العناوين' : 'Include Header'}</Label>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
              <Label>{isRTL ? 'نشط' : 'Active'}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
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