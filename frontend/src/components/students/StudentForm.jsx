import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../LanguageContext';
import { useBranch } from '../BranchContext';
import { tenantQuery, fetchData, callApi } from '../../api/supabaseClient';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Upload, Loader2, UserPlus, FileText, CreditCard, X } from 'lucide-react';
import { logAuditEvent, AuditActions } from '../AuditService';
import { NotificationHelper } from '../notifications/NotificationHelper';
import { toast } from 'sonner';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useTenant } from '../TenantContext';
import { Checkbox } from '../ui/checkbox';

const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const EMPTY_FORM = {
  student_id: '',
  name_ar: '',
  name_en: '',
  date_of_birth: '',
  gender: '',
  nationality: 'سعودي',
  national_id: '',
  iqama_number: '',
  passport_number: '',
  place_of_birth: '',
  religion: '',
  grade: '',
  section: '',
  campus: '',
  academic_year: '',
  status: 'active',
  enrollment_date: new Date().toISOString().split('T')[0],
  photo_url: '',
  // Guardian 1
  guardian_name_en: '',
  guardian_name_ar: '',
  guardian_email: '',
  guardian_phone: '',
  guardian_relationship: 'father',
  guardian_national_id: '',
  guardian_occupation: '',
  // Guardian 2
  guardian2_name_ar: '',
  guardian2_name_en: '',
  guardian2_phone: '',
  guardian2_relationship: 'mother',
  guardian2_national_id: '',
  // Contact
  address: '',
  emergency_contact: '',
  emergency_phone: '',
  // Medical
  blood_type: '',
  medical_notes: '',
  allergies: '',
  chronic_conditions: '',
  medications: '',
  // Billing preferences
  fee_structure_id: '',
  payment_plan_id: '',
  payment_notes: '',
  // Documents (URLs)
  doc_birth_cert_url: '',
  doc_student_id_url: '',
  doc_guardian_id_url: '',
  doc_transfer_url: '',
  doc_other_url: '',
};

