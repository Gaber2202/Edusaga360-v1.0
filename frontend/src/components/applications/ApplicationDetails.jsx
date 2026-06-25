import React, { useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useRole } from '../RoleContext';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import {
  User, FileText, Calendar, CheckCircle, XCircle,
  Clock, AlertTriangle, Phone, Mail, MapPin,
  Star, Building2, GraduationCap, Video, Users, Download
} from 'lucide-react';
import { logAuditEvent } from '../AuditService';

const PIPELINE_STAGES = [
  { key: 'inquiry',      label_ar: 'استفسار',           label_en: 'Inquiry'     },
  { key: 'submitted',    label_ar: 'مقدَّم',             label_en: 'Submitted'   },
  { key: 'under_review', label_ar: 'مراجعة الوثائق',    label_en: 'Docs Review' },
  { key: 'assessment',   label_ar: 'الاختبار',           label_en: 'Assessment'  },
  { key: 'interview',    label_ar: 'مقابلة',             label_en: 'Interview'   },
  { key: 'committee',    label_ar: 'اللجنة الأكاديمية', label_en: 'Committee'   },
  { key: 'accepted',     label_ar: 'مقبول',              label_en: 'Accepted'    },
  { key: 'waitlist',     label_ar: 'قائمة انتظار',       label_en: 'Waitlist'    },
  { key: 'enrolled',     label_ar: 'ملتحق',              label_en: 'Enrolled'    },
  { key: 'rejected',     label_ar: 'مرفوض',              label_en: 'Rejected'    },
];

