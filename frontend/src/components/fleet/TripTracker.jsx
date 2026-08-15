import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import DataTable from '../ui/DataTable';
import StatusBadge from '../ui/StatusBadge';
import { Plus, MapPin, Clock, Loader2, Route } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function TripTracker() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_id: '',
    driver_id: '',
    trip_type: 'morning_route',
    trip_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '07:00',
    end_time: '08:00',
    start_odometer: 0,
    end_odometer: 0,
    route: '',
    students_count: 0,
    status: 'scheduled'
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('vehicles').select('*').match(branchFilter())),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(branchFilter())),
  });

  const { data: trips = [], isLoading } = useQuery({ enabled: false /* trip_logs table not built */, queryKey: ['tripLogs', selectedBranchId], queryFn: () => fetchData(tenantQuery('trip_logs').select('*').match(branchFilter()).order('created_at', { ascending: false })), initialData: [] });

  const filteredTrips = filterByBranch(trips);

  const handleSave = async () => {
    if (!formData.vehicle_id || !formData.driver_id) {
      toast.error(isRTL ? 'اختر المركبة والسائق' : 'Select vehicle and driver');
      return;
    }

    setSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === formData.vehicle_id);
      const driver = employees.find(e => e.id === formData.driver_id);
      const tripNumber = `TRIP-${Date.now().toString(36).toUpperCase()}`;
      const distance = formData.end_odometer - formData.start_odometer;
      
      await tenantQuery('trip_logs').insert({
        ...formData,
        trip_number: tripNumber,
        vehicle_number: vehicle?.vehicle_number,
        driver_name: driver?.name_ar,
        branch_id: selectedBranchId,
        distance_km: distance > 0 ? distance : 0
      });

      queryClient.invalidateQueries({ queryKey: ['tripLogs'] });
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
      driver_id: '',
      trip_type: 'morning_route',
      trip_date: format(new Date(), 'yyyy-MM-dd'),
      start_time: '07:00',
      end_time: '08:00',
      start_odometer: 0,
      end_odometer: 0,
      route: '',
      students_count: 0,
      status: 'scheduled'
    });
  };

  const columns = [
    { header: isRTL ? 'رقم الرحلة' : 'Trip #', cell: (row) => <span className="font-mono text-sm">{row.trip_number}</span> },
    { header: isRTL ? 'المركبة' : 'Vehicle', accessorKey: 'vehicle_number' },
    { header: isRTL ? 'السائق' : 'Driver', accessorKey: 'driver_name' },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => {
      const types = {
        morning_route: isRTL ? 'مسار صباحي' : 'Morning Route',
        afternoon_route: isRTL ? 'مسار مسائي' : 'Afternoon Route',
        field_trip: isRTL ? 'رحلة ميدانية' : 'Field Trip',
        event: isRTL ? 'فعالية' : 'Event'
      };
      return types[row.trip_type] || row.trip_type;
    }},
    { header: isRTL ? 'التاريخ' : 'Date', cell: (row) => format(new Date(row.trip_date), 'dd/MM/yyyy') },
    { header: isRTL ? 'المسافة' : 'Distance', cell: (row) => `${row.distance_km || 0} ${isRTL ? 'كم' : 'km'}` },
    { header: isRTL ? 'الطلاب' : 'Students', accessorKey: 'students_count' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> }
  ];

  const totalTrips = filteredTrips.length;
  const totalDistance = filteredTrips.reduce((sum, t) => sum + (t.distance_km || 0), 0);
  const totalStudents = filteredTrips.reduce((sum, t) => sum + (t.students_count || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{isRTL ? 'سجل الرحلات' : 'Trip Logs'}</h3>
          <p className="text-sm text-muted-foreground">{isRTL ? 'تتبع رحلات المركبات' : 'Track vehicle trips'}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'سجل جديد' : 'New Trip'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي الرحلات' : 'Total Trips'}</p>
                <p className="text-2xl font-bold">{totalTrips}</p>
              </div>
              <Route className="w-10 h-10 text-najdi-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي المسافة' : 'Total Distance'}</p>
                <p className="text-2xl font-bold">{totalDistance.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">{isRTL ? 'كيلومتر' : 'km'}</p>
              </div>
              <MapPin className="w-10 h-10 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{isRTL ? 'إجمالي الطلاب' : 'Total Students'}</p>
                <p className="text-2xl font-bold">{totalStudents}</p>
              </div>
              <Clock className="w-10 h-10 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable columns={columns} data={filteredTrips} loading={isLoading} emptyMessage={t('noData')} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'سجل رحلة جديدة' : 'New Trip Log'}</DialogTitle>
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
                <Label>{isRTL ? 'السائق' : 'Driver'} *</Label>
                <Select value={formData.driver_id} onValueChange={(v) => setFormData(p => ({...p, driver_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الرحلة' : 'Trip Type'}</Label>
                <Select value={formData.trip_type} onValueChange={(v) => setFormData(p => ({...p, trip_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning_route">{isRTL ? 'مسار صباحي' : 'Morning Route'}</SelectItem>
                    <SelectItem value="afternoon_route">{isRTL ? 'مسار مسائي' : 'Afternoon Route'}</SelectItem>
                    <SelectItem value="field_trip">{isRTL ? 'رحلة ميدانية' : 'Field Trip'}</SelectItem>
                    <SelectItem value="event">{isRTL ? 'فعالية' : 'Event'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'التاريخ' : 'Date'}</Label>
                <Input type="date" value={formData.trip_date} onChange={(e) => setFormData(p => ({...p, trip_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'وقت البداية' : 'Start Time'}</Label>
                <Input type="time" value={formData.start_time} onChange={(e) => setFormData(p => ({...p, start_time: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'وقت النهاية' : 'End Time'}</Label>
                <Input type="time" value={formData.end_time} onChange={(e) => setFormData(p => ({...p, end_time: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'عداد البداية' : 'Start Odometer'}</Label>
                <Input type="number" value={formData.start_odometer} onChange={(e) => setFormData(p => ({...p, start_odometer: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'عداد النهاية' : 'End Odometer'}</Label>
                <Input type="number" value={formData.end_odometer} onChange={(e) => setFormData(p => ({...p, end_odometer: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المسار' : 'Route'}</Label>
                <Input value={formData.route} onChange={(e) => setFormData(p => ({...p, route: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'عدد الطلاب' : 'Students Count'}</Label>
                <Input type="number" value={formData.students_count} onChange={(e) => setFormData(p => ({...p, students_count: parseInt(e.target.value) || 0}))} />
              </div>
            </div>
            {formData.end_odometer > formData.start_odometer && (
              <div className="bg-sand p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">{isRTL ? 'المسافة المقطوعة' : 'Distance Traveled'}</p>
                <p className="text-2xl font-bold">{(formData.end_odometer - formData.start_odometer).toFixed(0)} {isRTL ? 'كم' : 'km'}</p>
              </div>
            )}
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