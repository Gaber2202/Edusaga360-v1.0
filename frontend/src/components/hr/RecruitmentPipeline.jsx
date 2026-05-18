import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tenantQuery, callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { Bot, Loader2, Star, XCircle, ArrowRight, AlertTriangle, CheckCircle2, Pencil, Save, ChevronLeft, ChevronRight, Calendar, Video, MapPin, Mail } from 'lucide-react';
import { logAuditEvent, AuditActions } from '../AuditService';
import StageValidationChecker, { getStageValidation } from '../recruitment/StageValidationChecker';
import OfferLetterGenerator from '../recruitment/OfferLetterGenerator';
import ConvertToEmployee from '../recruitment/ConvertToEmployee';

const STAGES = [
  { key: 'applied',              ar: 'تقديم',            en: 'Applied',      color: 'bg-slate-100 text-slate-700',    border: 'border-slate-200' },
  { key: 'screening',            ar: 'فرز',              en: 'Screening',    color: 'bg-blue-100 text-blue-700',      border: 'border-blue-200' },
  { key: 'interview_scheduled',  ar: 'مقابلة',           en: 'Interview',    color: 'bg-amber-100 text-amber-700',    border: 'border-amber-200' },
  { key: 'interviewed',          ar: 'تمت المقابلة',    en: 'Interviewed',  color: 'bg-purple-100 text-purple-700',  border: 'border-purple-200' },
  { key: 'offered',              ar: 'عرض وظيفي',       en: 'Offered',      color: 'bg-emerald-100 text-emerald-700',border: 'border-emerald-200' },
  { key: 'hired',                ar: 'تم التوظيف',      en: 'Hired',        color: 'bg-green-100 text-green-700',    border: 'border-green-200' },
];