const STATUS_COLORS = {
  inquiry: 'bg-slate-100 text-slate-700', submitted: 'bg-blue-100 text-blue-700',
  pending: 'bg-blue-100 text-blue-700', under_review: 'bg-yellow-100 text-yellow-700',
  assessment: 'bg-purple-100 text-purple-700', interview: 'bg-indigo-100 text-indigo-700',
  committee: 'bg-orange-100 text-orange-700', accepted: 'bg-green-100 text-green-700',
  waitlist: 'bg-teal-100 text-teal-700', enrolled: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

function InfoRow({ label, value, icon: Icon }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
      {Icon && <Icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm text-slate-800 font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function ApplicationDetails({ open, onClose, application, onUpdate }) {
  const { isRTL } = useLanguage();
  const { userRole } = useRole();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [newStatus, setNewStatus] = useState('');
  const [stageNote, setStageNote] = useState('');
  const [interviewType, setInterviewType] = useState('online');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [interviewLink, setInterviewLink] = useState('');
  const [evalScores, setEvalScores] = useState({ communication: 3, academic: 3, behavior: 3, parent: 3, notes: '', recommendation: 'recommend' });

  if (!application) return null;

  const canManage = ['admin', 'admissions', 'branch_manager'].includes(userRole);
  const days = differenceInDays(new Date(), new Date(application.created_at));

  const handleStageChange = async () => {
    if (!newStatus) return;
    setSaving(true);
    try {
      await tenantQuery('applications').update({
        status: newStatus,
        pipeline_stage: newStatus,
        internal_notes: stageNote ? `[${new Date().toLocaleDateString()}] Stage changed to ${newStatus}: ${stageNote}` : undefined,
      });
      await logAuditEvent({ action: 'UPDATE', entityType: 'Application', entityId: application.id, notes: `Stage changed to ${newStatus}: ${stageNote}` });
      toast.success(isRTL ? 'تم تحديث المرحلة' : 'Stage updated successfully');
      setNewStatus('');
      setStageNote('');
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
      await tenantQuery('applications').update({ status: decision });
      await logAuditEvent({ action: decision === 'accepted' ? 'approve' : 'reject', entityType: 'Application', entityId: application.id });
      toast.success(decision === 'accepted'
        ? (isRTL ? 'تم قبول الطلب ✅' : 'Application accepted ✅')
        : (isRTL ? 'تم رفض الطلب' : 'Application rejected'));
      onUpdate();
      onClose();
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
      await tenantQuery('applications').update({
        status: 'interview',
        pipeline_stage: 'assessment_scheduled',
        internal_notes: `Interview scheduled: ${interviewDate} ${interviewTime} | Type: ${interviewType} | Link: ${interviewLink}`,
      });
      toast.success(isRTL ? 'تم جدولة المقابلة' : 'Interview scheduled');
      onUpdate();
    } catch {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const StarRating = ({ label, field }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setEvalScores(s => ({...s, [field]: n}))}>
            <Star className={`w-5 h-5 ${n <= evalScores[field] ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {application.student_name_ar?.[0] || '?'}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{application.student_name_ar}</h2>
                {application.student_name_en && <p className="text-sm text-slate-500">{application.student_name_en}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[application.status] || 'bg-slate-100 text-slate-600'}`}>
                    {isRTL ? (PIPELINE_STAGES.find(s=>s.key===application.status)?.label_ar || application.status) : (PIPELINE_STAGES.find(s=>s.key===application.status)?.label_en || application.status)}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">{application.application_number}</span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{days} {isRTL ? 'يوم' : 'days'}
                  </span>
                  {days > 30 && <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{isRTL ? 'متأخر' : 'Overdue'}</span>}
                </div>
              </div>
            </div>
            {/* Quick actions */}
            {canManage && application.status !== 'enrolled' && application.status !== 'rejected' && (
              <div className="flex gap-2 flex-shrink-0">
                {application.status !== 'accepted' && (
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 border-b border-slate-200 flex-shrink-0">
            <TabsList className="bg-transparent border-0 h-10 gap-0 p-0">
              {[
                { id: 'overview', ar: 'نظرة عامة', en: 'Overview' },
                { id: 'documents', ar: 'الوثائق', en: 'Documents' },
                { id: 'interview', ar: 'المقابلة', en: 'Interview' },
                { id: 'evaluation', ar: 'التقييم', en: 'Evaluation' },
                { id: 'pipeline', ar: 'خط السير', en: 'Pipeline' },
              ].map(tab => (
                <TabsTrigger
                  key={tab.id} value={tab.id}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent data-[state=active]:text-blue-600 px-4 h-10"
                >
                  {isRTL ? tab.ar : tab.en}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="p-6 m-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Student Info */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <User className="w-4 h-4" />{isRTL ? 'بيانات الطالب' : 'Student Information'}
                  </h3>
                  <div className="bg-slate-50 rounded-lg px-4 py-2">
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

                {/* Guardian Info */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4" />{isRTL ? 'بيانات ولي الأمر' : 'Guardian Information'}
                  </h3>
                  <div className="bg-slate-50 rounded-lg px-4 py-2">
                    <InfoRow label={isRTL ? 'الاسم' : 'Name'} value={application.guardian_name_ar} />
                    <InfoRow label={isRTL ? 'صلة القرابة' : 'Relationship'} value={application.guardian_relationship} />
                    <InfoRow label={isRTL ? 'الهاتف' : 'Phone'} value={application.guardian_phone} icon={Phone} />
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

                {/* Notes */}
                {application.internal_notes && (
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">{isRTL ? 'الملاحظات الداخلية' : 'Internal Notes'}</h3>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">{application.internal_notes}</div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* DOCUMENTS TAB */}
            <TabsContent value="documents" className="p-6 m-0">
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-700">{isRTL ? 'قائمة الوثائق المطلوبة' : 'Required Documents Checklist'}</h3>
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
                ].map(doc => {
                  const uploaded = application.documents?.some(d => d.type === doc.key);
                  return (
                    <div key={doc.key} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">{isRTL ? doc.ar : doc.en}</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${uploaded ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {uploaded ? (isRTL ? '✓ مرفوع' : '✓ Uploaded') : (isRTL ? '✗ مفقود' : '✗ Missing')}
                      </span>
                    </div>
                  );
                })}
                {application.documents && application.documents.length > 0 && (
                  <div className="pt-2">
                    <h4 className="text-sm font-semibold text-slate-600 mb-2">{isRTL ? 'الوثائق المرفوعة' : 'Uploaded Files'}</h4>
                    {application.documents.map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-blue-500" />
                          <span className="text-sm">{doc.name}</span>
                        </div>
                        {doc.url && (
                          <a href={doc.url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7"><Download className="w-3.5 h-3.5" /></Button>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* INTERVIEW TAB */}
            <TabsContent value="interview" className="p-6 m-0">
              <div className="space-y-6">
                <h3 className="font-semibold text-slate-700">{isRTL ? 'جدولة المقابلة' : 'Schedule Interview'}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>{isRTL ? 'نوع المقابلة' : 'Interview Type'}</Label>
                    <Select value={interviewType} onValueChange={setInterviewType}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">{isRTL ? 'أونلاين (فيديو)' : 'Online (Video)'}</SelectItem>
                        <SelectItem value="offline">{isRTL ? 'حضوري' : 'In-Person'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{isRTL ? 'التاريخ' : 'Date'}</Label>
                    <Input type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label>{isRTL ? 'الوقت' : 'Time'}</Label>
                    <Input type="time" value={interviewTime} onChange={e => setInterviewTime(e.target.value)} className="mt-1" />
                  </div>
                  {interviewType === 'online' && (
                    <div>
                      <Label>{isRTL ? 'رابط الاجتماع' : 'Meeting Link'}</Label>
                      <Input placeholder="https://meet.google.com/..." value={interviewLink} onChange={e => setInterviewLink(e.target.value)} className="mt-1" />
                    </div>
                  )}
                </div>
                <Button onClick={handleScheduleInterview} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  <Calendar className="w-4 h-4 me-2" />
                  {isRTL ? 'جدولة المقابلة' : 'Schedule Interview'}
                </Button>

                {/* Existing interview info */}
                {application.status === 'interview' && (
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <p className="text-sm font-semibold text-indigo-700 mb-1 flex items-center gap-2">
                      <Video className="w-4 h-4" />
                      {isRTL ? 'المقابلة مجدولة' : 'Interview Scheduled'}
                    </p>
                    <p className="text-sm text-indigo-600">{application.internal_notes}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* EVALUATION TAB */}
            <TabsContent value="evaluation" className="p-6 m-0">
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-700">{isRTL ? 'نموذج تقييم المقابلة' : 'Interview Evaluation Form'}</h3>
                <div className="bg-slate-50 rounded-lg p-4 space-y-1 divide-y divide-slate-200">
                  <StarRating label={isRTL ? 'مهارات التواصل' : 'Communication Skills'} field="communication" />
                  <StarRating label={isRTL ? 'الاستعداد الأكاديمي' : 'Academic Readiness'} field="academic" />
                  <StarRating label={isRTL ? 'السلوك والمواقف' : 'Behavior & Attitude'} field="behavior" />
                  <StarRating label={isRTL ? 'تعاون ولي الأمر' : 'Parent Cooperation'} field="parent" />
                </div>
                <div>
                  <Label>{isRTL ? 'ملاحظات المقابل' : 'Interviewer Notes'}</Label>
                  <Textarea
                    value={evalScores.notes}
                    onChange={e => setEvalScores(s => ({...s, notes: e.target.value}))}
                    placeholder={isRTL ? 'ملاحظات إضافية...' : 'Additional notes...'}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>{isRTL ? 'التوصية النهائية' : 'Final Recommendation'}</Label>
                  <Select value={evalScores.recommendation} onValueChange={v => setEvalScores(s => ({...s, recommendation: v}))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommend">{isRTL ? '✅ يُوصى بالقبول' : '✅ Recommend'}</SelectItem>
                      <SelectItem value="conditional">{isRTL ? '⚠ قبول مشروط' : '⚠ Conditional'}</SelectItem>
                      <SelectItem value="not_recommend">{isRTL ? '❌ لا يُوصى بالقبول' : '❌ Do Not Recommend'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  <CheckCircle className="w-4 h-4 me-2" />
                  {isRTL ? 'حفظ التقييم' : 'Save Evaluation'}
                </Button>
              </div>
            </TabsContent>

            {/* PIPELINE TAB */}
            <TabsContent value="pipeline" className="p-6 m-0">
              <div className="space-y-6">
                {/* Stage progress */}
                <div>
                  <h3 className="font-semibold text-slate-700 mb-4">{isRTL ? 'مراحل خط السير' : 'Pipeline Progress'}</h3>
                  <div className="space-y-2">
                    {PIPELINE_STAGES.filter(s => !['waitlist','rejected'].includes(s.key)).map((stage, i) => {
                      const stageIndex = PIPELINE_STAGES.findIndex(s => s.key === (application.status || 'inquiry'));
                      const currentIndex = PIPELINE_STAGES.findIndex(s => s.key === stage.key);
                      const isPast = currentIndex < stageIndex;
                      const isCurrent = stage.key === application.status;
                      return (
                        <div key={stage.key} className={`flex items-center gap-3 p-3 rounded-lg ${isCurrent ? 'bg-blue-50 border border-blue-200' : isPast ? 'opacity-60' : 'opacity-40'}`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isCurrent ? 'bg-blue-600 text-white' : isPast ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                            {isPast ? '✓' : i + 1}
                          </div>
                          <span className={`text-sm font-medium ${isCurrent ? 'text-blue-700' : 'text-slate-600'}`}>
                            {isRTL ? stage.label_ar : stage.label_en}
                          </span>
                          {isCurrent && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full ms-auto">{isRTL ? 'الحالية' : 'Current'}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Stage change */}
                {canManage && (
                  <div className="border-t border-slate-200 pt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700">{isRTL ? 'تغيير المرحلة' : 'Change Stage'}</h4>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger>
                        <SelectValue placeholder={isRTL ? 'اختر المرحلة...' : 'Select stage...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map(s => (
                          <SelectItem key={s.key} value={s.key}>{isRTL ? s.label_ar : s.label_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder={isRTL ? 'سبب تغيير المرحلة (مطلوب للتدقيق)...' : 'Reason for stage change (required for audit)...'}
                      value={stageNote}
                      onChange={e => setStageNote(e.target.value)}
                      className="text-sm"
                      rows={2}
                    />
                    <Button onClick={handleStageChange} disabled={saving || !newStatus} className="w-full">
                      {isRTL ? 'تطبيق التغيير' : 'Apply Stage Change'}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}