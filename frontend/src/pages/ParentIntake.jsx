import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { sanitizeHtml } from '../lib/sanitize';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Upload, CheckCircle, School, FileText, Users, DollarSign } from 'lucide-react';

export default function ParentIntake() {
  const [language, setLanguage] = useState('ar');
  const isRTL = language === 'ar';
  const [linkCode, setLinkCode] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  
  const [formData, setFormData] = useState({
    guardian_name_ar: '',
    guardian_name_en: '',
    guardian_national_id: '',
    guardian_phone: '',
    guardian_email: '',
    guardian_relationship: 'father',
    address: '',
    student_name_ar: '',
    student_name_en: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    academic_year: '',
    applying_for_grade: '',
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

  const { data: intakeLink } = useQuery({
    queryKey: ['intakeLink', linkCode],
    queryFn: () => fetchData(tenantQuery('parent_intake_links').select('*').match({ link_code: linkCode, is_active: true })),
    enabled: !!linkCode,
    select: (data) => data[0]
  });

  const { data: _branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match({ is_active: true })),
  });

  const { data: academicYears = [] } = useQuery({
    queryKey: ['academicYears'],
    queryFn: () => fetchData(tenantQuery('academic_years').select('*').match({ is_active: true })),
  });

  const { data: feeStructures = [] } = useQuery({
    queryKey: ['feeStructures'],
    queryFn: () => fetchData(tenantQuery('fee_structures').select('*').match({ is_active: true })),
  });

  const { data: specialCareFees = [] } = useQuery({
    queryKey: ['specialCareFees'],
    queryFn: () => fetchData(tenantQuery('special_care_fees').select('*').match({ is_active: true })),
  });

  const { data: currentTC } = useQuery({
    queryKey: ['currentTC'],
    queryFn: () => fetchData(tenantQuery('tc_versions').select('*').match({ is_current: true, applies_to: 'admissions' })),
    select: (data) => data[0]
  });

  useEffect(() => {
    if (formData.academic_year && formData.applying_for_grade && intakeLink?.branch_id) {
      // Get all fee types for this grade/year/branch
      const applicableFees = feeStructures.filter(f => 
        f.academic_year === formData.academic_year &&
        f.grade === formData.applying_for_grade &&
        f.branch_id === intakeLink.branch_id &&
        f.display_in_intake === true
      );

      const specialCareFee = specialCareFees.find(f =>
        f.academic_year === formData.academic_year &&
        f.grade === formData.applying_for_grade &&
        f.branch_id === intakeLink.branch_id
      );

      // Calculate breakdown
      const breakdown = {};
      applicableFees.forEach(fee => {
        breakdown[fee.fee_type_code] = {
          name_ar: fee.fee_type_name_ar,
          name_en: fee.fee_type_name_en,
          amount: fee.amount
        };
      });

      let totalAmount = applicableFees.reduce((sum, fee) => sum + (fee.amount || 0), 0);
      let specialCareAmount = 0;

      if (formData.has_special_needs && specialCareFee) {
        if (specialCareFee.fee_calculation_type === 'fixed') {
          specialCareAmount = specialCareFee.fixed_amount || 0;
        } else {
          const tuitionFee = applicableFees.find(f => f.fee_type_code === 'TUITION_FEE');
          const tuitionAmount = tuitionFee?.amount || 0;
          specialCareAmount = (tuitionAmount * (specialCareFee.percentage || 0)) / 100;
        }
        breakdown['SPECIAL_CARE'] = {
          name_ar: 'رسوم الرعاية الخاصة',
          name_en: 'Special Care Fee',
          amount: specialCareAmount
        };
        totalAmount += specialCareAmount;
      }

      setCalculatedFees({
        breakdown,
        total: totalAmount,
        // Keep legacy fields for compatibility
        tuition: applicableFees.find(f => f.fee_type_code === 'TUITION_FEE')?.amount || 0,
        specialCare: specialCareAmount
      });
    }
  }, [formData.academic_year, formData.applying_for_grade, formData.has_special_needs, feeStructures, specialCareFees, intakeLink]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!termsAccepted) {
      toast.error(isRTL ? 'يرجى الموافقة على الشروط والأحكام' : 'Please accept Terms & Conditions');
      return;
    }

    setSubmitting(true);
    try {
      const applicationNumber = `APP-${Date.now()}`;
      
      const applicationData = {
        application_number: applicationNumber,
        branch_id: intakeLink.branch_id,
        ...formData,
        tuition_fee_snapshot: calculatedFees.tuition,
        special_care_fee_snapshot: calculatedFees.specialCare,
        total_estimated_fees: calculatedFees.total,
        source: 'parent_intake',
        intake_link_id: intakeLink.id,
        tc_version_accepted: currentTC?.version_code,
        tc_accepted_date: new Date().toISOString(),
        tc_acceptance_ip: 'recorded',
        status: 'submitted',
        pipeline_stage: 'new'
      };

      await tenantQuery('applications').insert(applicationData);

      // Update link submission count
      await tenantQuery('parent_intake_links').update({
        submission_count: (intakeLink.submission_count || 0) + 1
      });

      setSubmitted(true);
      toast.success(isRTL ? 'تم إرسال الطلب بنجاح' : 'Application submitted successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    const uploadedDocs = [];

    for (const file of files) {
      try {
        const { file_url } = await callApi('/api/files/upload', { file });
        uploadedDocs.push({
          name: file.name,
          url: file_url,
          type: file.type,
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

  if (!intakeLink) {
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

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-najdi-50 to-sand flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="max-w-lg">
          <CardContent className="pt-8 pb-8 text-center">
            <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-ink mb-4">
              {isRTL ? 'تم إرسال الطلب بنجاح!' : 'Application Submitted Successfully!'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {isRTL 
                ? 'شكراً لك! سيتم التواصل معك قريباً من فريق القبول.'
                : 'Thank you! The admissions team will contact you soon.'}
            </p>
            <div className="bg-najdi-50 p-4 rounded-lg text-sm text-ink">
              {isRTL 
                ? 'يرجى الاحتفاظ برقم الطلب للمتابعة'
                : 'Please keep your application number for reference'}
            </div>
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
              src="/edusaga-logo.svg" 
              alt="EduSaga" 
              className="h-16"
            />
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
                <div>
                  <Label>{isRTL ? 'الاسم الكامل (عربي)' : 'Full Name (Arabic)'} *</Label>
                  <Input required value={formData.guardian_name_ar} onChange={(e) => setFormData({...formData, guardian_name_ar: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'الاسم الكامل (إنجليزي)' : 'Full Name (English)'}</Label>
                  <Input value={formData.guardian_name_en} onChange={(e) => setFormData({...formData, guardian_name_en: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'رقم الجوال' : 'Phone Number'} *</Label>
                  <Input required type="tel" value={formData.guardian_phone} onChange={(e) => setFormData({...formData, guardian_phone: e.target.value})} />
                </div>
                <div>
                  <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'}</Label>
                  <Input type="email" value={formData.guardian_email} onChange={(e) => setFormData({...formData, guardian_email: e.target.value})} />
                </div>
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
                  <Label>{isRTL ? 'العام الدراسي' : 'Academic Year'} *</Label>
                  <Select required value={formData.academic_year} onValueChange={(v) => setFormData({...formData, academic_year: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder={isRTL ? 'اختر العام' : 'Select Year'} />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map(year => (
                        <SelectItem key={year.id} value={year.name}>
                          {isRTL ? year.name_ar || year.name : year.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isRTL ? 'الصف المطلوب' : 'Applying for Grade'} *</Label>
                  <Select required value={formData.applying_for_grade} onValueChange={(v) => setFormData({...formData, applying_for_grade: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder={isRTL ? 'اختر الصف' : 'Select Grade'} />
                    </SelectTrigger>
                    <SelectContent>
                      {grades.map(g => (
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
                    <span className="text-lg font-bold">{fee.amount.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-3 bg-white rounded-lg px-4 mt-3">
                  <span className="font-bold text-lg">{isRTL ? 'الإجمالي التقديري' : 'Total Estimated'}</span>
                  <span className="text-2xl font-bold text-najdi-900">{calculatedFees.total.toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {isRTL 
                    ? 'الرسوم تقديرية وقد تتغير حسب الخدمات المضافة'
                    : 'Fees are estimated and may vary based on additional services'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Documents Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {isRTL ? 'المستندات (اختياري)' : 'Documents (Optional)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <Label htmlFor="file-upload" className="cursor-pointer text-najdi-700 hover:text-najdi-900">
                  {isRTL ? 'رفع المستندات' : 'Upload Documents'}
                </Label>
                <Input id="file-upload" type="file" multiple onChange={handleFileUpload} className="hidden" />
                <p className="text-xs text-muted-foreground mt-2">
                  {isRTL ? 'شهادة الميلاد، التقارير الطبية، السجلات الدراسية' : 'Birth certificate, medical reports, school records'}
                </p>
              </div>
              {formData.documents.length > 0 && (
                <div className="mt-4 space-y-2">
                  {formData.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-sand p-2 rounded">
                      <span className="text-sm">{doc.name}</span>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Terms & Conditions */}
          {currentTC && (
            <Card>
              <CardHeader>
                <CardTitle>{isRTL ? 'الشروط والأحكام' : 'Terms & Conditions'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-sand p-4 rounded-lg max-h-48 overflow-y-auto mb-4 text-sm">
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(isRTL ? currentTC.content_ar : currentTC.content_en) }} />
                </div>
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
          )}

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