export default function RecruitmentPipeline({ applicants, recruitments, employees, departments, branches, companies }) {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();

  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingMove, setPendingMove] = useState(null); // { applicant, targetStage }
  const [showScore, setShowScore] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [movingId, setMovingId] = useState(null);
  const [interviewScore, setInterviewScore] = useState({ technical: 3, communication: 3, cultural: 3, notes: '' });
  const [showScheduleInterview, setShowScheduleInterview] = useState(null); // applicant
  const [scheduleForm, setScheduleForm] = useState({ interview_date: '', interview_time: '', interview_mode: 'on_site', interview_location: '', interview_notes: '' });
  const [schedulingSaving, setSchedulingSaving] = useState(false);
  const [hiredApplicant, setHiredApplicant] = useState(null); // triggers auto-convert dialog

  const stageApplicants = (stageKey) => applicants.filter(a => a.status === stageKey);

  const openEdit = (applicant) => {
    setEditForm({
      full_name_ar: applicant.full_name_ar || '',
      full_name_en: applicant.full_name_en || '',
      email: applicant.email || '',
      phone: applicant.phone || '',
      nationality: applicant.nationality || '',
      education_level: applicant.education_level || '',
      specialization: applicant.specialization || '',
      years_of_experience: applicant.years_of_experience || 0,
      expected_salary: applicant.expected_salary || 0,
      current_salary: applicant.current_salary || 0,
      cv_url: applicant.cv_url || '',
      recruiter_notes: applicant.recruiter_notes || '',
    });
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.full_name_ar?.trim()) {
      toast.error(isRTL ? 'الاسم بالعربي مطلوب' : 'Arabic name is required');
      return;
    }
    setSavingEdit(true);
    try {
      const dataToSave = {
        ...editForm,
        current_salary: parseFloat(editForm.current_salary) || 0,
        expected_salary: parseFloat(editForm.expected_salary) || 0,
      };
      const updatedApplicant = { ...selectedApplicant, ...dataToSave };
      await tenantQuery('applicants').update(dataToSave);
      try {
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Applicant', entityId: selectedApplicant.id, newValues: dataToSave, notes: 'Applicant info updated' });
      } catch (_) {}
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
      setEditMode(false);
      setSelectedApplicant(updatedApplicant);
      toast.success(isRTL ? 'تم حفظ بيانات المتقدم' : 'Applicant info saved');
    } catch (error) {
      toast.error(isRTL ? `فشل الحفظ: ${error.message}` : `Save failed: ${error.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  // Core stage move with validation + audit log
  const doMove = async (applicant, nextStage, extraData = {}) => {
    setMovingId(applicant.id);
    try {
      const prevStage = applicant.status;
      await tenantQuery('applicants').update({ status: nextStage, ...extraData });
      try {
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Applicant', entityId: applicant.id, oldValues: { status: prevStage }, newValues: { status: nextStage, ...extraData }, notes: `Pipeline stage: ${prevStage} → ${nextStage}` });
      } catch (_) {}
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
      toast.success(isRTL ? `تم الانتقال إلى: ${STAGES.find(s => s.key === nextStage)?.ar}` : `Moved to: ${STAGES.find(s => s.key === nextStage)?.en}`);

      // Auto-trigger employee conversion when moved to Hired
      if (nextStage === 'hired' && !applicant.converted_employee_id) {
        setHiredApplicant({ ...applicant, status: 'hired' });
      }
    } catch (error) {
      toast.error(isRTL ? `فشل النقل: ${error.message}` : `Move failed: ${error.message}`);
    } finally {
      setMovingId(null);
      setPendingMove(null);
    }
  };

  const handleMoveRequest = (applicant, nextStage, skipValidation = false) => {
    if (nextStage === 'rejected') {
      setShowRejectDialog(applicant);
      return;
    }
    if (!skipValidation) {
      const { valid } = getStageValidation(applicant, nextStage);
      if (!valid) {
        setPendingMove({ applicant, targetStage: nextStage });
        return;
      }
    }
    doMove(applicant, nextStage);
  };

  const handleOpenSchedule = (applicant) => {
    setScheduleForm({ interview_date: '', interview_time: '', interview_mode: 'on_site', interview_location: '', interview_notes: '' });
    setShowScheduleInterview(applicant);
  };

  const handleSaveSchedule = async () => {
    if (!scheduleForm.interview_date || !scheduleForm.interview_time) {
      toast.error(isRTL ? 'يرجى تحديد التاريخ والوقت' : 'Please set date and time');
      return;
    }
    if (schedulingSaving) return; // prevent double-submit
    setSchedulingSaving(true);
    const applicantSnapshot = showScheduleInterview; // capture before state changes
    try {
      const datetime = `${scheduleForm.interview_date}T${scheduleForm.interview_time}:00`;
      await tenantQuery('applicants').update({
        status: 'interview_scheduled',
        interview_scheduled_at: datetime,
        interview_mode: scheduleForm.interview_mode,
        interview_location: scheduleForm.interview_location || '',
        interview_notes: scheduleForm.interview_notes || '',
      });
      try {
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Applicant', entityId: applicantSnapshot.id, newValues: { status: 'interview_scheduled', interview_scheduled_at: datetime }, notes: 'Interview scheduled' });
      } catch (_) {}
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
      setShowScheduleInterview(null);
      toast.success(isRTL ? 'تم جدولة المقابلة بنجاح' : 'Interview scheduled successfully');
    } catch (error) {
      toast.error(isRTL ? `فشل الحفظ: ${error.message}` : `Failed to save: ${error.message}`);
    } finally {
      setSchedulingSaving(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) {
      toast.error(isRTL ? 'يرجى إدخال سبب الرفض' : 'Please enter rejection reason');
      return;
    }
    await doMove(showRejectDialog, 'rejected', { recruiter_notes: rejectReason });
    setShowRejectDialog(null);
    setRejectReason('');
  };

  const handleSaveScore = async () => {
    try {
      const avg = Math.round((interviewScore.technical + interviewScore.communication + interviewScore.cultural) / 3 * 10) / 10;
      await tenantQuery('applicants').update({
        interview_score: avg,
        interview_technical_score: interviewScore.technical,
        interview_communication_score: interviewScore.communication,
        interview_culture_score: interviewScore.cultural,
        interview_notes: interviewScore.notes,
        status: 'interviewed',
      });
      try {
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Applicant', entityId: selectedApplicant.id, newValues: { status: 'interviewed', interview_score: avg }, notes: 'Interview scored' });
      } catch (_) {}
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
      setShowScore(false);
      setSelectedApplicant(null);
      toast.success(isRTL ? 'تم حفظ نتيجة المقابلة والانتقال لمرحلة "تمت المقابلة"' : 'Interview scored — moved to Interviewed');
    } catch (error) {
      toast.error(isRTL ? `فشل الحفظ: ${error.message}` : `Save failed: ${error.message}`);
    }
  };

  const handleAISuggest = async (applicant) => {
    setLoadingAI(true);
    setAiSuggestion('');
    const rec = recruitments?.find(r => r.id === applicant.recruitment_id);
    const prompt = `You are Yamen AI, an HR recruitment advisor for EduSaga, a Saudi school group.
Assess this candidate for a school position. Respond ONLY about this candidate and recruitment context.

Candidate:
- Name: ${applicant.full_name_ar} / ${applicant.full_name_en || ''}
- Education: ${applicant.education_level || 'N/A'}
- Experience: ${applicant.years_of_experience || 0} years
- Specialization: ${applicant.specialization || 'N/A'}
- Nationality: ${applicant.nationality || 'N/A'}
- Interview Score: ${applicant.interview_score || 'Not yet scored'}
- Interview Notes: ${applicant.interview_notes || 'None'}
- Expected Salary: ${applicant.expected_salary || 0} SAR
- Current Salary: ${applicant.current_salary || 0} SAR
- Position: ${rec?.position_name || 'General'}
- Salary Range: ${rec?.salary_range_min || 0}–${rec?.salary_range_max || 0} SAR

Provide:
1. Hiring success probability (0-100%)
2. Salary recommendation (SAR) with justification
3. Missing documents or information
4. Pipeline bottleneck risk
5. Hire / Hold / No-Hire recommendation with clear reasoning

Respond in both Arabic and English. Be concise and specific.`;
    const res = await callApi('/api/ai/invoke-llm', { prompt });
    setAiSuggestion(res);
    setLoadingAI(false);
  };

  return (
    <div className="space-y-6">
      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {STAGES.map(stage => (
            <div key={stage.key} className="w-60 flex-shrink-0">
              <div className={`px-3 py-2 rounded-t-xl font-semibold text-xs flex items-center justify-between ${stage.color}`}>
                <span>{isRTL ? stage.ar : stage.en}</span>
                <Badge className="bg-white/70 text-slate-700 text-xs font-bold">{stageApplicants(stage.key).length}</Badge>
              </div>
              <div className={`bg-slate-50 border ${stage.border} rounded-b-xl p-2 space-y-2 min-h-[240px]`}>
                {stageApplicants(stage.key).map(app => (
                  <Card
                    key={app.id}
                    className="cursor-pointer hover:shadow-md transition-all border border-slate-200 bg-white"
                    onClick={() => setSelectedApplicant(app)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <p className="font-semibold text-sm text-slate-800 leading-tight">{app.full_name_ar}</p>
                      {app.full_name_en && <p className="text-xs text-slate-400">{app.full_name_en}</p>}
                      {app.job_title && <p className="text-xs text-slate-500 italic">{app.job_title}</p>}
                      {app.interview_scheduled_at && (
                        <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded px-1 py-0.5">
                          {app.interview_mode === 'virtual' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                          <span>{new Date(app.interview_scheduled_at).toLocaleDateString(isRTL ? 'ar-SA' : 'en-GB')} {new Date(app.interview_scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                      {app.interview_score > 0 && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500" />
                          <span className="text-xs font-medium text-amber-700">{app.interview_score}/5</span>
                        </div>
                      )}
                      {app.offer_status && app.offer_status !== 'draft' && (
                        <Badge className="text-xs bg-emerald-100 text-emerald-700">
                          {isRTL ? 'عرض: ' : 'Offer: '}{app.offer_status}
                        </Badge>
                      )}
                      {app.converted_employee_id && (
                        <Badge className="text-xs bg-green-100 text-green-700">
                          <CheckCircle2 className="w-3 h-3 me-1" />{isRTL ? 'موظف' : 'Hired'}
                        </Badge>
                      )}

                      {/* Stage action buttons */}
                      <div className="flex gap-1 flex-wrap pt-1" onClick={e => e.stopPropagation()}>
                        {stage.key === 'applied' && (
                          <Button size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-700"
                            disabled={movingId === app.id}
                            onClick={() => handleMoveRequest(app, 'screening')}>
                            {movingId === app.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3 me-1" />}
                            {isRTL ? 'فرز' : 'Screen'}
                          </Button>
                        )}
                        {stage.key === 'screening' && (
                          <Button size="sm" className="h-6 text-xs px-2 bg-amber-500 hover:bg-amber-600"
                            onClick={() => handleOpenSchedule(app)}>
                            <Calendar className="w-3 h-3 me-1" />
                            {isRTL ? 'جدولة مقابلة' : 'Schedule'}
                          </Button>
                        )}
                        {stage.key === 'interview_scheduled' && (
                          <Button size="sm" className="h-6 text-xs px-2 bg-purple-600 hover:bg-purple-700"
                            onClick={() => { setSelectedApplicant(app); setShowScore(true); }}>
                            {isRTL ? 'تسجيل النتيجة' : 'Score'}
                          </Button>
                        )}
                        {stage.key === 'interviewed' && (
                          <Button size="sm" className="h-6 text-xs px-2 bg-emerald-600 hover:bg-emerald-700"
                            disabled={movingId === app.id}
                            onClick={() => handleMoveRequest(app, 'offered')}>
                            {isRTL ? 'عرض' : 'Offer'}
                          </Button>
                        )}
                        {stage.key !== 'hired' && stage.key !== 'rejected' && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs px-1 text-red-500 hover:bg-red-50"
                            onClick={() => handleMoveRequest(app, 'rejected')}>
                            <XCircle className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Applicant Detail Dialog */}
      {selectedApplicant && !showScore && (
        <Dialog open={!!selectedApplicant} onOpenChange={() => { setSelectedApplicant(null); setAiSuggestion(''); setEditMode(false); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <span>{selectedApplicant.full_name_ar}</span>
                {selectedApplicant.applicant_number && (
                  <span className="text-slate-400 font-normal text-sm">— {selectedApplicant.applicant_number}</span>
                )}
                <Badge className={STAGES.find(s => s.key === selectedApplicant.status)?.color || 'bg-slate-100'}>
                  {isRTL ? STAGES.find(s => s.key === selectedApplicant.status)?.ar : STAGES.find(s => s.key === selectedApplicant.status)?.en}
                </Badge>
                <Button size="sm" variant="outline" className="ms-auto h-7 text-xs gap-1" onClick={() => editMode ? setEditMode(false) : openEdit(selectedApplicant)}>
                  <Pencil className="w-3 h-3" />
                  {editMode ? (isRTL ? 'إلغاء' : 'Cancel') : (isRTL ? 'تعديل' : 'Edit')}
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {editMode ? (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الاسم بالعربي *' : 'Arabic Name *'}</Label>
                    <Input value={editForm.full_name_ar} onChange={e => setEditForm(p => ({ ...p, full_name_ar: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الاسم بالإنجليزي' : 'English Name'}</Label>
                    <Input value={editForm.full_name_en} onChange={e => setEditForm(p => ({ ...p, full_name_en: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'البريد' : 'Email'}</Label>
                    <Input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الهاتف' : 'Phone'}</Label>
                    <Input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الجنسية' : 'Nationality'}</Label>
                    <Input value={editForm.nationality} onChange={e => setEditForm(p => ({ ...p, nationality: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'التعليم' : 'Education'}</Label>
                    <Select value={editForm.education_level} onValueChange={v => setEditForm(p => ({ ...p, education_level: v }))}>
                      <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                      <SelectContent>
                        {['high_school', 'diploma', 'bachelor', 'master', 'phd'].map(v => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'التخصص' : 'Specialization'}</Label>
                    <Input value={editForm.specialization} onChange={e => setEditForm(p => ({ ...p, specialization: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'سنوات الخبرة' : 'Years of Experience'}</Label>
                    <Input type="number" min="0" value={editForm.years_of_experience} onChange={e => setEditForm(p => ({ ...p, years_of_experience: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الراتب الحالي (ر.س)' : 'Current Salary (SAR)'}</Label>
                    <Input type="number" min="0" value={editForm.current_salary ?? ''} onChange={e => setEditForm(p => ({ ...p, current_salary: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{isRTL ? 'الراتب المتوقع (ر.س)' : 'Expected Salary (SAR)'}</Label>
                    <Input type="number" min="0" value={editForm.expected_salary ?? ''} onChange={e => setEditForm(p => ({ ...p, expected_salary: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>{isRTL ? 'رابط السيرة الذاتية' : 'CV URL'}</Label>
                    <Input value={editForm.cv_url} onChange={e => setEditForm(p => ({ ...p, cv_url: e.target.value }))} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>{isRTL ? 'ملاحظات المسؤول' : 'Recruiter Notes'}</Label>
                    <Textarea rows={3} value={editForm.recruiter_notes} onChange={e => setEditForm(p => ({ ...p, recruiter_notes: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleSaveEdit} disabled={savingEdit}>
                      {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {isRTL ? 'حفظ التعديلات' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg">
                <div><Label className="text-slate-500">{isRTL ? 'البريد' : 'Email'}</Label><p>{selectedApplicant.email || '-'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'الهاتف' : 'Phone'}</Label><p>{selectedApplicant.phone || '-'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'التعليم' : 'Education'}</Label><p>{selectedApplicant.education_level || '-'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'الخبرة' : 'Experience'}</Label><p>{selectedApplicant.years_of_experience || 0} {isRTL ? 'سنوات' : 'yrs'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'الراتب المتوقع' : 'Expected Salary'}</Label><p className="font-semibold text-emerald-700">{(selectedApplicant.expected_salary || 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'الجنسية' : 'Nationality'}</Label><p>{selectedApplicant.nationality || '-'}</p></div>
                {selectedApplicant.recruiter_notes && (
                  <div className="col-span-2"><Label className="text-slate-500">{isRTL ? 'ملاحظات' : 'Notes'}</Label><p className="text-slate-700">{selectedApplicant.recruiter_notes}</p></div>
                )}
              </div>
              )}

              {/* Interview Scheduled Info */}
              {selectedApplicant.interview_scheduled_at && (
                <div className={`rounded-lg p-3 border flex items-start gap-3 ${selectedApplicant.interview_mode === 'virtual' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                  {selectedApplicant.interview_mode === 'virtual' ? <Video className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" /> : <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />}
                  <div>
                    <p className={`font-semibold text-xs mb-0.5 ${selectedApplicant.interview_mode === 'virtual' ? 'text-blue-800' : 'text-amber-800'}`}>
                      {selectedApplicant.interview_mode === 'virtual' ? (isRTL ? 'مقابلة عن بُعد' : 'Virtual Interview') : (isRTL ? 'مقابلة حضورية' : 'On-Site Interview')}
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {new Date(selectedApplicant.interview_scheduled_at).toLocaleDateString(isRTL ? 'ar-SA' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      {' — '}
                      {new Date(selectedApplicant.interview_scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {selectedApplicant.interview_location && <p className="text-xs text-slate-500 mt-0.5">{selectedApplicant.interview_location}</p>}
                    {selectedApplicant.interview_notes && <p className="text-xs text-slate-500 mt-0.5 italic">{selectedApplicant.interview_notes}</p>}
                  </div>
                </div>
              )}

              {/* Interview Scores */}
              {selectedApplicant.interview_score > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="font-semibold text-amber-800 mb-2 text-xs">{isRTL ? 'نتائج المقابلة' : 'Interview Scores'}</p>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div><p className="text-lg font-bold text-blue-600">{selectedApplicant.interview_technical_score || 0}</p><p className="text-slate-500">{isRTL ? 'تقني' : 'Technical'}</p></div>
                    <div><p className="text-lg font-bold text-purple-600">{selectedApplicant.interview_communication_score || 0}</p><p className="text-slate-500">{isRTL ? 'تواصل' : 'Comm.'}</p></div>
                    <div><p className="text-lg font-bold text-emerald-600">{selectedApplicant.interview_culture_score || 0}</p><p className="text-slate-500">{isRTL ? 'انسجام' : 'Culture'}</p></div>
                    <div><p className="text-lg font-bold text-amber-600">{selectedApplicant.interview_score}</p><p className="text-slate-500">{isRTL ? 'متوسط' : 'Avg'}/5</p></div>
                  </div>
                </div>
              )}

              {/* Offer Letter — when at offered/interviewed stage */}
              {(selectedApplicant.status === 'offered' || selectedApplicant.status === 'interviewed') && (
                <OfferLetterGenerator
                  applicant={selectedApplicant}
                  recruitment={recruitments?.find(r => r.id === selectedApplicant.recruitment_id)}
                  departments={departments || []}
                  branches={branches || []}
                  companies={companies || []}
                  onOfferCreated={() => {
                    queryClient.invalidateQueries({ queryKey: ['applicants'] });
                    setSelectedApplicant(null);
                  }}
                />
              )}

              {/* Convert to Employee — offer accepted or status hired */}
              {(selectedApplicant.offer_status === 'accepted' || selectedApplicant.offer_accepted === true) && !selectedApplicant.converted_employee_id && (
                <ConvertToEmployee
                  applicant={selectedApplicant}
                  recruitment={recruitments?.find(r => r.id === selectedApplicant.recruitment_id)}
                  employees={employees || []}
                  onConverted={() => {
                    queryClient.invalidateQueries({ queryKey: ['applicants'] });
                    setSelectedApplicant(null);
                  }}
                />
              )}
              {selectedApplicant.converted_employee_id && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-lg p-3 text-sm font-medium border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" />
                  {isRTL ? 'تم تحويله إلى موظف — الإلحاق جارٍ' : 'Converted to Employee — Onboarding initiated'}
                </div>
              )}

              {/* Stage Navigation */}
              {!editMode && (() => {
                const currentIdx = STAGES.findIndex(s => s.key === selectedApplicant.status);
                const prevStage = currentIdx > 0 ? STAGES[currentIdx - 1] : null;
                const nextStage = currentIdx < STAGES.length - 1 && selectedApplicant.status !== 'hired' ? STAGES[currentIdx + 1] : null;
                return (
                  <div className="flex items-center gap-2 border-t pt-3">
                    {prevStage && (
                      <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs" disabled={movingId === selectedApplicant.id}
                        onClick={() => { handleMoveRequest(selectedApplicant, prevStage.key, true); setSelectedApplicant(null); }}>
                        <ChevronLeft className="w-3 h-3" />
                        {isRTL ? `رجوع: ${prevStage.ar}` : `Back: ${prevStage.en}`}
                      </Button>
                    )}
                    {nextStage && selectedApplicant.status !== 'rejected' && (
                      <Button size="sm" className="flex-1 gap-1 text-xs bg-blue-600 hover:bg-blue-700" disabled={movingId === selectedApplicant.id}
                        onClick={() => { handleMoveRequest(selectedApplicant, nextStage.key); }}>
                        {isRTL ? `التالي: ${nextStage.ar}` : `Next: ${nextStage.en}`}
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* Yamen AI */}
              <Button onClick={() => handleAISuggest(selectedApplicant)} disabled={loadingAI} className="w-full bg-purple-600 hover:bg-purple-700 gap-2">
                {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                {isRTL ? 'تقييم يامن AI' : 'Yamen AI Assessment'}
              </Button>
              {aiSuggestion && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 whitespace-pre-wrap text-sm text-slate-700">
                  {aiSuggestion}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Stage Validation Blocker Dialog */}
      {pendingMove && (
        <Dialog open={!!pendingMove} onOpenChange={() => setPendingMove(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-5 h-5" />
                {isRTL ? 'متطلبات مرحلة الانتقال' : 'Stage Transition Requirements'}
              </DialogTitle>
            </DialogHeader>
            <StageValidationChecker
              applicant={pendingMove.applicant}
              targetStage={pendingMove.targetStage}
              isRTL={isRTL}
            />
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={() => setPendingMove(null)}>
                {isRTL ? 'حسناً' : 'OK'}
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => {
                const app = pendingMove.applicant;
                setPendingMove(null);
                setSelectedApplicant(app);
                openEdit(app);
              }}>
                <Pencil className="w-4 h-4 me-1" />
                {isRTL ? 'تعديل وإكمال البيانات' : 'Edit & Complete Data'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject Reason Dialog */}
      {showRejectDialog && (
        <Dialog open={!!showRejectDialog} onOpenChange={() => { setShowRejectDialog(null); setRejectReason(''); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-700 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                {isRTL ? 'رفض المتقدم' : 'Reject Applicant'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                {isRTL ? `رفض: ${showRejectDialog.full_name_ar}` : `Rejecting: ${showRejectDialog.full_name_ar}`}
              </p>
              <div className="space-y-2">
                <Label>{isRTL ? 'سبب الرفض *' : 'Rejection Reason *'}</Label>
                <Textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder={isRTL ? 'يرجى إدخال سبب الرفض...' : 'Enter rejection reason...'}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowRejectDialog(null); setRejectReason(''); }}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button variant="destructive" onClick={handleConfirmReject}>
                {isRTL ? 'تأكيد الرفض' : 'Confirm Rejection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Schedule Interview Dialog */}
      {showScheduleInterview && (
        <Dialog open={!!showScheduleInterview} onOpenChange={() => setShowScheduleInterview(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-600" />
                {isRTL ? 'جدولة مقابلة' : 'Schedule Interview'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="font-semibold text-slate-700">{showScheduleInterview.full_name_ar}</p>
                {showScheduleInterview.full_name_en && <p className="text-slate-400 text-xs">{showScheduleInterview.full_name_en}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{isRTL ? 'التاريخ *' : 'Date *'}</Label>
                  <Input type="date" value={scheduleForm.interview_date} onChange={e => setScheduleForm(p => ({ ...p, interview_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>{isRTL ? 'الوقت *' : 'Time *'}</Label>
                  <Input type="time" value={scheduleForm.interview_time} onChange={e => setScheduleForm(p => ({ ...p, interview_time: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'نوع المقابلة' : 'Interview Mode'}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleForm(p => ({ ...p, interview_mode: 'on_site' }))}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${scheduleForm.interview_mode === 'on_site' ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm font-medium">{isRTL ? 'حضوري' : 'On-Site'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleForm(p => ({ ...p, interview_mode: 'virtual' }))}
                    className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${scheduleForm.interview_mode === 'virtual' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    <Video className="w-4 h-4" />
                    <span className="text-sm font-medium">{isRTL ? 'عن بُعد' : 'Virtual'}</span>
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{scheduleForm.interview_mode === 'on_site' ? (isRTL ? 'موقع المقابلة' : 'Interview Location') : (isRTL ? 'رابط الاجتماع' : 'Meeting Link')}</Label>
                <Input
                  value={scheduleForm.interview_location}
                  onChange={e => setScheduleForm(p => ({ ...p, interview_location: e.target.value }))}
                  placeholder={scheduleForm.interview_mode === 'on_site' ? (isRTL ? 'مثال: مبنى الإدارة — قاعة 3' : 'e.g. Admin Building — Room 3') : 'https://meet.google.com/...'}
                />
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'ملاحظات للمرشح' : 'Notes for Candidate'}</Label>
                <Textarea rows={2} value={scheduleForm.interview_notes} onChange={e => setScheduleForm(p => ({ ...p, interview_notes: e.target.value }))} placeholder={isRTL ? 'ما يجب إحضاره، تعليمات، إلخ...' : 'What to bring, instructions, etc...'} />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2 text-xs text-blue-700">
                <Mail className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{isRTL ? 'سيتم حفظ بيانات المقابلة في ملف المرشح. يمكن للمسؤول إرسال الدعوة يدوياً.' : 'Interview details will be saved to the applicant profile. HR can send the invitation manually.'}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowScheduleInterview(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={handleSaveSchedule} disabled={schedulingSaving} className="bg-amber-500 hover:bg-amber-600 gap-2">
                {schedulingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                {isRTL ? 'تأكيد الجدولة' : 'Confirm Schedule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Auto Convert to Employee — triggered when moved to Hired */}
      {hiredApplicant && (
        <ConvertToEmployee
          applicant={hiredApplicant}
          recruitment={recruitments?.find(r => r.id === hiredApplicant.recruitment_id)}
          employees={employees || []}
          autoOpen={true}
          onConverted={() => {
            setHiredApplicant(null);
            queryClient.invalidateQueries({ queryKey: ['applicants'] });
          }}
        />
      )}

      {/* Interview Score Dialog */}
      <Dialog open={showScore} onOpenChange={v => { if (!v) { setShowScore(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تسجيل نتيجة المقابلة' : 'Record Interview Score'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {[
              { key: 'technical', ar: 'الكفاءة التقنية', en: 'Technical Skills' },
              { key: 'communication', ar: 'مهارات التواصل', en: 'Communication' },
              { key: 'cultural', ar: 'الملاءمة الثقافية', en: 'Cultural Fit' },
            ].map(criterion => (
              <div key={criterion.key} className="space-y-1">
                <Label>{isRTL ? criterion.ar : criterion.en} (1–5)</Label>
                <Select value={String(interviewScore[criterion.key])} onValueChange={v => setInterviewScore(p => ({ ...p, [criterion.key]: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ))}
            <div className="space-y-1">
              <Label>{isRTL ? 'ملاحظات المقابلة *' : 'Interview Notes *'}</Label>
              <Textarea rows={3} value={interviewScore.notes} onChange={e => setInterviewScore(p => ({ ...p, notes: e.target.value }))} placeholder={isRTL ? 'ملاحظات الجلسة...' : 'Panel notes...'} />
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
              <p className="text-xs text-slate-500 mb-1">{isRTL ? 'متوسط النتيجة' : 'Average Score'}</p>
              <p className="text-3xl font-bold text-amber-600">{((interviewScore.technical + interviewScore.communication + interviewScore.cultural) / 3).toFixed(1)}<span className="text-base text-slate-400">/5</span></p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScore(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveScore} disabled={!interviewScore.notes.trim()}>
              {isRTL ? 'حفظ والانتقال للمرحلة التالية' : 'Save & Move to Interviewed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}