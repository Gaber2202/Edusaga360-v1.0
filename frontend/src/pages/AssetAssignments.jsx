import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../api/supabaseClient';
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
import { Plus, UserCheck, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const CONDITION_OPTIONS = [
  { value: 'excellent', ar: 'ممتاز', en: 'Excellent' },
  { value: 'good', ar: 'جيد', en: 'Good' },
  { value: 'fair', ar: 'مقبول', en: 'Fair' },
  { value: 'poor', ar: 'ضعيف', en: 'Poor' },
];

export default function AssetAssignments() {
  const { isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('assignments');
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showReturnDialog, setShowReturnDialog] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    asset_id: '', employee_id: '', assignment_date: format(new Date(), 'yyyy-MM-dd'),
    expected_return_date: '', condition_on_assignment: 'good', condition_notes: ''
  });

  const [returnForm, setReturnForm] = useState({ condition_on_return: 'good', return_notes: '' });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['assetAssignments', tenantId, selectedBranchId],
    queryFn: () => tenantQuery('asset_assignments').select('*').match(tenantFilter(branchFilter()), '-created_date'),
    enabled: hasTenantAccess,
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['availableAssets', tenantId],
    queryFn: () => tenantQuery('fixed_assets').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const filtered = filterByBranch(assignments);
  const active = filtered.filter(a => a.status === 'active');
  const returned = filtered.filter(a => a.status === 'returned');

  const handleAssign = async () => {
    if (!form.asset_id || !form.employee_id) { toast.error(isRTL ? 'يرجى اختيار الأصل والموظف' : 'Select asset and employee'); return; }
    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const asset = assets.find(a => a.id === form.asset_id);
      const emp = employees.find(e => e.id === form.employee_id);
      const data = {
        ...form,
        branch_id: selectedBranchId || asset?.branch_id || '',
        asset_code: asset?.asset_code || '',
        asset_name_ar: asset?.name_ar || '',
        asset_name_en: asset?.name_en || '',
        serial_number: asset?.serial_number || '',
        employee_name: emp?.name_ar || emp?.name_en || '',
        employee_number: emp?.employee_number || '',
        assigned_by: user.email,
        status: 'active',
        assignment_number: `ASGN-${Date.now().toString(36).toUpperCase()}`
      };
      const created = await tenantQuery('asset_assignments').insert(data);
      // Update asset status
      await tenantQuery('fixed_assets').update({
        status: 'assigned_to_employee',
        assigned_employee_id: form.employee_id,
        assigned_employee_name: data.employee_name,
        current_assignment_id: created.id
      });
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'AssetAssignment', entityId: created.id, newValues: data });
      queryClient.invalidateQueries({ queryKey: ['assetAssignments', 'availableAssets', 'assets'] });
      setShowAssignDialog(false);
      setForm({ asset_id: '', employee_id: '', assignment_date: format(new Date(), 'yyyy-MM-dd'), expected_return_date: '', condition_on_assignment: 'good', condition_notes: '' });
      toast.success(isRTL ? 'تم تعيين الأصل للموظف' : 'Asset assigned successfully');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleReturn = async (assignment) => {
    setSaving(true);
    try {
      await tenantQuery('asset_assignments').update({
        status: 'returned',
        return_date: format(new Date(), 'yyyy-MM-dd'),
        condition_on_return: returnForm.condition_on_return,
        return_notes: returnForm.return_notes,
        returned_signed_by_hr: true
      });
      await tenantQuery('fixed_assets').update({
        status: 'active',
        assigned_employee_id: null,
        assigned_employee_name: null,
        current_assignment_id: null
      });
      await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'AssetAssignment', entityId: assignment.id, newValues: { status: 'returned', ...returnForm } });
      queryClient.invalidateQueries({ queryKey: ['assetAssignments', 'availableAssets', 'assets'] });
      setShowReturnDialog(null);
      setReturnForm({ condition_on_return: 'good', return_notes: '' });
      toast.success(isRTL ? 'تم تسجيل الإرجاع' : 'Return recorded');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const conditionBadge = (cond) => {
    const map = { excellent: 'bg-emerald-100 text-emerald-700', good: 'bg-blue-100 text-blue-700', fair: 'bg-amber-100 text-amber-700', poor: 'bg-red-100 text-red-700', damaged: 'bg-red-200 text-red-800' };
    const label = CONDITION_OPTIONS.find(c => c.value === cond);
    return <Badge className={map[cond] || 'bg-slate-100 text-slate-700'}>{isRTL ? label?.ar : label?.en || cond}</Badge>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'تعيين الأصول للموظفين' : 'Asset Assignments'}
        subtitle={isRTL ? 'تتبع الأصول المعينة للموظفين ومتابعة إرجاعها' : 'Track assets assigned to employees and manage returns'}
        action actionLabel={isRTL ? 'تعيين أصل' : 'Assign Asset'} actionIcon={Plus}
        onAction={() => setShowAssignDialog(true)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="assignments">
            <UserCheck className="w-4 h-4 me-2 inline" />
            {isRTL ? `المعينة (${active.length})` : `Active (${active.length})`}
          </TabsTrigger>
          <TabsTrigger value="returned">
            <RotateCcw className="w-4 h-4 me-2 inline" />
            {isRTL ? `المُرجعة (${returned.length})` : `Returned (${returned.length})`}
          </TabsTrigger>
        </TabsList>

        {['assignments', 'returned'].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الأصل' : 'Asset'}</TableHead>
                    <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
                    <TableHead>{isRTL ? 'تاريخ التعيين' : 'Assigned Date'}</TableHead>
                    <TableHead>{isRTL ? 'الحالة عند التعيين' : 'Condition'}</TableHead>
                    {tab === 'returned' && <TableHead>{isRTL ? 'تاريخ الإرجاع' : 'Return Date'}</TableHead>}
                    {tab === 'returned' && <TableHead>{isRTL ? 'الحالة عند الإرجاع' : 'Return Cond.'}</TableHead>}
                    {tab === 'assignments' && <TableHead></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : (tab === 'assignments' ? active : returned).length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{isRTL ? 'لا توجد بيانات' : 'No data'}</TableCell></TableRow>
                  ) : (tab === 'assignments' ? active : returned).map(a => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div><p className="font-medium">{a.asset_name_ar}</p><p className="text-xs text-slate-400">{a.asset_code} {a.serial_number && `• S/N: ${a.serial_number}`}</p></div>
                      </TableCell>
                      <TableCell className="font-medium">{a.employee_name}</TableCell>
                      <TableCell>{a.assignment_date}</TableCell>
                      <TableCell>{conditionBadge(a.condition_on_assignment)}</TableCell>
                      {tab === 'returned' && <TableCell>{a.return_date}</TableCell>}
                      {tab === 'returned' && <TableCell>{conditionBadge(a.condition_on_return)}</TableCell>}
                      {tab === 'assignments' && (
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => { setShowReturnDialog(a); setReturnForm({ condition_on_return: 'good', return_notes: '' }); }}>
                            <RotateCcw className="w-3 h-3 me-1" />{isRTL ? 'تسجيل إرجاع' : 'Return'}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isRTL ? 'تعيين أصل لموظف' : 'Assign Asset to Employee'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{isRTL ? 'الأصل' : 'Asset'} *</Label>
              <Select value={form.asset_id} onValueChange={(v) => setForm(p => ({ ...p, asset_id: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر أصلاً متاحاً' : 'Select available asset'} /></SelectTrigger>
                <SelectContent>
                  {assets.filter(a => a.status === 'active').map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name_ar} — {a.asset_code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الموظف' : 'Select employee'} /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar || e.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ التعيين' : 'Assignment Date'}</Label>
                <Input type="date" value={form.assignment_date} onChange={(e) => setForm(p => ({ ...p, assignment_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الإرجاع المتوقع' : 'Expected Return'}</Label>
                <Input type="date" value={form.expected_return_date} onChange={(e) => setForm(p => ({ ...p, expected_return_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الحالة عند التعيين' : 'Condition on Assignment'}</Label>
              <Select value={form.condition_on_assignment} onValueChange={(v) => setForm(p => ({ ...p, condition_on_assignment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITION_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{isRTL ? c.ar : c.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea rows={2} value={form.condition_notes} onChange={(e) => setForm(p => ({ ...p, condition_notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleAssign} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'تعيين' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Dialog */}
      {showReturnDialog && (
        <Dialog open={!!showReturnDialog} onOpenChange={() => setShowReturnDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{isRTL ? 'تسجيل إرجاع الأصل' : 'Record Asset Return'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3 text-sm">
                <p className="font-medium">{showReturnDialog.asset_name_ar}</p>
                <p className="text-slate-500">{isRTL ? 'موظف:' : 'Employee:'} {showReturnDialog.employee_name}</p>
                <p className="text-slate-500">{isRTL ? 'معين منذ:' : 'Assigned:'} {showReturnDialog.assignment_date}</p>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحالة عند الإرجاع' : 'Condition on Return'}</Label>
                <Select value={returnForm.condition_on_return} onValueChange={(v) => setReturnForm(p => ({ ...p, condition_on_return: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...CONDITION_OPTIONS, { value: 'damaged', ar: 'تالف', en: 'Damaged' }].map(c => (
                      <SelectItem key={c.value} value={c.value}>{isRTL ? c.ar : c.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'ملاحظات الإرجاع' : 'Return Notes'}</Label>
                <Textarea rows={2} value={returnForm.return_notes} onChange={(e) => setReturnForm(p => ({ ...p, return_notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReturnDialog(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={() => handleReturn(showReturnDialog)} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
                {isRTL ? 'تأكيد الإرجاع' : 'Confirm Return'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}