function DocUploadField({ label, value, onChange, isRTL }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = React.useRef();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      onChange(file_url);
      toast.success(isRTL ? 'تم رفع الملف' : 'File uploaded');
    } catch {
      toast.error(isRTL ? 'فشل رفع الملف' : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <Label className="text-xs text-slate-600 mb-1 block">{label}</Label>
        {value ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs">
            <FileText className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            <a href={value} target="_blank" rel="noreferrer" className="text-emerald-700 font-medium truncate hover:underline">
              {isRTL ? 'عرض الملف' : 'View file'}
            </a>
            <button type="button" onClick={() => onChange('')} className="ms-auto text-slate-400 hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {isRTL ? 'رفع ملف' : 'Upload file'}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFile} className="hidden" />
    </div>
  );
}

export default function StudentForm({ open, onClose, onSuccess, student }) {
  const { t, isRTL } = useLanguage();
  const { selectedBranchId } = useBranch();
  const { tenantId } = useTenantFilter();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [inviteParent, setInviteParent] = useState(true);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const tt = (ar, en) => (isRTL ? ar : en);

  const { data: grades = [] } = useQuery({
    queryKey: ['grades', tenantId],
    queryFn: async () => {
      const { data = [] } = await tenantQuery('grades').select('*').match({ is_active: true });
      return data.sort((a, b) => a.display_order - b.display_order);
    },
  });
  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears', tenantId],
    queryFn: () => fetchData(tenantQuery('academic_years').select('*').match({ is_active: true })),
  });
  const { data: feeStructures = [] } = useQuery({
    queryKey: ['fee_structures', tenantId],
    queryFn: () => fetchData(tenantQuery('fee_structures').select('id, name_ar, name_en, grade').order('name_ar')),
  });
  const { data: paymentPlans = [] } = useQuery({
    queryKey: ['payment_plans', tenantId],
    queryFn: () => fetchData(tenantQuery('payment_plans').select('id, name_ar, name_en').order('name_ar')),
  });

  React.useEffect(() => {
    if (student) {
      setFormData({
        ...EMPTY_FORM,
        ...Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, student[k] ?? EMPTY_FORM[k]])),
      });
    } else {
      setFormData({ ...EMPTY_FORM });
    }
  }, [student]);

  const set = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      set('photo_url', file_url);
    } catch {
      toast.error(tt('فشل رفع الصورة', 'Photo upload failed'));
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name_ar || !formData.grade) {
      toast.error(tt('يرجى ملء الحقول المطلوبة', 'Please fill in required fields'));
      return;
    }
    setLoading(true);
    try {
      const studentId = formData.student_id || `STU-${Date.now().toString(36).toUpperCase()}`;
      const {
        guardian_name_en, guardian_name_ar, guardian_email, guardian_phone,
        guardian_relationship, guardian_national_id, guardian_occupation,
        guardian2_name_ar, guardian2_name_en, guardian2_phone,
        guardian2_relationship, guardian2_national_id,
        ...rest
      } = formData;

      const data = {
        ...rest,
        student_id: studentId,
        branch_id: selectedBranchId || 'all',
        guardian_name_en,
        guardian_name_ar,
        guardian_email,
        guardian_phone,
        guardian_relationship,
        guardian_national_id,
        guardian_occupation,
        guardian2_name_ar,
        guardian2_name_en,
        guardian2_phone,
        guardian2_relationship,
        guardian2_national_id,
      };

      if (student?.id) {
        await tenantQuery('students').update(data).eq('id', student.id);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'Student', entityId: student.id, oldValues: student, newValues: data, page: 'Students' });
        toast.success(tt('تم التحديث بنجاح', 'Student updated successfully'));
      } else {
        const created = await tenantQuery('students').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'Student', entityId: created?.id, newValues: data, page: 'Students' });
        if (data.status === 'active') NotificationHelper.notifyStudentEnrollment(created);
        if (inviteParent && guardian_email && tenantId) {
          try {
            await callApi('/api/parents/invite', {
              guardian_name_en: guardian_name_en || formData.emergency_contact || 'Parent',
              guardian_name_ar,
              guardian_email,
              guardian_phone: guardian_phone || formData.emergency_phone || '',
              guardian_relationship,
              guardian_national_id,
              student_id: created?.id || created?.[0]?.id,
              student_name: formData.name_en || formData.name_ar,
              tenant_id: tenantId,
              school_name: tenant?.name || tenant?.name_en || 'School',
            });
            toast.success(tt('تم إرسال دعوة لولي الأمر', 'Parent invitation sent'));
          } catch (err) {
            console.error('Parent invite failed:', err);
          }
        }
        toast.success(tt('تم إنشاء الطالب بنجاح', 'Student created successfully'));
      }
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving student:', error);
      toast.error(tt('حدث خطأ أثناء الحفظ', 'Error saving student'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {student ? tt('تعديل بيانات الطالب', 'Edit Student') : tt('إضافة طالب جديد', 'Add New Student')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-1">
          {/* Photo */}
          <div className="flex justify-center pb-2">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border-2 border-slate-200">
                {formData.photo_url
                  ? <img src={formData.photo_url} alt="Student" className="w-full h-full object-cover" />
                  : <span className="text-3xl text-slate-400">{formData.name_ar?.[0] || '?'}</span>}
              </div>
              <label className="absolute bottom-0 end-0 w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center cursor-pointer hover:bg-slate-800 transition-colors">
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhoto} />
                {uploadingPhoto ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Upload className="w-4 h-4 text-white" />}
              </label>
            </div>
          </div>

          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-auto">
              <TabsTrigger value="personal" className="text-xs py-2">
                <span className="hidden sm:inline">{tt('الشخصية', 'Personal')}</span>
                <span className="sm:hidden">1</span>
              </TabsTrigger>
              <TabsTrigger value="academic" className="text-xs py-2">
                <span className="hidden sm:inline">{tt('الأكاديمية', 'Academic')}</span>
                <span className="sm:hidden">2</span>
              </TabsTrigger>
              <TabsTrigger value="guardian" className="text-xs py-2">
                <span className="hidden sm:inline">{tt('ولي الأمر', 'Guardian')}</span>
                <span className="sm:hidden">3</span>
              </TabsTrigger>
              <TabsTrigger value="medical" className="text-xs py-2">
                <span className="hidden sm:inline">{tt('الصحة', 'Health')}</span>
                <span className="sm:hidden">4</span>
              </TabsTrigger>
              <TabsTrigger value="docs" className="text-xs py-2">
                <span className="hidden sm:inline">{tt('الوثائق', 'Documents')}</span>
                <span className="sm:hidden">5</span>
              </TabsTrigger>
            </TabsList>

            {/* ── Personal ── */}
            <TabsContent value="personal" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{tt('الاسم بالعربية', 'Name (Arabic)')} *</Label>
                  <Input value={formData.name_ar} onChange={(e) => set('name_ar', e.target.value)} required dir="rtl" />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('الاسم بالإنجليزية', 'Name (English)')}</Label>
                  <Input value={formData.name_en} onChange={(e) => set('name_en', e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('تاريخ الميلاد', 'Date of Birth')}</Label>
                  <Input type="date" value={formData.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('الجنس', 'Gender')}</Label>
                  <Select value={formData.gender} onValueChange={(v) => set('gender', v)}>
                    <SelectTrigger><SelectValue placeholder={tt('اختر', 'Select')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{tt('ذكر', 'Male')}</SelectItem>
                      <SelectItem value="female">{tt('أنثى', 'Female')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('الجنسية', 'Nationality')}</Label>
                  <Input value={formData.nationality} onChange={(e) => set('nationality', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('رقم الهوية الوطنية', 'National ID')}</Label>
                  <Input value={formData.national_id} onChange={(e) => set('national_id', e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('رقم الإقامة', 'Iqama / Residence #')}</Label>
                  <Input value={formData.iqama_number} onChange={(e) => set('iqama_number', e.target.value)} dir="ltr" placeholder={tt('للمقيمين', 'For residents')} />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('رقم جواز السفر', 'Passport Number')}</Label>
                  <Input value={formData.passport_number} onChange={(e) => set('passport_number', e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('مكان الميلاد', 'Place of Birth')}</Label>
                  <Input value={formData.place_of_birth} onChange={(e) => set('place_of_birth', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('الديانة', 'Religion')}</Label>
                  <Select value={formData.religion} onValueChange={(v) => set('religion', v)}>
                    <SelectTrigger><SelectValue placeholder={tt('اختر', 'Select')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="islam">{tt('إسلام', 'Islam')}</SelectItem>
                      <SelectItem value="christianity">{tt('مسيحية', 'Christianity')}</SelectItem>
                      <SelectItem value="other">{tt('أخرى', 'Other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>{tt('العنوان', 'Address')}</Label>
                  <Textarea value={formData.address} onChange={(e) => set('address', e.target.value)} rows={2} />
                </div>
              </div>
            </TabsContent>

            {/* ── Academic ── */}
            <TabsContent value="academic" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{tt('الصف', 'Grade')} *</Label>
                  <Select value={formData.grade} onValueChange={(v) => set('grade', v)} required>
                    <SelectTrigger><SelectValue placeholder={tt('اختر الصف', 'Select grade')} /></SelectTrigger>
                    <SelectContent>
                      {grades.map((g) => (
                        <SelectItem key={g.grade_code} value={g.grade_code}>{isRTL ? g.name_ar : g.name_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('الشعبة', 'Section')}</Label>
                  <Select value={formData.section} onValueChange={(v) => set('section', v)}>
                    <SelectTrigger><SelectValue placeholder={tt('اختر', 'Select')} /></SelectTrigger>
                    <SelectContent>
                      {SECTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('العام الدراسي', 'Academic Year')}</Label>
                  <Select value={formData.academic_year} onValueChange={(v) => set('academic_year', v)}>
                    <SelectTrigger><SelectValue placeholder={tt('اختر العام', 'Select year')} /></SelectTrigger>
                    <SelectContent>
                      {academicYears.map((y) => <SelectItem key={y.id} value={y.year_code}>{y.year_label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('تاريخ التسجيل', 'Enrollment Date')}</Label>
                  <Input type="date" value={formData.enrollment_date} onChange={(e) => set('enrollment_date', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('الحالة', 'Status')}</Label>
                  <Select value={formData.status} onValueChange={(v) => set('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{tt('نشط', 'Active')}</SelectItem>
                      <SelectItem value="inactive">{tt('غير نشط', 'Inactive')}</SelectItem>
                      <SelectItem value="transferred">{tt('محوّل', 'Transferred')}</SelectItem>
                      <SelectItem value="graduated">{tt('متخرج', 'Graduated')}</SelectItem>
                      <SelectItem value="withdrawn">{tt('منسحب', 'Withdrawn')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{tt('الحرم الجامعي / الفرع', 'Campus / Branch')}</Label>
                  <Input value={formData.campus} onChange={(e) => set('campus', e.target.value)} />
                </div>
              </div>

              {/* Billing preferences */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
                <h4 className="font-semibold text-blue-900 text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {tt('تفضيلات الفواتير والرسوم', 'Billing & Fee Preferences')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{tt('هيكل الرسوم', 'Fee Structure')}</Label>
                    <Select value={formData.fee_structure_id || 'none'} onValueChange={(v) => set('fee_structure_id', v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={tt('اختر الهيكل', 'Select structure')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tt('لا يوجد', 'None')}</SelectItem>
                        {feeStructures
                          .filter((f) => !f.grade || !formData.grade || f.grade === formData.grade)
                          .map((f) => (
                            <SelectItem key={f.id} value={f.id}>{isRTL ? f.name_ar : f.name_en || f.name_ar}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('خطة الدفع', 'Payment Plan')}</Label>
                    <Select value={formData.payment_plan_id || 'none'} onValueChange={(v) => set('payment_plan_id', v === 'none' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder={tt('اختر الخطة', 'Select plan')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tt('لا يوجد', 'None')}</SelectItem>
                        {paymentPlans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{isRTL ? p.name_ar : p.name_en || p.name_ar}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>{tt('ملاحظات الدفع', 'Payment Notes')}</Label>
                    <Textarea value={formData.payment_notes} onChange={(e) => set('payment_notes', e.target.value)} rows={2} placeholder={tt('أي ملاحظات خاصة بالدفع أو الرسوم', 'Any special billing or discount notes')} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Guardian ── */}
            <TabsContent value="guardian" className="space-y-4 pt-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                  <UserPlus className="w-4 h-4 text-blue-500" />
                  {tt('ولي الأمر الأول', 'Primary Guardian')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{tt('الاسم بالعربية', 'Name (Arabic)')}</Label>
                    <Input value={formData.guardian_name_ar} onChange={(e) => set('guardian_name_ar', e.target.value)} dir="rtl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('الاسم بالإنجليزية', 'Name (English)')}</Label>
                    <Input value={formData.guardian_name_en} onChange={(e) => set('guardian_name_en', e.target.value)} dir="ltr" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('البريد الإلكتروني', 'Email')}</Label>
                    <Input type="email" value={formData.guardian_email} onChange={(e) => set('guardian_email', e.target.value)} dir="ltr" placeholder="parent@example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('الهاتف', 'Phone')}</Label>
                    <Input type="tel" value={formData.guardian_phone} onChange={(e) => set('guardian_phone', e.target.value)} dir="ltr" placeholder="+966 5XX XXX XXXX" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('صلة القرابة', 'Relationship')}</Label>
                    <Select value={formData.guardian_relationship} onValueChange={(v) => set('guardian_relationship', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="father">{tt('أب', 'Father')}</SelectItem>
                        <SelectItem value="mother">{tt('أم', 'Mother')}</SelectItem>
                        <SelectItem value="guardian">{tt('ولي أمر', 'Legal Guardian')}</SelectItem>
                        <SelectItem value="other">{tt('أخرى', 'Other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('رقم هوية ولي الأمر', 'Guardian National ID')}</Label>
                    <Input value={formData.guardian_national_id} onChange={(e) => set('guardian_national_id', e.target.value)} dir="ltr" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>{tt('المهنة', 'Occupation')}</Label>
                    <Input value={formData.guardian_occupation} onChange={(e) => set('guardian_occupation', e.target.value)} />
                  </div>
                </div>

                {!student && formData.guardian_email && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <Checkbox id="invite-parent" checked={inviteParent} onCheckedChange={(v) => setInviteParent(!!v)} />
                    <label htmlFor="invite-parent" className="text-sm text-emerald-800 cursor-pointer">
                      {tt('إرسال دعوة تلقائية لولي الأمر للوصول إلى بوابة ولي الأمر', 'Automatically invite guardian to the Parent Portal')}
                    </label>
                  </div>
                )}
              </div>

              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
                  <UserPlus className="w-4 h-4 text-purple-500" />
                  {tt('ولي الأمر الثاني (اختياري)', 'Secondary Guardian (Optional)')}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{tt('الاسم بالعربية', 'Name (Arabic)')}</Label>
                    <Input value={formData.guardian2_name_ar} onChange={(e) => set('guardian2_name_ar', e.target.value)} dir="rtl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('الاسم بالإنجليزية', 'Name (English)')}</Label>
                    <Input value={formData.guardian2_name_en} onChange={(e) => set('guardian2_name_en', e.target.value)} dir="ltr" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('الهاتف', 'Phone')}</Label>
                    <Input type="tel" value={formData.guardian2_phone} onChange={(e) => set('guardian2_phone', e.target.value)} dir="ltr" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('صلة القرابة', 'Relationship')}</Label>
                    <Select value={formData.guardian2_relationship} onValueChange={(v) => set('guardian2_relationship', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="father">{tt('أب', 'Father')}</SelectItem>
                        <SelectItem value="mother">{tt('أم', 'Mother')}</SelectItem>
                        <SelectItem value="guardian">{tt('ولي أمر', 'Guardian')}</SelectItem>
                        <SelectItem value="other">{tt('أخرى', 'Other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>{tt('رقم هوية ولي الأمر الثاني', 'Guardian 2 National ID')}</Label>
                    <Input value={formData.guardian2_national_id} onChange={(e) => set('guardian2_national_id', e.target.value)} dir="ltr" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h4 className="font-semibold text-slate-800 text-sm">{tt('اتصال الطوارئ', 'Emergency Contact')}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{tt('الاسم', 'Name')}</Label>
                    <Input value={formData.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{tt('الهاتف', 'Phone')}</Label>
                    <Input type="tel" value={formData.emergency_phone} onChange={(e) => set('emergency_phone', e.target.value)} dir="ltr" />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Medical ── */}
            <TabsContent value="medical" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{tt('فصيلة الدم', 'Blood Type')}</Label>
                  <Select value={formData.blood_type} onValueChange={(v) => set('blood_type', v)}>
                    <SelectTrigger><SelectValue placeholder={tt('اختر', 'Select')} /></SelectTrigger>
                    <SelectContent>
                      {BLOOD_TYPES.map((bt) => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>{tt('الحساسية', 'Allergies')}</Label>
                  <Textarea value={formData.allergies} onChange={(e) => set('allergies', e.target.value)} rows={2} placeholder={tt('اذكر أي حساسية معروفة', 'List any known allergies')} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>{tt('الأمراض المزمنة', 'Chronic Conditions')}</Label>
                  <Textarea value={formData.chronic_conditions} onChange={(e) => set('chronic_conditions', e.target.value)} rows={2} placeholder={tt('مثل: السكري، الربو', 'e.g. Diabetes, Asthma')} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>{tt('الأدوية الدائمة', 'Medications')}</Label>
                  <Textarea value={formData.medications} onChange={(e) => set('medications', e.target.value)} rows={2} placeholder={tt('الاسم، الجرعة، التوقيت', 'Name, dosage, timing')} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>{tt('ملاحظات طبية إضافية', 'Additional Medical Notes')}</Label>
                  <Textarea value={formData.medical_notes} onChange={(e) => set('medical_notes', e.target.value)} rows={2} />
                </div>
              </div>
            </TabsContent>

            {/* ── Documents ── */}
            <TabsContent value="docs" className="space-y-5 pt-4">
              <p className="text-xs text-slate-500">{tt('ارفع صور أو ملفات PDF للوثائق الرسمية. كل الملفات مشفرة ومخزنة بأمان.', 'Upload photos or PDFs of official documents. All files are encrypted and stored securely.')}</p>
              <div className="grid grid-cols-1 gap-4">
                <DocUploadField
                  label={tt('صورة شخصية (رسمية)', 'Student Photo (Official)')}
                  value={formData.photo_url}
                  onChange={(v) => set('photo_url', v)}
                  isRTL={isRTL}
                />
                <DocUploadField
                  label={tt('شهادة الميلاد', 'Birth Certificate')}
                  value={formData.doc_birth_cert_url}
                  onChange={(v) => set('doc_birth_cert_url', v)}
                  isRTL={isRTL}
                />
                <DocUploadField
                  label={tt('بطاقة هوية الطالب / الإقامة', 'Student National ID / Iqama')}
                  value={formData.doc_student_id_url}
                  onChange={(v) => set('doc_student_id_url', v)}
                  isRTL={isRTL}
                />
                <DocUploadField
                  label={tt('هوية ولي الأمر', 'Guardian ID')}
                  value={formData.doc_guardian_id_url}
                  onChange={(v) => set('doc_guardian_id_url', v)}
                  isRTL={isRTL}
                />
                <DocUploadField
                  label={tt('وثيقة النقل (إن وجدت)', 'Transfer Document (if applicable)')}
                  value={formData.doc_transfer_url}
                  onChange={(v) => set('doc_transfer_url', v)}
                  isRTL={isRTL}
                />
                <DocUploadField
                  label={tt('وثيقة أخرى', 'Other Document')}
                  value={formData.doc_other_url}
                  onChange={(v) => set('doc_other_url', v)}
                  isRTL={isRTL}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <Button type="button" variant="outline" onClick={onClose}>{t('cancel')}</Button>
            <Button type="submit" disabled={loading} className="bg-slate-900 hover:bg-slate-800 gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
