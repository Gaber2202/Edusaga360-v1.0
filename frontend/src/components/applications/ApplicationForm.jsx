import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { tenantQuery, callApi } from '../../api/supabaseClient';
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

const GRADES = ['KG1', 'KG2', 'KG3', 'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'Grade6', 'Grade7', 'Grade8', 'Grade9', 'Grade10', 'Grade11', 'Grade12'];

export default function ApplicationForm({ open, onClose, onSuccess, application }) {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const [loading, setLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [formData, setFormData] = useState({
    student_name_ar: '',
    student_name_en: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    national_id: '',
    applying_for_grade: '',
    academic_year: '2024-2025',
    previous_school: '',
    guardian_name_ar: '',
    guardian_name_en: '',
    guardian_relationship: '',
    guardian_phone: '',
    guardian_email: '',
    guardian_national_id: '',
    address: '',
    documents: [],
    notes: '',
    status: 'pending'
  });

  // CRITICAL FIX: Load application data when editing
  React.useEffect(() => {
    if (application) {
      console.log('Loading application for edit:', application);
      setFormData({
        student_name_ar: application.student_name_ar || '',
        student_name_en: application.student_name_en || '',
        date_of_birth: application.date_of_birth || '',
        gender: application.gender || '',
        nationality: application.nationality || '',
        national_id: application.national_id || '',
        applying_for_grade: application.applying_for_grade || '',
        academic_year: application.academic_year || '2024-2025',
        previous_school: application.previous_school || '',
        guardian_name_ar: application.guardian_name_ar || '',
        guardian_name_en: application.guardian_name_en || '',
        guardian_relationship: application.guardian_relationship || '',
        guardian_phone: application.guardian_phone || '',
        guardian_email: application.guardian_email || '',
        guardian_national_id: application.guardian_national_id || '',
        address: application.address || '',
        documents: application.documents || [],
        notes: application.notes || '',
        status: application.status || 'pending',
        branch_id: application.branch_id || ''
      });
    } else {
      // Reset form for new application
      setFormData({
        student_name_ar: '',
        student_name_en: '',
        date_of_birth: '',
        gender: '',
        nationality: '',
        national_id: '',
        applying_for_grade: '',
        academic_year: '2024-2025',
        previous_school: '',
        guardian_name_ar: '',
        guardian_name_en: '',
        guardian_relationship: '',
        guardian_phone: '',
        guardian_email: '',
        guardian_national_id: '',
        address: '',
        documents: [],
        notes: '',
        status: 'pending'
      });
    }
  }, [application, open]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingDoc(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      const newDoc = {
        name: file.name,
        url: file_url,
        type: file.type
      };
      setFormData(prev => ({
        ...prev,
        documents: [...(prev.documents || []), newDoc]
      }));
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploadingDoc(false);
    }
  };

  const removeDocument = (index) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.student_name_ar) {
      toast.error(isRTL ? 'يرجى إدخال اسم الطالب' : 'Please enter student name');
      return;
    }
    if (!formData.applying_for_grade) {
      toast.error(isRTL ? 'يرجى اختيار الصف' : 'Please select grade');
      return;
    }
    if (!formData.guardian_name_ar || !formData.guardian_phone) {
      toast.error(isRTL ? 'يرجى إدخال بيانات ولي الأمر' : 'Please enter guardian information');
      return;
    }
    
    setLoading(true);
    try {
      const appNumber = `APP-${Date.now().toString(36).toUpperCase()}`;
      const data = {
        ...formData,
        application_number: application?.application_number || appNumber,
        branch_id: formData.branch_id || selectedBranchId,
        status: formData.status || 'submitted'
      };

      if (application?.id) {
        await tenantQuery('applications').update(data);
        await logAuditEvent({
          action: AuditActions.UPDATE,
          entityType: 'Application',
          entityId: application.id,
          oldValues: application,
          newValues: data
        });
      } else {
        const created = await tenantQuery('applications').insert(data);
        await logAuditEvent({
          action: AuditActions.CREATE,
          entityType: 'Application',
          entityId: created.id,
          newValues: data
        });
      }
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving application:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
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
          {/* Student Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-ink border-b pb-2">
              {isRTL ? 'بيانات الطالب' : 'Student Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('studentNameAr')} *</Label>
                <Input
                  value={formData.student_name_ar}
                  onChange={(e) => handleChange('student_name_ar', e.target.value)}
                  required
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('studentNameEn')}</Label>
                <Input
                  value={formData.student_name_en}
                  onChange={(e) => handleChange('student_name_en', e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('dateOfBirth')}</Label>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleChange('date_of_birth', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('gender')}</Label>
                <Select value={formData.gender} onValueChange={(v) => handleChange('gender', v)}>
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
                <Label>{t('nationality')}</Label>
                <Input
                  value={formData.nationality}
                  onChange={(e) => handleChange('nationality', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('nationalId')}</Label>
                <Input
                  value={formData.national_id}
                  onChange={(e) => handleChange('national_id', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('applyingForGrade')} *</Label>
                <Select value={formData.applying_for_grade} onValueChange={(v) => handleChange('applying_for_grade', v)} required>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select grade'} />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map(grade => (
                      <SelectItem key={grade} value={grade}>{t(grade)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('previousSchool')}</Label>
                <Input
                  value={formData.previous_school}
                  onChange={(e) => handleChange('previous_school', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Guardian Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-ink border-b pb-2">
              {isRTL ? 'بيانات ولي الأمر' : 'Guardian Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('guardianName')} ({isRTL ? 'عربي' : 'Arabic'}) *</Label>
                <Input
                  value={formData.guardian_name_ar}
                  onChange={(e) => handleChange('guardian_name_ar', e.target.value)}
                  required
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('guardianName')} ({isRTL ? 'إنجليزي' : 'English'})</Label>
                <Input
                  value={formData.guardian_name_en}
                  onChange={(e) => handleChange('guardian_name_en', e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('relationship')} *</Label>
                <Select value={formData.guardian_relationship} onValueChange={(v) => handleChange('guardian_relationship', v)} required>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="father">{t('father')}</SelectItem>
                    <SelectItem value="mother">{t('mother')}</SelectItem>
                    <SelectItem value="guardian">{t('guardian')}</SelectItem>
                    <SelectItem value="other">{t('other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('phone')} *</Label>
                <Input
                  type="tel"
                  value={formData.guardian_phone}
                  onChange={(e) => handleChange('guardian_phone', e.target.value)}
                  required
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('email')}</Label>
                <Input
                  type="email"
                  value={formData.guardian_email}
                  onChange={(e) => handleChange('guardian_email', e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('nationalId')}</Label>
                <Input
                  value={formData.guardian_national_id}
                  onChange={(e) => handleChange('guardian_national_id', e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('address')}</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="space-y-4">
            <h3 className="font-semibold text-ink border-b pb-2">
              {t('documents')}
            </h3>
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
              <div className="relative">
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={uploadingDoc}
                />
                <Button type="button" variant="outline" disabled={uploadingDoc} className="gap-2">
                  {uploadingDoc ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {t('uploadDocument')}
                </Button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('notes')}</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
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