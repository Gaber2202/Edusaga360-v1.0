import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../LanguageContext';
import { tenantQuery, uploadFileApi, fetchData, supabase } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../AuditService';
import { useBranch } from '../BranchContext';
import { useTenantFilter } from '../../hooks/useTenantFilter';

const GRADES = ['KG1', 'KG2', 'KG3', 'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'Grade6', 'Grade7', 'Grade8', 'Grade9', 'Grade10', 'Grade11', 'Grade12'];

const emptyForm = (branchId = '') => ({
  student_name_ar: '',
  student_name_en: '',
  date_of_birth: '',
  gender: '',
  nationality: '',
  national_id: '',
  applying_for_grade: '',
  academic_year: '',
  previous_school: '',
  guardian_name_ar: '',
  guardian_name_en: '',
  guardian_relationship: 'father',
  guardian_phone: '',
  guardian_whatsapp: '',
  guardian_email: '',
  guardian_national_id: '',
  address: '',
  branch_id: branchId || '',
  documents: [],
  notes: '',
  status: 'inquiry',
  pipeline_stage: 'inquiry',
});

export default function ApplicationForm({ open, onClose, onSuccess, application, branches: branchesProp }) {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [loading, setLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [formData, setFormData] = useState(() => emptyForm(selectedBranchId));

  const { data: branchesFromQuery = [] } = useQuery({
    queryKey: ['branches', tenantId, 'admissions-form'],
    queryFn: () => fetchData(tenantQuery('branches').select('id, name_en, name_ar, name').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess && open && !branchesProp?.length,
  });
  const branches = branchesProp?.length ? branchesProp : branchesFromQuery;

  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears', tenantId, 'admissions-form'],
    queryFn: () => fetchData(tenantQuery('academic_years').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    enabled: hasTenantAccess && open,
  });

  useEffect(() => {
    if (!open) return;
    if (application) {
      setFormData({
        ...emptyForm(),
        student_name_ar: application.student_name_ar || '',
        student_name_en: application.student_name_en || '',
        date_of_birth: application.date_of_birth || '',
        gender: application.gender || '',
        nationality: application.nationality || '',
        national_id: application.national_id || '',
        applying_for_grade: application.applying_for_grade || '',
        academic_year: application.academic_year || '',
        previous_school: application.previous_school || '',
        guardian_name_ar: application.guardian_name_ar || '',
        guardian_name_en: application.guardian_name_en || '',
        guardian_relationship: application.guardian_relationship || 'father',
        guardian_phone: application.guardian_phone || '',
        guardian_whatsapp: application.guardian_whatsapp || application.guardian_phone || '',
        guardian_email: application.guardian_email || '',
        guardian_national_id: application.guardian_national_id || '',
        address: application.address || '',
        documents: application.documents || [],
        notes: application.notes || '',
        status: application.status || 'inquiry',
        pipeline_stage: application.pipeline_stage || application.status || 'inquiry',
        branch_id: application.branch_id || selectedBranchId || '',
      });
    } else {
      const currentYear =
        academicYears.find((y) => y.is_current)?.year_label ||
        academicYears[0]?.year_label ||
        '';
      setFormData({
        ...emptyForm(selectedBranchId || ''),
        academic_year: currentYear,
      });
    }
  }, [application, open, selectedBranchId, academicYears]);

  const handleChange = (field, value) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'guardian_phone' && !prev.guardian_whatsapp) {
        next.guardian_whatsapp = value;
      }
      return next;
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDoc(true);
    try {
      const result = await uploadFileApi(file);
      const newDoc = {
        name: file.name,
        url: result.signedUrl || result.path,
        type: file.type,
        uploaded_at: new Date().toISOString(),
      };
      setFormData((prev) => ({
        ...prev,
        documents: [...(prev.documents || []), newDoc],
      }));
      toast.success(isRTL ? 'تم رفع المستند' : 'Document uploaded');
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(isRTL ? 'فشل رفع المستند' : 'Document upload failed');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const removeDocument = (index) => {
    setFormData((prev) => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index),
    }));
  };

  const validate = () => {
    const required = [
      ['guardian_name_ar', isRTL ? 'اسم ولي الأمر (عربي)' : 'Parent name (Arabic)'],
      ['guardian_name_en', isRTL ? 'اسم ولي الأمر (إنجليزي)' : 'Parent name (English)'],
      ['guardian_email', isRTL ? 'البريد الإلكتروني' : 'Email'],
      ['guardian_whatsapp', isRTL ? 'رقم واتساب' : 'WhatsApp number'],
      ['applying_for_grade', isRTL ? 'الصف' : 'Grade'],
      ['branch_id', isRTL ? 'الفرع' : 'Branch'],
      ['academic_year', isRTL ? 'العام الدراسي' : 'Academic year'],
    ];
    for (const [field, label] of required) {
      if (!String(formData[field] || '').trim()) {
        toast.error(isRTL ? `يرجى إدخال ${label}` : `Please enter ${label}`);
        return false;
      }
    }
    if (!formData.student_name_ar?.trim()) {
      toast.error(isRTL ? 'يرجى إدخال اسم الطالب' : 'Please enter student name');
      return false;
    }
    if (!(formData.documents?.length > 0)) {
      toast.error(isRTL ? 'يرجى رفع مستندات القبول' : 'Please upload admission documents');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const appNumber = `APP-${Date.now().toString(36).toUpperCase()}`;
      const data = {
        student_name_ar: formData.student_name_ar.trim(),
        student_name_en: formData.student_name_en?.trim() || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        nationality: formData.nationality || null,
        national_id: formData.national_id || null,
        applying_for_grade: formData.applying_for_grade,
        academic_year: formData.academic_year,
        previous_school: formData.previous_school || null,
        guardian_name_ar: formData.guardian_name_ar.trim(),
        guardian_name_en: formData.guardian_name_en.trim(),
        guardian_relationship: formData.guardian_relationship || 'guardian',
        guardian_phone: formData.guardian_phone || formData.guardian_whatsapp,
        guardian_whatsapp: formData.guardian_whatsapp.trim(),
        guardian_email: formData.guardian_email.trim(),
        guardian_national_id: formData.guardian_national_id || null,
        address: formData.address || null,
        documents: formData.documents || [],
        notes: formData.notes || null,
        branch_id: formData.branch_id,
        application_number: application?.application_number || appNumber,
        status: application?.status || 'inquiry',
        pipeline_stage: application?.pipeline_stage || 'inquiry',
        source: application?.source || 'manual',
      };

      if (application?.id) {
        await tenantQuery('applications').update(data).eq('id', application.id);
        await logAuditEvent({
          action: AuditActions.UPDATE,
          entityType: 'Application',
          entityId: application.id,
          oldValues: application,
          newValues: data,
        });
      } else {
        const { data: created, error: insertError } = await tenantQuery('applications').insert(data).select('id').single();
        if (insertError) throw insertError;
        const createdId = created?.id;
        await logAuditEvent({
          action: AuditActions.CREATE,
          entityType: 'Application',
          entityId: createdId,
          newValues: data,
        });
        if (createdId) {
          const { data: auth } = await supabase.auth.getUser();
          try {
            const { error: histError } = await tenantQuery('application_stage_history').insert({
              application_id: createdId,
              from_status: null,
              to_status: 'inquiry',
              note: 'Manual admission request created',
              changed_by: auth?.user?.id ?? null,
              changed_by_name: auth?.user?.email ?? null,
            });
            if (histError) console.warn('Stage history seed skipped:', histError);
          } catch (histErr) {
            console.warn('Stage history seed skipped:', histErr);
          }
        }
      }
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving application:', error);
      toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {application ? (isRTL ? 'تعديل الطلب' : 'Edit Application') : t('newApplication')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-ink border-b pb-2">
              {isRTL ? 'بيانات الطالب' : 'Student Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('studentNameAr')} *</Label>
                <Input value={formData.student_name_ar} onChange={(e) => handleChange('student_name_ar', e.target.value)} required dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{t('studentNameEn')}</Label>
                <Input value={formData.student_name_en} onChange={(e) => handleChange('student_name_en', e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الصف' : 'Grade'} *</Label>
                <Select value={formData.applying_for_grade} onValueChange={(v) => handleChange('applying_for_grade', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select grade'} />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((grade) => (
                      <SelectItem key={grade} value={grade}>{t(grade) || grade}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الفرع' : 'Branch'} *</Label>
                <Select value={formData.branch_id || undefined} onValueChange={(v) => handleChange('branch_id', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر الفرع' : 'Select branch'} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {isRTL ? (b.name_ar || b.name || b.name_en) : (b.name_en || b.name || b.name_ar)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'} *</Label>
                {academicYears.length > 0 ? (
                  <Select value={formData.academic_year || undefined} onValueChange={(v) => handleChange('academic_year', v)}>
                    <SelectTrigger>
                      <SelectValue placeholder={isRTL ? 'اختر العام' : 'Select year'} />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((y) => (
                        <SelectItem key={y.id || y.year_label} value={y.year_label || y.name || String(y.id)}>
                          {y.year_label || y.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={formData.academic_year} onChange={(e) => handleChange('academic_year', e.target.value)} placeholder="2025-2026" required />
                )}
              </div>
              <div className="space-y-2">
                <Label>{t('dateOfBirth')}</Label>
                <Input type="date" value={formData.date_of_birth} onChange={(e) => handleChange('date_of_birth', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('gender')}</Label>
                <Select value={formData.gender || undefined} onValueChange={(v) => handleChange('gender', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t('male')}</SelectItem>
                    <SelectItem value="female">{t('female')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('previousSchool')}</Label>
                <Input value={formData.previous_school} onChange={(e) => handleChange('previous_school', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-ink border-b pb-2">
              {isRTL ? 'بيانات ولي الأمر' : 'Parent / Guardian'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم ولي الأمر (عربي)' : 'Parent name (Arabic)'} *</Label>
                <Input value={formData.guardian_name_ar} onChange={(e) => handleChange('guardian_name_ar', e.target.value)} required dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم ولي الأمر (إنجليزي)' : 'Parent name (English)'} *</Label>
                <Input value={formData.guardian_name_en} onChange={(e) => handleChange('guardian_name_en', e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('email')} *</Label>
                <Input type="email" value={formData.guardian_email} onChange={(e) => handleChange('guardian_email', e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'رقم واتساب' : 'WhatsApp number'} *</Label>
                <Input type="tel" value={formData.guardian_whatsapp} onChange={(e) => handleChange('guardian_whatsapp', e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('phone')}</Label>
                <Input type="tel" value={formData.guardian_phone} onChange={(e) => handleChange('guardian_phone', e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('relationship')}</Label>
                <Select value={formData.guardian_relationship || undefined} onValueChange={(v) => handleChange('guardian_relationship', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="father">{t('father')}</SelectItem>
                    <SelectItem value="mother">{t('mother')}</SelectItem>
                    <SelectItem value="guardian">{t('guardian')}</SelectItem>
                    <SelectItem value="other">{t('other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('address')}</Label>
                <Textarea value={formData.address} onChange={(e) => handleChange('address', e.target.value)} rows={2} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-ink border-b pb-2">
              {isRTL ? 'مستندات القبول *' : 'Admission documents *'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isRTL
                ? 'ارفع مستندات طلب الالتحاق الأساسية (هوية، شهادات، إلخ).'
                : 'Upload basic school application documents (IDs, certificates, etc.).'}
            </p>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {formData.documents?.map((doc, i) => (
                  <div key={i} className="flex items-center gap-2 bg-sand-alt px-3 py-2 rounded-lg">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-ink hover:underline">
                      {doc.name}
                    </a>
                    <button type="button" onClick={() => removeDocument(i)} className="text-red-500 hover:text-red-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="relative inline-block">
                <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadingDoc} />
                <Button type="button" variant="outline" disabled={uploadingDoc} className="gap-2">
                  {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {t('uploadDocument')}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('notes')}</Label>
            <Textarea value={formData.notes} onChange={(e) => handleChange('notes', e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" disabled={loading} className="bg-najdi-900 hover:bg-najdi-900">
              {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
