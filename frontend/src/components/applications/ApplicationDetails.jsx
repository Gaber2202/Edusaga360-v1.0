import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useRole } from '../RoleContext';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import {
  User, FileText, Calendar, CheckCircle, XCircle,
  Clock, AlertTriangle, Phone, Mail, MapPin,
  Star, Building2, GraduationCap, Video, Users, History,
} from 'lucide-react';
import { logAuditEvent, AuditActions } from '../AuditService';
import { callApi } from '../../api/supabaseClient';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import {
  DEFAULT_ADMISSION_STAGES,
  STATUS_COLORS,
  normalizeApplicationStage,
  stageLabel,
} from '../../lib/admissionsPipeline';

function InfoRow({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm text-ink font-medium">{value}</p>
      </div>
    </div>
  );
}

async function recordStageChange({
  applicationId,
  fromStatus,
  toStatus,
  note,
  actorId,
  actorName,
}) {
  const { error } = await tenantQuery('application_stage_history').insert({
    application_id: applicationId,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null,
    changed_by: actorId || null,
    changed_by_name: actorName || null,
  });
  if (error) throw error;
}

export default function ApplicationDetails({
  open,
  onClose,
  application,
  onUpdate,
  stages: stagesProp,
}) {
  const { isRTL } = useLanguage();
  const { userRole, user } = useRole();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [newStatus, setNewStatus] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [interviewType, setInterviewType] = useState('online');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [interviewLink, setInterviewLink] = useState('');
  const [evalScores, setEvalScores] = useState({
    communication: 3, academic: 3, behavior: 3, parent: 3, notes: '', recommendation: 'recommend',
  });

  const stages = stagesProp?.length ? stagesProp : DEFAULT_ADMISSION_STAGES;

  const { data: staff = [] } = useQuery({
    queryKey: ['employees', tenantId, 'admissions-assignees'],
    queryFn: () => fetchData(
      tenantQuery('employees')
        .select('id, name_ar, name_en, status, job_title')
        .match(tenantFilter({ status: 'active' }))
        .order('name_en', { ascending: true })
        .limit(200)
    ),
    enabled: hasTenantAccess && open,
  });

  const { data: stageHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ['application_stage_history', application?.id],
    queryFn: () => fetchData(
      tenantQuery('application_stage_history')
        .select('*')
        .eq('application_id', application.id)
        .order('created_at', { ascending: false })
        .limit(50)
    ),
    enabled: !!application?.id && open,
  });

  useEffect(() => {
    if (!application) return;
    setAssigneeId(application.assigned_reviewer_id || '');
    setNewStatus('');
    setStageNote('');
  }, [application?.id, application?.assigned_reviewer_id]);

  if (!application) return null;

  const canManage = ['admin', 'admissions', 'branch_manager'].includes(userRole);
  const days = differenceInDays(new Date(), new Date(application.created_at));
  const currentStage = normalizeApplicationStage(application);
  const actorName = user?._displayName || user?.email || null;
  const actorId = user?.id || null;

  const staffName = (emp) => (isRTL ? (emp.name_ar || emp.name_en) : (emp.name_en || emp.name_ar)) || emp.id;

  const applyStageUpdate = async ({ toStatus, note, extra = {} }) => {
    const fromStatus = application.status || currentStage;
    const updates = {
      status: toStatus,
      pipeline_stage: toStatus,
      ...extra,
    };
    if (note) {
      const stamp = `[${new Date().toLocaleDateString()}] ${fromStatus} → ${toStatus}: ${note}`;
      updates.internal_notes = application.internal_notes
        ? `${application.internal_notes}\n${stamp}`
        : stamp;
    }

    const { error } = await tenantQuery('applications').update(updates).eq('id', application.id);
    if (error) throw error;

    try {
      await recordStageChange({
        applicationId: application.id,
        fromStatus,
        toStatus,
        note,
        actorId,
        actorName,
      });
    } catch (histErr) {
      console.warn('Stage history write failed:', histErr);
    }

    await logAuditEvent({
      action: AuditActions.UPDATE,
      entityType: 'Application',
      entityId: application.id,
      oldValues: { status: fromStatus, pipeline_stage: application.pipeline_stage },
      newValues: { status: toStatus, pipeline_stage: toStatus, note: note || null },
    });
  };

  const notifyParent = async (event, extra = {}) => {
    try {
      await callApi(`/api/admissions/applications/${application.id}/notify`, { event, extra });
    } catch (err) {
      console.warn('Admissions WhatsApp notify skipped:', err?.message || err);
    }
  };

  const handleStageChange = async () => {
    if (!newStatus) return;
    if (!stageNote.trim()) {
      toast.error(isRTL ? 'سبب التغيير مطلوب للتدقيق' : 'Stage change reason is required for audit');
      return;
    }
    setSaving(true);
    try {
      await applyStageUpdate({ toStatus: newStatus, note: stageNote.trim() });
      if (newStatus === 'assessment') {
        await notifyParent('assessment_results', { result_summary: stageNote.trim(), stage: newStatus });
      } else if (newStatus === 'rejected') {
        await notifyParent('rejection');
      } else if (newStatus === 'accepted' || newStatus === 'submitted' || newStatus === 'inquiry') {
        await notifyParent('welcome');
      } else if (newStatus === 'interview') {
        await notifyParent('interview_scheduling');
      }
      toast.success(isRTL ? 'تم تحديث المرحلة' : 'Stage updated successfully');
      setNewStatus('');
      setStageNote('');
      refetchHistory();
      onUpdate();
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickDecision = async (decision) => {
    setSaving(true);
    try {
      await applyStageUpdate({
        toStatus: decision,
        note: decision === 'accepted' ? 'Quick accept' : 'Quick reject',
      });
      await notifyParent(decision === 'accepted' ? 'welcome' : 'rejection');
      toast.success(decision === 'accepted'
        ? (isRTL ? 'تم قبول الطلب' : 'Application accepted')
        : (isRTL ? 'تم رفض الطلب' : 'Application rejected'));
      refetchHistory();
      onUpdate();
      onClose();
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignOwner = async () => {
    setSaving(true);
    try {
      const emp = staff.find((e) => e.id === assigneeId);
      const name = emp ? staffName(emp) : null;
      const { error } = await tenantQuery('applications').update({
        assigned_reviewer_id: assigneeId || null,
        assigned_reviewer: name,
      }).eq('id', application.id);
      if (error) throw error;
      await logAuditEvent({
        action: AuditActions.UPDATE,
        entityType: 'Application',
        entityId: application.id,
        oldValues: {
          assigned_reviewer_id: application.assigned_reviewer_id,
          assigned_reviewer: application.assigned_reviewer,
        },
        newValues: { assigned_reviewer_id: assigneeId || null, assigned_reviewer: name },
      });
      toast.success(isRTL ? 'تم تعيين المالك' : 'Owner assigned');
      onUpdate();
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleInterview = async () => {
    if (!interviewDate || !interviewTime) {
      toast.error(isRTL ? 'يرجى تحديد التاريخ والوقت' : 'Please select date and time');
      return;
    }
    setSaving(true);
    try {
      const note = `Interview scheduled: ${interviewDate} ${interviewTime} | Type: ${interviewType} | Link: ${interviewLink}`;
      await applyStageUpdate({
        toStatus: 'interview',
        note,
        extra: { pipeline_stage: 'assessment_scheduled' },
      });
      await notifyParent('interview_scheduling', {
        interview_date: interviewDate,
        interview_time: interviewTime,
        interview_type: interviewType,
        interview_link: interviewLink,
      });
      toast.success(isRTL ? 'تم جدولة المقابلة' : 'Interview scheduled');
      refetchHistory();
      onUpdate();
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const StarRating = ({ label, field }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setEvalScores((s) => ({ ...s, [field]: n }))}>
            <Star className={`w-5 h-5 ${n <= evalScores[field] ? 'text-amber-400 fill-amber-400' : 'text-najdi-100'}`} />
          </button>
        ))}
      </div>
    </div>
  );

  const progressStages = stages.filter((s) => !['waitlist', 'rejected'].includes(s.key));
  const stageIndex = progressStages.findIndex((s) => s.key === currentStage);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <div className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-najdi-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {application.student_name_ar?.[0] || '?'}
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">{application.student_name_ar}</h2>
                {application.student_name_en && <p className="text-sm text-muted-foreground">{application.student_name_en}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[currentStage] || 'bg-sand-alt text-muted-foreground'}`}>
                    {stageLabel(stages, currentStage, isRTL) || currentStage}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{application.application_number}</span>
                  {(application.assigned_reviewer || application.assigned_reviewer_name) && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {application.assigned_reviewer || application.assigned_reviewer_name}
                    </span>
                  )}
                  {application.document_status === 'pending_physical_verification' && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {isRTL ? 'مستندات ناقصة' : 'Docs Pending'}
                    </span>
                  )}
                  {application.document_status === 'documents_complete' && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {isRTL ? 'مستندات مكتملة' : 'Docs Complete'}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />{days} {isRTL ? 'يوم' : 'days'}
                  </span>
                  {days > 30 && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />{isRTL ? 'متأخر' : 'Overdue'}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {canManage && currentStage !== 'enrolled' && currentStage !== 'rejected' && (
              <div className="flex gap-2 flex-shrink-0">
                {currentStage !== 'accepted' && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8" onClick={() => handleQuickDecision('accepted')} disabled={saving}>
                    <CheckCircle className="w-3.5 h-3.5 me-1" />
                    {isRTL ? 'قبول' : 'Accept'}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 h-8" onClick={() => handleQuickDecision('rejected')} disabled={saving}>
                  <XCircle className="w-3.5 h-3.5 me-1" />
                  {isRTL ? 'رفض' : 'Reject'}
                </Button>
              </div>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 border-b border-border flex-shrink-0">
            <TabsList className="bg-transparent border-0 h-10 gap-0 p-0">
              {[
                { id: 'overview', ar: 'نظرة عامة', en: 'Overview' },
                { id: 'documents', ar: 'الوثائق', en: 'Documents' },
                { id: 'interview', ar: 'المقابلة', en: 'Interview' },
                { id: 'evaluation', ar: 'التقييم', en: 'Evaluation' },
                { id: 'pipeline', ar: 'خط السير', en: 'Pipeline' },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-najdi-700 data-[state=active]:bg-transparent data-[state=active]:text-najdi-700 px-4 h-10"
                >
                  {isRTL ? tab.ar : tab.en}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="overview" className="p-6 m-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />{isRTL ? 'بيانات الطالب' : 'Student Information'}
                  </h3>
                  <div className="bg-sand rounded-lg px-4 py-2">
                    <InfoRow label={isRTL ? 'الاسم بالعربي' : 'Name (Arabic)'} value={application.student_name_ar} />
                    <InfoRow label={isRTL ? 'الاسم بالإنجليزي' : 'Name (English)'} value={application.student_name_en} />
                    <InfoRow label={isRTL ? 'تاريخ الميلاد' : 'Date of Birth'} value={application.date_of_birth ? format(new Date(application.date_of_birth), 'dd/MM/yyyy') : ''} />
                    <InfoRow label={isRTL ? 'الجنس' : 'Gender'} value={application.gender === 'male' ? (isRTL ? 'ذكر' : 'Male') : application.gender === 'female' ? (isRTL ? 'أنثى' : 'Female') : ''} />
                    <InfoRow label={isRTL ? 'الجنسية' : 'Nationality'} value={application.nationality} />
                    <InfoRow label={isRTL ? 'الصف المطلوب' : 'Grade Applying'} value={application.applying_for_grade} icon={GraduationCap} />
                    <InfoRow label={isRTL ? 'العام الدراسي' : 'Academic Year'} value={application.academic_year} />
                    <InfoRow label={isRTL ? 'المدرسة السابقة' : 'Previous School'} value={application.previous_school} icon={Building2} />
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />{isRTL ? 'بيانات ولي الأمر' : 'Guardian Information'}
                  </h3>
                  <div className="bg-sand rounded-lg px-4 py-2">
                    <InfoRow label={isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} value={application.guardian_name_ar} />
                    <InfoRow label={isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'} value={application.guardian_name_en} />
                    <InfoRow label={isRTL ? 'صلة القرابة' : 'Relationship'} value={application.guardian_relationship} />
                    <InfoRow label={isRTL ? 'واتساب' : 'WhatsApp'} value={application.guardian_whatsapp || application.guardian_phone} icon={Phone} />
                    <InfoRow label={isRTL ? 'البريد الإلكتروني' : 'Email'} value={application.guardian_email} icon={Mail} />
                    <InfoRow label={isRTL ? 'اسم الأم' : 'Mother Name'} value={application.mother_name_ar} />
                    <InfoRow label={isRTL ? 'هاتف الأم' : 'Mother Phone'} value={application.mother_phone} icon={Phone} />
                    <InfoRow label={isRTL ? 'العنوان' : 'Address'} value={application.address} icon={MapPin} />
                  </div>

                  {application.has_special_needs && (
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-semibold text-amber-700 mb-1">{isRTL ? '⚠ احتياجات خاصة' : '⚠ Special Needs'}</p>
                      <p className="text-sm text-amber-600">{application.special_care_notes}</p>
                    </div>
                  )}
                </div>

                {canManage && (
                  <div className="md:col-span-2 border border-border rounded-lg p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {isRTL ? 'تعيين مالك الطلب' : 'Assign pipeline owner'}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Select value={assigneeId || 'unassigned'} onValueChange={(v) => setAssigneeId(v === 'unassigned' ? '' : v)}>
                        <SelectTrigger className="w-full sm:w-72">
                          <SelectValue placeholder={isRTL ? 'اختر موظفاً...' : 'Select staff...'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">{isRTL ? 'غير معيّن' : 'Unassigned'}</SelectItem>
                          {staff.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id}>{staffName(emp)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={handleAssignOwner} disabled={saving}>
                        {isRTL ? 'حفظ التعيين' : 'Save assignment'}
                      </Button>
                    </div>
                  </div>
                )}

                {application.internal_notes && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-ink mb-2">{isRTL ? 'الملاحظات الداخلية' : 'Internal Notes'}</h3>
                    <div className="bg-sand rounded-lg p-3 text-sm text-ink whitespace-pre-wrap">{application.internal_notes}</div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="documents" className="p-6 m-0">
              <div className="space-y-4">
                <h3 className="font-semibold text-ink">{isRTL ? 'قائمة الوثائق المطلوبة' : 'Required Documents Checklist'}</h3>
                {[
                  { key: 'birth_cert', ar: 'شهادة الميلاد', en: 'Birth Certificate' },
                  { key: 'passport', ar: 'نسخة جواز السفر', en: 'Passport Copy' },
                  { key: 'iqama', ar: 'نسخة الإقامة', en: 'Iqama Copy' },
                  { key: 'prev_reports', ar: 'كشف الدرجات (آخر سنتين)', en: 'Report Cards (Last 2 Years)' },
                  { key: 'transfer_cert', ar: 'شهادة الانتقال', en: 'Transfer Certificate' },
                  { key: 'vaccination', ar: 'سجل التطعيمات', en: 'Vaccination Record' },
                  { key: 'medical', ar: 'شهادة اللياقة الطبية', en: 'Medical Fitness Certificate' },
                  { key: 'parent_id', ar: 'هوية ولي الأمر', en: 'Parent ID' },
                  { key: 'photos', ar: 'صور شخصية (2×)', en: 'Passport Photos (2×)' },
                ].map((doc) => {
                  const uploaded = application.documents?.some((d) => d.type === doc.key);
                  return (
                    <div key={doc.key} className="flex items-center justify-between p-3 bg-sand rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-ink">{isRTL ? doc.ar : doc.en}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${uploaded ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {uploaded ? (isRTL ? '✓ مرفوع' : '✓ Uploaded') : (isRTL ? '✗ مفقود' : '✗ Missing')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="interview" className="p-6 m-0">
              <div className="space-y-4 max-w-lg">
                <h3 className="font-semibold text-ink flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {isRTL ? 'جدولة المقابلة' : 'Schedule Interview'}
                </h3>
                <Select value={interviewType} onValueChange={setInterviewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">{isRTL ? 'عن بُعد' : 'Online'}</SelectItem>
                    <SelectItem value="onsite">{isRTL ? 'حضوري' : 'On-site'}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
                  <Input type="time" value={interviewTime} onChange={(e) => setInterviewTime(e.target.value)} />
                </div>
                {interviewType === 'online' && (
                  <Input
                    placeholder={isRTL ? 'رابط الاجتماع' : 'Meeting link'}
                    value={interviewLink}
                    onChange={(e) => setInterviewLink(e.target.value)}
                    dir="ltr"
                  />
                )}
                <Button onClick={handleScheduleInterview} disabled={saving || !canManage} className="w-full">
                  <Video className="w-4 h-4 me-2" />
                  {isRTL ? 'تأكيد الجدولة' : 'Confirm schedule'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="evaluation" className="p-6 m-0">
              <div className="space-y-4 max-w-lg">
                <h3 className="font-semibold text-ink">{isRTL ? 'تقييم المقابلة' : 'Interview Evaluation'}</h3>
                <StarRating label={isRTL ? 'التواصل' : 'Communication'} field="communication" />
                <StarRating label={isRTL ? 'الأكاديمي' : 'Academic'} field="academic" />
                <StarRating label={isRTL ? 'السلوك' : 'Behavior'} field="behavior" />
                <StarRating label={isRTL ? 'ولي الأمر' : 'Parent engagement'} field="parent" />
                <Textarea
                  placeholder={isRTL ? 'ملاحظات...' : 'Notes...'}
                  value={evalScores.notes}
                  onChange={(e) => setEvalScores((s) => ({ ...s, notes: e.target.value }))}
                  rows={3}
                />
                <Select
                  value={evalScores.recommendation}
                  onValueChange={(v) => setEvalScores((s) => ({ ...s, recommendation: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recommend">{isRTL ? 'يُوصى بالقبول' : 'Recommend'}</SelectItem>
                    <SelectItem value="conditional">{isRTL ? 'قبول مشروط' : 'Conditional'}</SelectItem>
                    <SelectItem value="not_recommend">{isRTL ? 'لا يُوصى' : 'Do not recommend'}</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="bg-najdi-700 hover:bg-najdi-900 text-white" disabled>
                  <CheckCircle className="w-4 h-4 me-2" />
                  {isRTL ? 'حفظ التقييم' : 'Save Evaluation'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="pipeline" className="p-6 m-0">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-ink mb-4">{isRTL ? 'مراحل خط السير' : 'Pipeline Progress'}</h3>
                  <div className="space-y-2">
                    {progressStages.map((stage, i) => {
                      const currentIndex = progressStages.findIndex((s) => s.key === stage.key);
                      const isPast = stageIndex >= 0 && currentIndex < stageIndex;
                      const isCurrent = stage.key === currentStage;
                      return (
                        <div
                          key={stage.key}
                          className={`flex items-center gap-3 p-3 rounded-lg ${isCurrent ? 'bg-najdi-50 border border-najdi-100' : isPast ? 'opacity-60' : 'opacity-40'}`}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isCurrent ? 'bg-najdi-700 text-white' : isPast ? 'bg-emerald-500 text-white' : 'bg-sand-alt text-muted-foreground'}`}>
                            {isPast ? '✓' : i + 1}
                          </div>
                          <span className={`text-sm font-medium ${isCurrent ? 'text-najdi-900' : 'text-muted-foreground'}`}>
                            {isRTL ? stage.label_ar : stage.label_en}
                          </span>
                          {isCurrent && (
                            <span className="text-xs bg-najdi-50 text-najdi-700 px-2 py-0.5 rounded-full ms-auto">
                              {isRTL ? 'الحالية' : 'Current'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {canManage && (
                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-ink">{isRTL ? 'تغيير المرحلة' : 'Change Stage'}</h4>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'اختر المرحلة...' : 'Select stage...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.key} value={s.key}>{isRTL ? s.label_ar : s.label_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder={isRTL ? 'سبب تغيير المرحلة (مطلوب للتدقيق)...' : 'Reason for stage change (required for audit)...'}
                      value={stageNote}
                      onChange={(e) => setStageNote(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <Button onClick={handleStageChange} disabled={saving || !newStatus} className="w-full">
                      {isRTL ? 'تطبيق التغيير' : 'Apply Stage Change'}
                    </Button>
                  </div>
                )}

                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                    <History className="w-4 h-4" />
                    {isRTL ? 'سجل المراحل' : 'Stage audit trail'}
                  </h4>
                  {stageHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{isRTL ? 'لا يوجد سجل بعد' : 'No history yet'}</p>
                  ) : (
                    <div className="space-y-2">
                      {stageHistory.map((h) => (
                        <div key={h.id} className="text-sm bg-sand rounded-lg p-3 border border-border">
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className="font-medium text-ink">
                              {h.from_status ? `${stageLabel(stages, h.from_status, isRTL) || h.from_status} → ` : ''}
                              {stageLabel(stages, h.to_status, isRTL) || h.to_status}
                            </span>
                            <span className="text-xs text-muted-foreground ms-auto">
                              {h.created_at ? format(new Date(h.created_at), 'dd/MM/yyyy HH:mm') : ''}
                            </span>
                          </div>
                          {(h.changed_by_name || h.note) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {h.changed_by_name ? `${h.changed_by_name}` : ''}
                              {h.changed_by_name && h.note ? ' · ' : ''}
                              {h.note || ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
