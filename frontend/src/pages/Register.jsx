import React, { useState } from 'react';
import { submitRegistrationRequest } from '../api/registrationRequest';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { CheckCircle } from 'lucide-react';

const COUNTRY_CODES = [
  { code: '+966', label: '🇸🇦 +966', country: 'KSA' },
  { code: '+971', label: '🇦🇪 +971', country: 'UAE' },
  { code: '+974', label: '🇶🇦 +974', country: 'Qatar' },
  { code: '+965', label: '🇰🇼 +965', country: 'Kuwait' },
  { code: '+973', label: '🇧🇭 +973', country: 'Bahrain' },
  { code: '+968', label: '🇴🇲 +968', country: 'Oman' },
  { code: '+20',  label: '🇪🇬 +20',  country: 'Egypt' },
  { code: '+1',   label: '🇺🇸 +1',   country: 'US/CA' },
];

const CITIES = [
  'الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام',
  'الخبر', 'أبها', 'تبوك', 'حائل', 'القصيم', 'أخرى',
];

const STUDENT_RANGES = [
  { value: 'lt100', label: 'أقل من 100' },
  { value: '100-300', label: '100 – 300' },
  { value: '300-500', label: '300 – 500' },
  { value: '500-1000', label: '500 – 1,000' },
  { value: '1000+', label: 'أكثر من 1000' },
];

const SCHOOL_TYPES = [
  { value: 'government', label: 'حكومية' },
  { value: 'private', label: 'أهلية' },
  { value: 'international', label: 'دولية' },
];

const HOW_HEARD = [
  'توصية من زميل',
  'وسائل التواصل الاجتماعي',
  'محرك البحث',
  'معرض أو فعالية',
  'أخرى',
];

const INITIAL_FORM = {
  first_name: '',
  last_name: '',
  school_name: '',
  email: '',
  country_code: '+966',
  phone: '',
  city: '',
  school_type: '',
  estimated_students: '',
  how_heard: '',
};

