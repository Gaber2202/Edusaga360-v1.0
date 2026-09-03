import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  tenantQuery,
  fetchData,
  callApi,
  uploadFileApi,
  getSignedUrlApi,
} from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { useRole } from '../components/RoleContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import {
  Plus, FileText, Mail, Download, AlertCircle, CheckCircle, Clock, Loader2, Search, Trash2, PenLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';
import {
  DOCUMENT_TYPES,
  buildDocumentPayload,
  buildEmployeeContractFromDocument,
  documentStatusLabel,
  documentTypeLabel,
  filterDocuments,
  isExpiringSoon,
  normalizeUploadResult,
  resolveDocumentStatus,
} from '../lib/hrContractHelpers';

const emptyForm = {
  document_type: 'employment_contract',
  employee_id: '',
  document_name: '',
  document_url: '',
  file_path: '',
  version: '1.0',
  issue_date: format(new Date(), 'yyyy-MM-dd'),
  expiry_date: '',
  requires_signature: true,
  notes: '',
  status: 'draft',
  contract_data: {},
};

export default function HRContracts() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, branchFilter } = useBranch();
  const { user } = useRole();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [formData, setFormData] = useState(emptyForm);

  const { data: documents = [], isLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['hrDocuments', tenantId, selectedBranchId],
    queryFn: () =>
      fetchData(
        tenantQuery('employee_documents')
          .select('*')
          .match(tenantFilter(branchFilter()))
          .order('created_at', { ascending: false }),
      ),
    initialData: [],
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId, 'hrContracts'],
    queryFn: () =>
      fetchData(
        tenantQuery('employees')
          .select(
            'id, employee_id, name_ar, name_en, email, status, job_title, department_id, branch_id, hire_date, end_date, contract_end_date, contract_type, basic_salary, total_salary',
          )
          .match(tenantFilter({ status: 'active' })),
      ),
    enabled: hasTenantAccess,
  });

  const filteredDocuments = filterDocuments(documents, {
    search,
    status: statusFilter,
    type: typeFilter,
  });

  const pendingSignature = documents.filter(
    (d) => d.requires_signature && resolveDocumentStatus(d) === 'sent',
  ).length;
  const signedCount = documents.filter((d) => resolveDocumentStatus(d) === 'signed').length;
  const expiringDocs = documents.filter((d) => isExpiringSoon(d, 30)).length;

  const resetForm = () => setFormData({ ...emptyForm, issue_date: format(new Date(), 'yyyy-MM-dd') });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFileApi(file);
      const normalized = normalizeUploadResult(result);
      setFormData((p) => ({ ...p, ...normalized }));
      toast.success(isRTL ? 'تم رفع المستند' : 'Document uploaded');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setUploading(false);
    }
  };

  const syncEmployeeContract = async (doc, documentId) => {
    if (doc.document_type !== 'employment_contract' || !doc.employee_id) return;
    const payload = buildEmployeeContractFromDocument(doc, { documentId });
    if (!payload.start_date) return;

    const existing = await fetchData(
      tenantQuery('employee_contracts')
        .select('id')
        .match({ employee_id: doc.employee_id, document_id: documentId }),
    );
    if (existing[0]?.id) {
      await tenantQuery('employee_contracts')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
    } else {
      await tenantQuery('employee_contracts').insert(payload);
    }
  };

  const handleSave = async () => {
    if (!formData.employee_id || !formData.document_name) {
      toast.error(isRTL ? 'يرجى اختيار الموظف واسم المستند' : 'Employee and document name are required');
      return;
    }

    setSaving(true);
    try {
      const employee = employees.find((e) => e.id === formData.employee_id);
      const contractData =
        formData.document_type === 'employment_contract'
          ? {
              contract_type: employee?.contract_type || 'limited',
              start_date: formData.issue_date,
              end_date: formData.expiry_date || employee?.contract_end_date || null,
              basic_salary: employee?.basic_salary ?? null,
              total_salary: employee?.total_salary ?? null,
              job_title: employee?.job_title || null,
            }
          : {};

      const data = buildDocumentPayload(
        { ...formData, status: 'draft', contract_data: contractData },
        { employee, selectedBranchId },
      );

      const { data: created, error } = await tenantQuery('employee_documents')
        .insert(data)
        .select()
        .single();
      if (error) throw error;

      await syncEmployeeContract({ ...data, id: created.id }, created.id);

      await logAuditEvent({
        action: AuditActions.CREATE,
        entityType: 'EmployeeDocument',
        entityId: created.id,
        newValues: data,
      });

      queryClient.invalidateQueries({ queryKey: ['hrDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['hrDocuments_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['emp_contracts'] });
      setShowForm(false);
      resetForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendEmail = async (doc) => {
    try {
      const employee = employees.find((e) => e.id === doc.employee_id);
      if (!employee?.email) {
        toast.error(isRTL ? 'لا يوجد بريد إلكتروني للموظف' : 'No email for employee');
        return;
      }

      await callApi('/api/email/send', {
        to: employee.email,
        subject: isRTL ? `مستند: ${doc.document_name}` : `Document: ${doc.document_name}`,
        body: isRTL
          ? `عزيزي ${employee.name_ar}،\n\nمرفق مستند: ${doc.document_name}\n\nيرجى المراجعة والتوقيع إذا لزم الأمر.\n\nمع التحية`
          : `Dear ${employee.name_en || employee.name_ar},\n\nPlease find attached: ${doc.document_name}\n\nReview and sign if required.\n\nBest regards`,
      });

      const { error } = await tenantQuery('employee_documents')
        .update({
          status: 'sent',
          sent_date: format(new Date(), 'yyyy-MM-dd'),
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['hrDocuments'] });
      toast.success(isRTL ? 'تم الإرسال' : 'Sent successfully');
    } catch (error) {
      console.error(error);
      toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    }
  };

  const handleMarkSigned = async (doc) => {
    try {
      const signer = user?.full_name || user?.display_name || user?.email || 'HR';
      const { error } = await tenantQuery('employee_documents')
        .update({
          status: 'signed',
          signed_date: new Date().toISOString(),
          signed_by: signer,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id);
      if (error) throw error;

      await syncEmployeeContract({ ...doc, status: 'signed' }, doc.id);

      await logAuditEvent({
        action: AuditActions.UPDATE,
        entityType: 'EmployeeDocument',
        entityId: doc.id,
        newValues: { status: 'signed' },
      });

      queryClient.invalidateQueries({ queryKey: ['hrDocuments'] });
      queryClient.invalidateQueries({ queryKey: ['emp_contracts'] });
      toast.success(isRTL ? 'تم تسجيل التوقيع' : 'Marked as signed');
    } catch (error) {
      toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    }
  };

  const handleDelete = async (doc) => {
    if (
      !window.confirm(
        isRTL ? `حذف "${doc.document_name}"؟` : `Delete "${doc.document_name}"?`,
      )
    ) {
      return;
    }
    setDeletingId(doc.id);
    try {
      const { error } = await tenantQuery('employee_documents').delete().eq('id', doc.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['hrDocuments'] });
      toast.success(isRTL ? 'تم الحذف' : 'Deleted');
    } catch (error) {
      toast.error(error?.message || (isRTL ? 'فشل الحذف' : 'Delete failed'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenFile = async (doc) => {
    const path = doc.file_path || doc.document_url;
    if (!path) return;
    setOpeningId(doc.id);
    try {
      let url = path;
      if (!/^https?:\/\//i.test(path)) {
        url = await getSignedUrlApi(path);
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error?.message || (isRTL ? 'تعذر فتح الملف' : 'Could not open file'));
    } finally {
      setOpeningId(null);
    }
  };

  const statusColors = {
    draft: 'bg-sand-alt text-ink',
    sent: 'bg-najdi-50 text-najdi-900',
    signed: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-red-100 text-red-700',
    archived: 'bg-sand-alt text-muted-foreground',
  };

  const columns = [
    {
      header: isRTL ? 'المستند' : 'Document',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.document_name}</p>
          <p className="text-sm text-muted-foreground">
            {documentTypeLabel(row.document_type, isRTL)}
          </p>
        </div>
      ),
    },
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: isRTL ? 'الإصدار' : 'Version', accessorKey: 'version' },
    {
      header: isRTL ? 'تاريخ الإصدار' : 'Issue Date',
      cell: (row) =>
        row.issue_date ? format(new Date(row.issue_date), 'dd/MM/yyyy') : '—',
    },
    {
      header: isRTL ? 'تاريخ الانتهاء' : 'Expiry',
      cell: (row) => {
        if (!row.expiry_date) return '—';
        const daysUntil = differenceInDays(new Date(row.expiry_date), new Date());
        const expiring = isExpiringSoon(row, 30);
        return (
          <div className="flex items-center gap-2">
            <span className={expiring ? 'text-red-600' : ''}>
              {format(new Date(row.expiry_date), 'dd/MM/yyyy')}
            </span>
            {expiring && <AlertCircle className="w-4 h-4 text-red-600" />}
            {daysUntil < 0 && (
              <span className="text-xs text-red-600">{isRTL ? 'منتهي' : 'past'}</span>
            )}
          </div>
        );
      },
    },
    {
      header: t('status'),
      cell: (row) => {
        const status = resolveDocumentStatus(row);
        return (
          <Badge className={statusColors[status] || statusColors.draft}>
            {documentStatusLabel(status, isRTL)}
          </Badge>
        );
      },
    },
    {
      header: t('actions'),
      cell: (row) => {
        const status = resolveDocumentStatus(row);
        return (
          <div className="flex gap-1">
            {(row.file_path || row.document_url) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={openingId === row.id}
                onClick={() => handleOpenFile(row)}
                title={isRTL ? 'تحميل' : 'Download'}
              >
                {openingId === row.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </Button>
            )}
            {status === 'draft' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleSendEmail(row)}
                title={isRTL ? 'إرسال' : 'Send'}
              >
                <Mail className="w-4 h-4" />
              </Button>
            )}
            {(status === 'draft' || status === 'sent') && row.requires_signature && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleMarkSigned(row)}
                title={isRTL ? 'تسجيل توقيع' : 'Mark signed'}
              >
                <PenLine className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={deletingId === row.id}
              onClick={() => handleDelete(row)}
              title={isRTL ? 'حذف' : 'Delete'}
            >
              {deletingId === row.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'العقود والمستندات' : 'Contracts & Documents'}
        subtitle={
          isRTL
            ? 'إدارة عقود ومستندات الموظفين'
            : 'Manage employee contracts and documents'
        }
        action
        actionLabel={isRTL ? 'إضافة مستند' : 'Add Document'}
        actionIcon={Plus}
        onAction={() => {
          resetForm();
          setShowForm(true);
        }}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title={isRTL ? 'جميع المستندات' : 'Total Documents'}
          value={documents.length}
          icon={FileText}
          iconClassName="bg-najdi-50"
        />
        <StatCard
          title={isRTL ? 'بانتظار التوقيع' : 'Pending Signature'}
          value={pendingSignature}
          icon={Clock}
          iconClassName="bg-amber-50"
        />
        <StatCard
          title={isRTL ? 'موقعة' : 'Signed'}
          value={signedCount}
          icon={CheckCircle}
          iconClassName="bg-emerald-50"
        />
        <StatCard
          title={isRTL ? 'تنتهي قريباً' : 'Expiring Soon'}
          value={expiringDocs}
          icon={AlertCircle}
          iconClassName="bg-red-50"
        />
      </div>

      <div className="flex flex-col md:flex-row gap-2 max-w-3xl">
        <div className="relative flex-1">
          <Search
            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`}
          />
          <Input
            placeholder={isRTL ? 'بحث...' : 'Search...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={isRTL ? 'النوع' : 'Type'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'كل الأنواع' : 'All types'}</SelectItem>
            {DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {documentTypeLabel(type, isRTL)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
            <SelectItem value="draft">{documentStatusLabel('draft', isRTL)}</SelectItem>
            <SelectItem value="sent">{documentStatusLabel('sent', isRTL)}</SelectItem>
            <SelectItem value="signed">{documentStatusLabel('signed', isRTL)}</SelectItem>
            <SelectItem value="expired">{documentStatusLabel('expired', isRTL)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredDocuments}
        loading={isLoading}
        emptyMessage={t('noData')}
      />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إضافة مستند' : 'Add Document'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select
                value={formData.employee_id}
                onValueChange={(v) => setFormData((p) => ({ ...p, employee_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر' : 'Select'} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name_ar} ({emp.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'نوع المستند' : 'Document Type'} *</Label>
              <Select
                value={formData.document_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, document_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {documentTypeLabel(type, isRTL)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'اسم المستند' : 'Document Name'} *</Label>
              <Input
                value={formData.document_name}
                onChange={(e) => setFormData((p) => ({ ...p, document_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'رفع المستند' : 'Upload Document'}</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
                {uploading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
              </div>
              {(formData.file_path || formData.document_url) && (
                <p className="text-xs text-emerald-600">
                  {isRTL ? 'تم الرفع بنجاح' : 'Uploaded successfully'}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</Label>
                <Input
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData((p) => ({ ...p, issue_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'}</Label>
                <Input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData((p) => ({ ...p, expiry_date: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formData.requires_signature}
                onCheckedChange={(checked) =>
                  setFormData((p) => ({ ...p, requires_signature: !!checked }))
                }
              />
              <span className="text-sm">{isRTL ? 'يتطلب توقيع' : 'Requires Signature'}</span>
            </label>
            <div className="space-y-2">
              <Label>{t('notes')}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              {t('cancel')}
            </Button>
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
