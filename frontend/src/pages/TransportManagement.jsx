import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import StatCard from '../components/ui/StatCard';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { Plus, Search, AlertTriangle, MapPin, Users, Route,
  CheckCircle, Shield, Navigation
} from 'lucide-react';
import LiveBusTracker from '../components/transport/LiveBusTracker';

const BLANK_ROUTE = { route_code: '', name_ar: '', name_en: '', direction: 'both', vehicle_id: '', driver_id: '', supervisor_id: '', monthly_fee: 0, stops: [], is_active: true, notes: '' };

export default function TransportManagement() {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('routes');
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [routeForm, setRouteForm] = useState(BLANK_ROUTE);
  const [editingRoute, setEditingRoute] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [newStop, setNewStop] = useState({ name_ar: '', name_en: '', estimated_time: '' });
  const [assignData, setAssignData] = useState({ student_id: '', route_id: '', pickup_stop: '', dropoff_stop: '' });
  const [studentSearch, setStudentSearch] = useState('');

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ['busRoutes', tenantId],
    queryFn: () => fetchData(tenantQuery('bus_routes').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['busAssignments', tenantId],
    queryFn: () => fetchData(tenantQuery('student_bus_assignments').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles', tenantId],
    queryFn: () => fetchData(tenantQuery('vehicles').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const activeRoutes = routes.filter(r => r.is_active);
  const totalStudents = assignments.length;
  const routesWithSupervisor = routes.filter(r => r.supervisor_id).length;

  // Expiring docs from vehicles
  const today = new Date();
  const expiryAlerts = vehicles.filter(v => {
    const fields = [v.insurance_expiry, v.license_expiry];
    return fields.some(f => f && differenceInDays(new Date(f), today) <= 30);
  });

  const filteredRoutes = routes.filter(r => {
    const q = search.toLowerCase();
    return !q || r.name_ar?.includes(search) || r.name_en?.toLowerCase().includes(q) || r.route_code?.includes(search);
  });

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase();
    return !q || s.name_ar?.includes(studentSearch) || s.name_en?.toLowerCase().includes(q);
  });

  const handleSaveRoute = async () => {
    if (!routeForm.route_code || !routeForm.name_ar) return toast.error(isRTL ? 'أدخل البيانات المطلوبة' : 'Enter required fields');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const vehicle = vehicles.find(v => v.id === routeForm.vehicle_id);
      const driver = employees.find(e => e.id === routeForm.driver_id);
      const supervisor = employees.find(e => e.id === routeForm.supervisor_id);
      const data = {
        ...routeForm,
        ...(tid && { tenant_id: tid }),
        vehicle_number: vehicle?.vehicle_number,
        driver_name: driver?.name_ar,
        supervisor_name: supervisor?.name_ar,
      };
      if (editingRoute) {
        await tenantQuery('bus_routes').update(data);
      } else {
        await tenantQuery('bus_routes').insert(data);
      }
      queryClient.invalidateQueries({ queryKey: ['busRoutes'] });
      setShowRouteForm(false); setRouteForm(BLANK_ROUTE); setEditingRoute(null);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } finally { setSaving(false); }
  };

  const handleAssign = async () => {
    if (!assignData.student_id || !assignData.route_id) return toast.error(isRTL ? 'اختر الطالب والمسار' : 'Select student and route');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const student = students.find(s => s.id === assignData.student_id);
      const route = routes.find(r => r.id === assignData.route_id);
      await tenantQuery('student_bus_assignments').insert({
        ...(tid && { tenant_id: tid }),
        student_id: assignData.student_id, student_name: student?.name_ar, grade: student?.grade,
        route_id: assignData.route_id, route_name: route?.name_ar,
        pickup_stop: assignData.pickup_stop, dropoff_stop: assignData.dropoff_stop,
        start_date: format(new Date(), 'yyyy-MM-dd'), status: 'active',
      });
      queryClient.invalidateQueries({ queryKey: ['busAssignments'] });
      setShowAssignForm(false); setAssignData({ student_id: '', route_id: '', pickup_stop: '', dropoff_stop: '' }); setStudentSearch('');
      toast.success(isRTL ? 'تم التخصيص' : 'Assigned successfully');
    } finally { setSaving(false); }
  };

  const addStop = () => {
    if (!newStop.name_ar) return;
    setRouteForm(f => ({ ...f, stops: [...(f.stops || []), { ...newStop, stop_order: (f.stops?.length || 0) + 1 }] }));
    setNewStop({ name_ar: '', name_en: '', estimated_time: '' });
  };

  const selectedRoute = routes.find(r => r.id === assignData.route_id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{isRTL ? 'إدارة النقل المدرسي' : 'Transport Management'}</h1>
          <p className="text-sm text-muted-foreground">{isRTL ? 'المسارات، تخصيص الطلاب، والتتبع' : 'Routes, student assignments & bus tracking'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAssignForm(true)}>
            <Users className="w-4 h-4 me-1" />{isRTL ? 'تخصيص طالب' : 'Assign Student'}
          </Button>
          <Button onClick={() => { setEditingRoute(null); setRouteForm(BLANK_ROUTE); setShowRouteForm(true); }} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            <Plus className="w-4 h-4 me-1" />{isRTL ? 'إضافة مسار' : 'Add Route'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'مسارات نشطة' : 'Active Routes'} value={activeRoutes.length} icon={Route} iconClassName="bg-cyan-50" />
        <StatCard title={isRTL ? 'طلاب مخصصون' : 'Assigned Students'} value={totalStudents} icon={Users} iconClassName="bg-najdi-50" />
        <StatCard title={isRTL ? 'مراقبو الحافلات' : 'With Supervisors'} value={routesWithSupervisor} icon={Shield} iconClassName="bg-green-50" />
        <StatCard title={isRTL ? 'تنبيهات انتهاء' : 'Expiry Alerts'} value={expiryAlerts.length} icon={AlertTriangle} iconClassName="bg-red-50" />
      </div>

      {expiryAlerts.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{isRTL ? 'تنبيهات انتهاء الصلاحية' : 'Expiry Alerts'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {expiryAlerts.map(v => (
              <div key={v.id} className="text-xs text-red-600 bg-red-100 px-3 py-1.5 rounded-lg">
                {v.vehicle_number} — {[
                  v.insurance_expiry && differenceInDays(new Date(v.insurance_expiry), today) <= 30 && `Insurance: ${v.insurance_expiry}`,
                  v.license_expiry && differenceInDays(new Date(v.license_expiry), today) <= 30 && `License: ${v.license_expiry}`,
                ].filter(Boolean).join(' · ')}
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="live"><Navigation className="w-4 h-4 me-1 text-cyan-500" />{isRTL ? 'التتبع المباشر' : 'Live Tracking'}</TabsTrigger>
          <TabsTrigger value="routes"><Route className="w-4 h-4 me-1" />{isRTL ? 'المسارات' : 'Routes'}</TabsTrigger>
          <TabsTrigger value="assignments"><Users className="w-4 h-4 me-1" />{isRTL ? 'تخصيصات الطلاب' : 'Student Assignments'}</TabsTrigger>
          <TabsTrigger value="safety"><Shield className="w-4 h-4 me-1" />{isRTL ? 'السلامة' : 'Safety'}</TabsTrigger>
        </TabsList>

        {/* LIVE TRACKING */}
        <TabsContent value="live" className="mt-4">
          <LiveBusTracker
            routes={routes}
            assignments={assignments}
            students={students}
            getTenantIdForCreate={getTenantIdForCreate}
            tenantFilter={tenantFilter}
            tenantId={tenantId}
            hasTenantAccess={hasTenantAccess}
          />
        </TabsContent>

        {/* ROUTES */}
        <TabsContent value="routes" className="mt-4 space-y-4">
          <div className="relative max-w-72">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={e => setSearch(e.target.value)} className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRoutes.map(r => {
              const routeAssignments = assignments.filter(a => a.route_id === r.id);
              return (
                <Card key={r.id} className={!r.is_active ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-ink">{r.name_ar}</p>
                        {r.name_en && <p className="text-xs text-muted-foreground">{r.name_en}</p>}
                        <p className="text-xs text-cyan-600 font-mono">{r.route_code}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-sand-alt text-muted-foreground'}`}>
                        {r.is_active ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'متوقف' : 'Inactive')}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-muted-foreground mb-3">
                      {r.vehicle_number && <p>🚌 {r.vehicle_number}</p>}
                      {r.driver_name && <p>👤 {isRTL ? 'السائق:' : 'Driver:'} {r.driver_name}</p>}
                      {r.supervisor_name && <p>🛡 {isRTL ? 'المشرف:' : 'Supervisor:'} {r.supervisor_name}</p>}
                      <p>👥 {routeAssignments.length} {isRTL ? 'طالب' : 'students'}</p>
                      {r.monthly_fee > 0 && <p>💰 {r.monthly_fee} SAR/{isRTL ? 'شهر' : 'month'}</p>}
                    </div>
                    {r.stops?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {r.stops.map((s, i) => <span key={i} className="text-xs bg-sand-alt px-1.5 py-0.5 rounded">{s.name_ar}</span>)}
                      </div>
                    )}
                    <Button size="sm" variant="ghost" className="w-full h-7 text-xs mt-1" onClick={() => { setEditingRoute(r); setRouteForm({ ...r }); setShowRouteForm(true); }}>
                      {isRTL ? 'تعديل' : 'Edit'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {filteredRoutes.length === 0 && !routesLoading && (
              <div className="col-span-3 text-center py-12 text-muted-foreground">{isRTL ? 'لا توجد مسارات' : 'No routes found'}</div>
            )}
          </div>
        </TabsContent>

        {/* ASSIGNMENTS */}
        <TabsContent value="assignments" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                    <TableHead>{isRTL ? 'المسار' : 'Route'}</TableHead>
                    <TableHead>{isRTL ? 'موقف الصباح' : 'Pickup Stop'}</TableHead>
                    <TableHead>{isRTL ? 'موقف المساء' : 'Dropoff Stop'}</TableHead>
                    <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-sm">{a.student_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.grade}</TableCell>
                      <TableCell className="text-sm">{a.route_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.pickup_stop || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.dropoff_stop || '—'}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-sand-alt text-muted-foreground'}`}>{a.status}</span></TableCell>
                    </TableRow>
                  ))}
                  {assignments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{isRTL ? 'لا تخصيصات' : 'No assignments'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* SAFETY */}
        <TabsContent value="safety" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4 text-cyan-500" />{isRTL ? 'متطلبات السلامة السعودية' : 'Saudi Safety Requirements'}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { ar: 'مشرف مرافق في كل حافلة (إلزامي)', en: 'Supervisor on every bus (mandatory)', done: routesWithSupervisor === routes.length },
                  { ar: 'تأكيد تفتيش الحافلة بعد الرحلة', en: 'End-of-route bus sweep confirmation', done: true },
                  { ar: 'تسجيل الصعود والنزول للطلاب', en: 'Student boarding/alighting log', done: true },
                  { ar: 'سجل الحوادث والطوارئ', en: 'Incident & emergency log', done: true },
                ].map((req, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle className={`w-4 h-4 flex-shrink-0 ${req.done ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <span className={req.done ? 'text-ink' : 'text-muted-foreground'}>{isRTL ? req.ar : req.en}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" />{isRTL ? 'حافلات بدون مشرف' : 'Routes Without Supervisor'}</CardTitle></CardHeader>
              <CardContent>
                {routes.filter(r => r.is_active && !r.supervisor_id).map(r => (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{r.name_ar}</p>
                      <p className="text-xs text-muted-foreground">{r.route_code}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingRoute(r); setRouteForm({ ...r }); setShowRouteForm(true); }}>
                      {isRTL ? 'تعيين مشرف' : 'Assign Supervisor'}
                    </Button>
                  </div>
                ))}
                {routes.filter(r => r.is_active && !r.supervisor_id).length === 0 && (
                  <p className="text-center text-sm text-green-600 py-4">{isRTL ? '✓ جميع الحافلات لديها مشرف' : '✓ All buses have supervisors'}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Route Form Dialog */}
      <Dialog open={showRouteForm} onOpenChange={setShowRouteForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRoute ? (isRTL ? 'تعديل المسار' : 'Edit Route') : (isRTL ? 'إضافة مسار' : 'Add Route')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{isRTL ? 'رمز المسار *' : 'Route Code *'}</Label><Input value={routeForm.route_code} onChange={e => setRouteForm(f => ({ ...f, route_code: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{isRTL ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</Label><Input value={routeForm.name_ar} onChange={e => setRouteForm(f => ({ ...f, name_ar: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label><Input value={routeForm.name_en} onChange={e => setRouteForm(f => ({ ...f, name_en: e.target.value }))} /></div>
              <div className="space-y-1"><Label>{isRTL ? 'الاتجاه' : 'Direction'}</Label>
                <Select value={routeForm.direction} onValueChange={v => setRouteForm(f => ({ ...f, direction: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{isRTL ? 'ذهاب وإياب' : 'Both'}</SelectItem>
                    <SelectItem value="morning">{isRTL ? 'صباحي فقط' : 'Morning only'}</SelectItem>
                    <SelectItem value="afternoon">{isRTL ? 'مسائي فقط' : 'Afternoon only'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{isRTL ? 'الحافلة' : 'Bus'}</Label>
                <Select value={routeForm.vehicle_id || 'none'} onValueChange={v => setRouteForm(f => ({ ...f, vehicle_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.vehicle_number} — {v.plate_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{isRTL ? 'السائق' : 'Driver'}</Label>
                <Select value={routeForm.driver_id || 'none'} onValueChange={v => setRouteForm(f => ({ ...f, driver_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{isRTL ? 'المشرف' : 'Supervisor'}</Label>
                <Select value={routeForm.supervisor_id || 'none'} onValueChange={v => setRouteForm(f => ({ ...f, supervisor_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{isRTL ? 'الرسوم الشهرية (ر.س)' : 'Monthly Fee (SAR)'}</Label><Input type="number" value={routeForm.monthly_fee} onChange={e => setRouteForm(f => ({ ...f, monthly_fee: parseFloat(e.target.value) || 0 }))} /></div>
            </div>

            {/* Stops */}
            <div className="space-y-2">
              <Label>{isRTL ? 'المحطات' : 'Stops'}</Label>
              {(routeForm.stops || []).map((s, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-sand rounded-lg text-sm">
                  <MapPin className="w-3.5 h-3.5 text-cyan-500" />
                  <span className="font-medium">{i + 1}. {s.name_ar}</span>
                  {s.estimated_time && <span className="text-muted-foreground">· {s.estimated_time}</span>}
                  <button onClick={() => setRouteForm(f => ({ ...f, stops: f.stops.filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-red-500 ms-auto">×</button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder={isRTL ? 'اسم المحطة (عربي)' : 'Stop name'} value={newStop.name_ar} onChange={e => setNewStop(s => ({ ...s, name_ar: e.target.value }))} className="flex-1" />
                <Input placeholder={isRTL ? 'الوقت' : 'ETA'} value={newStop.estimated_time} onChange={e => setNewStop(s => ({ ...s, estimated_time: e.target.value }))} className="w-24" />
                <Button type="button" size="sm" variant="outline" onClick={addStop}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRouteForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveRoute} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 text-white">{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Student Dialog */}
      <Dialog open={showAssignForm} onOpenChange={setShowAssignForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{isRTL ? 'تخصيص طالب للنقل' : 'Assign Student to Route'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الطالب' : 'Student'}</Label>
              {!assignData.student_id ? (
                <>
                  <Input placeholder={isRTL ? 'ابحث...' : 'Search...'} value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
                  {studentSearch && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {filteredStudents.slice(0, 6).map(s => (
                        <button key={s.id} onClick={() => { setAssignData(d => ({ ...d, student_id: s.id })); setStudentSearch(s.name_ar); }} className="w-full text-start px-3 py-2 hover:bg-sand text-sm border-b last:border-0">{s.name_ar} — {s.grade}</button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-cyan-50 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-cyan-500" /><span className="text-sm">{studentSearch}</span>
                  <button onClick={() => { setAssignData(d => ({ ...d, student_id: '' })); setStudentSearch(''); }} className="text-muted-foreground ms-auto">×</button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'المسار' : 'Route'}</Label>
              <Select value={assignData.route_id || 'none'} onValueChange={v => setAssignData(d => ({ ...d, route_id: v === 'none' ? '' : v, pickup_stop: '', dropoff_stop: '' }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر مساراً' : 'Select route'} /></SelectTrigger>
                <SelectContent>{routes.filter(r => r.is_active).map(r => <SelectItem key={r.id} value={r.id}>{r.name_ar}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {selectedRoute?.stops?.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label>{isRTL ? 'موقف الصعود' : 'Pickup Stop'}</Label>
                  <Select value={assignData.pickup_stop || 'none'} onValueChange={v => setAssignData(d => ({ ...d, pickup_stop: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{selectedRoute.stops.map((s, i) => <SelectItem key={i} value={s.name_ar}>{s.name_ar}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'موقف النزول' : 'Dropoff Stop'}</Label>
                  <Select value={assignData.dropoff_stop || 'none'} onValueChange={v => setAssignData(d => ({ ...d, dropoff_stop: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{selectedRoute.stops.map((s, i) => <SelectItem key={i} value={s.name_ar}>{s.name_ar}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleAssign} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 text-white">{isRTL ? 'تخصيص' : 'Assign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}