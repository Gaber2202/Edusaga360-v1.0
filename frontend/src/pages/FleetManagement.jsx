import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import { Plus, Truck, AlertCircle, Search, Loader2, Wrench, Fuel, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import MaintenanceTracker from '../components/fleet/MaintenanceTracker';
import FuelTracker from '../components/fleet/FuelTracker';
import TripTracker from '../components/fleet/TripTracker';

export default function FleetManagement() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('vehicles');
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState({
    vehicle_number: '',
    plate_number: '',
    vehicle_type: 'bus',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    capacity: 0,
    license_expiry: '',
    insurance_expiry: '',
    driver_id: '',
    route: '',
    status: 'active',
    notes: ''
  });

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles', tenantId, selectedBranchId],
    queryFn: () => tenantQuery('vehicles').select('*').match(tenantFilter(branchFilter()), '-created_date'),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const { data: _branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => tenantQuery('branchs').select('*').match(tenantFilter()),
    enabled: hasTenantAccess,
  });

  const filteredVehicles = filterByBranch(vehicles).filter(v =>
    v.vehicle_number?.includes(search) || 
    v.plate_number?.includes(search) ||
    v.make?.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate stats
  const activeVehicles = filteredVehicles.filter(v => v.status === 'active').length;
  const maintenanceVehicles = filteredVehicles.filter(v => v.status === 'maintenance').length;
  const expiringLicenses = filteredVehicles.filter(v => {
    if (!v.license_expiry) return false;
    const daysUntil = differenceInDays(new Date(v.license_expiry), new Date());
    return daysUntil >= 0 && daysUntil <= 30;
  }).length;
  const expiringInsurance = filteredVehicles.filter(v => {
    if (!v.insurance_expiry) return false;
    const daysUntil = differenceInDays(new Date(v.insurance_expiry), new Date());
    return daysUntil >= 0 && daysUntil <= 30;
  }).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = {
        ...formData,
        ...(tid && { tenant_id: tid }),
        branch_id: selectedBranchId,
        driver_name: employees.find(e => e.id === formData.driver_id)?.name_ar
      };

      if (editingVehicle?.id) {
        await tenantQuery('vehicles').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Vehicle', entityId: editingVehicle.id, oldValues: editingVehicle, newValues: data });
      } else {
        const created = await tenantQuery('vehicles').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Vehicle', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    // CRITICAL FIX: Properly load vehicle data for editing
    setFormData({
      vehicle_number: vehicle.vehicle_number || '',
      plate_number: vehicle.plate_number || '',
      vehicle_type: vehicle.vehicle_type || 'bus',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || new Date().getFullYear(),
      capacity: vehicle.capacity || 0,
      license_expiry: vehicle.license_expiry || '',
      insurance_expiry: vehicle.insurance_expiry || '',
      driver_id: vehicle.driver_id || '',
      route: vehicle.route || '',
      status: vehicle.status || 'active',
      notes: vehicle.notes || ''
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditingVehicle(null);
    setFormData({
      vehicle_number: '', plate_number: '', vehicle_type: 'bus', make: '', model: '',
      year: new Date().getFullYear(), capacity: 0, license_expiry: '', insurance_expiry: '',
      driver_id: '', route: '', status: 'active', notes: ''
    });
  };

  const vehicleColumns = [
    { header: isRTL ? 'رقم المركبة' : 'Vehicle #', cell: (row) => <span className="font-mono font-medium">{row.vehicle_number}</span> },
    { header: isRTL ? 'رقم اللوحة' : 'Plate #', accessorKey: 'plate_number' },
    { header: isRTL ? 'النوع' : 'Type', cell: (row) => {
      const types = { bus: isRTL ? 'حافلة' : 'Bus', van: isRTL ? 'فان' : 'Van', car: isRTL ? 'سيارة' : 'Car' };
      return types[row.vehicle_type] || row.vehicle_type;
    }},
    { header: isRTL ? 'الطراز' : 'Model', cell: (row) => `${row.make} ${row.model} (${row.year})` },
    { header: isRTL ? 'السعة' : 'Capacity', accessorKey: 'capacity' },
    { header: isRTL ? 'السائق' : 'Driver', accessorKey: 'driver_name' },
    { header: isRTL ? 'انتهاء الرخصة' : 'License Expiry', cell: (row) => {
      if (!row.license_expiry) return '-';
      const daysUntil = differenceInDays(new Date(row.license_expiry), new Date());
      const isExpiring = daysUntil >= 0 && daysUntil <= 30;
      return (
        <div className="flex items-center gap-2">
          <span className={isExpiring ? 'text-red-600 font-medium' : ''}>
            {format(new Date(row.license_expiry), 'dd/MM/yyyy')}
          </span>
          {isExpiring && <AlertCircle className="w-4 h-4 text-red-600" />}
        </div>
      );
    }},
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <Button size="sm" variant="ghost" onClick={() => handleEdit(row)}>
        {t('edit')}
      </Button>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إدارة الأسطول' : 'Fleet Management'}
        subtitle={isRTL ? 'إدارة المركبات والسائقين' : 'Manage vehicles and drivers'}
        action
        actionLabel={isRTL ? 'إضافة مركبة' : 'Add Vehicle'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'مركبات نشطة' : 'Active Vehicles'} value={activeVehicles} icon={Truck} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'تحت الصيانة' : 'In Maintenance'} value={maintenanceVehicles} icon={AlertCircle} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'رخص تنتهي قريباً' : 'Expiring Licenses'} value={expiringLicenses} icon={AlertCircle} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'تأمين ينتهي قريباً' : 'Expiring Insurance'} value={expiringInsurance} icon={AlertCircle} iconClassName="bg-orange-50" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="vehicles" className="gap-2">
            <Truck className="w-4 h-4" />
            {isRTL ? 'المركبات' : 'Vehicles'}
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2">
            <Wrench className="w-4 h-4" />
            {isRTL ? 'الصيانة' : 'Maintenance'}
          </TabsTrigger>
          <TabsTrigger value="fuel" className="gap-2">
            <Fuel className="w-4 h-4" />
            {isRTL ? 'الوقود' : 'Fuel'}
          </TabsTrigger>
          <TabsTrigger value="trips" className="gap-2">
            <MapPin className="w-4 h-4" />
            {isRTL ? 'الرحلات' : 'Trips'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="mt-6 space-y-6">
          <div className="relative max-w-md">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
          </div>
          <DataTable columns={vehicleColumns} data={filteredVehicles} loading={isLoading} emptyMessage={t('noData')} />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6">
          <MaintenanceTracker />
        </TabsContent>

        <TabsContent value="fuel" className="mt-6">
          <FuelTracker />
        </TabsContent>

        <TabsContent value="trips" className="mt-6">
          <TripTracker />
        </TabsContent>
      </Tabs>

      {/* Vehicle Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVehicle ? (isRTL ? 'تعديل المركبة' : 'Edit Vehicle') : (isRTL ? 'إضافة مركبة' : 'Add Vehicle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'رقم المركبة' : 'Vehicle Number'} *</Label>
                <Input value={formData.vehicle_number} onChange={(e) => setFormData(p => ({...p, vehicle_number: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'رقم اللوحة' : 'Plate Number'} *</Label>
                <Input value={formData.plate_number} onChange={(e) => setFormData(p => ({...p, plate_number: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النوع' : 'Type'}</Label>
                <Select value={formData.vehicle_type} onValueChange={(v) => setFormData(p => ({...p, vehicle_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bus">{isRTL ? 'حافلة' : 'Bus'}</SelectItem>
                    <SelectItem value="van">{isRTL ? 'فان' : 'Van'}</SelectItem>
                    <SelectItem value="car">{isRTL ? 'سيارة' : 'Car'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'السعة' : 'Capacity'}</Label>
                <Input type="number" value={formData.capacity} onChange={(e) => setFormData(p => ({...p, capacity: parseInt(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الماركة' : 'Make'}</Label>
                <Input value={formData.make} onChange={(e) => setFormData(p => ({...p, make: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الموديل' : 'Model'}</Label>
                <Input value={formData.model} onChange={(e) => setFormData(p => ({...p, model: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'السنة' : 'Year'}</Label>
                <Input type="number" value={formData.year} onChange={(e) => setFormData(p => ({...p, year: parseInt(e.target.value) || new Date().getFullYear()}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'السائق' : 'Driver'}</Label>
                <Select value={formData.driver_id || 'none'} onValueChange={(v) => setFormData(p => ({...p, driver_id: v === 'none' ? '' : v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isRTL ? 'بدون' : 'None'}</SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name_ar}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'انتهاء الرخصة' : 'License Expiry'}</Label>
                <Input type="date" value={formData.license_expiry} onChange={(e) => setFormData(p => ({...p, license_expiry: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'انتهاء التأمين' : 'Insurance Expiry'}</Label>
                <Input type="date" value={formData.insurance_expiry} onChange={(e) => setFormData(p => ({...p, insurance_expiry: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData(p => ({...p, status: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{isRTL ? 'نشطة' : 'Active'}</SelectItem>
                    <SelectItem value="maintenance">{isRTL ? 'صيانة' : 'Maintenance'}</SelectItem>
                    <SelectItem value="inactive">{isRTL ? 'غير نشطة' : 'Inactive'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المسار' : 'Route'}</Label>
                <Input value={formData.route} onChange={(e) => setFormData(p => ({...p, route: e.target.value}))} />
              </div>
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