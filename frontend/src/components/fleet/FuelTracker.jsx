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
import { Plus, Fuel, TrendingUp, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function FuelTracker() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    vehicle_id: '',
    fuel_date: format(new Date(), 'yyyy-MM-dd'),
    fuel_type: 'petrol_91',
    liters: 0,
    cost_per_liter: 0,
    odometer_reading: 0,
    payment_method: 'fuel_card',
    station_name: ''
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('vehicles').select('*').match(branchFilter())),
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['fuelRecords', selectedBranchId],
    queryFn: () => fetchData(tenantQuery('fuel_records').select('*').match(branchFilter()).order('created_at', { ascending: false })),
  });

  const filteredRecords = filterByBranch(records);

  const handleSave = async () => {
    if (!formData.vehicle_id || formData.liters <= 0) {
      toast.error(isRTL ? 'أدخل البيانات المطلوبة' : 'Enter required data');
      return;
    }

    setSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === formData.vehicle_id);
      const recordNumber = `FUEL-${Date.now().toString(36).toUpperCase()}`;
      const totalCost = formData.liters * formData.cost_per_liter;
      
      await tenantQuery('fuel_records').insert({
        ...formData,
        record_number: recordNumber,
        vehicle_number: vehicle?.vehicle_number,
        branch_id: selectedBranchId,
        total_cost: totalCost
      });

      queryClient.invalidateQueries({ queryKey: ['fuelRecords'] });
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
      fuel_date: format(new Date(), 'yyyy-MM-dd'),
      fuel_type: 'petrol_91',
      liters: 0,
      cost_per_liter: 0,
      odometer_reading: 0,
      payment_method: 'fuel_card',
      station_name: ''
    });
  };

  const columns = [
    { header: isRTL ? 'المركبة' : 'Vehicle', accessorKey: 'vehicle_number' },
    { header: isRTL ? 'التاريخ' : 'Date', cell: (row) => format(new Date(row.fuel_date), 'dd/MM/yyyy') },
    { header: isRTL ? 'اللترات' : 'Liters', cell: (row) => `${row.liters} ${isRTL ? 'لتر' : 'L'}` },
    { header: isRTL ? 'السعر/لتر' : 'Price/L', cell: (row) => `${row.cost_per_liter?.toFixed(2)} ${t('sar')}` },
    { header: isRTL ? 'الإجمالي' : 'Total', cell: (row) => `${row.total_cost?.toLocaleString()} ${t('sar')}` },
    { header: isRTL ? 'العداد' : 'Odometer', cell: (row) => row.odometer_reading?.toLocaleString() || '-' },
    { header: isRTL ? 'المحطة' : 'Station', accessorKey: 'station_name' }
  ];

  const totalSpent = filteredRecords.reduce((sum, r) => sum + (r.total_cost || 0), 0);
  const totalLiters = filteredRecords.reduce((sum, r) => sum + (r.liters || 0), 0);
  const avgPerLiter = totalLiters > 0 ? totalSpent / totalLiters : 0;

  const fuelTrends = filteredRecords.slice(0, 10).reverse().map(r => ({
    date: format(new Date(r.fuel_date), 'dd/MM'),
    cost: r.total_cost
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{isRTL ? 'سجل الوقود' : 'Fuel Records'}</h3>
          <p className="text-sm text-slate-500">{isRTL ? 'تتبع استهلاك الوقود' : 'Track fuel consumption'}</p>
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
                <p className="text-sm text-slate-500">{isRTL ? 'إجمالي المصروف' : 'Total Spent'}</p>
                <p className="text-2xl font-bold">{totalSpent.toLocaleString()}</p>
                <p className="text-xs text-slate-500">{t('sar')}</p>
              </div>
              <Fuel className="w-10 h-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'إجمالي اللترات' : 'Total Liters'}</p>
                <p className="text-2xl font-bold">{totalLiters.toFixed(0)}</p>
              </div>
              <Fuel className="w-10 h-10 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{isRTL ? 'متوسط السعر' : 'Avg Price/L'}</p>
                <p className="text-2xl font-bold">{avgPerLiter.toFixed(2)}</p>
                <p className="text-xs text-slate-500">{t('sar')}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {fuelTrends.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h4 className="text-sm font-medium mb-4">{isRTL ? 'اتجاه التكاليف' : 'Cost Trend'}</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={fuelTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => `${value} SAR`} />
                <Bar dataKey="cost" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <DataTable columns={columns} data={filteredRecords} loading={isLoading} emptyMessage={t('noData')} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'سجل وقود جديد' : 'New Fuel Record'}</DialogTitle>
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
                <Label>{isRTL ? 'التاريخ' : 'Date'}</Label>
                <Input type="date" value={formData.fuel_date} onChange={(e) => setFormData(p => ({...p, fuel_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الوقود' : 'Fuel Type'}</Label>
                <Select value={formData.fuel_type} onValueChange={(v) => setFormData(p => ({...p, fuel_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="petrol_91">{isRTL ? 'بنزين 91' : 'Petrol 91'}</SelectItem>
                    <SelectItem value="petrol_95">{isRTL ? 'بنزين 95' : 'Petrol 95'}</SelectItem>
                    <SelectItem value="diesel">{isRTL ? 'ديزل' : 'Diesel'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'اللترات' : 'Liters'} *</Label>
                <Input type="number" step="0.01" value={formData.liters} onChange={(e) => setFormData(p => ({...p, liters: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'السعر/لتر' : 'Price per Liter'} *</Label>
                <Input type="number" step="0.01" value={formData.cost_per_liter} onChange={(e) => setFormData(p => ({...p, cost_per_liter: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'قراءة العداد' : 'Odometer Reading'}</Label>
                <Input type="number" value={formData.odometer_reading} onChange={(e) => setFormData(p => ({...p, odometer_reading: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المحطة' : 'Station'}</Label>
                <Input value={formData.station_name} onChange={(e) => setFormData(p => ({...p, station_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'طريقة الدفع' : 'Payment Method'}</Label>
                <Select value={formData.payment_method} onValueChange={(v) => setFormData(p => ({...p, payment_method: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fuel_card">{isRTL ? 'بطاقة وقود' : 'Fuel Card'}</SelectItem>
                    <SelectItem value="cash">{isRTL ? 'نقداً' : 'Cash'}</SelectItem>
                    <SelectItem value="card">{isRTL ? 'بطاقة' : 'Card'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.liters > 0 && formData.cost_per_liter > 0 && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-sm text-slate-600">{isRTL ? 'الإجمالي' : 'Total Cost'}</p>
                <p className="text-2xl font-bold">{(formData.liters * formData.cost_per_liter).toFixed(2)} {t('sar')}</p>
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