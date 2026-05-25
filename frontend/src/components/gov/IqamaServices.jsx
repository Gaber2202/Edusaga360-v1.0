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
import { Plus, AlertTriangle } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';

export default function IqamaServices() {
  const { isRTL } = useLanguage();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ employee_id: '', iqama_number: '', iqama_type: 'work', issue_date: '', expiry_date: '', sponsorship_company_name: '', status: 'active', fee_amount: 0, notes: '' });

  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('*').order()) });
  const { data: iqamas = [], isLoading } = useQuery({ queryKey: ['iqamas'], queryFn: () => fetchData(tenantQuery('iqama_records').select('*').order('-created_date')) });

  const today = new Date();

  const getExpiryBadge = (expiryDate) => {
    if (!expiryDate) return null;
    const days = differenceInDays(parseISO(expiryDate), today);
    if (days < 0) return <Badge className="bg-red-100 text-red-700">{isRTL ? 'منتهية' : 'Expired'}</Badge>;
    if (days <= 30) return <Badge className="bg-red-100 text-red-700">{days}d</Badge>;
    if (days <= 60) return <Badge className="bg-amber-100 text-amber-700">{days}d</Badge>;
    if (days <= 90) return <Badge className="bg-yellow-100 text-yellow-700">{days}d</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700">{isRTL ? 'ساري' : 'Valid'}</Badge>;
  };

  const columns = [
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: isRTL ? 'رقم الإقامة' : 'Iqama No.', accessorKey: 'iqama_number' },
    { header: isRTL ? 'النوع' : 'Type', cell: r => r.iqama_type },
    { header: isRTL ? 'تاريخ الانتهاء' : 'Expiry', cell: r => (
      <div className="flex items-center gap-2">
        <span className="text-sm">{r.expiry_date}</span>
        {getExpiryBadge(r.expiry_date)}
      </div>
    )},
    { header: isRTL ? 'الكفيل' : 'Sponsor', accessorKey: 'sponsorship_company_name' },
    { header: isRTL ? 'الحالة' : 'Status', cell: r => (
      <Badge className={r.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
        {r.status}
      </Badge>
    )},
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const emp = employees.find(e => e.id === form.employee_id);
      await tenantQuery('iqama_records').insert({ ...form, employee_name: emp?.name_ar || emp?.name_en, branch_id: emp?.branch_id });
      qc.invalidateQueries({ queryKey: ['iqamas'] });
      setShowForm(false);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved successfully');
    } catch (_e) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const expiringCount = iqamas.filter(i => {
    if (!i.expiry_date) return false;
    const d = differenceInDays(parseISO(i.expiry_date), today);
    return d >= 0 && d <= 60;
  }).length;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          {expiringCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-amber-800 text-sm font-medium">
                {expiringCount} {isRTL ? 'إقامة تنتهي خلال 60 يوماً' : 'iqamas expiring within 60 days'}
              </span>
            </div>
          )}
        </div>
        <Button onClick={() => setShowForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'إضافة إقامة' : 'Add Iqama'}
        </Button>
      </div>

      <DataTable columns={columns} data={iqamas} loading={isLoading} emptyMessage={isRTL ? 'لا توجد إقامات' : 'No iqama records'} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إضافة / تجديد إقامة' : 'Add / Renew Iqama'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر موظفاً' : 'Select employee'} /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{isRTL ? (e.name_ar || e.name_en) : (e.name_en || e.name_ar)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'رقم الإقامة' : 'Iqama Number'} *</Label>
              <Input value={form.iqama_number} onChange={e => setForm(p => ({ ...p, iqama_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'النوع' : 'Type'}</Label>
              <Select value={form.iqama_type} onValueChange={v => setForm(p => ({ ...p, iqama_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">{isRTL ? 'عمل' : 'Work'}</SelectItem>
                  <SelectItem value="family">{isRTL ? 'عائلة' : 'Family'}</SelectItem>
                  <SelectItem value="dependent">{isRTL ? 'تابع' : 'Dependent'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</Label>
              <Input type="date" value={form.issue_date} onChange={e => setForm(p => ({ ...p, issue_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'} *</Label>
              <Input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'اسم الكفيل' : 'Sponsoring Company'}</Label>
              <Input value={form.sponsorship_company_name} onChange={e => setForm(p => ({ ...p, sponsorship_company_name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'الرسوم (ر.س)' : 'Fee (SAR)'}</Label>
              <Input type="number" value={form.fee_amount} onChange={e => setForm(p => ({ ...p, fee_amount: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{isRTL ? 'نشط' : 'Active'}</SelectItem>
                  <SelectItem value="under_renewal">{isRTL ? 'قيد التجديد' : 'Under Renewal'}</SelectItem>
                  <SelectItem value="pending">{isRTL ? 'قيد الانتظار' : 'Pending'}</SelectItem>
                  <SelectItem value="cancelled">{isRTL ? 'ملغى' : 'Cancelled'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving || !form.employee_id || !form.iqama_number || !form.expiry_date} className="bg-emerald-600 hover:bg-emerald-700">
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}