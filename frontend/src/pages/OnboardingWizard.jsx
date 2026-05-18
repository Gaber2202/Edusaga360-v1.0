import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, callApi } from '../api/supabaseClient';
import { useTenant } from '../components/TenantContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Building2,
  Users,
  CheckCircle,
  Loader2,
  Settings,
  Camera,
  Upload,
  Mail,
  School,
} from 'lucide-react';
import navigateWithToken from '../utils/navigateWithToken';

const LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6964bc9bb6c7937565369920/d84349133_EduSaga.png';

const STEPS = [
  { id: 'welcome', label: 'مرحباً' },
  { id: 'school', label: 'بيانات المدرسة' },
  { id: 'logo', label: 'شعار المدرسة' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'team', label: 'دعوة الفريق' },
  { id: 'complete', label: 'مكتمل!' },
];

const GRADING_SYSTEMS = [
  { value: 'percentage', label: 'نسبة مئوية (0-100)' },
  { value: 'gpa', label: 'نقاط GPA (0-4)' },
  { value: 'letter', label: 'حروف (A-F)' },
  { value: 'moe', label: 'نظام وزارة التعليم' },
];

const SCHOOL_TYPES = [
  { value: 'government', label: 'حكومية' },
  { value: 'private', label: 'أهلية' },
  { value: 'international', label: 'دولية' },
];

const STAGES = [
  { value: 'primary', label: 'ابتدائي' },
  { value: 'middle', label: 'متوسط' },
  { value: 'high', label: 'ثانوي' },
  { value: 'kindergarten', label: 'رياض أطفال' },
];

const TEAM_ROLES = [
  { value: 'admin', label: 'مدير' },
  { value: 'teacher', label: 'معلم' },
  { value: 'staff', label: 'موظف إداري' },
  { value: 'accountant', label: 'محاسب' },
];

function progressKey(tenantId) {
  return tenantId ? `edusaga_onboarding_${tenantId}` : null;
}

