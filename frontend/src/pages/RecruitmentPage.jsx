import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { 
  Plus, Search, Eye, UserPlus, Briefcase, Users, 
  CheckCircle, XCircle, Loader2, Bot
} from 'lucide-react';
import RecruitmentPipeline from '../components/hr/RecruitmentPipeline';
import YamenHRInsights from '../components/hr/YamenHRInsights';
import OfferLetterGenerator from '../components/recruitment/OfferLetterGenerator';
import ConvertToEmployee from '../components/recruitment/ConvertToEmployee';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function RecruitmentPage() {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter, branches } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('requests');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showApplicantForm, setShowApplicantForm] = useState(false);
  const [showApplicantDetails, setShowApplicantDetails] = useState(null);
  const [editingRequest, setEditingRequest] = useState(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [requestForm, setRequestForm] = useState({
    branch_id: '',
    department_id: '',
    job_title_id: '',
    position_name: '',
    number_of_positions: 1,
    job_description: '',
    required_qualifications: '',
    employment_type: 'permanent',
    salary_range_min: 0,
    salary_range_max: 0,
    urgent: false,
    justification: ''
  });

  const [applicantForm, setApplicantForm] = useState({
    recruitment_id: '',
    full_name_ar: '',
    full_name_en: '',
    email: '',
    phone: '',
    national_id: '',
    nationality: '',
    residency_status: 'resident',
    date_of_birth: '',
    gender: 'male',
    education_level: '',
    specialization: '',
    years_of_experience: 0,
    current_salary: 0,
    expected_salary: 0,
    notice_period_days: 0,
    employment_type: 'full_time',
    saudization_category: '',
    cv_url: '',
    certificates_url: '',
    interview_technical_score: 0,
    interview_communication_score: 0,
    interview_culture_score: 0,
    recruiter_notes: '',
    department_id: '',
    branch_id: '',
    job_title: '',
  });

  const { data: recruitments = [], isLoading: loadingRecruitments } = useQuery({
    queryKey: ['recruitments', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('recruitments').select('*').match(tenantFilter(branchFilter())).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: applicants = [], isLoading: loadingApplicants } = useQuery({
    queryKey: ['applicants', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('applicants').select('*').match(tenantFilter(branchFilter())).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', tenantId],
    queryFn: () => fetchData(tenantQuery('departments').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: _jobTitles = [] } = useQuery({
    queryKey: ['jobTitles', tenantId],
    queryFn: () => fetchData(tenantQuery('job_titles').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies_rec', tenantId],
    queryFn: () => fetchData(tenantQuery('companys').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees_active_rec', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const filteredRecruitments = filterByBranch(recruitments).filter(r => 
    r.position_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.request_number?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredApplicants = applicants.filter(a =>
    a.full_name_ar?.includes(search) ||
    a.full_name_en?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveRequest = async () => {
    if (!requestForm.position_name) {
      toast.error(isRTL ? 'يرجى إدخال اسم الوظيفة' : 'Please enter position name');
      return;
    }

    setSaving(true);
    try {
      const requestNumber = `REC-${Date.now().toString(36).toUpperCase()}`;
      const data = {
        ...requestForm,
        request_number: editingRequest?.request_number || requestNumber,
        branch_id: requestForm.branch_id || selectedBranchId,
        status: 'draft'
      };

      if (editingRequest?.id) {
        await tenantQuery('recruitments').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Recruitment', entityId: editingRequest.id, oldValues: editingRequest, newValues: data });
      } else {
        const created = await tenantQuery('recruitments').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Recruitment', entityId: created.id, newValues: data });
      }

      queryClient.invalidateQueries({ queryKey: ['recruitments'] });
      setShowRequestForm(false);
      resetRequestForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApplicant = async () => {
    if (!applicantForm.full_name_ar || !applicantForm.email) {
      toast.error(isRTL ? 'يرجى إدخال البيانات المطلوبة' : 'Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const applicantNumber = `APP-${Date.now().toString(36).toUpperCase()}`;
      const data = {
        ...applicantForm,
        current_salary: parseFloat(applicantForm.current_salary) || 0,
        expected_salary: parseFloat(applicantForm.expected_salary) || 0,
        applicant_number: applicantNumber,
        status: 'applied'
      };

      const created = await tenantQuery('applicants').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Applicant', entityId: created.id, newValues: data });

      queryClient.invalidateQueries({ queryKey: ['applicants'] });
      setShowApplicantForm(false);
      resetApplicantForm();
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      toast.error(isRTL ? `حدث خطأ: ${error.message}` : `Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitRequest = async (recruitment) => {
    try {
      await tenantQuery('recruitments').update({ status: 'submitted' });
      try { await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Recruitment', entityId: recruitment.id, newValues: { status: 'submitted' } }); } catch (_) {}
      queryClient.invalidateQueries({ queryKey: ['recruitments'] });
      toast.success(isRTL ? 'تم إرسال الطلب' : 'Request submitted');
    } catch (error) {
      toast.error(isRTL ? `فشل الإرسال: ${error.message}` : `Submit failed: ${error.message}`);
    }
  };

  const handleApproveRequest = async (recruitment, action) => {
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await tenantQuery('recruitments').update({ status: newStatus });
      try { await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Recruitment', entityId: recruitment.id, newValues: { status: newStatus } }); } catch (_) {}
      queryClient.invalidateQueries({ queryKey: ['recruitments'] });
      toast.success(isRTL ? (action === 'approve' ? 'تم الاعتماد' : 'تم الرفض') : (action === 'approve' ? 'Approved' : 'Rejected'));
    } catch (error) {
      toast.error(isRTL ? `فشل الإجراء: ${error.message}` : `Action failed: ${error.message}`);
    }
  };

  const handleApplicantAction = async (applicant, newStatus) => {
    try {
      await tenantQuery('applicants').update({ status: newStatus });
      try { await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Applicant', entityId: applicant.id, newValues: { status: newStatus } }); } catch (_) {}
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
      toast.success(isRTL ? 'تم التحديث' : 'Updated successfully');
    } catch (error) {
      toast.error(isRTL ? `فشل التحديث: ${error.message}` : `Update failed: ${error.message}`);
    }
  };

  const resetRequestForm = () => {
    setEditingRequest(null);
    setRequestForm({
      branch_id: '', department_id: '', job_title_id: '', position_name: '',
      number_of_positions: 1, job_description: '', required_qualifications: '',
      employment_type: 'permanent', salary_range_min: 0, salary_range_max: 0,
      urgent: false, justification: ''
    });
  };

  const resetApplicantForm = () => {
    setApplicantForm({
      recruitment_id: '', full_name_ar: '', full_name_en: '', email: '', phone: '',
      national_id: '', nationality: '', residency_status: 'resident', date_of_birth: '', gender: 'male',
      education_level: '', specialization: '', years_of_experience: 0,
      current_salary: 0, expected_salary: 0, notice_period_days: 0,
      employment_type: 'full_time', saudization_category: '', cv_url: '', certificates_url: '',
      interview_technical_score: 0, interview_communication_score: 0, interview_culture_score: 0,
      recruiter_notes: '', department_id: '', branch_id: '', job_title: '',
    });
  };

  const recruitmentColumns = [
    { header: isRTL ? 'رقم الطلب' : 'Request #', cell: (row) => <span className="font-mono text-sm">{row.request_number}</span> },
    { header: isRTL ? 'الوظيفة' : 'Position', cell: (row) => <span className="font-medium">{row.position_name}</span> },
    { header: isRTL ? 'العدد' : 'Positions', accessorKey: 'number_of_positions' },
    { header: isRTL ? 'الفرع' : 'Branch', cell: (row) => branches.find(b => b.id === row.branch_id)?.name_ar || '-' },
    { header: isRTL ? 'عاجل' : 'Urgent', cell: (row) => row.urgent ? <Badge variant="destructive">{isRTL ? 'عاجل' : 'Urgent'}</Badge> : '-' },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => { setEditingRequest(row); setRequestForm(row); setShowRequestForm(true); }}>
          {t('edit')}
        </Button>
        {row.status === 'draft' && (
          <Button size="sm" variant="outline" onClick={() => handleSubmitRequest(row)}>
            {isRTL ? 'إرسال' : 'Submit'}
          </Button>
        )}
        {row.status === 'submitted' && (
          <>
            <Button size="sm" variant="default" onClick={() => handleApproveRequest(row, 'approve')}>
              <CheckCircle className="w-4 h-4 me-1" /> {t('approve')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleApproveRequest(row, 'reject')}>
              <XCircle className="w-4 h-4 me-1" /> {t('reject')}
            </Button>
          </>
        )}
      </div>
    )}
  ];

  const applicantColumns = [
    { header: isRTL ? 'رقم المتقدم' : 'Applicant #', cell: (row) => <span className="font-mono text-sm">{row.applicant_number}</span> },
    { header: isRTL ? 'الاسم' : 'Name', cell: (row) => <div><p className="font-medium">{row.full_name_ar}</p><p className="text-sm text-slate-500">{row.full_name_en}</p></div> },
    { header: t('email'), accessorKey: 'email' },
    { header: t('phone'), accessorKey: 'phone' },
    { header: isRTL ? 'الخبرة' : 'Experience', cell: (row) => `${row.years_of_experience || 0} ${isRTL ? 'سنوات' : 'years'}` },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setShowApplicantDetails(row)}>
          <Eye className="w-4 h-4 me-1" /> {t('view')}
        </Button>
        {row.status === 'applied' && (
          <Button size="sm" variant="outline" onClick={() => handleApplicantAction(row, 'screening')}>
            {isRTL ? 'فرز' : 'Screen'}
          </Button>
        )}
        {row.status === 'screening' && (
          <Button size="sm" variant="outline" onClick={() => handleApplicantAction(row, 'interview_scheduled')}>
            {isRTL ? 'جدولة مقابلة' : 'Schedule Interview'}
          </Button>
        )}
        {row.status === 'interviewed' && (
          <>
            <Button size="sm" variant="default" onClick={() => handleApplicantAction(row, 'offered')}>
              {isRTL ? 'عرض وظيفي' : 'Offer'}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleApplicantAction(row, 'rejected')}>
              {t('reject')}
            </Button>
          </>
        )}
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'التوظيف' : 'Recruitment'}
        subtitle={isRTL ? 'إدارة طلبات التوظيف والمتقدمين' : 'Manage recruitment requests and applicants'}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="requests" className="gap-2">
            <Briefcase className="w-4 h-4" />
            {isRTL ? 'طلبات التوظيف' : 'Recruitment Requests'}
          </TabsTrigger>
          <TabsTrigger value="applicants" className="gap-2">
            <Users className="w-4 h-4" />
            {isRTL ? 'المتقدمين' : 'Applicants'}
          </TabsTrigger>
          <TabsTrigger value="pipeline" className="gap-2">
            <Briefcase className="w-4 h-4" />
            {isRTL ? 'خط سير المتقدمين' : 'Pipeline'}
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-2">
            <Bot className="w-4 h-4" />
            Yamen AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
            </div>
            <Button onClick={() => { resetRequestForm(); setShowRequestForm(true); }} className="gap-2">
              <Plus className="w-4 h-4" />
              {isRTL ? 'طلب توظيف جديد' : 'New Request'}
            </Button>
          </div>
          <DataTable columns={recruitmentColumns} data={filteredRecruitments} loading={loadingRecruitments} emptyMessage={t('noData')} />
        </TabsContent>

        <TabsContent value="applicants" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
              <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={(e) => setSearch(e.target.value)} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
            </div>
            <Button onClick={() => { resetApplicantForm(); setShowApplicantForm(true); }} className="gap-2">
              <UserPlus className="w-4 h-4" />
              {isRTL ? 'إضافة متقدم' : 'Add Applicant'}
            </Button>
          </div>
          <DataTable columns={applicantColumns} data={filteredApplicants} loading={loadingApplicants} emptyMessage={t('noData')} />
        </TabsContent>

        <TabsContent value="pipeline">
          <RecruitmentPipeline 
            applicants={applicants} 
            recruitments={recruitments} 
            employees={employees}
            departments={departments}
            branches={branches}
            companies={companies}
          />
        </TabsContent>

        <TabsContent value="ai">
          <YamenHRInsights 
            module="recruitment"
            data={{
              total: recruitments.length,
              open: recruitments.filter(r => r.status === 'approved').length,
              applicants: applicants.length,
              interviewed: applicants.filter(a => a.status === 'interviewed').length,
              offered: applicants.filter(a => a.status === 'offered').length,
              hired: applicants.filter(a => a.status === 'hired').length,
              rejected: applicants.filter(a => a.status === 'rejected').length,
              saudizationHires: applicants.filter(a => a.nationality?.toLowerCase().includes('saudi') || a.nationality?.toLowerCase().includes('سعود')).filter(a => a.status === 'hired').length,
              salaryRangeMin: Math.min(...recruitments.map(r => r.salary_range_min || 0).filter(v => v > 0), 0),
              salaryRangeMax: Math.max(...recruitments.map(r => r.salary_range_max || 0), 0),
            }}
            isRTL={isRTL}
          />
        </TabsContent>
      </Tabs>

      {/* Recruitment Request Form Dialog */}
      <Dialog open={showRequestForm} onOpenChange={setShowRequestForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRequest ? (isRTL ? 'تعديل طلب التوظيف' : 'Edit Request') : (isRTL ? 'طلب توظيف جديد' : 'New Recruitment Request')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم الوظيفة' : 'Position Name'} *</Label>
                <Input value={requestForm.position_name} onChange={(e) => setRequestForm(p => ({...p, position_name: e.target.value}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'عدد الوظائف' : 'Number of Positions'}</Label>
                <Input type="number" min="1" value={requestForm.number_of_positions} onChange={(e) => setRequestForm(p => ({...p, number_of_positions: parseInt(e.target.value) || 1}))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
                <Select value={requestForm.branch_id} onValueChange={(v) => setRequestForm(p => ({...p, branch_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'القسم' : 'Department'}</Label>
                <Select value={requestForm.department_id} onValueChange={(v) => setRequestForm(p => ({...p, department_id: v}))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع التوظيف' : 'Employment Type'}</Label>
                <Select value={requestForm.employment_type} onValueChange={(v) => setRequestForm(p => ({...p, employment_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permanent">{isRTL ? 'دائم' : 'Permanent'}</SelectItem>
                    <SelectItem value="fixed_term">{isRTL ? 'محدد المدة' : 'Fixed Term'}</SelectItem>
                    <SelectItem value="part_time">{isRTL ? 'دوام جزئي' : 'Part Time'}</SelectItem>
                    <SelectItem value="contract">{isRTL ? 'عقد' : 'Contract'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={requestForm.urgent} onChange={(e) => setRequestForm(p => ({...p, urgent: e.target.checked}))} className="rounded" />
                  <span className="text-red-600 font-medium">{isRTL ? 'طلب عاجل' : 'Urgent Request'}</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف الوظيفي' : 'Job Description'}</Label>
              <Textarea value={requestForm.job_description} onChange={(e) => setRequestForm(p => ({...p, job_description: e.target.value}))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'المؤهلات المطلوبة' : 'Required Qualifications'}</Label>
              <Textarea value={requestForm.required_qualifications} onChange={(e) => setRequestForm(p => ({...p, required_qualifications: e.target.value}))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'المبررات' : 'Justification'}</Label>
              <Textarea value={requestForm.justification} onChange={(e) => setRequestForm(p => ({...p, justification: e.target.value}))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSaveRequest} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Applicant Form Dialog */}
      <Dialog open={showApplicantForm} onOpenChange={setShowApplicantForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إضافة متقدم' : 'Add Applicant'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm border-b pb-1">{isRTL ? 'البيانات الأساسية' : 'Basic Information'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'طلب التوظيف' : 'Job Requisition'} *</Label>
                  <Select value={applicantForm.recruitment_id} onValueChange={(v) => setApplicantForm(p => ({...p, recruitment_id: v}))}>
                    <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الوظيفة' : 'Select Position'} /></SelectTrigger>
                    <SelectContent>
                      {recruitments.filter(r => r.status === 'approved').map(r => <SelectItem key={r.id} value={r.id}>{r.position_name} — {r.request_number}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'المسمى الوظيفي' : 'Job Title'}</Label>
                  <Input value={applicantForm.job_title} onChange={(e) => setApplicantForm(p => ({...p, job_title: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                  <Input value={applicantForm.full_name_ar} onChange={(e) => setApplicantForm(p => ({...p, full_name_ar: e.target.value}))} dir="rtl" />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                  <Input value={applicantForm.full_name_en} onChange={(e) => setApplicantForm(p => ({...p, full_name_en: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('email')} *</Label>
                  <Input type="email" value={applicantForm.email} onChange={(e) => setApplicantForm(p => ({...p, email: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('phone')} *</Label>
                  <Input value={applicantForm.phone} onChange={(e) => setApplicantForm(p => ({...p, phone: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{t('nationalId')}</Label>
                  <Input value={applicantForm.national_id} onChange={(e) => setApplicantForm(p => ({...p, national_id: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'تاريخ الميلاد' : 'Date of Birth'}</Label>
                  <Input type="date" value={applicantForm.date_of_birth} onChange={(e) => setApplicantForm(p => ({...p, date_of_birth: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الجنس' : 'Gender'}</Label>
                  <Select value={applicantForm.gender} onValueChange={(v) => setApplicantForm(p => ({...p, gender: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{isRTL ? 'ذكر' : 'Male'}</SelectItem>
                      <SelectItem value="female">{isRTL ? 'أنثى' : 'Female'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('nationality')}</Label>
                  <Input value={applicantForm.nationality} onChange={(e) => setApplicantForm(p => ({...p, nationality: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'وضع الإقامة' : 'Residency Status'}</Label>
                  <Select value={applicantForm.residency_status} onValueChange={(v) => setApplicantForm(p => ({...p, residency_status: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="citizen">{isRTL ? 'مواطن سعودي' : 'Saudi Citizen'}</SelectItem>
                      <SelectItem value="resident">{isRTL ? 'مقيم' : 'Resident'}</SelectItem>
                      <SelectItem value="visitor">{isRTL ? 'زائر' : 'Visitor'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'فئة نطاقات (سعودة)' : 'Saudization Category'}</Label>
                  <Input value={applicantForm.saudization_category} onChange={(e) => setApplicantForm(p => ({...p, saudization_category: e.target.value}))} placeholder="e.g. Platinum, Green" />
                </div>
              </div>
            </div>

            {/* Work & Assignment */}
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm border-b pb-1">{isRTL ? 'بيانات العمل' : 'Work Details'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'القسم' : 'Department'}</Label>
                  <Select value={applicantForm.department_id} onValueChange={(v) => setApplicantForm(p => ({...p, department_id: v}))}>
                    <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                    <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
                  <Select value={applicantForm.branch_id} onValueChange={(v) => setApplicantForm(p => ({...p, branch_id: v}))}>
                    <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                    <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'نوع التوظيف' : 'Employment Type'}</Label>
                  <Select value={applicantForm.employment_type} onValueChange={(v) => setApplicantForm(p => ({...p, employment_type: v}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">{isRTL ? 'دوام كامل' : 'Full Time'}</SelectItem>
                      <SelectItem value="part_time">{isRTL ? 'دوام جزئي' : 'Part Time'}</SelectItem>
                      <SelectItem value="contract">{isRTL ? 'عقد' : 'Contract'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'فترة الإشعار (أيام)' : 'Notice Period (days)'}</Label>
                  <Input type="number" min="0" value={applicantForm.notice_period_days} onChange={(e) => setApplicantForm(p => ({...p, notice_period_days: parseInt(e.target.value) || 0}))} />
                </div>
              </div>
            </div>

            {/* Qualifications */}
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm border-b pb-1">{isRTL ? 'المؤهلات' : 'Qualifications'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'المستوى التعليمي' : 'Education Level'}</Label>
                  <Select value={applicantForm.education_level} onValueChange={(v) => setApplicantForm(p => ({...p, education_level: v}))}>
                    <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diploma">{isRTL ? 'دبلوم' : 'Diploma'}</SelectItem>
                      <SelectItem value="bachelor">{isRTL ? 'بكالوريوس' : 'Bachelor'}</SelectItem>
                      <SelectItem value="master">{isRTL ? 'ماجستير' : 'Master'}</SelectItem>
                      <SelectItem value="phd">{isRTL ? 'دكتوراه' : 'PhD'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'التخصص' : 'Specialization'}</Label>
                  <Input value={applicantForm.specialization} onChange={(e) => setApplicantForm(p => ({...p, specialization: e.target.value}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'سنوات الخبرة' : 'Years of Experience'}</Label>
                  <Input type="number" min="0" value={applicantForm.years_of_experience} onChange={(e) => setApplicantForm(p => ({...p, years_of_experience: parseInt(e.target.value) || 0}))} />
                </div>
              </div>
            </div>

            {/* Salary */}
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm border-b pb-1">{isRTL ? 'الراتب' : 'Salary'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'الراتب الحالي (ر.س)' : 'Current Salary (SAR)'}</Label>
                  <Input type="number" min="0" value={applicantForm.current_salary ?? ''} onChange={(e) => setApplicantForm(p => ({...p, current_salary: e.target.value === '' ? '' : parseFloat(e.target.value) || 0}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الراتب المتوقع (ر.س)' : 'Expected Salary (SAR)'}</Label>
                  <Input type="number" min="0" value={applicantForm.expected_salary ?? ''} onChange={(e) => setApplicantForm(p => ({...p, expected_salary: e.target.value === '' ? '' : parseFloat(e.target.value) || 0}))} />
                </div>
              </div>
            </div>

            {/* Documents */}
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm border-b pb-1">{isRTL ? 'المستندات' : 'Documents'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'رابط السيرة الذاتية' : 'CV URL'}</Label>
                  <Input type="url" value={applicantForm.cv_url} onChange={(e) => setApplicantForm(p => ({...p, cv_url: e.target.value}))} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'رابط الشهادات' : 'Certificates URL'}</Label>
                  <Input type="url" value={applicantForm.certificates_url} onChange={(e) => setApplicantForm(p => ({...p, certificates_url: e.target.value}))} placeholder="https://..." />
                </div>
              </div>
            </div>

            {/* Interview Scores */}
            <div>
              <h3 className="font-semibold text-slate-700 mb-3 text-sm border-b pb-1">{isRTL ? 'نتائج المقابلة' : 'Interview Scores'} (0–10)</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'التقني' : 'Technical'}</Label>
                  <Input type="number" min="0" max="10" value={applicantForm.interview_technical_score} onChange={(e) => setApplicantForm(p => ({...p, interview_technical_score: parseFloat(e.target.value) || 0}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'التواصل' : 'Communication'}</Label>
                  <Input type="number" min="0" max="10" value={applicantForm.interview_communication_score} onChange={(e) => setApplicantForm(p => ({...p, interview_communication_score: parseFloat(e.target.value) || 0}))} />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'الانسجام الثقافي' : 'Culture Fit'}</Label>
                  <Input type="number" min="0" max="10" value={applicantForm.interview_culture_score} onChange={(e) => setApplicantForm(p => ({...p, interview_culture_score: parseFloat(e.target.value) || 0}))} />
                </div>
              </div>
            </div>

            {/* Recruiter Notes */}
            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات المُجنِّد' : 'Recruiter Notes'}</Label>
              <Textarea value={applicantForm.recruiter_notes} onChange={(e) => setApplicantForm(p => ({...p, recruiter_notes: e.target.value}))} rows={3} />
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t mt-4">
            <Button variant="outline" onClick={() => setShowApplicantForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSaveApplicant} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Applicant Details Dialog */}
      {showApplicantDetails && (
        <Dialog open={!!showApplicantDetails} onOpenChange={() => setShowApplicantDetails(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isRTL ? 'تفاصيل المتقدم' : 'Applicant Details'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><Label className="text-slate-500">{isRTL ? 'الاسم' : 'Name'}</Label><p className="font-medium">{showApplicantDetails.full_name_ar}</p></div>
                <div><Label className="text-slate-500">{t('email')}</Label><p>{showApplicantDetails.email}</p></div>
                <div><Label className="text-slate-500">{t('phone')}</Label><p>{showApplicantDetails.phone}</p></div>
                <div><Label className="text-slate-500">{t('nationality')}</Label><p>{showApplicantDetails.nationality || '-'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'المستوى التعليمي' : 'Education'}</Label><p>{showApplicantDetails.education_level || '-'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'سنوات الخبرة' : 'Experience'}</Label><p>{showApplicantDetails.years_of_experience || 0} {isRTL ? 'سنوات' : 'years'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'الراتب المتوقع' : 'Expected Salary'}</Label><p className="font-medium text-emerald-600">{showApplicantDetails.expected_salary?.toLocaleString() || '-'} {isRTL ? 'ر.س' : 'SAR'}</p></div>
                <div className="col-span-2"><Label className="text-slate-500">{t('status')}</Label><StatusBadge status={showApplicantDetails.status} /></div>
              </div>

              {/* Interview Scores */}
              {(showApplicantDetails.interview_technical_score > 0 || showApplicantDetails.interview_communication_score > 0) && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="font-semibold text-slate-700 mb-3 text-sm">{isRTL ? 'نتائج المقابلة' : 'Interview Scores'}</p>
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="bg-white rounded-lg p-2 border"><p className="text-2xl font-bold text-blue-600">{showApplicantDetails.interview_technical_score || 0}</p><p className="text-xs text-slate-500">{isRTL ? 'تقني' : 'Technical'}</p></div>
                    <div className="bg-white rounded-lg p-2 border"><p className="text-2xl font-bold text-purple-600">{showApplicantDetails.interview_communication_score || 0}</p><p className="text-xs text-slate-500">{isRTL ? 'تواصل' : 'Communication'}</p></div>
                    <div className="bg-white rounded-lg p-2 border"><p className="text-2xl font-bold text-emerald-600">{showApplicantDetails.interview_culture_score || 0}</p><p className="text-xs text-slate-500">{isRTL ? 'انسجام' : 'Culture Fit'}</p></div>
                  </div>
                </div>
              )}

              {/* Offer Letter Section */}
              {(showApplicantDetails.status === 'offered' || showApplicantDetails.status === 'interviewed' || showApplicantDetails.status === 'screening') && (
                <OfferLetterGenerator
                  applicant={showApplicantDetails}
                  recruitment={recruitments.find(r => r.id === showApplicantDetails.recruitment_id)}
                  departments={departments}
                  branches={branches}
                  companies={companies}
                  onOfferCreated={() => { queryClient.invalidateQueries({ queryKey: ['applicants'] }); setShowApplicantDetails(null); }}
                />
              )}

              {/* Convert to Employee */}
              {(showApplicantDetails.offer_status === 'accepted' || showApplicantDetails.offer_accepted === true) && !showApplicantDetails.converted_employee_id && (
                <ConvertToEmployee
                  applicant={showApplicantDetails}
                  recruitment={recruitments.find(r => r.id === showApplicantDetails.recruitment_id)}
                  employees={employees}
                  onConverted={() => { queryClient.invalidateQueries({ queryKey: ['applicants'] }); setShowApplicantDetails(null); }}
                />
              )}
              {showApplicantDetails.converted_employee_id && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg p-3 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  {isRTL ? 'تم تحويله إلى موظف' : 'Converted to Employee'}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}