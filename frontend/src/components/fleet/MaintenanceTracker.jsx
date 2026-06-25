import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import DataTable from '../ui/DataTable';
import StatusBadge from '../ui/StatusBadge';
import { Plus, Wrench, Calendar, DollarSign, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function MaintenanceTracker() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_id: '',
    maintenance_type: 'routine',
    service_date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
    cost: 0,
    service_provider: '',
    status: 'scheduled',
    notes: ''
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('vehicles').select('*').match(branchFilter())),
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['maintenanceRecords', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('maintenance_records').select('*').match(branchFilter()).order('created_at', { ascending: false })),
  });

  const filteredRecords = filterByBranch(records);

  const handleSave = async () => {
    if (!formData.vehicle_id) {
      toast.error(isRTL ? 'اختر المركبة' : 'Select vehicle');
      return;
    }

    setSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === formData.vehicle_id);
      const recordNumber = `MNT-${Date.now().toString(36).toUpperCase()}`;
      
      await tenantQuery('maintenance_records').insert({
        ...formData,
        record_number: recordNumber,
        vehicle_number: vehicle?.vehicle_number,
        branch_id: selectedBranchId
      });

      queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      vehicle_id: '',
      maintenance_type: 'routine',
      service_date: format(new Date(), 'yyyy-MM-dd'),
      description: '',
      cost: 0,
      service_provider: '',
      status: 'scheduled',
      notes: ''
    });
  };

  const columns = [
    { header: isRTL ? 'رقم السجل' : 'Record #', cell: (row) => <span className="font-mono text-sm">{row.record_number}</span> },
    { header: isRTL ? 'المركبة' : 'Vehicle', accessorKey: 'vehicle_number' },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => {
      const types = {
        routine: isRTL ? 'روتيني' : 'Routine',
        repair: isRTL ? 'إصلاح' : 'Repair',
        inspection: isRTL ? 'فحص' : 'Inspection',
        oil_change: isRTL ? 'تغيير زيت' : 'Oil Change',
        tire_change: isRTL ? 'تغيير إطارات' : 'Tire Change'
      };
      return types[row.maintenance_type] || row.maintenance_type;
    }},
    { header: isRTL ? 'التاريخ' : 'Date', cell: (row) => format(new Date(row.service_date), 'dd/MM/yyyy') },
    { header: isRTL ? 'التكلفة' : 'Cost', cell: (row) => `${row.cost?.toLocaleString()} ${t('sar')}` },
    { header: isRTL ? 'مقدم الخدمة' : 'Provider', accessorKey: 'service_provider' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> }
  ];

  const totalCost = filteredRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
  const scheduledCount = filteredRecords.filter(r => r.status === 'scheduled').length;
  const completedCount = filteredRecords.filter(r => r.status === 'completed').length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{isRTL ? 'سجل الصيانة' : 'Maintenance Records'}</h3>
          <p className="text-sm text-slate-500">{isRTL ? 'تتبع صيانة المركبات' : 'Track vehicle maintenance'}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'سجل جديد' : 'New Record'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'إجمالي التكاليف' : 'Total Costs'}</p>
                <p className="text-2xl font-bold">{totalCost.toLocaleString()}</p>
              </div>
              <DollarSign className="w-10 h-10 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'مجدولة' : 'Scheduled'}</p>
                <p className="text-2xl font-bold">{scheduledCount}</p>
              </div>
              <Calendar className="w-10 h-10 text-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'مكتملة' : 'Completed'}</p>
                <p className="text-2xl font-bold">{completedCount}</p>
              </div>
              <Wrench className="w-10 h-10 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable columns={columns} data={filteredRecords} loading={isLoading} emptyMessage={t('noData')} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'سجل صيانة جديد' : 'New Maintenance Record'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'المركبة' : 'Vehicle'} *</Label>
                <Select value={formData.vehicle_id} onValueChange={(v) => setFormData(p => ({...p, vehicle_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.vehicle_number} - {v.plate_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الصيانة' : 'Maintenance Type'}</Label>
                <Select value={formData.maintenance_type} onValueChange={(v) => setFormData(p => ({...p, maintenance_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">{isRTL ? 'روتيني' : 'Routine'}</SelectItem>
                    <SelectItem value="repair">{isRTL ? 'إصلاح' : 'Repair'}</SelectItem>
                    <SelectItem value="inspection">{isRTL ? 'فحص' : 'Inspection'}</SelectItem>
                    <SelectItem value="oil_change">{isRTL ? 'تغيير زيت' : 'Oil Change'}</SelectItem>
                    <SelectItem value="tire_change">{isRTL ? 'تغيير إطارات' : 'Tire Change'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الخدمة' : 'Service Date'}</Label>
                <Input type="date" value={formData.service_date} onChange={(e) => setFormData(p => ({...p, service_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'التكلفة' : 'Cost'}</Label>
                <Input type="number" value={formData.cost} onChange={(e) => setFormData(p => ({...p, cost: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'مقدم الخدمة' : 'Service Provider'}</Label>
                <Input value={formData.service_provider} onChange={(e) => setFormData(p => ({...p, service_provider: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData(p => ({...p, status: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">{isRTL ? 'مجدولة' : 'Scheduled'}</SelectItem>
                    <SelectItem value="in_progress">{isRTL ? 'جارية' : 'In Progress'}</SelectItem>
                    <SelectItem value="completed">{isRTL ? 'مكتملة' : 'Completed'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData(p => ({...p, description: e.target.value}))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea value={formData.notes} onChange={(e) => setFormData(p => ({...p, notes: e.target.value}))} rows={2} />
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