function StepProgress({ step, completedSteps }) {
  return (
    <div className="w-full" dir="rtl">
      <div className="flex items-start justify-between">
        {STEPS.map((s, index) => {
          const done = completedSteps.includes(index);
          const active = index === step;
          return (
            <div key={s.id} className="contents">
              <div className="flex flex-col items-center gap-2 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  done ? 'bg-[#059669] text-white' : active ? 'bg-[#1a56db] text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {done ? <CheckCircle className="w-5 h-5" /> : index + 1}
                </div>
                <span className={`text-[11px] sm:text-xs text-center leading-tight ${active ? 'text-[#1a56db] font-bold' : 'text-gray-500'}`}>
                  {s.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`h-1 flex-1 rounded-full mt-4 mx-1 sm:mx-2 ${done ? 'bg-[#059669]' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center space-y-2 border-t border-gray-100 pt-8">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
        <Icon className="w-7 h-7 text-[#1a56db]" />
      </div>
      <h2 className="text-2xl font-bold text-[#1e3a8a]">{title}</h2>
      {subtitle && <p className="text-sm text-[#374151] leading-relaxed">{subtitle}</p>}
    </div>
  );
}

export default function OnboardingWizard() {
  const { tenant, refreshTenant } = useTenant();
  const fileInputRef = useRef(null);
  const setupToken = new URLSearchParams(window.location.search).get('token');
  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [logoSkipped, setLogoSkipped] = useState(false);
  const [teamSkipped, setTeamSkipped] = useState(false);
  const [sentInvites, setSentInvites] = useState([]);
  const [tokenState, setTokenState] = useState(setupToken ? 'validating' : 'none');
  const [tokenInfo, setTokenInfo] = useState(null);

  const [orgForm, setOrgForm] = useState({
    name_ar: '',
    name_en: '',
    phone: '',
    website: '',
    address: '',
    school_type: 'private',
    education_stages: [],
  });

  const [logoUrl, setLogoUrl] = useState('');

  const [settingsForm, setSettingsForm] = useState({
    academic_year_start: '',
    grading_system: 'percentage',
    default_language: 'ar',
  });

  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });

  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    role: 'teacher',
  });

  const storageKey = useMemo(() => progressKey(tenant?.id || tokenInfo?.request_id), [tenant?.id, tokenInfo?.request_id]);

  useEffect(() => {
    validateSetupTokenForOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateSetupTokenForOnboarding = async () => {
    if (!setupToken) return;
    try {
      const res = await callApi('/api/functions/validateSetupToken', { token: setupToken });
      const data = res.data || {};
      if (data.state === 'valid') {
        setTokenInfo(data);
        setTokenState('ready');
        setOrgForm(prev => ({ ...prev, name_ar: data.school_name || '', name_en: data.school_name || '' }));
        const authed = await supabase.auth.getSession().then(r => !!r.data?.session);
        if (authed && !tenant?.id) {
          setSaving(true);
          await callApi('/api/functions/completeSetupFromToken', { token: setupToken });
          navigateWithToken('/OnboardingWizard');
        }
      } else if (data.state === 'consumed') {
        setTokenState('consumed');
      } else if (data.state === 'expired') {
        setTokenState('expired');
      } else {
        setTokenState('invalid');
      }
    } catch (_e) {
      setTokenState('invalid');
    }
  };

  useEffect(() => {
    if (!tenant) return;

    setOrgForm(prev => ({
      ...prev,
      name_ar: tenant.name_ar || '',
      name_en: tenant.name_en || '',
      phone: tenant.phone || '',
      website: tenant.website || '',
      address: tenant.address || '',
      school_type: tenant.school_type || 'private',
      education_stages: Array.isArray(tenant.education_stages) ? tenant.education_stages : [],
    }));
    setLogoUrl(tenant.logo_url || '');

    const key = progressKey(tenant.id);
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Number.isInteger(parsed.currentStep)) setStep(Math.max(0, Math.min(STEPS.length - 1, parsed.currentStep - 1)));
      if (Array.isArray(parsed.completedSteps)) setCompletedSteps(parsed.completedSteps.map(n => n - 1));
    }
  }, [tenant]);

  const saveProgress = (nextStep, completedIndex = step) => {
    const nextCompleted = Array.from(new Set([...completedSteps, completedIndex])).filter(i => i >= 0 && i < STEPS.length);
    setCompletedSteps(nextCompleted);
    setStep(nextStep);
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify({
        currentStep: nextStep + 1,
        completedSteps: nextCompleted.map(i => i + 1),
      }));
    }
  };

  const saveTenant = async (payload) => {
    await callApi('/api/functions/completeOnboarding', payload);
    refreshTenant?.();
  };

  const canContinue = () => {
    if (step === 1) return Boolean(orgForm.name_ar.trim() && orgForm.phone.trim() && orgForm.school_type && orgForm.education_stages.length > 0);
    if (step === 3) return Boolean(
      settingsForm.academic_year_start &&
      passwordForm.password.length >= 8 &&
      passwordForm.password === passwordForm.confirmPassword
    );
    return true;
  };

  const handleNext = async () => {
    if (step === 0 && setupToken && !tenant?.id) {
      setSaving(true);
      try {
        const authed = await supabase.auth.getSession().then(r => !!r.data?.session);
        if (!authed) {
          window.location.href = '/login';
          return;
        }
        await callApi('/api/functions/completeSetupFromToken', { token: setupToken });
        refreshTenant?.();
        navigateWithToken('/OnboardingWizard');
        return;
      } catch (e) {
        toast.error(e.message || 'يرجى تسجيل الدخول بنفس البريد المستخدم في التسجيل');
        setSaving(false);
        return;
      }
    }

    if (!canContinue()) {
      toast.error('يرجى إكمال الحقول المطلوبة قبل المتابعة');
      return;
    }

    setSaving(true);
    try {
      if (step === 1) {
        await saveTenant({ org_data: orgForm, progress: { current_step: 3 } });
        toast.success('تم حفظ بيانات المدرسة');
      }
      if (step === 2) {
        await saveTenant({ org_data: { logo_url: logoUrl }, progress: { current_step: 4 } });
      }
      if (step === 3) {
        if (passwordForm.password.length < 8) {
          toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
          setSaving(false);
          return;
        }
        if (passwordForm.password !== passwordForm.confirmPassword) {
          toast.error('كلمتا المرور غير متطابقتين');
          setSaving(false);
          return;
        }
        const currentUser = await supabase.auth.getUser().then(r => r.data?.user);
        await supabase.auth.updateUser({
          userId: currentUser.id,
          currentPassword: '',
          newPassword: passwordForm.password,
        });
        await saveTenant({ settings: settingsForm, progress: { current_step: 5 } });
        toast.success('تم حفظ الإعدادات وكلمة المرور');
      }
      if (step === 5) {
        await callApi('/api/functions/completeOnboarding', { complete: true });
        refreshTenant?.();
        if (storageKey) localStorage.removeItem(storageKey);
        navigateWithToken('/Dashboard');
        return;
      }
      saveProgress(Math.min(step + 1, STEPS.length - 1));
    } catch (e) {
      toast.error(e.message || 'تعذر حفظ البيانات');
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => setStep(prev => Math.max(0, prev - 1));

  const handleSkip = () => {
    if (step === 2) setLogoSkipped(true);
    if (step === 4) setTeamSkipped(true);
    saveProgress(step + 1);
  };

  const handleLogoUpload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('الحجم الأقصى للشعار هو 2MB');
      return;
    }
    setSaving(true);
    try {
      const { file_url } = await callApi('/api/files/upload', { file });
      setLogoUrl(file_url);
      setLogoSkipped(false);
      await saveTenant({ org_data: { logo_url: file_url } });
      toast.success('تم رفع الشعار');
    } catch (e) {
      toast.error(e.message || 'تعذر رفع الشعار');
    } finally {
      setSaving(false);
    }
  };

  const toggleStage = (value) => {
    setOrgForm(prev => ({
      ...prev,
      education_stages: prev.education_stages.includes(value)
        ? prev.education_stages.filter(s => s !== value)
        : [...prev.education_stages, value],
    }));
  };

  const sendInvite = async () => {
    if (!inviteForm.email || !inviteForm.email.includes('@')) {
      toast.error('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    setSaving(true);
    try {
      await callApi('/api/auth/invite', { email: inviteForm.email, role: inviteForm.role === 'admin' ? 'admin' : 'user' });
      setSentInvites(prev => [...prev, { ...inviteForm }]);
      setInviteForm({ name: '', email: '', role: 'teacher' });
      toast.success('تم إرسال الدعوة');
    } catch (e) {
      toast.error(e.message || 'تعذر إرسال الدعوة');
    } finally {
      setSaving(false);
    }
  };

  if (tenant?.onboarding_completed) {
    return (
      <div className="min-h-[80vh] bg-[#f8fafc] flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-10 text-center space-y-5">
          <CheckCircle className="w-16 h-16 text-[#059669] mx-auto" />
          <h2 className="text-2xl font-bold text-[#1e3a8a]">تم إعداد المؤسسة بنجاح!</h2>
          <p className="text-[#374151]">يمكنك البدء في استخدام النظام الآن</p>
          <Button className="w-full bg-[#1a56db] hover:bg-blue-700" onClick={() => navigateWithToken('/')}>
            🚀 انتقل إلى لوحة التحكم
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-[#f8fafc] flex items-center justify-center p-3 sm:p-6" dir="rtl">
      <div className="w-full max-w-[680px] bg-white rounded-2xl shadow-lg p-6 sm:p-10 space-y-8">
        <div className="text-center space-y-3">
          <img src={LOGO_URL} alt="EduSaga 360" className="h-10 w-auto mx-auto" />
          {tenant?.logo_url && <img src={tenant.logo_url} alt="School" className="h-12 w-12 rounded-full object-cover mx-auto border" />}
        </div>

        <StepProgress step={step} completedSteps={completedSteps} />

        <div className="min-h-[360px]">
          {setupToken && tokenState === 'validating' && step === 0 && (
            <div className="text-center space-y-4 border-t border-gray-100 pt-12">
              <Loader2 className="w-12 h-12 animate-spin text-[#1a56db] mx-auto" />
              <h1 className="text-2xl font-bold text-[#1e3a8a]">جاري التحقق من رابط الإعداد...</h1>
            </div>
          )}

          {setupToken && ['expired', 'invalid', 'consumed'].includes(tokenState) && step === 0 && (
            <div className="text-center space-y-4 border-t border-gray-100 pt-12">
              <School className="w-14 h-14 text-amber-500 mx-auto" />
              <h1 className="text-2xl font-bold text-[#1e3a8a]">
                {tokenState === 'expired' ? 'انتهت صلاحية الرابط' : tokenState === 'consumed' ? 'تم استخدام الرابط مسبقاً' : 'رابط الإعداد غير صحيح'}
              </h1>
              <p className="text-[#374151]">يرجى استخدام أحدث رابط وصل إلى بريدك أو تسجيل الدخول للمتابعة.</p>
            </div>
          )}

          {(!setupToken || tokenState === 'ready' || tenant?.id) && step === 0 && (
            <div className="text-center space-y-6 border-t border-gray-100 pt-8">
              <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
                <School className="w-8 h-8 text-[#1a56db]" />
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-[#1e3a8a]">مرحباً بك في EduSaga 360</h1>
                <p className="text-[#374151] leading-relaxed">
                  سنساعدك في إعداد بيئة {tenant?.name_ar || tenant?.name_en || tokenInfo?.school_name || 'مدرستك'} بخطوات بسيطة وسريعة.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-[#374151] text-right space-y-2">
                <p>✅ تأكيد بيانات المدرسة</p>
                <p>✅ رفع الشعار وتخصيص الهوية</p>
                <p>✅ إعداد الخيارات الأساسية ودعوة الفريق</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <SectionHeader icon={Building2} title="إعدادات المدرسة الأساسية" subtitle="راجع بيانات مدرستك وحدّثها قبل بدء استخدام النظام" />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#374151]">اسم المدرسة بالعربية *</Label>
                  <Input dir="rtl" value={orgForm.name_ar} onChange={e => setOrgForm(p => ({ ...p, name_ar: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#374151]">اسم المدرسة بالإنجليزية</Label>
                  <Input dir="ltr" value={orgForm.name_en} onChange={e => setOrgForm(p => ({ ...p, name_en: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#374151]">رقم هاتف المدرسة *</Label>
                  <Input value={orgForm.phone} onChange={e => setOrgForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#374151]">الموقع الإلكتروني</Label>
                  <Input dir="ltr" value={orgForm.website} onChange={e => setOrgForm(p => ({ ...p, website: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[#374151]">العنوان</Label>
                <textarea
                  className="w-full min-h-24 rounded-md border border-input bg-white px-3 py-2 text-sm text-[#374151] focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={orgForm.address}
                  onChange={e => setOrgForm(p => ({ ...p, address: e.target.value }))}
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[#374151]">نوع المدرسة *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SCHOOL_TYPES.map(type => (
                    <button key={type.value} type="button" onClick={() => setOrgForm(p => ({ ...p, school_type: type.value }))} className={`rounded-xl border px-3 py-3 text-sm font-medium ${orgForm.school_type === type.value ? 'border-[#1a56db] bg-blue-50 text-[#1a56db]' : 'border-gray-200 text-[#374151]'}`}>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-[#374151]">المرحلة الدراسية *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {STAGES.map(stage => (
                    <button key={stage.value} type="button" onClick={() => toggleStage(stage.value)} className={`rounded-xl border px-3 py-3 text-sm font-medium ${orgForm.education_stages.includes(stage.value) ? 'border-[#059669] bg-emerald-50 text-[#059669]' : 'border-gray-200 text-[#374151]'}`}>
                      {stage.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 text-center">
              <SectionHeader icon={Camera} title="شعار مدرستك" subtitle="أضف شعار مدرستك ليظهر في جميع أنحاء النظام" />
              {logoUrl ? (
                <div className="space-y-3">
                  <img src={logoUrl} alt="School Logo" className="w-28 h-28 rounded-full object-cover mx-auto border-4 border-blue-50 shadow" />
                  <button type="button" className="text-sm font-semibold text-[#1a56db] hover:underline" onClick={() => fileInputRef.current?.click()}>
                    تغيير الصورة
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-blue-200 rounded-2xl p-10 bg-blue-50/40 hover:bg-blue-50 transition text-center space-y-3">
                  <Upload className="w-12 h-12 mx-auto text-[#1a56db]" />
                  <p className="font-semibold text-[#374151]">اسحب الشعار هنا أو انقر للاختيار</p>
                  <p className="text-sm text-gray-500">PNG أو JPG — الحجم الأقصى 2MB</p>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={e => handleLogoUpload(e.target.files?.[0])} />
              <button type="button" className="text-sm text-gray-500 hover:text-[#1a56db]" onClick={handleSkip}>
                تخطي هذا الخطوة الآن
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <SectionHeader icon={Settings} title="الإعدادات الأساسية" subtitle="حدد بداية العام الدراسي ونظام التقييم الافتراضي وأنشئ كلمة مرور لحسابك" />
              <div className="space-y-2">
                <Label className="text-[#374151]">بداية العام الدراسي *</Label>
                <Input type="date" value={settingsForm.academic_year_start} onChange={e => setSettingsForm(p => ({ ...p, academic_year_start: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label className="text-[#374151]">نظام التقييم</Label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {GRADING_SYSTEMS.map(g => (
                    <button key={g.value} type="button" onClick={() => setSettingsForm(p => ({ ...p, grading_system: g.value }))} className={`py-3 px-3 rounded-xl border text-sm font-medium text-right ${settingsForm.grading_system === g.value ? 'border-[#1a56db] bg-blue-50 text-[#1a56db]' : 'border-gray-200 text-[#374151]'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[#374151]">اللغة الافتراضية</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setSettingsForm(p => ({ ...p, default_language: 'ar' }))} className={`py-3 rounded-xl border text-sm font-semibold ${settingsForm.default_language === 'ar' ? 'border-[#1a56db] bg-blue-50 text-[#1a56db]' : 'border-gray-200 text-[#374151]'}`}>العربية</button>
                  <button type="button" onClick={() => setSettingsForm(p => ({ ...p, default_language: 'en' }))} className={`py-3 rounded-xl border text-sm font-semibold ${settingsForm.default_language === 'en' ? 'border-[#1a56db] bg-blue-50 text-[#1a56db]' : 'border-gray-200 text-[#374151]'}`}>English</button>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-4">
                <div>
                  <h3 className="font-bold text-[#1e3a8a]">إنشاء كلمة مرور الحساب *</h3>
                  <p className="text-sm text-[#374151] mt-1">استخدمها لاحقاً لتسجيل الدخول إلى لوحة التحكم.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[#374151]">كلمة المرور *</Label>
                    <Input
                      type="password"
                      dir="ltr"
                      value={passwordForm.password}
                      onChange={e => setPasswordForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="8 أحرف على الأقل"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[#374151]">تأكيد كلمة المرور *</Label>
                    <Input
                      type="password"
                      dir="ltr"
                      value={passwordForm.confirmPassword}
                      onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="أعد كتابة كلمة المرور"
                    />
                  </div>
                </div>
                {passwordForm.confirmPassword && passwordForm.password !== passwordForm.confirmPassword && (
                  <p className="text-sm text-red-600">كلمتا المرور غير متطابقتين</p>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <SectionHeader icon={Users} title="أضف أول عضو في فريقك" subtitle="يمكنك دعوة المعلمين والإداريين للانضمام" />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[#374151]">الاسم</Label>
                  <Input value={inviteForm.name} onChange={e => setInviteForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-[#374151]">البريد الإلكتروني</Label>
                  <Input type="email" dir="ltr" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[#374151]">الدور</Label>
                <select className="w-full h-10 rounded-md border border-input bg-white px-3 text-sm" value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}>
                  {TEAM_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button type="button" onClick={sendInvite} disabled={saving} className="bg-[#1a56db] hover:bg-blue-700">
                  <Mail className="w-4 h-4" /> إرسال الدعوة
                </Button>
                <button type="button" className="text-sm text-gray-500 hover:text-[#1a56db] px-3" onClick={handleSkip}>
                  تخطي — سأضيف الفريق لاحقاً
                </button>
              </div>
              {sentInvites.length > 0 && (
                <div className="space-y-2">
                  <Badge className="bg-emerald-100 text-[#059669]">✓ تم إرسال الدعوة</Badge>
                  <div className="space-y-2">
                    {sentInvites.map((invite, i) => (
                      <div key={`${invite.email}-${i}`} className="rounded-xl border border-gray-100 p-3 text-sm flex justify-between gap-3">
                        <span className="font-medium text-[#374151]">{invite.name || 'عضو فريق'}</span>
                        <span className="text-gray-500" dir="ltr">{invite.email}</span>
                        <span className="text-[#1a56db]">{TEAM_ROLES.find(r => r.value === invite.role)?.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="text-center space-y-6 border-t border-gray-100 pt-8">
              <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center mx-auto animate-pulse">
                <CheckCircle className="w-14 h-14 text-[#059669]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-[#1e3a8a]">🎉 مدرستك جاهزة!</h2>
                <p className="text-[#374151]">تم إعداد بيئة {tenant?.name_ar || orgForm.name_ar || 'مدرستك'} بنجاح على EduSaga 360</p>
              </div>
              <div className="bg-gray-50 rounded-2xl p-5 text-right space-y-2 text-sm text-[#374151]">
                <p>✅ تم إنشاء الحساب</p>
                <p>{logoUrl && !logoSkipped ? '✅ تم رفع الشعار' : '⏭ تم تخطي الشعار'}</p>
                <p>✅ تم إعداد بيانات المدرسة</p>
                <p>✅ تجربة مجانية 30 يوم — Enterprise مفعّلة</p>
                {sentInvites.length > 0 && <p>✅ تم إرسال دعوات الفريق</p>}
                {teamSkipped && <p>⏭ تم تخطي دعوة الفريق</p>}
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-800">
                ⏳ تجربتك المجانية تنتهي في {tenant?.trial_end_date || 'نهاية الفترة التجريبية'} — استكشف جميع المميزات قبل اختيار خطتك
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-5 flex gap-3 justify-between">
          {step > 0 ? (
            <Button type="button" variant="outline" className="flex-1 sm:flex-none bg-gray-100 text-[#374151] border-gray-200" onClick={handleBack}>
              ← السابق
            </Button>
          ) : <div />}
          <Button type="button" className="flex-1 sm:flex-none bg-[#1a56db] hover:bg-blue-700 min-w-40" onClick={handleNext} disabled={saving || tokenState === 'validating' || ['expired', 'invalid', 'consumed'].includes(tokenState) || !canContinue()}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {step === 0 && setupToken && !tenant?.id ? 'إنشاء الحساب وبدء الإعداد' : step === STEPS.length - 1 ? '🚀 انتقل إلى لوحة التحكم' : '→ متابعة'}
          </Button>
        </div>
      </div>
    </div>
  );
}