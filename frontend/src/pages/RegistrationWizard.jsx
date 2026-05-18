import React, { useState } from 'react';
import { submitTenantRequest } from '../api/tenantRequest';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  CheckCircle, ChevronRight, ChevronLeft,
  Loader2, Globe, Phone, Mail, User, Briefcase, School, Settings, FileText, Edit2
} from 'lucide-react';

const SAUDI_REGIONS = [
  { value: 'riyadh', ar: 'الرياض', en: 'Riyadh' },
  { value: 'makkah', ar: 'مكة المكرمة', en: 'Makkah' },
  { value: 'madinah', ar: 'المدينة المنورة', en: 'Madinah' },
  { value: 'qassim', ar: 'القصيم', en: 'Al-Qassim' },
  { value: 'eastern', ar: 'المنطقة الشرقية', en: 'Eastern Province' },
  { value: 'asir', ar: 'عسير', en: 'Asir' },
  { value: 'tabuk', ar: 'تبوك', en: 'Tabuk' },
  { value: 'hail', ar: 'حائل', en: 'Hail' },
  { value: 'northern', ar: 'الحدود الشمالية', en: 'Northern Borders' },
  { value: 'jazan', ar: 'جازان', en: 'Jazan' },
  { value: 'najran', ar: 'نجران', en: 'Najran' },
  { value: 'baha', ar: 'الباحة', en: 'Al-Baha' },
  { value: 'jawf', ar: 'الجوف', en: 'Al-Jawf' },
];

const SCHOOL_TYPES = [
  { value: 'primary', ar: 'ابتدائية', en: 'Primary' },
  { value: 'middle', ar: 'متوسطة', en: 'Middle' },
  { value: 'secondary', ar: 'ثانوية', en: 'Secondary' },
  { value: 'mixed', ar: 'مختلطة (K-12)', en: 'Mixed (K-12)' },
];

const CONTACT_METHODS = [
  { value: 'whatsapp', ar: 'واتساب', en: 'WhatsApp' },
  { value: 'email', ar: 'بريد إلكتروني', en: 'Email' },
  { value: 'call', ar: 'مكالمة هاتفية', en: 'Phone Call' },
];

