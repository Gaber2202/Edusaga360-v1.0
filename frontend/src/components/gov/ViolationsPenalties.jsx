import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Badge } from '../ui/badge';
import DataTable from '../ui/DataTable';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

export default function ViolationsPenalties() {
  const { isRTL } = useLanguage();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ violation_type: 'iqama', authority: 'mol', employee_name: '', amount_sar: 0, due_date: '', status: 'open', description: '', reference_number: '' });

  const { data: violations = [], isLoading } = useQuery({ queryKey: ['violations'], queryFn: () => fetchData(tenantQuery('govi_violations').select('*').order('created_date', { ascending: false })) });
  const { data: employees = [] } = useQuery({ queryKey: ['employees'], queryFn: () => fetchData(tenantQuery('employees').select('*').order()) });

  const openViolations = violations.filter(v => v.status === 'open');
  const totalExposure = openViolations.reduce((s, v) => s + (v.amount_sar || 0), 0);

  const violationTypes = { iqama: isRTL ? 'إقامة' : 'Iqama', gosi: isRTL ? 'تأمينات' : 'GOSI', wps: isRTL ? 'حماية الأجور' : 'WPS', labor_law: isRTL ? 'نظام العمل' : 'Labor Law', saudization: isRTL ? 'توطين' : 'Saudization', other: isRTL ? 'أخرى' : 'Other' };
  const authorities = { mol: 'MOL', gosi: 'GOSI', zatca: 'ZATCA', hrsd: 'HRSD', moi: 'MOI', other: isRTL ? 'أخرى' : 'Other' };
  const statusColors = { open: 'bg-red-100 text-red-700', appealing: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700', waived: 'bg-blue-100 text-blue-700', closed: 'bg-slate-100 text-slate-700' };
  const statusLabels = { open: isRTL ? 'مفتوح' : 'Open', appealing: isRTL ? 'طعن' : 'Appealing', paid: isRTL ? 'مدفوع' : 'Paid', waived: isRTL ? 'متنازل' : 'Waived', closed: isRTL ? 'مغلق' : 'Closed' };

  const columns = [
    { header: isRTL ? 'النوع' : 'Type', cell: r => violationTypes[r.violation_type] || r.violation_type },
    { header: isRTL ? 'الجهة' : 'Authority', cell: r => authorities[r.authority] || r.authority },
    { header: isRTL ? 'الموظف' : 'Employee', cell: r => r.employee_name || '—' },
    { header: isRTL ? 'المبلغ' : 'Amount', cell: r => <span className="font-semibold text-red-600">{(r.amount_sar || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span> },
    { header: isRTL ? 'تاريخ الاستحقاق' : 'Due Date', accessorKey: 'due_date' },
    { header: isRTL ? 'رقم المرجع' : 'Reference', accessorKey: 'reference_number' },
    { header: isRTL ? 'الحالة' : 'Status', cell: r => <Badge className={statusColors[r.status] || 'bg-slate-100 text-slate-700'}>{statusLabels[r.status] || r.status}</Badge> },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await tenantQuery('govi_violations').insert({ ...form, violation_number: `VIO-${Date.now().toString(36).toUpperCase()}` });
      qc.invalidateQueries({ queryKey: ['violations'] });
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-red-200 bg-red-50"><CardContent className="p-4">
          <div className="text-2xl font-bold text-red-700">{openViolations.length}</div>
          <div className="text-sm text-red-600">{isRTL ? 'مخالفات مفتوحة' : 'Open Violations'}</div>
        </CardContent></Card>
        <Card className="border-red-200 bg-red-50"><CardContent className="p-4">
          <div className="text-xl font-bold text-red-700">{totalExposure.toLocaleString()}</div>
          <div className="text-sm text-red-600">{isRTL ? 'الإجمالي المعرض (ر.س)' : 'Total Exposure (SAR)'}</div>
        </CardContent></Card>
        <Card className="border-emerald-200 bg-emerald-50"><CardContent className="p-4">
          <div className="text-2xl font-bold text-emerald-700">{violations.filter(v => v.status === 'paid').length}</div>
          <div className="text-sm text-emerald-600">{isRTL ? 'مدفوعة' : 'Paid'}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-2xl font-bold text-slate-700">{violations.length}</div>
          <div className="text-sm text-slate-500">{isRTL ? 'الإجمالي' : 'Total'}</div>
        </CardContent></Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowForm(true)} className="bg-red-600 hover:bg-red-700">
          <Plus className="w-4 h-4 me-2" />{isRTL ? 'إضافة مخالفة' : 'Add Violation'}
        </Button>
      </div>

      <DataTable columns={columns} data={violations} loading={isLoading} emptyMessage={isRTL ? 'لا توجد مخالفات' : 'No violations'} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isRTL ? 'إضافة مخالفة' : 'Add Violation'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>{isRTL ? 'نوع المخالفة' : 'Violation Type'} *</Label>
              <Select value={form.violation_type} onValueChange={v => setForm(p => ({ ...p, violation_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(violationTypes).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'الجهة' : 'Authority'} *</Label>
              <Select value={form.authority} onValueChange={v => setForm(p => ({ ...p, authority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(authorities).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'الموظف' : 'Employee'}</Label>
              <Select value={form.employee_id || ''} onValueChange={v => { const e = employees.find(x => x.id === v); setForm(p => ({ ...p, employee_id: v, employee_name: e?.name_ar || e?.name_en || '' })); }}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختياري' : 'Optional'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isRTL ? 'لا يوجد' : 'None'}</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{isRTL ? (e.name_ar || e.name_en) : (e.name_en || e.name_ar)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'المبلغ (ر.س)' : 'Amount (SAR)'} *</Label>
              <Input type="number" value={form.amount_sar} onChange={e => setForm(p => ({ ...p, amount_sar: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'رقم المرجع' : 'Reference Number'}</Label>
              <Input value={form.reference_number} onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700">{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}