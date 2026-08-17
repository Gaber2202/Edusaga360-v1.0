import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function HolidayCalendar() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    holiday_name_ar: '',
    holiday_name_en: '',
    start_date: '',
    end_date: '',
    holiday_type: 'national_holiday',
    applies_to_branches: [],
    is_active: true
  });

  const { data: rawHolidays = [], isLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['holidays', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('holidays').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    initialData: []
  });

  const holidays = useMemo(() => rawHolidays.map(h => ({
    ...h,
    holiday_name_ar: h.name_ar,
    holiday_name_en: h.name_en,
    start_date: h.date,
    end_date: h.end_date || h.date,
    holiday_type: h.type,
    applies_to_branches: h.branch_id ? [h.branch_id] : [],
    is_active: true
  })), [rawHolidays]);

  const { data: _branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const filteredHolidays = selectedBranchId && selectedBranchId !== 'all'
    ? holidays.filter(h => !h.applies_to_branches?.length || h.applies_to_branches.includes(selectedBranchId))
    : holidays;

  const handleSave = async () => {
    if (!formData.holiday_name_ar || !formData.start_date) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = {
        name_ar: formData.holiday_name_ar,
        name_en: formData.holiday_name_en,
        date: formData.start_date,
        end_date: formData.end_date || formData.start_date,
        type: formData.holiday_type,
        is_recurring: false,
        branch_id: formData.applies_to_branches?.[0] || null,
        ...(tid && { tenant_id: tid })
      };

      if (editingHoliday?.id) {
        await tenantQuery('holidays').update(data).eq('id', editingHoliday.id);
        toast.success(isRTL ? 'تم التحديث بنجاح' : 'Updated successfully');
      } else {
        await tenantQuery('holidays').insert(data);
        toast.success(isRTL ? 'تم الإضافة بنجاح' : 'Added successfully');
      }

      await queryClient.invalidateQueries({ queryKey: ['holidays'] });
      setShowForm(false);
      resetForm();
    } catch (error) {
      toast.error(error.message || (isRTL ? 'خطأ' : 'Error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (holiday) => {
    if (!confirm(isRTL ? 'هل أنت متأكد؟' : 'Are you sure?')) return;
    try {
      await tenantQuery('holidays').delete().eq('id', holiday.id);
      await queryClient.invalidateQueries({ queryKey: ['holidays'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted');
    } catch (error) {
      toast.error(error.message || (isRTL ? 'خطأ' : 'Error'));
    }
  };

  const handleEdit = (holiday) => {
    setEditingHoliday(holiday);
    // CRITICAL FIX: Properly load holiday data for editing
    setFormData({
      holiday_name_ar: holiday.holiday_name_ar || '',
      holiday_name_en: holiday.holiday_name_en || '',
      start_date: holiday.start_date || '',
      end_date: holiday.end_date || '',
      holiday_type: holiday.holiday_type || 'national_holiday',
      applies_to_branches: holiday.applies_to_branches || [],
      is_active: holiday.is_active !== false
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingHoliday(null);
    setFormData({
      holiday_name_ar: '',
      holiday_name_en: '',
      start_date: '',
      end_date: '',
      holiday_type: 'national_holiday',
      applies_to_branches: [],
      is_active: true
    });
  };

  const columns = [
    {
      header: isRTL ? 'الاسم' : 'Holiday Name',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.holiday_name_ar}</p>
          <p className="text-sm text-muted-foreground">{row.holiday_name_en}</p>
        </div>
      )
    },
    {
      header: isRTL ? 'التاريخ' : 'Date',
      cell: (row) => (
        <span>
          {format(new Date(row.start_date), 'dd MMM yyyy')}
          {row.end_date && row.end_date !== row.start_date && ` - ${format(new Date(row.end_date), 'dd MMM yyyy')}`}
        </span>
      )
    },
    {
      header: isRTL ? 'النوع' : 'Type',
      cell: (row) => {
        const types = {
          national_holiday: isRTL ? 'إجازة وطنية' : 'National Holiday',
          school_holiday: isRTL ? 'إجازة مدرسية' : 'School Holiday',
          optional_observance: isRTL ? 'إجازة اختيارية' : 'Optional'
        };
        return <span className="text-xs bg-najdi-50 text-najdi-900 px-2 py-1 rounded">{types[row.holiday_type]}</span>;
      }
    },
    {
      header: isRTL ? 'الحالة' : 'Status',
      cell: (row) => <span className={row.is_active ? 'text-green-600' : 'text-muted-foreground'}>{row.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}</span>
    },
    {
      header: t('actions'),
      cell: (row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
            {t('edit')}
          </Button>
          <Button size="sm" variant="ghost" text-red-600 onClick={() => handleDelete(row)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'تقويم الإجازات الرسمية' : 'Holiday Calendar'}
        subtitle={isRTL ? 'إدارة العطل الرسمية والمدرسية' : 'Manage national and school holidays'}
        action
        actionLabel={isRTL ? 'إضافة إجازة' : 'Add Holiday'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <DataTable columns={columns} data={filteredHolidays} loading={isLoading} emptyMessage={t('noData')} />

      {/* Holiday Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingHoliday ? (isRTL ? 'تعديل الإجازة' : 'Edit Holiday') : (isRTL ? 'إضافة إجازة' : 'Add Holiday')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input
                  dir="rtl"
                  value={formData.holiday_name_ar}
                  onChange={(e) => setFormData(p => ({...p, holiday_name_ar: e.target.value}))}
                  placeholder={isRTL ? 'مثلاً: عيد الفطر' : 'e.g. Eid Al-Fitr'}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input
                  value={formData.holiday_name_en}
                  onChange={(e) => setFormData(p => ({...p, holiday_name_en: e.target.value}))}
                  placeholder="e.g. Eid Al-Fitr"
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ البداية' : 'Start Date'} *</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData(p => ({...p, start_date: e.target.value}))}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ النهاية (اختياري)' : 'End Date (Optional)'}</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData(p => ({...p, end_date: e.target.value}))}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>{isRTL ? 'نوع الإجازة' : 'Holiday Type'}</Label>
                <Select value={formData.holiday_type} onValueChange={(v) => setFormData(p => ({...p, holiday_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national_holiday">{isRTL ? 'إجازة وطنية' : 'National Holiday'}</SelectItem>
                    <SelectItem value="school_holiday">{isRTL ? 'إجازة مدرسية' : 'School Holiday'}</SelectItem>
                    <SelectItem value="optional_observance">{isRTL ? 'إجازة اختيارية' : 'Optional Observance'}</SelectItem>
                  </SelectContent>
                </Select>
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