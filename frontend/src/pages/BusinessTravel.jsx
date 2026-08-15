import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import Currency from '../components/Currency';
import { getCurrencySymbol } from '../lib/localization';
import { useRole } from '../components/RoleContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Plane, Plus, Loader2, BarChart3, FileText, CheckCircle, XCircle } from 'lucide-react';
import { useTenant } from '../components/TenantContext';

export default function BusinessTravel() {
  const { isRTL, t } = useLanguage();
  const { tenant } = useTenant();
  const { user, userRole } = useRole();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('requests');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    destination: '', purpose: '', departure_date: '', return_date: '',
    estimated_cost: 0, transportation_type: 'flight',
    accommodation_type: 'hotel', per_diem: 0,
    notes: '', department_id: '', employee_name: ''
  });

  const { data: travelRequests = [], isLoading } = useQuery({ enabled: false /* travel_requests table not built */, queryKey: ['travel_requests', tenantId, selectedBranchId], queryFn: () => fetchData(tenantQuery('travel_requests').select('*').match(tenantFilter()).order('created_at', { ascending: false })), initialData: [] });

  const { data: travelPolicies = [] } = useQuery({ enabled: false /* travel_policies table not built */, queryKey: ['travel_policies', tenantId], queryFn: () => fetchData(tenantQuery('travel_policies').select('*').match(tenantFilter())), initialData: [] });

  const handleSave = async () => {
    if (!form.destination || !form.departure_date) {
      toast.error(isRTL ? 'الوجهة وتاريخ السفر مطلوبان' : 'Destination and date required');
      return;
    }
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = {
        ...form,
        ...(tid && { tenant_id: tid }),
        request_number: `TRV-${Date.now().toString(36).toUpperCase()}`,
        requested_by: user?.email,
        employee_name: form.employee_name || user?.full_name || user?.email,
        status: 'pending',
        branch_id: selectedBranchId
      };
      const created = await tenantQuery('travel_requests').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'TravelRequest', entityId: created.id, newValues: data });
      queryClient.invalidateQueries({ queryKey: ['travel_requests'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم إرسال طلب السفر' : 'Travel request submitted');
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };

  const handleApprove = async (request, action) => {
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await tenantQuery('travel_requests').update({ status: newStatus, approved_by: user?.email, approved_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', request.id);
      queryClient.invalidateQueries({ queryKey: ['travel_requests'] });
      toast.success(isRTL ? (action === 'approve' ? 'تم الاعتماد' : 'تم الرفض') : (action === 'approve' ? 'Approved' : 'Rejected'));
    } catch (error) { toast.error(error.message); }
  };

  const resetForm = () => setForm({ destination: '', purpose: '', departure_date: '', return_date: '', estimated_cost: 0, transportation_type: 'flight', accommodation_type: 'hotel', per_diem: 0, notes: '', department_id: '', employee_name: '' });

  const totalPlanned = travelRequests.filter(r => r.status === 'approved').reduce((s, r) => s + (r.estimated_cost || 0), 0);
  const totalActual = travelRequests.filter(r => r.status === 'completed').reduce((s, r) => s + (r.actual_cost || r.estimated_cost || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'سفر العمل' : 'Business Travel'}
        subtitle={isRTL ? 'طلبات السفر وسياسات السفر وتتبع النفقات' : 'Travel requests, policies, and expense tracking'}
        actionLabel={isRTL ? 'طلب سفر جديد' : 'New Travel Request'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-sm text-muted-foreground">{isRTL ? 'طلبات معلقة' : 'Pending'}</p><p className="text-2xl font-bold text-amber-600">{travelRequests.filter(r => r.status === 'pending').length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">{isRTL ? 'معتمدة' : 'Approved'}</p><p className="text-2xl font-bold text-emerald-600">{travelRequests.filter(r => r.status === 'approved').length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">{isRTL ? 'تكلفة مخططة' : 'Planned Cost'}</p><p className="text-2xl font-bold text-najdi-700"><Currency amount={totalPlanned} /></p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">{isRTL ? 'تكلفة فعلية' : 'Actual Cost'}</p><p className="text-2xl font-bold text-purple-600"><Currency amount={totalActual} /></p></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="requests" className="gap-1"><Plane className="w-4 h-4" />{isRTL ? 'الطلبات' : 'Requests'}</TabsTrigger>
          <TabsTrigger value="policies" className="gap-1"><FileText className="w-4 h-4" />{isRTL ? 'السياسات' : 'Policies'}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1"><BarChart3 className="w-4 h-4" />{isRTL ? 'التحليلات' : 'Analytics'}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'رقم الطلب' : 'Request #'}</TableHead>
                  <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead>{isRTL ? 'الوجهة' : 'Destination'}</TableHead>
                  <TableHead>{isRTL ? 'المغادرة' : 'Departure'}</TableHead>
                  <TableHead>{isRTL ? 'العودة' : 'Return'}</TableHead>
                  <TableHead>{isRTL ? 'التكلفة المقدرة' : 'Est. Cost'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : travelRequests.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{isRTL ? 'لا توجد طلبات' : 'No requests'}</TableCell></TableRow>
                ) : travelRequests.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.request_number}</TableCell>
                    <TableCell className="font-medium">{r.employee_name}</TableCell>
                    <TableCell>{r.destination}</TableCell>
                    <TableCell>{r.departure_date}</TableCell>
                    <TableCell>{r.return_date || '-'}</TableCell>
                    <TableCell><Currency amount={r.estimated_cost} /></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      {r.status === 'pending' && (userRole === 'admin' || userRole === 'hr_admin') && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(r, 'approve')} className="text-emerald-600"><CheckCircle className="w-4 h-4" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(r, 'reject')} className="text-red-600"><XCircle className="w-4 h-4" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="policies" className="mt-4">
          <Card className="p-6">
            <h4 className="font-semibold mb-4">{isRTL ? 'سياسات السفر حسب الدور/القسم' : 'Travel Policies by Role/Department'}</h4>
            {travelPolicies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p>{isRTL ? 'لا توجد سياسات سفر بعد' : 'No travel policies configured yet'}</p>
                <p className="text-xs mt-1">{isRTL ? 'سيتم تطبيق السياسات تلقائياً على طلبات السفر' : 'Policies will be auto-enforced on travel requests'}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الدور/القسم' : 'Role/Dept'}</TableHead>
                    <TableHead>{isRTL ? 'حد التكلفة اليومية' : 'Daily Limit'}</TableHead>
                    <TableHead>{isRTL ? 'فئة الطيران' : 'Flight Class'}</TableHead>
                    <TableHead>{isRTL ? 'فئة الفندق' : 'Hotel Category'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {travelPolicies.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.role_name || p.department_name}</TableCell>
                      <TableCell><Currency amount={p.daily_limit} /></TableCell>
                      <TableCell>{p.flight_class || 'Economy'}</TableCell>
                      <TableCell>{p.hotel_category || '3-star'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'مقارنة المخطط مقابل الفعلي' : 'Planned vs Actual Spend'}</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-najdi-50 rounded-lg">
                  <span className="text-sm">{isRTL ? 'التكلفة المخططة' : 'Planned'}</span>
                  <span className="font-bold text-najdi-700"><Currency amount={totalPlanned} /></span>
                </div>
                <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
                  <span className="text-sm">{isRTL ? 'التكلفة الفعلية' : 'Actual'}</span>
                  <span className="font-bold text-emerald-600"><Currency amount={totalActual} /></span>
                </div>
                <div className="flex justify-between items-center p-3 bg-sand rounded-lg">
                  <span className="text-sm">{isRTL ? 'الفرق' : 'Variance'}</span>
                  <span className={`font-bold ${totalPlanned - totalActual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}><Currency amount={totalPlanned - totalActual} /></span>
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'أكثر الوجهات' : 'Top Destinations'}</h4>
              <div className="space-y-2">
                {Object.entries(travelRequests.reduce((acc, r) => { acc[r.destination || 'N/A'] = (acc[r.destination || 'N/A'] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([dest, count], i) => (
                  <div key={i} className="flex justify-between items-center p-2 bg-sand rounded-lg">
                    <span className="text-sm">{dest}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
                {travelRequests.length === 0 && <p className="text-center text-muted-foreground py-4">{isRTL ? 'لا توجد بيانات' : 'No data'}</p>}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{isRTL ? 'طلب سفر جديد' : 'New Travel Request'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم الموظف' : 'Employee Name'}</Label>
                <Input value={form.employee_name} onChange={(e) => setForm(p => ({...p, employee_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الوجهة' : 'Destination'} *</Label>
                <Input value={form.destination} onChange={(e) => setForm(p => ({...p, destination: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ المغادرة' : 'Departure Date'} *</Label>
                <Input type="date" value={form.departure_date} onChange={(e) => setForm(p => ({...p, departure_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ العودة' : 'Return Date'}</Label>
                <Input type="date" value={form.return_date} onChange={(e) => setForm(p => ({...p, return_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'وسيلة النقل' : 'Transportation'}</Label>
                <Select value={form.transportation_type} onValueChange={(v) => setForm(p => ({...p, transportation_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flight">{isRTL ? 'طيران' : 'Flight'}</SelectItem>
                    <SelectItem value="car">{isRTL ? 'سيارة' : 'Car'}</SelectItem>
                    <SelectItem value="bus">{isRTL ? 'حافلة' : 'Bus'}</SelectItem>
                    <SelectItem value="train">{isRTL ? 'قطار' : 'Train'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الإقامة' : 'Accommodation'}</Label>
                <Select value={form.accommodation_type} onValueChange={(v) => setForm(p => ({...p, accommodation_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hotel">{isRTL ? 'فندق' : 'Hotel'}</SelectItem>
                    <SelectItem value="apartment">{isRTL ? 'شقة' : 'Apartment'}</SelectItem>
                    <SelectItem value="none">{isRTL ? 'بدون إقامة' : 'No Accommodation'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? `التكلفة المقدرة (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Estimated Cost (${getCurrencySymbol(tenant?.localization, isRTL)})`}</Label>
                <Input type="number" min="0" value={form.estimated_cost} onChange={(e) => setForm(p => ({...p, estimated_cost: parseFloat(e.target.value) || 0}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? `البدل اليومي (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Per Diem (${getCurrencySymbol(tenant?.localization, isRTL)})`}</Label>
                <Input type="number" min="0" value={form.per_diem} onChange={(e) => setForm(p => ({...p, per_diem: parseFloat(e.target.value) || 0}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'غرض السفر' : 'Purpose'}</Label>
              <Textarea value={form.purpose} onChange={(e) => setForm(p => ({...p, purpose: e.target.value}))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea value={form.notes} onChange={(e) => setForm(p => ({...p, notes: e.target.value}))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إرسال' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