const CURRENT_SYSTEMS = [
  { value: 'none', ar: 'لا يوجد', en: 'None' },
  { value: 'noor', ar: 'نور', en: 'Noor' },
  { value: 'oracle', ar: 'Oracle', en: 'Oracle' },
  { value: 'sap', ar: 'SAP', en: 'SAP' },
  { value: 'spreadsheets', ar: 'جداول بيانات', en: 'Spreadsheets' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

const STEPS = [
  { titleAr: 'معلومات المدرسة', titleEn: 'School Information', icon: School },
  { titleAr: 'بيانات التواصل', titleEn: 'Contact Person', icon: User },
  { titleAr: 'المعلومات التقنية', titleEn: 'Technical Info', icon: Settings },
  { titleAr: 'مراجعة وإرسال', titleEn: 'Review & Submit', icon: FileText },
];

const initialForm = {
  // Step 1
  school_name: '',
  school_name_ar: '',
  school_type: '',
  city: '',
  region: '',
  estimated_students: '',
  // Step 2
  contact_name: '',
  job_title: '',
  contact_phone: '',
  contact_email: '',
  preferred_contact: '',
  // Step 3
  current_system: '',
  expected_go_live: '',
  num_branches: '',
  needs_migration: '',
};

export default function RegistrationWizard() {
  const [lang, setLang] = useState('ar');
  const isRTL = lang === 'ar';
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState(initialForm);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  // ── Validation ──────────────────────────────────────────────────────────
  const validateStep0 = () => {
    if (!form.school_name.trim()) { toast.error(isRTL ? 'اسم المدرسة بالإنجليزي مطلوب' : 'School name in English is required'); return false; }
    if (!form.school_name_ar.trim()) { toast.error(isRTL ? 'اسم المدرسة بالعربي مطلوب' : 'School name in Arabic is required'); return false; }
    if (!form.school_type) { toast.error(isRTL ? 'نوع المدرسة مطلوب' : 'School type is required'); return false; }
    if (!form.region) { toast.error(isRTL ? 'المنطقة مطلوبة' : 'Region is required'); return false; }
    if (!form.estimated_students) { toast.error(isRTL ? 'العدد التقديري مطلوب' : 'Estimated student count is required'); return false; }
    return true;
  };

  const validateStep1 = () => {
    if (!form.contact_name.trim()) { toast.error(isRTL ? 'الاسم الكامل مطلوب' : 'Full name is required'); return false; }
    if (!form.job_title.trim()) { toast.error(isRTL ? 'المسمى الوظيفي مطلوب' : 'Job title is required'); return false; }
    const saudiPhone = /^(\+966|0)(5\d{8})$/;
    if (!form.contact_phone.trim()) { toast.error(isRTL ? 'رقم الجوال مطلوب' : 'Mobile number is required'); return false; }
    if (!saudiPhone.test(form.contact_phone.replace(/\s/g, ''))) { toast.error(isRTL ? 'رقم الجوال يجب أن يكون بالصيغة السعودية (+966 5x...)' : 'Mobile must be in Saudi format (+966 5x...)'); return false; }
    if (!form.contact_email.trim() || !form.contact_email.includes('@')) { toast.error(isRTL ? 'البريد الإلكتروني غير صحيح' : 'Valid work email is required'); return false; }
    if (!form.preferred_contact) { toast.error(isRTL ? 'طريقة التواصل المفضلة مطلوبة' : 'Preferred contact method is required'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.current_system) { toast.error(isRTL ? 'النظام الحالي مطلوب' : 'Current system is required'); return false; }
    if (!form.expected_go_live) { toast.error(isRTL ? 'تاريخ الانطلاق المتوقع مطلوب' : 'Expected go-live date is required'); return false; }
    if (!form.num_branches) { toast.error(isRTL ? 'عدد الفروع مطلوب' : 'Number of branches is required'); return false; }
    if (!form.needs_migration) { toast.error(isRTL ? 'الرجاء تحديد ما إذا كنت تحتاج ترحيل البيانات' : 'Please select if you need data migration'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitTenantRequest({
        school_name: form.school_name,
        school_name_ar: form.school_name_ar,
        country: 'KSA',
        city: form.city,
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        preferred_language: lang,
        notes: JSON.stringify({
          school_type: form.school_type,
          region: form.region,
          estimated_students: form.estimated_students,
          job_title: form.job_title,
          preferred_contact: form.preferred_contact,
          current_system: form.current_system,
          expected_go_live: form.expected_go_live,
          num_branches: form.num_branches,
          needs_migration: form.needs_migration,
        }),
      });
      setSubmitted(true);
    } catch (e) {
      toast.error(e.message || (isRTL ? 'فشل في الإرسال' : 'Failed to submit'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Section chips ────────────────────────────────────────────────────────
  const regionLabel = SAUDI_REGIONS.find(r => r.value === form.region)?.[isRTL ? 'ar' : 'en'] || form.region;
  const schoolTypeLabel = SCHOOL_TYPES.find(t => t.value === form.school_type)?.[isRTL ? 'ar' : 'en'] || form.school_type;
  const contactMethodLabel = CONTACT_METHODS.find(c => c.value === form.preferred_contact)?.[isRTL ? 'ar' : 'en'] || form.preferred_contact;
  const currentSystemLabel = CURRENT_SYSTEMS.find(s => s.value === form.current_system)?.[isRTL ? 'ar' : 'en'] || form.current_system;

  // ── UI helpers ───────────────────────────────────────────────────────────
  const ToggleBtn = ({ options, field }) => (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => set(field, o.value)}
          className={`py-2 px-4 rounded-lg border text-sm font-medium transition-all ${
            form[field] === o.value
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          {isRTL ? o.ar : o.en}
        </button>
      ))}
    </div>
  );

  const ReviewRow = ({ label, value }) => (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 text-sm flex-shrink-0">{label}</span>
      <span className="text-slate-800 text-sm font-medium text-end">{value || '—'}</span>
    </div>
  );

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4 ${isRTL ? 'rtl' : 'ltr'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: ${isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Inter', sans-serif"}; }
      `}</style>

      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6964bc9bb6c7937565369920/d84349133_EduSaga.png"
              alt="EduSaga Logo"
              className="h-12 w-auto"
            />
            <div className="text-start">
              <p className="font-bold text-xl text-slate-900">EduSaga 360</p>
              <p className="text-xs text-slate-500">{isRTL ? 'منصة إدارة المدارس' : 'School Management Platform'}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setLang(l => l === 'ar' ? 'en' : 'ar')} className="text-slate-500">
            <Globe className="w-4 h-4 me-1" />
            {lang === 'ar' ? 'English' : 'العربية'}
          </Button>
        </div>

        {/* Progress bar */}
        {!submitted && (
          <div className="flex items-center justify-center gap-1 mb-6">
            {STEPS.map((s, i) => (
              <React.Fragment key={i}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
                  }`}>
                    {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-xs hidden sm:block font-medium ${i === step ? 'text-blue-600' : 'text-slate-400'}`}>
                    {isRTL ? s.titleAr : s.titleEn}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 w-6 rounded mx-1 ${i < step ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ── STEP 0: School Info ── */}
        {step === 0 && (
          <Card className="shadow-lg border-0">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <School className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{isRTL ? 'معلومات المدرسة' : 'School Information'}</h2>
                  <p className="text-sm text-slate-500">{isRTL ? 'أخبرنا عن مؤسستك التعليمية' : 'Tell us about your educational institution'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'اسم المدرسة (إنجليزي) *' : 'School Name (English) *'}</Label>
                  <Input placeholder="Bright Future Academy" value={form.school_name} onChange={e => set('school_name', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'اسم المدرسة (عربي) *' : 'School Name (Arabic) *'}</Label>
                  <Input dir="rtl" placeholder="أكاديمية المستقبل المشرق" value={form.school_name_ar} onChange={e => set('school_name_ar', e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isRTL ? 'نوع المدرسة *' : 'School Type *'}</Label>
                <ToggleBtn options={SCHOOL_TYPES} field="school_type" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'المدينة' : 'City'}</Label>
                  <Input placeholder={isRTL ? 'الرياض' : 'Riyadh'} value={form.city} onChange={e => set('city', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'المنطقة *' : 'Region *'}</Label>
                  <select
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                    value={form.region}
                    onChange={e => set('region', e.target.value)}
                  >
                    <option value="">{isRTL ? 'اختر المنطقة' : 'Select region'}</option>
                    {SAUDI_REGIONS.map(r => (
                      <option key={r.value} value={r.value}>{isRTL ? r.ar : r.en}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isRTL ? 'العدد التقديري للطلاب *' : 'Estimated Number of Students *'}</Label>
                <Input type="number" min="1" placeholder="500" value={form.estimated_students} onChange={e => set('estimated_students', e.target.value)} />
              </div>

              <Button className="w-full gap-2 h-11" onClick={() => { if (validateStep0()) setStep(1); }}>
                {isRTL ? 'التالي' : 'Next'}
                {isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 1: Contact Person ── */}
        {step === 1 && (
          <Card className="shadow-lg border-0">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{isRTL ? 'بيانات المسؤول عن التواصل' : 'Contact Person Details'}</h2>
                  <p className="text-sm text-slate-500">{isRTL ? 'من سيكون نقطة التواصل الرئيسية؟' : 'Who will be the main point of contact?'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'الاسم الكامل *' : 'Full Name *'}</Label>
                  <div className="relative">
                    <User className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                    <Input className={isRTL ? 'pr-9' : 'pl-9'} placeholder={isRTL ? 'محمد أحمد' : 'John Smith'} value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'المسمى الوظيفي *' : 'Job Title *'}</Label>
                  <div className="relative">
                    <Briefcase className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                    <Input className={isRTL ? 'pr-9' : 'pl-9'} placeholder={isRTL ? 'مدير المدرسة' : 'School Principal'} value={form.job_title} onChange={e => set('job_title', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'رقم الجوال (966+) *' : 'Mobile (+966) *'}</Label>
                  <div className="relative">
                    <Phone className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                    <Input className={isRTL ? 'pr-9' : 'pl-9'} placeholder="+966 5x xxx xxxx" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'البريد الإلكتروني للعمل *' : 'Work Email *'}</Label>
                  <div className="relative">
                    <Mail className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                    <Input type="email" className={isRTL ? 'pr-9' : 'pl-9'} placeholder="you@school.edu.sa" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isRTL ? 'طريقة التواصل المفضلة *' : 'Preferred Contact Method *'}</Label>
                <ToggleBtn options={CONTACT_METHODS} field="preferred_contact" />
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(0)} className="flex-1">{isRTL ? 'رجوع' : 'Back'}</Button>
                <Button className="flex-1 gap-2 h-11" onClick={() => { if (validateStep1()) setStep(2); }}>
                  {isRTL ? 'التالي' : 'Next'}
                  {isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 2: Technical Info ── */}
        {step === 2 && (
          <Card className="shadow-lg border-0">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Settings className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{isRTL ? 'المعلومات التقنية' : 'Technical Information'}</h2>
                  <p className="text-sm text-slate-500">{isRTL ? 'لنفهم احتياجاتك التقنية' : 'Help us understand your technical needs'}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isRTL ? 'النظام الحالي المستخدم *' : 'Current System in Use *'}</Label>
                <ToggleBtn options={CURRENT_SYSTEMS} field="current_system" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'تاريخ الانطلاق المتوقع *' : 'Expected Go-Live Date *'}</Label>
                  <Input type="date" value={form.expected_go_live} onChange={e => set('expected_go_live', e.target.value)} min={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isRTL ? 'عدد الفروع *' : 'Number of Branches *'}</Label>
                  <Input type="number" min="1" placeholder="1" value={form.num_branches} onChange={e => set('num_branches', e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{isRTL ? 'هل تحتاج إلى ترحيل بيانات؟ *' : 'Do you need data migration? *'}</Label>
                <div className="flex gap-3">
                  {[{ value: 'yes', ar: 'نعم', en: 'Yes' }, { value: 'no', ar: 'لا', en: 'No' }].map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set('needs_migration', o.value)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        form.needs_migration === o.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {isRTL ? o.ar : o.en}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">{isRTL ? 'رجوع' : 'Back'}</Button>
                <Button className="flex-1 gap-2 h-11" onClick={() => { if (validateStep2()) setStep(3); }}>
                  {isRTL ? 'مراجعة الطلب' : 'Review Application'}
                  {isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── STEP 3: Review & Submit ── */}
        {step === 3 && !submitted && (
          <Card className="shadow-lg border-0">
            <CardContent className="pt-6 pb-6 space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{isRTL ? 'مراجعة وإرسال الطلب' : 'Review & Submit Application'}</h2>
                  <p className="text-sm text-slate-500">{isRTL ? 'تأكد من صحة البيانات قبل الإرسال' : 'Verify all details before submitting'}</p>
                </div>
              </div>

              {/* Section 1 review */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <School className="w-4 h-4 text-blue-600" />
                    <span className="font-semibold text-blue-800 text-sm">{isRTL ? 'معلومات المدرسة' : 'School Information'}</span>
                  </div>
                  <button onClick={() => { setStep(0); }} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-medium">
                    <Edit2 className="w-3 h-3" /> {isRTL ? 'تعديل' : 'Edit'}
                  </button>
                </div>
                <div className="px-4 py-3 space-y-0.5">
                  <ReviewRow label={isRTL ? 'الاسم (إنجليزي)' : 'Name (EN)'} value={form.school_name} />
                  <ReviewRow label={isRTL ? 'الاسم (عربي)' : 'Name (AR)'} value={form.school_name_ar} />
                  <ReviewRow label={isRTL ? 'النوع' : 'Type'} value={schoolTypeLabel} />
                  <ReviewRow label={isRTL ? 'المدينة' : 'City'} value={form.city} />
                  <ReviewRow label={isRTL ? 'المنطقة' : 'Region'} value={regionLabel} />
                  <ReviewRow label={isRTL ? 'عدد الطلاب' : 'Est. Students'} value={form.estimated_students} />
                </div>
              </div>

              {/* Section 2 review */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-purple-50 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-purple-800 text-sm">{isRTL ? 'بيانات التواصل' : 'Contact Person'}</span>
                  </div>
                  <button onClick={() => setStep(1)} className="text-purple-600 hover:text-purple-800 flex items-center gap-1 text-xs font-medium">
                    <Edit2 className="w-3 h-3" /> {isRTL ? 'تعديل' : 'Edit'}
                  </button>
                </div>
                <div className="px-4 py-3 space-y-0.5">
                  <ReviewRow label={isRTL ? 'الاسم' : 'Name'} value={form.contact_name} />
                  <ReviewRow label={isRTL ? 'المسمى' : 'Title'} value={form.job_title} />
                  <ReviewRow label={isRTL ? 'الجوال' : 'Mobile'} value={form.contact_phone} />
                  <ReviewRow label={isRTL ? 'البريد' : 'Email'} value={form.contact_email} />
                  <ReviewRow label={isRTL ? 'التواصل المفضل' : 'Preferred Contact'} value={contactMethodLabel} />
                </div>
              </div>

              {/* Section 3 review */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-emerald-50 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-emerald-600" />
                    <span className="font-semibold text-emerald-800 text-sm">{isRTL ? 'المعلومات التقنية' : 'Technical Info'}</span>
                  </div>
                  <button onClick={() => setStep(2)} className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 text-xs font-medium">
                    <Edit2 className="w-3 h-3" /> {isRTL ? 'تعديل' : 'Edit'}
                  </button>
                </div>
                <div className="px-4 py-3 space-y-0.5">
                  <ReviewRow label={isRTL ? 'النظام الحالي' : 'Current System'} value={currentSystemLabel} />
                  <ReviewRow label={isRTL ? 'تاريخ الانطلاق' : 'Go-Live Date'} value={form.expected_go_live} />
                  <ReviewRow label={isRTL ? 'عدد الفروع' : 'Branches'} value={form.num_branches} />
                  <ReviewRow label={isRTL ? 'ترحيل البيانات' : 'Data Migration'} value={form.needs_migration === 'yes' ? (isRTL ? 'نعم' : 'Yes') : (isRTL ? 'لا' : 'No')} />
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                {isRTL
                  ? 'لن يتم إنشاء حساب مستخدم الآن. سيتم مراجعة الطلب من قِبل فريق EduSaga والتواصل معك خلال ساعات قليلة.'
                  : 'No user account will be created at this stage. EduSaga team will review your application and reach out within a few hours.'}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">{isRTL ? 'رجوع' : 'Back'}</Button>
                <Button
                  className="flex-1 gap-2 h-11 bg-blue-600 hover:bg-blue-700"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isRTL ? 'إرسال الطلب' : 'Submit Application'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── SUCCESS ── */}
        {submitted && (
          <Card className="shadow-lg border-0">
            <CardContent className="pt-10 pb-10 text-center space-y-5">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  {isRTL ? 'تم استلام طلبك! 🎉' : 'Application Received! 🎉'}
                </h2>
                <p className="text-slate-500 mt-2 max-w-sm mx-auto text-sm leading-relaxed">
                  {isRTL
                    ? `تم استلام طلبك بنجاح. سيتم إشعارك عند الموافقة عبر ${form.contact_email}.`
                    : `Your application has been received. You will be notified once approved at ${form.contact_email}.`}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-start max-w-xs mx-auto space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">{isRTL ? 'المدرسة:' : 'School:'}</span>
                  <span className="font-medium text-slate-900">{form.school_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{isRTL ? 'الحالة:' : 'Status:'}</span>
                  <span className="font-medium text-amber-600">{isRTL ? 'بانتظار الموافقة' : 'Pending Approval'}</span>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                {isRTL ? 'إذا لم تتلق بريداً إلكترونياً، تحقق من مجلد البريد العشوائي.' : "If you don't receive an email, please check your spam folder."}
              </p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400 mt-4">
          {isRTL ? 'بالتسجيل، أنت توافق على شروط الخدمة وسياسة الخصوصية' : 'By registering, you agree to our Terms of Service and Privacy Policy'}
        </p>
      </div>
    </div>
  );
}