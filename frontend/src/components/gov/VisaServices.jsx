import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { Plus } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';

export default function VisaServices() {
  const { isRTL } = useLanguage();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employee_id: '', visa_type: 'work', visa_number: '', issue_date: '', expiry_date: '', entry_type: 'single', status: 'active', fee_amount: 0, notes: '' });

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('*').order()) });
  const { data: visas = [], isLoading } = useQuery({ queryKey: ['visas'], queryFn: () => fetchData(tenantQuery('visa_records').select('*').order('-created_date')) });

  const today = new Date();

  const getExpiryBadge = (expiry) => {
    if (!expiry) return null;
    const days = differenceInDays(parseISO(expiry), today);
    if (days < 0) return <Badge className="bg-red-100 text-red-700">{isRTL ? 'منتهية' : 'Expired'}</Badge>;
    if (days <= 30) return <Badge className="bg-red-100 text-red-700">{days}d</Badge>;
    if (days <= 60) return <Badge className="bg-amber-100 text-amber-700">{days}d</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700">{isRTL ? 'ساري' : 'Valid'}</Badge>;
  };

  const visaTypeLabels = { work: isRTL ? 'عمل' : 'Work', exit_reentry: isRTL ? 'خروج وعودة' : 'Exit/Re-entry', final_exit: isRTL ? 'خروج نهائي' : 'Final Exit', visit: isRTL ? 'زيارة' : 'Visit', transit: isRTL ? 'عبور' : 'Transit' };

  const columns = [
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: isRTL ? 'النوع' : 'Type', cell: r => visaTypeLabels[r.visa_type] || r.visa_type },
    { header: isRTL ? 'رقم التأشيرة' : 'Visa No.', accessorKey: 'visa_number' },
    { header: isRTL ? 'تاريخ الانتهاء' : 'Expiry', cell: r => (
      <div className="flex items-center gap-2">
        <span className="text-sm">{r.expiry_date}</span>
        {getExpiryBadge(r.expiry_date)}
      </div>
    )},
    { header: isRTL ? 'نوع الدخول' : 'Entry', cell: r => r.entry_type === 'multiple' ? (isRTL ? 'متعدد' : 'Multiple') : (isRTL ? 'مفرد' : 'Single') },
    { header: isRTL ? 'الحالة' : 'Status', cell: r => (
      <Badge className={r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>{r.status}</Badge>
    )},
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === form.employee_id);
      await tenantQuery('visa_records').insert({ ...form, employee_name: emp?.name_ar || emp?.name_en, branch_id: emp?.branch_id });
      qc.invalidateQueries({ queryKey: ['visas'] });
      setShowForm(false);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 me-2" />{isRTL ? 'إضافة تأشيرة' : 'Add Visa'}
        </Button>
      </div>
      <DataTable columns={columns} data={visas} loading={isLoading} emptyMessage={isRTL ? 'لا توجد تأشيرات' : 'No visa records'} />
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{isRTL ? 'إضافة تأشيرة' : 'Add Visa Record'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{isRTL ? (e.name_ar || e.name_en) : (e.name_en || e.name_ar)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'نوع التأشيرة' : 'Visa Type'} *</Label>
              <Select value={form.visa_type} onValueChange={v => setForm(p => ({ ...p, visa_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(visaTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'رقم التأشيرة' : 'Visa Number'}</Label>
              <Input value={form.visa_number} onChange={e => setForm(p => ({ ...p, visa_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</Label>
              <Input type="date" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'} *</Label>
              <Input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'نوع الدخول' : 'Entry Type'}</Label>
              <Select value={form.entry_type} onValueChange={v => setForm(p => ({ ...p, entry_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">{isRTL ? 'مفرد' : 'Single'}</SelectItem>
                  <SelectItem value="multiple">{isRTL ? 'متعدد' : 'Multiple'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'الرسوم' : 'Fee (SAR)'}</Label>
              <Input type="number" value={form.fee_amount} onChange={e => setForm(p => ({ ...p, fee_amount: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving || !form.employee_id || !form.expiry_date} className="bg-emerald-600 hover:bg-emerald-700">
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}