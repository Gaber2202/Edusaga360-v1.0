import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import DataTable from '../ui/DataTable';
import { AlertTriangle, Upload, Loader2, Shield } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../../hooks/useTenantFilter';

const QIWA_STATUS = {
  draft: { ar: 'مسودة', en: 'Draft', color: 'bg-sand-alt text-ink' },
  submitted: { ar: 'مُرسل لقوى', en: 'Submitted', color: 'bg-najdi-50 text-najdi-900' },
  approved: { ar: 'معتمد قوى', en: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { ar: 'مرفوض', en: 'Rejected', color: 'bg-red-100 text-red-700' },
};

export default function QiwaContracts() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantId, hasTenantAccess } = useTenantFilter();
  const [search, setSearch] = useState('');
  const [showUpdateDialog, setShowUpdateDialog] = useState(null);
  const [qiwaRef, setQiwaRef] = useState('');
  const [newStatus, setNewStatus] = useState('submitted');
  const [saving, setSaving] = useState(false);

  const { data: contracts = [], isLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['hrDocuments_contracts', tenantId],
    queryFn: () =>
      fetchData(
        tenantQuery('employee_documents')
          .select('*')
          .match({ document_type: 'employment_contract' })
          .order('created_at', { ascending: false }),
      ),
    initialData: [],
  });

  const { data: employees = [] } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['employees_active', tenantId],
    queryFn: () =>
      fetchData(
        tenantQuery('employees').select(
          'id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at, national_id, iqama_number',
        ).match({ status: 'active' }),
      ),
  });

  const enriched = contracts.map(c => ({
    ...c,
    employee: employees.find(e => e.id === c.employee_id),
    daysToExpiry: c.expiry_date ? differenceInDays(new Date(c.expiry_date), new Date()) : null,
  }));

  const filtered = enriched.filter(c =>
    c.employee_name?.includes(search) ||
    c.document_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.qiwa_reference_id?.includes(search)
  );

  const notSynced = enriched.filter(c => !c.qiwa_status || c.qiwa_status === 'draft').length;
  const expiringSoon = enriched.filter(c => c.daysToExpiry !== null && c.daysToExpiry >= 0 && c.daysToExpiry <= 60).length;
  const approved = enriched.filter(c => c.qiwa_status === 'approved').length;
  const saudiCount = enriched.filter(c => employees.find(e => e.id === c.employee_id)?.is_saudi).length;

  const handleSync = async (contract) => {
    // Placeholder: prepare data structure for Qiwa API
    const qiwaPayload = {
      contract_id: contract.id,
      employee_national_id: contract.employee?.national_id || contract.employee?.iqama_number,
      contract_type: contract.contract_data?.contract_type,
      start_date: contract.contract_data?.start_date,
      end_date: contract.contract_data?.end_date,
      job_title: contract.contract_data?.job_title,
      basic_salary: contract.contract_data?.basic_salary,
      total_salary: contract.contract_data?.total_salary,
    };
    console.info('[QIWA API PLACEHOLDER]', qiwaPayload);
    const { error } = await tenantQuery('employee_documents')
      .update({
        qiwa_status: 'submitted',
        qiwa_submitted_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contract.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['hrDocuments_contracts'] });
    toast.success(isRTL ? 'تم الإرسال لقوى (محاكاة)' : 'Submitted to Qiwa (simulated)');
  };

  const handleManualUpdate = async () => {
    if (!showUpdateDialog?.id) return;
    setSaving(true);
    try {
      const { error } = await tenantQuery('employee_documents')
        .update({
          qiwa_status: newStatus,
          qiwa_reference_id: qiwaRef,
          qiwa_updated_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', showUpdateDialog.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['hrDocuments_contracts'] });
      setShowUpdateDialog(null);
      toast.success(isRTL ? 'تم تحديث حالة قوى' : 'Qiwa status updated');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { header: isRTL ? 'الموظف' : 'Employee', cell: (row) => (
      <div>
        <p className="font-medium">{row.employee_name}</p>
        <p className="text-xs text-muted-foreground">{row.employee?.employee_id}</p>
      </div>
    )},
    { header: isRTL ? 'المستند' : 'Document', cell: (row) => (
      <div>
        <p className="text-sm">{row.document_name}</p>
        <p className="text-xs text-muted-foreground">{isRTL ? 'إصدار' : 'v'}{row.version}</p>
      </div>
    )},
    { header: isRTL ? 'تاريخ الانتهاء' : 'Expiry', cell: (row) => {
      if (!row.expiry_date) return <span className="text-muted-foreground">—</span>;
      const days = row.daysToExpiry;
      return (
        <div className={`text-sm ${days !== null && days <= 60 ? 'text-amber-600 font-medium' : ''}`}>
          {format(new Date(row.expiry_date), 'dd/MM/yyyy')}
          {days !== null && days <= 60 && <p className="text-xs">{days}d {isRTL ? 'متبقي' : 'left'}</p>}
        </div>
      );
    }},
    { header: isRTL ? 'حالة قوى' : 'Qiwa Status', cell: (row) => {
      const s = row.qiwa_status || 'draft';
      const cfg = QIWA_STATUS[s] || QIWA_STATUS.draft;
      return (
        <div className="space-y-1">
          <Badge className={cfg.color}>{isRTL ? cfg.ar : cfg.en}</Badge>
          {row.qiwa_reference_id && <p className="text-xs text-muted-foreground">Ref: {row.qiwa_reference_id}</p>}
        </div>
      );
    }},
    { header: isRTL ? 'الإجراءات' : 'Actions', cell: (row) => (
      <div className="flex gap-2 flex-wrap">
        {(!row.qiwa_status || row.qiwa_status === 'draft') && (
          <Button size="sm" variant="outline" className="gap-1 text-najdi-900 border-najdi-100 text-xs" onClick={() => handleSync(row)}>
            <Upload className="w-3 h-3" /> {isRTL ? 'إرسال لقوى' : 'Submit to Qiwa'}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setShowUpdateDialog(row); setQiwaRef(row.qiwa_reference_id || ''); setNewStatus(row.qiwa_status || 'submitted'); }}>
          {isRTL ? 'تحديث يدوي' : 'Manual Update'}
        </Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      {/* Qiwa Compliance Dashboard */}
      <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 rounded-xl p-5 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-emerald-300" />
          <div>
            <h2 className="font-bold text-lg">{isRTL ? 'مزامنة عقود قوى' : 'Qiwa Employment Contracts'}</h2>
            <p className="text-emerald-300 text-sm">{isRTL ? 'إدارة ومزامنة العقود مع منصة قوى' : 'Manage and sync employment contracts with Qiwa platform'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{notSynced}</p>
            <p className="text-xs text-emerald-200">{isRTL ? 'غير مُزامنة' : 'Not Synced'}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{approved}</p>
            <p className="text-xs text-emerald-200">{isRTL ? 'معتمدة' : 'Approved'}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${expiringSoon > 0 ? 'text-amber-300' : ''}`}>{expiringSoon}</p>
            <p className="text-xs text-emerald-200">{isRTL ? 'تنتهي خلال 60 يوم' : 'Expiring <60 days'}</p>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{saudiCount}</p>
            <p className="text-xs text-emerald-200">{isRTL ? 'موظفون سعوديون' : 'Saudi Employees'}</p>
          </div>
        </div>
      </div>

      {notSynced > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{isRTL ? `${notSynced} عقد لم تتم مزامنتها مع قوى بعد` : `${notSynced} contract(s) not yet synced with Qiwa`}</span>
        </div>
      )}

      <div className="relative max-w-md">
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className="bg-white" />
      </div>

      <DataTable columns={columns} data={filtered} loading={isLoading} emptyMessage={isRTL ? 'لا توجد عقود' : 'No contracts found'} />

      {/* Manual Status Update Dialog */}
      <Dialog open={!!showUpdateDialog} onOpenChange={() => setShowUpdateDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تحديث حالة قوى يدوياً' : 'Manual Qiwa Status Update'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'حالة قوى' : 'Qiwa Status'}</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(QIWA_STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{isRTL ? v.ar : v.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'رقم مرجع قوى' : 'Qiwa Reference ID'}</Label>
              <Input value={qiwaRef} onChange={e => setQiwaRef(e.target.value)} placeholder="QIWA-XXXXXX" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleManualUpdate} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}