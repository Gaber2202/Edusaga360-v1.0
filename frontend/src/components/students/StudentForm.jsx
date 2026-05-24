import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
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
import { Upload, Loader2 } from 'lucide-react';
import { logAuditEvent, AuditActions } from '../AuditService';
import { NotificationHelper } from '../notifications/NotificationHelper';
import { toast } from 'sonner';
import { useTenantFilter } from '../../hooks/useTenantFilter';

const SECTIONS = ['A', 'B', 'C', 'D'];

export default function StudentForm({ open, onClose, onSuccess, student }) {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const { tenantId } = useTenantFilter();
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const { data: grades = [] } = useQuery({
    queryKey: ['grades', tenantId],
    queryFn: async () => {
      const data = await tenantQuery('grades').select('*').match({ is_active: true });
      return data.sort((a, b) => a.display_order - b.display_order);
    },
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears', tenantId],
    queryFn: () => tenantQuery('academic_years').select('*').match({ is_active: true }),
  });
  const [formData, setFormData] = useState({
    student_id: '',
    name_ar: '',
    name_en: '',
    date_of_birth: '',
    gender: '',
    nationality: 'سعودي',
    national_id: '',
    grade: '',
    section: '',
    campus: '',
    academic_year: '2024-2025',
    status: 'active',
    enrollment_date: new Date().toISOString().split('T')[0],
    photo_url: '',
    medical_notes: '',
    address: '',
    emergency_contact: '',
    emergency_phone: ''
  });

  // CRITICAL FIX: Load student data when editing
  React.useEffect(() => {
    if (student) {
      console.log('Loading student for edit:', student);
      setFormData({
        student_id: student.student_id || '',
        name_ar: student.name_ar || '',
        name_en: student.name_en || '',
        date_of_birth: student.date_of_birth || '',
        gender: student.gender || '',
        nationality: student.nationality || 'سعودي',
        national_id: student.national_id || '',
        grade: student.grade || '',
        section: student.section || '',
        campus: student.campus || '',
        academic_year: student.academic_year || '2024-2025',
        status: student.status || 'active',
        enrollment_date: student.enrollment_date || new Date().toISOString().split('T')[0],
        photo_url: student.photo_url || '',
        medical_notes: student.medical_notes || '',
        address: student.address || '',
        emergency_contact: student.emergency_contact || '',
        emergency_phone: student.emergency_phone || ''
      });
    } else {
      // Reset form for new student
      setFormData({
        student_id: '',
        name_ar: '',
        name_en: '',
        date_of_birth: '',
        gender: '',
        nationality: 'سعودي',
        national_id: '',
        grade: '',
        section: '',
        campus: '',
        academic_year: '',
        status: 'active',
        enrollment_date: new Date().toISOString().split('T')[0],
        photo_url: '',
        medical_notes: '',
        address: '',
        emergency_contact: '',
        emergency_phone: ''
      });
    }
  }, [student]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      setFormData(prev => ({ ...prev, photo_url: file_url }));
    } catch (error) {
      console.error('Error uploading photo:', error);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name_ar || !formData.grade) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill in required fields');
      return;
    }
    
    setLoading(true);
    try {
      const studentId = formData.student_id || `STU-${Date.now().toString(36).toUpperCase()}`;
      const data = { ...formData, student_id: studentId, branch_id: selectedBranchId || 'all' };

      if (student?.id) {
        await tenantQuery('students').update(data);
        await logAuditEvent({
          action: AuditActions.UPDATE,
          entityType: 'Student',
          entityId: student.id,
          oldValues: student,
          newValues: data,
          page: 'Students'
        });
        toast.success(isRTL ? 'تم التحديث بنجاح' : 'Student updated successfully');
      } else {
        const created = await tenantQuery('students').insert(data);
        await logAuditEvent({
          action: AuditActions.CREATE,
          entityType: 'Student',
          entityId: created.id,
          newValues: data,
          page: 'Students'
        });
        
        // Notify on new enrollment
        if (data.status === 'active') {
          NotificationHelper.notifyStudentEnrollment(created);
        }
        
        toast.success(isRTL ? 'تم إنشاء الطالب بنجاح' : 'Student created successfully');
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving student:', error);
      toast.error(isRTL ? 'حدث خطأ أثناء الحفظ' : 'Error saving student');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {student ? (isRTL ? 'تعديل بيانات الطالب' : 'Edit Student') : (isRTL ? 'إضافة طالب جديد' : 'Add New Student')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photo Upload */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-2 border-slate-200">
                {formData.photo_url ? (
                  <img src={formData.photo_url} alt="Student" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl text-slate-400">
                    {formData.name_ar?.[0] || '?'}
                  </span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center cursor-pointer hover:bg-slate-800 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  disabled={uploadingPhoto}
                />
                {uploadingPhoto ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 text-white" />
                )}
              </label>
            </div>
          </div>

          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900 border-b pb-2">
              {isRTL ? 'البيانات الأساسية' : 'Basic Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('studentNameAr')} *</Label>
                <Input
                  value={formData.name_ar}
                  onChange={(e) => handleChange('name_ar', e.target.value)}
                  required
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('studentNameEn')}</Label>
                <Input
                  value={formData.name_en}
                  onChange={(e) => handleChange('name_en', e.target.value)}
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
            </div>
          </div>

          {/* Academic Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900 border-b pb-2">
              {isRTL ? 'البيانات الأكاديمية' : 'Academic Information'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('grade')} *</Label>
                <Select value={formData.grade} onValueChange={(v) => handleChange('grade', v)} required>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select grade'} />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map(grade => (
                      <SelectItem key={grade.grade_code} value={grade.grade_code}>
                        {isRTL ? grade.name_ar : grade.name_en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('section')}</Label>
                <Select value={formData.section} onValueChange={(v) => handleChange('section', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر الشعبة' : 'Select section'} />
                  </SelectTrigger>
                  <SelectContent>
                    {SECTIONS.map(section => (
                      <SelectItem key={section} value={section}>{section}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('academicYear')}</Label>
                <Select value={formData.academic_year} onValueChange={(v) => handleChange('academic_year', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر العام' : 'Select year'} />
                  </SelectTrigger>
                  <SelectContent>
                     {academicYears.map(y => (
                       <SelectItem key={y.id} value={y.year_code}>{y.year_label}</SelectItem>
                     ))}
                   </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('enrollmentDate')}</Label>
                <Input
                  type="date"
                  value={formData.enrollment_date}
                  onChange={(e) => handleChange('enrollment_date', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('status')}</Label>
                <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t('active')}</SelectItem>
                    <SelectItem value="inactive">{t('inactive')}</SelectItem>
                    <SelectItem value="transferred">{t('transferred')}</SelectItem>
                    <SelectItem value="graduated">{t('graduated')}</SelectItem>
                    <SelectItem value="withdrawn">{t('withdrawn')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحرم الجامعي' : 'Campus'}</Label>
                <Input
                  value={formData.campus}
                  onChange={(e) => handleChange('campus', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Contact & Emergency */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900 border-b pb-2">
              {isRTL ? 'الاتصال والطوارئ' : 'Contact & Emergency'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>{t('address')}</Label>
                <Textarea
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'جهة اتصال الطوارئ' : 'Emergency Contact'}</Label>
                <Input
                  value={formData.emergency_contact}
                  onChange={(e) => handleChange('emergency_contact', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'هاتف الطوارئ' : 'Emergency Phone'}</Label>
                <Input
                  type="tel"
                  value={formData.emergency_phone}
                  onChange={(e) => handleChange('emergency_phone', e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{isRTL ? 'ملاحظات طبية' : 'Medical Notes'}</Label>
                <Textarea
                  value={formData.medical_notes}
                  onChange={(e) => handleChange('medical_notes', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="bg-slate-900 hover:bg-slate-800">
              {loading && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}