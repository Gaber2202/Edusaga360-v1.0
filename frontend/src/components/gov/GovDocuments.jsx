import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { Plus, Upload, FileText } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';

export default function GovDocuments() {
  const { isRTL } = useLanguage();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ document_type: 'iqama_copy', title: '', employee_id: '', employee_name: '', issue_date: '', expiry_date: '', file_url: '', notes: '' });

  const { data: documents = [], isLoading } = useQuery({ queryKey: ['govDocs'], queryFn: () => fetchData(tenantQuery('gov_documents').select('*').order('created_date', { ascending: false })) });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('*').order()) });

  const today = new Date();

  const docTypeLabels = { iqama_copy: isRTL ? 'نسخة إقامة' : 'Iqama Copy', passport: isRTL ? 'جواز سفر' : 'Passport', visa: isRTL ? 'تأشيرة' : 'Visa', letter: isRTL ? 'خطاب' : 'Letter', compliance_certificate: isRTL ? 'شهادة امتثال' : 'Compliance Cert', gosi_certificate: isRTL ? 'شهادة تأمينات' : 'GOSI Certificate', commercial_registration: isRTL ? 'سجل تجاري' : 'Commercial Reg', other: isRTL ? 'أخرى' : 'Other' };

  const getExpiryBadge = (expiry) => {
    if (!expiry) return null;
    const days = differenceInDays(parseISO(expiry), today);
    if (days < 0) return <Badge className="bg-red-100 text-red-700">{isRTL ? 'منتهي' : 'Expired'}</Badge>;
    if (days <= 30) return <Badge className="bg-red-100 text-red-700">{days}d</Badge>;
    if (days <= 60) return <Badge className="bg-amber-100 text-amber-700">{days}d</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700">{isRTL ? 'ساري' : 'Valid'}</Badge>;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      setForm(p => ({ ...p, file_url }));
      toast.success(isRTL ? 'تم رفع الملف' : 'File uploaded');
    } catch {
      toast.error(isRTL ? 'فشل رفع الملف' : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await tenantQuery('gov_documents').insert(form);
      qc.invalidateQueries({ queryKey: ['govDocs'] });
      setShowForm(false);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: isRTL ? 'العنوان' : 'Title', cell: r => <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500" /><span>{r.title}</span></div> },
    { header: isRTL ? 'النوع' : 'Type', cell: r => docTypeLabels[r.document_type] || r.document_type },
    { header: isRTL ? 'الموظف' : 'Employee', cell: r => r.employee_name || '—' },
    { header: isRTL ? 'تاريخ الانتهاء' : 'Expiry', cell: r => (
      <div className="flex items-center gap-2">
        <span className="text-sm">{r.expiry_date || '—'}</span>
        {r.expiry_date && getExpiryBadge(r.expiry_date)}
      </div>
    )},
    { header: isRTL ? 'الملف' : 'File', cell: r => r.file_url
      ? <a href={r.file_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-sm">{isRTL ? 'فتح' : 'Open'}</a>
      : '—'
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 me-2" />{isRTL ? 'إضافة مستند' : 'Add Document'}
        </Button>
      </div>

      <DataTable columns={columns} data={documents} loading={isLoading} emptyMessage={isRTL ? 'لا توجد مستندات' : 'No documents'} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isRTL ? 'إضافة مستند حكومي' : 'Add Government Document'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'العنوان' : 'Title'} *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'نوع المستند' : 'Document Type'}</Label>
              <Select value={form.document_type} onValueChange={v => setForm(p => ({ ...p, document_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(docTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'الموظف' : 'Employee'}</Label>
              <Select value={form.employee_id || ''} onValueChange={v => { const e = employees.find(x => x.id === v); setForm(p => ({ ...p, employee_id: v, employee_name: e?.name_ar || e?.name_en || '' })); }}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختياري' : 'Optional'} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{isRTL ? (e.name_ar || e.name_en) : (e.name_en || e.name_ar)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</Label>
              <Input type="date" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'}</Label>
              <Input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'رفع الملف' : 'Upload File'}</Label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 hover:bg-slate-100 transition-colors">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-600">{uploading ? (isRTL ? 'جاري الرفع...' : 'Uploading...') : (isRTL ? 'اختر ملفاً' : 'Choose file')}</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png" disabled={uploading} />
                </label>
                {form.file_url && <span className="text-emerald-600 text-sm">✓ {isRTL ? 'تم الرفع' : 'Uploaded'}</span>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving || !form.title} className="bg-blue-600 hover:bg-blue-700">{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}