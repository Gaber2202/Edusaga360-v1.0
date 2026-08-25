import Currency from '../components/Currency';
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callApi } from '../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Upload, CheckCircle, School, FileText, Users, DollarSign, AlertTriangle, Camera } from 'lucide-react';
import { isFieldVisible, resolveVisibleFields } from '../lib/intakeFormFields';

const REQUIRED_DOCUMENT_TYPES = [
  { code: 'national_id',       label_ar: 'هوية وطنية / إقامة',       label_en: 'National ID / Iqama' },
  { code: 'birth_certificate',  label_ar: 'شهادة الميلاد',            label_en: 'Birth Certificate' },
  { code: 'vaccination_record', label_ar: 'سجل التطعيمات',            label_en: 'Vaccination Record' },
  { code: 'school_report',      label_ar: 'كشف درجات المدرسة السابقة', label_en: 'Prior School Report' },
  { code: 'photo',              label_ar: 'صورة شخصية',               label_en: 'Student Photo' },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function uploadIntakeFile(file, linkCode) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const data_base64 = btoa(binary);
  const res = await fetch(`${API_BASE}/api/public/intake/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-intake-link-code': linkCode,
    },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type,
      data_base64,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Upload failed');
  }
  return res.json();
}

export default function ParentIntake() {
  const [language, setLanguage] = useState('ar');
  const isRTL = language === 'ar';
  const [linkCode, setLinkCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  const [formData, setFormData] = useState({
    guardian_name_ar: '',
    guardian_name_en: '',
    guardian_national_id: '',
    guardian_phone: '',
    guardian_whatsapp: '',
    guardian_email: '',
    guardian_relationship: 'father',
    address: '',
    student_name_ar: '',
    student_name_en: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    national_id: '',
    academic_year: '',
    applying_for_grade: '',
    previous_school: '',
    has_special_needs: false,
    special_care_notes: '',
    documents: []
  });

  const [calculatedFees, setCalculatedFees] = useState({
    breakdown: {},
    total: 0,
    tuition: 0,
    specialCare: 0
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) setLinkCode(code);
  }, []);

  const { data: intakeContext, isLoading: linkLoading, isError: linkError } = useQuery({
    queryKey: ['publicIntake', linkCode],
    queryFn: () => callApi(`/api/public/intake/by-code/${encodeURIComponent(linkCode)}`, null, { method: 'GET' }),
    enabled: !!linkCode,
    retry: 1,
  });

  const intakeLink = intakeContext?.link || null;
  const school = intakeContext?.school || null;
  const visible = resolveVisibleFields(intakeContext?.visible_fields);
  const feeStructures = intakeContext?.fee_structures || [];
  const requiredDocs = intakeContext?.required_documents || REQUIRED_DOCUMENT_TYPES;
  const show = (key) => isFieldVisible(visible, key);

  useEffect(() => {
    if (intakeLink?.academic_year && !formData.academic_year) {
      setFormData((prev) => ({ ...prev, academic_year: intakeLink.academic_year }));
    }
  }, [intakeLink?.academic_year]);

  useEffect(() => {
    if (formData.academic_year && formData.applying_for_grade && intakeLink?.branch_id) {
      const applicableFees = feeStructures.filter(f =>
        f.academic_year === formData.academic_year &&
        f.grade === formData.applying_for_grade &&
        f.branch_id === intakeLink.branch_id &&
        f.display_in_intake === true
      );
      const breakdown = {};
      applicableFees.forEach(fee => {
        breakdown[fee.fee_type_code] = {
          name_ar: fee.fee_type_name_ar,
          name_en: fee.fee_type_name_en,
          amount: fee.amount
        };
      });
      const totalAmount = applicableFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
      setCalculatedFees({
        breakdown,
        total: totalAmount,
        tuition: applicableFees.find(f => f.fee_type_code === 'TUITION_FEE')?.amount || 0,
        specialCare: 0
      });
    }
  }, [formData.academic_year, formData.applying_for_grade, feeStructures, intakeLink]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!termsAccepted) {
      toast.error(isRTL ? 'يرجى الموافقة على الشروط والأحكام' : 'Please accept Terms & Conditions');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        link_code: linkCode,
        intake_link_id: intakeLink.id,
        branch_id: intakeLink.branch_id,
        ...formData,
        guardian_phone: formData.guardian_phone || formData.guardian_whatsapp,
        guardian_whatsapp: formData.guardian_whatsapp || formData.guardian_phone,
        total_estimated_fees: calculatedFees.total,
        required_document_codes: requiredDocs.map(d => d.code),
      };
      const result = await callApi('/api/public/intake/submit', payload);
      setSubmissionResult(result);
      setSubmitted(true);
      toast.success(isRTL ? 'تم إرسال الطلب بنجاح' : 'Application submitted successfully');
    } catch (error) {
      console.error('Error:', error);
      if (error?.body?.error === 'duplicate') {
        toast.error(isRTL
          ? 'يوجد طلب بنفس رقم الهوية لهذا العام الدراسي'
          : 'An application with this national ID already exists for this year');
      } else {
        toast.error(error?.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDocUpload = async (file, docCode) => {
    try {
      const result = await uploadIntakeFile(file, linkCode);
      const newDoc = {
        name: file.name,
        url: result.signedUrl || result.path,
        path: result.path,
        type: file.type,
        doc_code: docCode,
        uploaded_date: new Date().toISOString()
      };
      setFormData(prev => ({
        ...prev,
        documents: [...prev.documents.filter(d => d.doc_code !== docCode), newDoc]
      }));
      toast.success(isRTL ? 'تم رفع الملف' : 'File uploaded');
    } catch (_error) {
      toast.error(_error?.message || (isRTL ? 'فشل رفع الملف' : 'Upload failed'));
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    const uploadedDocs = [];
    for (const file of files) {
      try {
        const result = await uploadIntakeFile(file, linkCode);
        uploadedDocs.push({
          name: file.name,
          url: result.signedUrl || result.path,
          path: result.path,
          type: file.type,
          doc_code: 'other',
          uploaded_date: new Date().toISOString()
        });
      } catch (_error) {
        toast.error(`${isRTL ? 'فشل رفع' : 'Failed to upload'} ${file.name}`);
      }
    }
    setFormData({
      ...formData,
      documents: [...formData.documents, ...uploadedDocs]
    });
  };

  const grades = ['KG1', 'KG2', 'KG3', 'Grade1', 'Grade2', 'Grade3', 'Grade4', 'Grade5', 'Grade6', 'Grade7', 'Grade8', 'Grade9', 'Grade10', 'Grade11', 'Grade12'];

  if (!linkCode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-najdi-50 to-sand flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <School className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{isRTL ? 'رابط غير صالح' : 'Invalid link'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (linkLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-najdi-50 to-sand flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-najdi-700 mb-4" />
            <p className="text-muted-foreground">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (linkError || !intakeLink) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-najdi-50 to-sand flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <School className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{isRTL ? 'الرابط غير صالح أو منتهٍ' : 'Link invalid or expired'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    const hasMissing = submissionResult?.missing_documents?.length > 0;
    const isPending = submissionResult?.document_status === 'pending_physical_verification';
    return (
      <div className="min-h-screen bg-gradient-to-br from-najdi-50 to-sand flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="max-w-lg">
          <CardContent className="pt-8 pb-8 text-center">
            {isPending ? (
              <AlertTriangle className="w-20 h-20 text-amber-500 mx-auto mb-6" />
            ) : (
              <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />
            )}
            <h2 className="text-2xl font-bold text-ink mb-4">
              {isRTL ? 'تم إرسال الطلب بنجاح!' : 'Application Submitted Successfully!'}
            </h2>
            {isPending ? (
              <>
                <p className="text-muted-foreground mb-4">
                  {isRTL 
                    ? 'تم إنشاء سجل الطالب. بعض المستندات المطلوبة ناقصة.'
                    : 'Student record created. Some required documents are missing.'}
                </p>
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-start mb-4">
                  <p className="font-semibold text-amber-800 mb-2">
                    {isRTL ? 'المستندات الناقصة:' : 'Missing Documents:'}
                  </p>
                  <ul className="space-y-1">
                    {submissionResult.missing_documents.map(code => {
                      const docType = REQUIRED_DOCUMENT_TYPES.find(d => d.code === code);
                      return (
                        <li key={code} className="text-sm text-amber-700 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full flex-shrink-0" />
                          {isRTL ? docType?.label_ar || code : docType?.label_en || code}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="bg-najdi-50 p-4 rounded-lg text-sm text-ink">
                  {isRTL 
                    ? 'يرجى زيارة المدرسة شخصياً لتقديم المستندات الناقصة. سيتم التواصل معكم لتحديد موعد.'
                    : 'Please visit the school in person to submit the missing documents. You will be contacted to schedule a visit.'}
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-6">
                  {isRTL 
                    ? 'شكراً لك! جميع المستندات مكتملة. سيتم التواصل معك قريباً من فريق القبول.'
                    : 'Thank you! All documents are complete. The admissions team will contact you soon.'}
                </p>
                <div className="bg-najdi-50 p-4 rounded-lg text-sm text-ink">
                  {isRTL 
                    ? 'يرجى الاحتفاظ برقم الطلب للمتابعة'
                    : 'Please keep your application number for reference'}
                </div>
              </>
            )}
            {submissionResult?.application?.application_number && (
              <div className="mt-4 bg-white border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{isRTL ? 'رقم الطلب' : 'Application Number'}</p>
                <p className="text-lg font-mono font-bold text-najdi-900">{submissionResult.application.application_number}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-najdi-50 to-sand p-4 lg:p-8" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        * { font-family: ${isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Inter', sans-serif"}; }
      `}</style>

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src={school?.logo_url || '/edusaga-logo.svg'} 
              alt={school?.name_en || school?.name_ar || 'School'} 
              className="h-16 object-contain"
            />
            {(school?.name_en || school?.name_ar) && (
              <p className="text-sm font-semibold text-ink">
                {isRTL ? (school.name_ar || school.name_en) : (school.name_en || school.name_ar)}
              </p>
            )}
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">
            {isRTL ? 'طلب قبول طالب جديد' : 'New Student Admission Application'}
          </h1>
          <p className="text-muted-foreground">
            {isRTL ? (intakeLink.name_ar || intakeLink.name_en) : (intakeLink.name_en || intakeLink.name_ar)}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')} className="mt-2">
            {language === 'ar' ? 'English' : 'عربي'}
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Guardian Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {isRTL ? 'بيانات ولي الأمر' : 'Parent / Guardian Information'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {show('guardian_name_ar') && (
                <div>
                  <Label>{isRTL ? 'الاسم الكامل (عربي)' : 'Full Name (Arabic)'} *</Label>
                  <Input required value={formData.guardian_name_ar} onChange={(e) => setFormData({...formData, guardian_name_ar: e.target.value})} />
                </div>
                )}
                {show('guardian_name_en') && (
                <div>
                  <Label>{isRTL ? 'الاسم الكامل (إنجليزي)' : 'Full Name (English)'} *</Label>
                  <Input required value={formData.guardian_name_en} onChange={(e) => setFormData({...formData, guardian_name_en: e.target.value})} />
                </div>
                )}
                {show('guardian_phone') && (
                <div>
                  <Label>{isRTL ? 'رقم الجوال' : 'Phone Number'}</Label>
                  <Input type="tel" value={formData.guardian_phone} onChange={(e) => setFormData({...formData, guardian_phone: e.target.value})} dir="ltr" />
                </div>
                )}
                {show('guardian_whatsapp') && (
                <div>
                  <Label>{isRTL ? 'واتساب' : 'WhatsApp'} *</Label>
                  <Input required type="tel" value={formData.guardian_whatsapp} onChange={(e) => setFormData({...formData, guardian_whatsapp: e.target.value})} dir="ltr" />
                </div>
                )}
                {show('guardian_email') && (
                <div>
                  <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'} *</Label>
                  <Input required type="email" value={formData.guardian_email} onChange={(e) => setFormData({...formData, guardian_email: e.target.value})} dir="ltr" />
                </div>
                )}
                <div>
                  <Label>{isRTL ? 'رقم الهوية / الإقامة' : 'National ID / Iqama'}</Label>
                  <Input value={formData.guardian_national_id} onChange={(e) => setFormData({...formData, guardian_national_id: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'صلة القرابة' : 'Relationship'}</Label>
                  <Select value={formData.guardian_relationship} onValueChange={(v) => setFormData({...formData, guardian_relationship: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="father">{isRTL ? 'الأب' : 'Father'}</SelectItem>
                      <SelectItem value="mother">{isRTL ? 'الأم' : 'Mother'}</SelectItem>
                      <SelectItem value="guardian">{isRTL ? 'ولي أمر' : 'Guardian'}</SelectItem>
                      <SelectItem value="other">{isRTL ? 'أخرى' : 'Other'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{isRTL ? 'العنوان' : 'Address'}</Label>
                <Textarea value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} rows={2} />
              </div>
            </CardContent>
          </Card>

          {/* Student Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <School className="w-5 h-5" />
                {isRTL ? 'بيانات الطالب' : 'Student Information'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{isRTL ? 'اسم الطالب (عربي)' : 'Student Name (Arabic)'} *</Label>
                  <Input required value={formData.student_name_ar} onChange={(e) => setFormData({...formData, student_name_ar: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'اسم الطالب (إنجليزي)' : 'Student Name (English)'}</Label>
                  <Input value={formData.student_name_en} onChange={(e) => setFormData({...formData, student_name_en: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'تاريخ الميلاد' : 'Date of Birth'} *</Label>
                  <Input required type="date" value={formData.date_of_birth} onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'الجنس' : 'Gender'} *</Label>
                  <Select required value={formData.gender} onValueChange={(v) => setFormData({...formData, gender: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder={isRTL ? 'اختر' : 'Select'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{isRTL ? 'ذكر' : 'Male'}</SelectItem>
                      <SelectItem value="female">{isRTL ? 'أنثى' : 'Female'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isRTL ? 'الجنسية' : 'Nationality'}</Label>
                  <Input value={formData.nationality} onChange={(e) => setFormData({...formData, nationality: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'رقم الهوية / الإقامة' : 'National ID / Iqama'}</Label>
                  <Input value={formData.national_id} onChange={(e) => setFormData({...formData, national_id: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'} *</Label>
                  <Input
                    required
                    value={formData.academic_year}
                    onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
                    placeholder={intakeLink.academic_year || ''}
                  />
                </div>
                <div>
                  <Label>{isRTL ? 'الصف المطلوب' : 'Applying for Grade'} *</Label>
                  <Select required value={formData.applying_for_grade} onValueChange={(v) => setFormData({...formData, applying_for_grade: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select Grade'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(intakeLink.allowed_grades) && intakeLink.allowed_grades.length > 0
                        ? intakeLink.allowed_grades
                        : grades
                      ).map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Special Needs */}
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center gap-3 mb-3">
                  <Checkbox 
                    checked={formData.has_special_needs} 
                    onCheckedChange={(checked) => setFormData({...formData, has_special_needs: checked})}
                  />
                  <Label className="cursor-pointer">
                    {isRTL ? 'الطالب/ة لديه احتياجات خاصة' : 'Student has Special Needs'}
                  </Label>
                </div>
                {formData.has_special_needs && (
                  <div>
                    <Label>{isRTL ? 'ملاحظات الرعاية الخاصة' : 'Special Care Notes'}</Label>
                    <Textarea 
                      value={formData.special_care_notes} 
                      onChange={(e) => setFormData({...formData, special_care_notes: e.target.value})} 
                      rows={3}
                      placeholder={isRTL ? 'يرجى توضيح نوع الاحتياجات الخاصة' : 'Please specify the type of special needs'}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fee Breakdown */}
          {formData.academic_year && formData.applying_for_grade && (
            <Card className="border-2 border-najdi-100 bg-najdi-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-najdi-900">
                  <DollarSign className="w-5 h-5" />
                  {isRTL ? 'الرسوم الدراسية المتوقعة' : 'Estimated Tuition Fees'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {calculatedFees.breakdown && Object.entries(calculatedFees.breakdown).map(([code, fee]) => (
                  <div key={code} className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">{isRTL ? fee.name_ar : fee.name_en}</span>
                    <span className="text-lg font-bold"><Currency amount={fee.amount} /></span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 bg-white rounded-lg px-4 mt-3">
                  <span className="font-bold text-lg">{isRTL ? 'الإجمالي التقديري' : 'Total Estimated'}</span>
                  <span className="text-2xl font-bold text-najdi-900"><Currency amount={calculatedFees.total} /></span>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {isRTL 
                    ? 'الرسوم تقديرية وقد تتغير حسب الخدمات المضافة'
                    : 'Fees are estimated and may vary based on additional services'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Required Documents Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {isRTL ? 'المستندات المطلوبة' : 'Required Documents'}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {isRTL 
                  ? 'يرجى رفع المستندات التالية. يمكنك التصوير مباشرة من الجوال أو رفع ملف PDF.'
                  : 'Please upload the following documents. You can take a photo from your phone or upload a PDF.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredDocs.map(docType => {
                const uploaded = formData.documents.find(d => d.doc_code === docType.code);
                return (
                  <div key={docType.code} className={`flex items-center gap-3 p-3 rounded-lg border ${uploaded ? 'border-green-200 bg-green-50' : 'border-border bg-sand'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {isRTL ? docType.label_ar : docType.label_en}
                      </p>
                      {uploaded && (
                        <p className="text-xs text-green-700 truncate">{uploaded.name}</p>
                      )}
                    </div>
                    {uploaded ? (
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <Label htmlFor={`doc-${docType.code}`} className="cursor-pointer flex-shrink-0">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-md text-xs font-medium text-najdi-700 hover:bg-najdi-50 transition-colors">
                          <Camera className="w-3.5 h-3.5" />
                          {isRTL ? 'رفع' : 'Upload'}
                        </div>
                        <Input
                          id={`doc-${docType.code}`}
                          type="file"
                          accept="image/*,application/pdf"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleDocUpload(file, docType.code);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </Label>
                    )}
                  </div>
                );
              })}

              {/* Additional documents */}
              <div className="border-t pt-3 mt-3">
                <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                  <Label htmlFor="file-upload-extra" className="cursor-pointer text-sm text-najdi-700 hover:text-najdi-900">
                    {isRTL ? 'مستندات إضافية (اختياري)' : 'Additional Documents (Optional)'}
                  </Label>
                  <Input id="file-upload-extra" type="file" multiple onChange={handleFileUpload} className="hidden" />
                </div>
              </div>

              {/* Show extra uploaded docs */}
              {formData.documents.filter(d => d.doc_code === 'other').length > 0 && (
                <div className="space-y-1">
                  {formData.documents.filter(d => d.doc_code === 'other').map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-sand p-2 rounded text-sm">
                      <span>{doc.name}</span>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                  ))}
                </div>
              )}

              {/* Completion summary */}
              {(() => {
                const requiredDocs = intakeLink.required_documents || REQUIRED_DOCUMENT_TYPES;
                const uploadedCount = requiredDocs.filter(d => formData.documents.some(ud => ud.doc_code === d.code)).length;
                return (
                  <div className={`flex items-center gap-2 p-2 rounded-lg text-sm ${uploadedCount === requiredDocs.length ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    {uploadedCount === requiredDocs.length ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    <span>
                      {isRTL 
                        ? `${uploadedCount} من ${requiredDocs.length} مستندات مرفوعة`
                        : `${uploadedCount} of ${requiredDocs.length} documents uploaded`}
                    </span>
                    {uploadedCount < requiredDocs.length && (
                      <Badge variant="outline" className="ms-auto text-xs">
                        {isRTL ? 'يمكنك إكمالها لاحقاً في المدرسة' : 'Can be completed on-site'}
                      </Badge>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Terms & Conditions */}
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'الشروط والأحكام' : 'Terms & Conditions'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <Checkbox
                  checked={termsAccepted}
                  onCheckedChange={setTermsAccepted}
                  className="mt-1"
                />
                <Label className="cursor-pointer text-sm leading-relaxed">
                  {isRTL
                    ? 'أوافق على الشروط والأحكام ورسوم الدراسة والسياسات المالية للمدرسة'
                    : "I agree to the school's Terms & Conditions, tuition fees, and financial policies"}
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-center pt-4">
            <Button 
              type="submit" 
              size="lg" 
              disabled={submitting || !termsAccepted}
              className="px-12 bg-najdi-700 hover:bg-najdi-900"
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin me-2" />}
              {isRTL ? 'إرسال الطلب' : 'Submit Application'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}