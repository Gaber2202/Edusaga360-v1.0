import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import { Plus, Edit2, Loader2 } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function BankManagement() {
  const { t: _t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    bank_name_ar: '',
    bank_name_en: '',
    bank_code: '',
    swift_code: '',
    supported_formats: ['csv'],
    notes: '',
    is_active: true
  });

  const { data: banks = [], isLoading } = useQuery({ enabled: false /* bank_templates table not built */, queryKey: ['bankTemplates', tenantId], queryFn: () => fetchData(tenantQuery('bank_templates').select('*').match(tenantFilter()).order('created_at', { ascending: false })), initialData: [] });

  const handleSave = async () => {
    if (!formData.bank_name_ar || !formData.bank_name_en) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...formData,
        created_by: editingBank ? undefined : user.email
      };

      if (editingBank) {
        await tenantQuery('bank_templates').update(data);
        toast.success(isRTL ? 'تم التحديث' : 'Bank updated');
      } else {
        await tenantQuery('bank_templates').insert(data);
        toast.success(isRTL ? 'تم الإنشاء' : 'Bank created');
      }

      queryClient.invalidateQueries({ queryKey: ['bankTemplates'] });
      setShowForm(false);
      setEditingBank(null);
      setFormData({
        bank_name_ar: '', bank_name_en: '', bank_code: '', swift_code: '',
        supported_formats: ['csv'], notes: '', is_active: true
      });
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const toggleFormat = (format) => {
    const current = formData.supported_formats || [];
    if (current.includes(format)) {
      setFormData({...formData, supported_formats: current.filter(f => f !== format)});
    } else {
      setFormData({...formData, supported_formats: [...current, format]});
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إدارة البنوك' : 'Bank Management'}
        subtitle={isRTL ? 'إدارة البنوك وقوالب التصدير' : 'Manage banks and export templates'}
        action
        actionLabel={isRTL ? 'بنك جديد' : 'Add Bank'}
        actionIcon={Plus}
        onAction={() => setShowForm(true)}
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'الرمز' : 'Code'}</TableHead>
              <TableHead>{isRTL ? 'اسم البنك' : 'Bank Name'}</TableHead>
              <TableHead>{isRTL ? 'الصيغ المدعومة' : 'Supported Formats'}</TableHead>
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
              banks.map(bank => (
                <TableRow key={bank.id}>
                  <TableCell className="font-mono text-xs">{bank.bank_code}</TableCell>
                  <TableCell className="font-medium">{isRTL ? bank.bank_name_ar : bank.bank_name_en}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {bank.supported_formats?.map(format => (
                        <Badge key={format} variant="outline" className="text-xs">{format.toUpperCase()}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={bank.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-sand-alt'}>
                      {bank.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditingBank(bank);
                      setFormData(bank);
                      setShowForm(true);
                    }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Bank Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingBank ? (isRTL ? 'تعديل البنك' : 'Edit Bank') : (isRTL ? 'بنك جديد' : 'New Bank')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'اسم البنك (عربي)' : 'Bank Name (Arabic)'} *</Label>
                <Input value={formData.bank_name_ar} onChange={(e) => setFormData({...formData, bank_name_ar: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'اسم البنك (إنجليزي)' : 'Bank Name (English)'} *</Label>
                <Input value={formData.bank_name_en} onChange={(e) => setFormData({...formData, bank_name_en: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{isRTL ? 'رمز البنك' : 'Bank Code'}</Label>
                <Input value={formData.bank_code} onChange={(e) => setFormData({...formData, bank_code: e.target.value})} />
              </div>
              <div>
                <Label>{isRTL ? 'رمز SWIFT' : 'SWIFT Code'}</Label>
                <Input value={formData.swift_code} onChange={(e) => setFormData({...formData, swift_code: e.target.value})} />
              </div>
            </div>

            <div>
              <Label>{isRTL ? 'الصيغ المدعومة' : 'Supported Formats'}</Label>
              <div className="flex gap-4 mt-2">
                {['csv', 'xlsx', 'pdf'].map(format => (
                  <label key={format} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formData.supported_formats?.includes(format)}
                      onCheckedChange={() => toggleFormat(format)}
                    />
                    <span className="text-sm">{format.toUpperCase()}</span>
                  </label>
                ))}
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