import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { Plus, FileText, Mail, Download, AlertCircle, CheckCircle, Clock, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const _DOCUMENT_TYPES = [
  'employment_contract', 'offer_letter', 'appointment_letter', 
  'termination_letter', 'salary_certificate', 'experience_certificate',
  'policy_acknowledgment', 'nda', 'other'
];

export default function HRContracts() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState({
    document_type: 'employment_contract',
    employee_id: '',
    document_name: '',
    document_url: '',
    version: '1.0',
    issue_date: format(new Date(), 'yyyy-MM-dd'),
    expiry_date: '',
    requires_signature: true,
    notes: ''
  });

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['hrDocuments', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('employee_documents').select('*').match(tenantFilter(branchFilter()), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const filteredDocuments = filterByBranch(documents).filter(d =>
    d.document_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.employee_name?.includes(search)
  );

  const pendingSignature = filteredDocuments.filter(d => d.requires_signature && d.status === 'sent').length;
  const expiringDocs = filteredDocuments.filter(d => {
    if (!d.expiry_date) return false;
    const daysUntil = differenceInDays(new Date(d.expiry_date), new Date());
    return daysUntil >= 0 && daysUntil <= 30;
  }).length;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      setFormData(p => ({ ...p, document_url: file_url }));
      toast.success(isRTL ? 'تم رفع المستند' : 'Document uploaded');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const employee = employees.find(e => e.id === formData.employee_id);
      
      const data = {
        ...formData,
        employee_name: employee?.name_ar,
        branch_id: employee?.branch_id || selectedBranchId,
        status: 'draft'
      };

      const created = await tenantQuery('employee_documents').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'EmployeeDocument', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['hrDocuments'] });
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

  const handleSendEmail = async (doc) => {
    try {
      const employee = employees.find(e => e.id === doc.employee_id);
      if (!employee?.email) {
        toast.error(isRTL ? 'لا يوجد بريد إلكتروني للموظف' : 'No email for employee');
        return;
      }

      await callApi('/api/email/send', {
        to: employee.email,
        subject: isRTL ? `مستند: ${doc.document_name}` : `Document: ${doc.document_name}`,
        body: isRTL 
          ? `عزيزي ${employee.name_ar}،\n\nمرفق مستند: ${doc.document_name}\n\nيرجى المراجعة والتوقيع إذا لزم الأمر.\n\nمع التحية`
          : `Dear ${employee.name_en || employee.name_ar},\n\nPlease find attached: ${doc.document_name}\n\nReview and sign if required.\n\nBest regards`
      });

      await tenantQuery('employee_documents').update({
        status: 'sent',
        sent_date: format(new Date(), 'yyyy-MM-dd')
      });

      queryClient.invalidateQueries({ queryKey: ['hrDocuments'] });
      toast.success(isRTL ? 'تم الإرسال' : 'Sent successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const resetForm = () => {
    setFormData({
      document_type: 'employment_contract',
      employee_id: '',
      document_name: '',
      document_url: '',
      version: '1.0',
      issue_date: format(new Date(), 'yyyy-MM-dd'),
      expiry_date: '',
      requires_signature: true,
      notes: ''
    });
  };

  const columns = [
    { header: isRTL ? 'المستند' : 'Document', cell: (row) => (
      <div>
        <p className="font-medium">{row.document_name}</p>
        <p className="text-sm text-slate-500">{row.document_type}</p>
      </div>
    )},
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: isRTL ? 'الإصدار' : 'Version', accessorKey: 'version' },
    { header: isRTL ? 'تاريخ الإصدار' : 'Issue Date', cell: (row) => format(new Date(row.issue_date), 'dd/MM/yyyy') },
    { header: isRTL ? 'تاريخ الانتهاء' : 'Expiry', cell: (row) => {
      if (!row.expiry_date) return '-';
      const daysUntil = differenceInDays(new Date(row.expiry_date), new Date());
      const isExpiring = daysUntil >= 0 && daysUntil <= 30;
      return (
        <div className="flex items-center gap-2">
          <span className={isExpiring ? 'text-red-600' : ''}>{format(new Date(row.expiry_date), 'dd/MM/yyyy')}</span>
          {isExpiring && <AlertCircle className="w-4 h-4 text-red-600" />}
        </div>
      );
    }},
    { header: t('status'), cell: (row) => {
      const colors = {
        draft: 'bg-slate-100 text-slate-700',
        sent: 'bg-blue-100 text-blue-700',
        signed: 'bg-emerald-100 text-emerald-700',
        expired: 'bg-red-100 text-red-700'
      };
      const labels = {
        draft: isRTL ? 'مسودة' : 'Draft',
        sent: isRTL ? 'مرسل' : 'Sent',
        signed: isRTL ? 'موقع' : 'Signed',
        expired: isRTL ? 'منتهي' : 'Expired'
      };
      return <Badge className={colors[row.status]}>{labels[row.status]}</Badge>;
    }},
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-1">
        {row.document_url && (
          <Button size="sm" variant="ghost" asChild>
            <a href={row.document_url} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4" />
            </a>
          </Button>
        )}
        {row.status === 'draft' && (
          <Button size="sm" variant="ghost" onClick={() => handleSendEmail(row)}>
            <Mail className="w-4 h-4" />
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'العقود' : 'Contracts'}
        subtitle={isRTL ? 'إدارة عقود ومستندات الموظفين' : 'Manage employee contracts and documents'}
        action
        actionLabel={isRTL ? 'إضافة مستند' : 'Add Document'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'جميع المستندات' : 'Total Documents'} value={filteredDocuments.length} icon={FileText} iconClassName="bg-blue-50" />
        <StatCard title={isRTL ? 'بانتظار التوقيع' : 'Pending Signature'} value={pendingSignature} icon={Clock} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'موقعة' : 'Signed'} value={filteredDocuments.filter(d => d.status === 'signed').length} icon={CheckCircle} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'تنتهي قريباً' : 'Expiring Soon'} value={expiringDocs} icon={AlertCircle} iconClassName="bg-red-50" />
      </div>

      <div className="relative max-w-md">
        <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
        <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
      </div>

      <DataTable columns={columns} data={filteredDocuments} loading={isLoading} emptyMessage={t('noData')} />

      {/* Document Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إضافة مستند' : 'Add Document'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select value={formData.employee_id} onValueChange={(v) => setFormData(p => ({...p, employee_id: v}))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name_ar} ({emp.employee_id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'نوع المستند' : 'Document Type'} *</Label>
              <Select value={formData.document_type} onValueChange={(v) => setFormData(p => ({...p, document_type: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employment_contract">{isRTL ? 'عقد توظيف' : 'Employment Contract'}</SelectItem>
                  <SelectItem value="offer_letter">{isRTL ? 'خطاب عرض' : 'Offer Letter'}</SelectItem>
                  <SelectItem value="appointment_letter">{isRTL ? 'خطاب تعيين' : 'Appointment Letter'}</SelectItem>
                  <SelectItem value="termination_letter">{isRTL ? 'خطاب إنهاء' : 'Termination Letter'}</SelectItem>
                  <SelectItem value="salary_certificate">{isRTL ? 'شهادة راتب' : 'Salary Certificate'}</SelectItem>
                  <SelectItem value="experience_certificate">{isRTL ? 'شهادة خبرة' : 'Experience Certificate'}</SelectItem>
                  <SelectItem value="policy_acknowledgment">{isRTL ? 'إقرار سياسة' : 'Policy Acknowledgment'}</SelectItem>
                  <SelectItem value="nda">{isRTL ? 'اتفاقية سرية' : 'NDA'}</SelectItem>
                  <SelectItem value="other">{isRTL ? 'أخرى' : 'Other'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'اسم المستند' : 'Document Name'} *</Label>
              <Input value={formData.document_name} onChange={(e) => setFormData(p => ({...p, document_name: e.target.value}))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'رفع المستند' : 'Upload Document'}</Label>
              <div className="flex gap-2">
                <Input type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} disabled={uploading} />
                {uploading && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
              </div>
              {formData.document_url && (
                <p className="text-xs text-emerald-600">{isRTL ? 'تم الرفع بنجاح' : 'Uploaded successfully'}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الإصدار' : 'Issue Date'}</Label>
                <Input type="date" value={formData.issue_date} onChange={(e) => setFormData(p => ({...p, issue_date: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الانتهاء' : 'Expiry Date'}</Label>
                <Input type="date" value={formData.expiry_date} onChange={(e) => setFormData(p => ({...p, expiry_date: e.target.value}))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                checked={formData.requires_signature}
                onChange={(e) => setFormData(p => ({...p, requires_signature: e.target.checked}))}
                className="w-4 h-4"
              />
              <Label>{isRTL ? 'يتطلب توقيع' : 'Requires Signature'}</Label>
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