export default function Register() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    if (errors[k]) setErrors(p => ({ ...p, [k]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.first_name.trim()) e.first_name = 'الاسم الأول مطلوب';
    if (!form.last_name.trim()) e.last_name = 'اسم العائلة مطلوب';
    if (!form.school_name.trim()) e.school_name = 'اسم المدرسة مطلوب';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'البريد الإلكتروني غير صحيح';
    if (!form.phone.trim()) e.phone = 'رقم الجوال مطلوب';
    if (!form.city) e.city = 'المدينة مطلوبة';
    if (!form.school_type) e.school_type = 'نوع المدرسة مطلوب';
    if (!form.estimated_students) e.estimated_students = 'عدد الطلاب التقريبي مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const full_name = `${form.first_name.trim()} ${form.last_name.trim()}`;
      const phone = `${form.country_code}${form.phone.replace(/^0/, '')}`;
      await submitRegistrationRequest({
        full_name,
        school_name: form.school_name,
        email: form.email,
        phone,
        city: form.city,
        school_type: form.school_type,
        estimated_students: form.estimated_students,
        how_heard: form.how_heard || undefined,
      });
      setSubmitted(true);
    } catch (e) {
      if (e?.code === 'DUPLICATE') {
        toast.error('يوجد طلب تسجيل مسبق لهذا البريد الإلكتروني. تحقق من بريدك للحصول على رابط الإعداد.');
      } else if (e?.code === 'VALIDATION') {
        toast.error('تحقق من الحقول المدخلة');
      } else if (e?.code === 'NETWORK') {
        toast.error('تعذر الاتصال بالخادم، حاول مرة أخرى');
      } else {
        toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success State ───────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #0f172a 100%)' }}
        dir="rtl"
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'); * { font-family: 'IBM Plex Sans Arabic', sans-serif; }`}</style>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-10 text-center space-y-5">
          <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-12 h-12 text-emerald-600" />
          </div>
          <img
            src="/edusaga-logo.svg"
            alt="EduSaga"
            className="h-10 w-auto mx-auto"
          />
          <div>
            <h2 className="text-2xl font-bold text-slate-900">تم استلام طلبك بنجاح!</h2>
            <p className="text-slate-600 mt-3 leading-relaxed text-sm">
              شكراً <span className="font-semibold text-slate-900">{form.first_name} {form.last_name}</span>، تلقينا طلب تسجيل مدرسة{' '}
              <span className="font-semibold text-slate-900">{form.school_name}</span>.
              <br /><br />
              سيقوم فريقنا بمراجعة طلبك وسيصلك بريد إلكتروني على{' '}
              <span className="font-semibold text-blue-700">{form.email}</span>{' '}
              خلال 24 ساعة يحتوي على رابط إعداد حسابك.
            </p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            في حال لم يصلك البريد، تحقق من مجلد الرسائل غير المرغوب فيها (Spam).
          </div>
          <a href="/school-login" className="text-sm text-blue-600 hover:underline block">
            لديك حساب بالفعل؟ تسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

  // ─── Registration Form ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex" dir="rtl">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'); * { font-family: 'IBM Plex Sans Arabic', sans-serif; }`}</style>

      {/* LEFT — Branding Panel */}
      <div
        className="hidden lg:flex lg:w-2/5 flex-col justify-between p-10 text-white"
        style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 50%, #0c4a6e 100%)' }}
      >
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src="/edusaga-logo.svg"
              alt="EduSaga 360"
              className="h-12 w-auto"
            />
            <div>
              <p className="font-bold text-xl">EduSaga 360</p>
              <p className="text-blue-300 text-xs">v1.0</p>
            </div>
          </div>

          {/* Taglines */}
          <div>
            <h1 className="text-3xl font-bold leading-snug">نظام إدارة المدارس الذكي</h1>
            <p className="text-blue-300 mt-2 text-sm">Powered by AI. Built for Saudi Schools.</p>
          </div>

          {/* Value props */}
          <div className="space-y-4">
            {[
              { icon: '🏫', text: 'إدارة شاملة لجميع عمليات المدرسة' },
              { icon: '🤖', text: 'ذكاء اصطناعي مدمج مع يمن AI' },
              { icon: '📋', text: 'متوافق مع متطلبات وزارة التعليم' },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{item.icon}</span>
                <p className="text-blue-100 text-sm leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom badge */}
        <div className="bg-white/10 border border-white/20 rounded-xl p-4 text-center">
          <p className="text-white font-semibold text-sm">🎁 تجربة مجانية 30 يوماً</p>
          <p className="text-blue-200 text-xs mt-1">لا يلزم بطاقة ائتمان</p>
        </div>
      </div>

      {/* RIGHT — Form */}
      <div className="flex-1 bg-slate-50 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-lg">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <img
                src="/edusaga-logo.svg"
                alt="EduSaga"
                className="h-8 w-auto"
              />
              <span className="font-bold text-slate-900">EduSaga 360</span>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">ابدأ تجربتك المجانية</h2>
              <p className="text-slate-500 text-sm mt-1">أنشئ حساب مدرستك في دقيقتين</p>
            </div>

            {/* Trial badge */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <p className="text-sm font-medium text-emerald-800">
                🎁 تجربة مجانية 30 يوماً — لا بطاقة ائتمان مطلوبة
              </p>
            </div>

            {/* Row 1: First & Last name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldBlock label="الاسم الأول *" error={errors.first_name}>
                <Input
                  placeholder="محمد"
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  className={errors.first_name ? 'border-red-400' : ''}
                />
              </FieldBlock>
              <FieldBlock label="اسم العائلة *" error={errors.last_name}>
                <Input
                  placeholder="الأحمدي"
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  className={errors.last_name ? 'border-red-400' : ''}
                />
              </FieldBlock>
            </div>

            {/* Row 2: School name */}
            <FieldBlock label="اسم المدرسة *" error={errors.school_name}>
              <Input
                placeholder="مدرسة النور"
                value={form.school_name}
                onChange={e => set('school_name', e.target.value)}
                className={errors.school_name ? 'border-red-400' : ''}
              />
            </FieldBlock>

            {/* Row 3: Email & Phone with country code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldBlock label="البريد الإلكتروني *" error={errors.email}>
                <Input
                  type="email"
                  dir="ltr"
                  placeholder="admin@school.edu.sa"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  className={errors.email ? 'border-red-400' : ''}
                />
              </FieldBlock>
              <FieldBlock label="رقم الجوال *" error={errors.phone}>
                <div className="flex gap-1">
                  <select
                    value={form.country_code}
                    onChange={e => set('country_code', e.target.value)}
                    className="h-9 rounded-md border border-input px-2 text-xs bg-transparent text-slate-900 focus:outline-none focus:ring-1 focus:ring-ring flex-shrink-0"
                    style={{ minWidth: '90px' }}
                    dir="ltr"
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <Input
                    dir="ltr"
                    placeholder="5XXXXXXXX"
                    value={form.phone}
                    onChange={e => set('phone', e.target.value)}
                    className={`flex-1 ${errors.phone ? 'border-red-400' : ''}`}
                  />
                </div>
              </FieldBlock>
            </div>

            {/* Row 3 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldBlock label="المدينة *" error={errors.city}>
                <select
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  className={`w-full h-9 rounded-md border px-3 text-sm bg-transparent text-slate-900 focus:outline-none focus:ring-1 focus:ring-ring ${errors.city ? 'border-red-400' : 'border-input'}`}
                >
                  <option value="">اختر المدينة</option>
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FieldBlock>
              <FieldBlock label="نوع المدرسة *" error={errors.school_type}>
                <div className="flex gap-2">
                  {SCHOOL_TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set('school_type', t.value)}
                      className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all ${
                        form.school_type === t.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      } ${errors.school_type ? 'border-red-300' : ''}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </FieldBlock>
            </div>

            {/* Student count */}
            <FieldBlock label="عدد الطلاب التقريبي *" error={errors.estimated_students}>
              <div className="flex flex-wrap gap-2">
                {STUDENT_RANGES.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => set('estimated_students', r.value)}
                    className={`py-1.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                      form.estimated_students === r.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    } ${errors.estimated_students ? 'border-red-300' : ''}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </FieldBlock>

            {/* How heard (optional) */}
            <FieldBlock label="كيف سمعت عنا؟ (اختياري)">
              <select
                value={form.how_heard}
                onChange={e => set('how_heard', e.target.value)}
                className="w-full h-9 rounded-md border border-input px-3 text-sm bg-transparent text-slate-900 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">اختر...</option>
                {HOW_HEARD.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </FieldBlock>

            {/* Submit */}
            <Button
              className="w-full h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'جاري إرسال الطلب...' : 'ابدأ التجربة المجانية مجاناً ←'}
            </Button>

            {/* Footer links */}
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-400">
                بالتسجيل، أنت توافق على شروط الاستخدام وسياسة الخصوصية
              </p>
              <p className="text-sm text-slate-500">
                لديك حساب بالفعل؟{' '}
                <a href="/school-login" className="text-blue-600 hover:underline font-medium">
                  تسجيل الدخول
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldBlock({ label, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}