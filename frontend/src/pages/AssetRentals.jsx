import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import { Building2, GraduationCap, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function AssetRentals() {
  const { isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('to_student');
  const [showDialog, setShowDialog] = useState(false);
  const [direction, setDirection] = useState('to_student');
  const [saving, setSaving] = useState(false);

  const emptyForm = (dir) => ({
    rental_direction: dir,
    asset_id: '',
    vendor_id: '',
    vendor_name: '',
    student_id: '',
    student_name: '',
    guardian_name: '',
    rental_start_date: format(new Date(), 'yyyy-MM-dd'),
    rental_end_date: '',
    rental_fee: 0,
    rental_period: 'monthly',
    condition_on_handover: 'good',
    handover_notes: '',
    notes: ''
  });

  const [form, setForm] = useState(emptyForm('to_student'));

  const { data: rentals = [], isLoading } = useQuery({
    queryKey: ['assetRentals', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('asset_rentals').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: rentableAssets = [] } = useQuery({
    queryKey: ['rentableAssets', tenantId],
    queryFn: () => fetchData(tenantQuery('fixed_assets').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['activeStudents', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: _vendors = [] } = useQuery({
    queryKey: ['vendors', tenantId],
    queryFn: () => fetchData(tenantQuery('vendors').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const filtered = filterByBranch(rentals);
  const toStudentRentals = filtered.filter(r => r.rental_direction === 'to_student');
  const fromVendorRentals = filtered.filter(r => r.rental_direction === 'from_vendor');

  const openDialog = (dir) => {
    setDirection(dir);
    setForm(emptyForm(dir));
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.asset_id) { toast.error(isRTL ? 'اختر الأصل' : 'Select asset'); return; }
    if (form.rental_direction === 'to_student' && !form.student_id) { toast.error(isRTL ? 'اختر الطالب' : 'Select student'); return; }
    if (form.rental_direction === 'from_vendor' && !form.vendor_name) { toast.error(isRTL ? 'أدخل اسم المورد' : 'Enter vendor'); return; }

    setSaving(true);
    try {
      const asset = rentableAssets.find(a => a.id === form.asset_id);
      let studentObj = null;
      if (form.student_id) studentObj = students.find(s => s.id === form.student_id);

      const data = {
        ...form,
        branch_id: selectedBranchId || asset?.branch_id || '',
        asset_code: asset?.asset_code || '',
        asset_name_ar: asset?.name_ar || '',
        asset_name_en: asset?.name_en || '',
        serial_number: asset?.serial_number || '',
        student_name: studentObj?.name_ar || '',
        status: 'active',
        rental_number: `RENT-${Date.now().toString(36).toUpperCase()}`
      };

      const created = await tenantQuery('asset_rentals').insert(data);

      // Update asset status
      const newStatus = form.rental_direction === 'to_student' ? 'rented_out' : 'active';
      await tenantQuery('fixed_assets').update({
        status: newStatus,
        current_rental_id: created.id,
        ownership_type: form.rental_direction === 'from_vendor' ? 'rented_from_vendor' : asset?.ownership_type || 'owned'
      });

      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'AssetRental', entityId: created.id, newValues: data });
      queryClient.invalidateQueries({ queryKey: ['assetRentals', 'rentableAssets', 'assets'] });
      setShowDialog(false);
      toast.success(isRTL ? 'تم تسجيل الإيجار' : 'Rental recorded');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleReturn = async (rental) => {
    await tenantQuery('asset_rentals').update({
      status: 'returned',
      return_date: format(new Date(), 'yyyy-MM-dd')
    });
    await tenantQuery('fixed_assets').update({ status: 'active', current_rental_id: null });
    await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'AssetRental', entityId: rental.id, newValues: { status: 'returned' } });
    queryClient.invalidateQueries({ queryKey: ['assetRentals', 'rentableAssets', 'assets'] });
    toast.success(isRTL ? 'تم تسجيل الإرجاع' : 'Returned');
  };

  const statusColors = { active: 'bg-emerald-100 text-emerald-700', returned: 'bg-sand-alt text-ink', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-sand-alt text-muted-foreground' };
  const statusLabels = { active: { ar: 'نشط', en: 'Active' }, returned: { ar: 'مُرجع', en: 'Returned' }, overdue: { ar: 'متأخر', en: 'Overdue' }, cancelled: { ar: 'ملغي', en: 'Cancelled' } };

  const RentalTable = ({ data, showStudent, showVendor }) => (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{isRTL ? 'الأصل' : 'Asset'}</TableHead>
            {showStudent && <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>}
            {showVendor && <TableHead>{isRTL ? 'المورد' : 'Vendor'}</TableHead>}
            <TableHead>{isRTL ? 'من' : 'From'}</TableHead>
            <TableHead>{isRTL ? 'إلى' : 'To'}</TableHead>
            <TableHead>{isRTL ? 'الرسوم' : 'Fee'}</TableHead>
            <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
          ) : data.length === 0 ? (
            <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isRTL ? 'لا توجد بيانات' : 'No data'}</TableCell></TableRow>
          ) : data.map(r => (
            <TableRow key={r.id}>
              <TableCell><div><p className="font-medium">{r.asset_name_ar}</p><p className="text-xs text-muted-foreground">{r.asset_code}</p></div></TableCell>
              {showStudent && <TableCell>{r.student_name || '—'}</TableCell>}
              {showVendor && <TableCell>{r.vendor_name || '—'}</TableCell>}
              <TableCell>{r.rental_start_date}</TableCell>
              <TableCell>{r.rental_end_date || '—'}</TableCell>
              <TableCell>{r.rental_fee ? `${r.rental_fee.toLocaleString()} ${isRTL ? 'ر.س' : 'SAR'}` : '—'}</TableCell>
              <TableCell><Badge className={statusColors[r.status] || 'bg-sand-alt'}>{isRTL ? statusLabels[r.status]?.ar : statusLabels[r.status]?.en || r.status}</Badge></TableCell>
              <TableCell>
                {r.status === 'active' && (
                  <Button size="sm" variant="outline" onClick={() => handleReturn(r)}>
                    <RotateCcw className="w-3 h-3 me-1" />{isRTL ? 'إرجاع' : 'Return'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إيجار الأصول' : 'Asset Rentals'}
        subtitle={isRTL ? 'إدارة إيجارات الأصول من الموردين وإلى الطلاب' : 'Manage rentals from vendors and to students'}
      >
        <Button variant="outline" onClick={() => openDialog('from_vendor')}>
          <Building2 className="w-4 h-4 me-2" />
          {isRTL ? 'إيجار من مورد' : 'Rent from Vendor'}
        </Button>
        <Button onClick={() => openDialog('to_student')}>
          <GraduationCap className="w-4 h-4 me-2" />
          {isRTL ? 'إيجار لطالب' : 'Rent to Student'}
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="to_student"><GraduationCap className="w-4 h-4 me-2 inline" />{isRTL ? `للطلاب (${toStudentRentals.length})` : `To Students (${toStudentRentals.length})`}</TabsTrigger>
          <TabsTrigger value="from_vendor"><Building2 className="w-4 h-4 me-2 inline" />{isRTL ? `من الموردين (${fromVendorRentals.length})` : `From Vendors (${fromVendorRentals.length})`}</TabsTrigger>
        </TabsList>
        <TabsContent value="to_student" className="mt-4">
          <RentalTable data={toStudentRentals} showStudent showVendor={false} />
        </TabsContent>
        <TabsContent value="from_vendor" className="mt-4">
          <RentalTable data={fromVendorRentals} showStudent={false} showVendor />
        </TabsContent>
      </Tabs>

      {/* Rental Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {direction === 'to_student' ? (isRTL ? 'إيجار جهاز لطالب' : 'Rent Device to Student') : (isRTL ? 'تسجيل إيجار من مورد' : 'Register Rental from Vendor')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{isRTL ? 'الأصل / الجهاز' : 'Asset / Device'} *</Label>
              <Select value={form.asset_id} onValueChange={(v) => setForm(p => ({ ...p, asset_id: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {rentableAssets
                    .filter(a => direction === 'to_student' ? (a.is_rentable && a.status === 'active') : a.status === 'active')
                    .map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name_ar} — {a.asset_code}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {direction === 'to_student' && (
              <div className="space-y-2">
                <Label>{isRTL ? 'الطالب' : 'Student'} *</Label>
                <Select value={form.student_id} onValueChange={(v) => setForm(p => ({ ...p, student_id: v }))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الطالب' : 'Select student'} /></SelectTrigger>
                  <SelectContent>
                    {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {direction === 'from_vendor' && (
              <div className="space-y-2">
                <Label>{isRTL ? 'المورد' : 'Vendor'} *</Label>
                <Input value={form.vendor_name} onChange={(e) => setForm(p => ({ ...p, vendor_name: e.target.value }))} placeholder={isRTL ? 'اسم المورد' : 'Vendor name'} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ البدء' : 'Start Date'}</Label>
                <Input type="date" value={form.rental_start_date} onChange={(e) => setForm(p => ({ ...p, rental_start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الانتهاء' : 'End Date'}</Label>
                <Input type="date" value={form.rental_end_date} onChange={(e) => setForm(p => ({ ...p, rental_end_date: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'رسوم الإيجار' : 'Rental Fee'}</Label>
                <Input type="number" value={form.rental_fee} onChange={(e) => setForm(p => ({ ...p, rental_fee: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'فترة الإيجار' : 'Period'}</Label>
                <Select value={form.rental_period} onValueChange={(v) => setForm(p => ({ ...p, rental_period: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{isRTL ? 'شهري' : 'Monthly'}</SelectItem>
                    <SelectItem value="termly">{isRTL ? 'فصلي' : 'Termly'}</SelectItem>
                    <SelectItem value="annual">{isRTL ? 'سنوي' : 'Annual'}</SelectItem>
                    <SelectItem value="custom">{isRTL ? 'مخصص' : 'Custom'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الحالة عند التسليم' : 'Condition on Handover'}</Label>
              <Select value={form.condition_on_handover} onValueChange={(v) => setForm(p => ({ ...p, condition_on_handover: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">{isRTL ? 'ممتاز' : 'Excellent'}</SelectItem>
                  <SelectItem value="good">{isRTL ? 'جيد' : 'Good'}</SelectItem>
                  <SelectItem value="fair">{isRTL ? 'مقبول' : 'Fair'}</SelectItem>
                  <SelectItem value="poor">{isRTL ? 'ضعيف' : 'Poor'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-najdi-700 hover:bg-najdi-900">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}