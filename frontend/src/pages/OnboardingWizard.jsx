import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { useAuth } from '../lib/AuthContext';
import { CheckCircle, Loader2, Clock, AlertCircle, GraduationCap } from 'lucide-react';

const STEPS = ['welcome', 'password', 'school', 'complete'];

export default function OnboardingWizard() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [request, setRequest] = useState(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [renewing, setRenewing] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [schoolLogo, setSchoolLogo] = useState('');
  const [academicYearStart, setAcademicYearStart] = useState('');
  const [numGrades, setNumGrades] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('ar');

  useEffect(() => {
    validateToken();
  }, [token]);

  // If the link belongs to an account that's already set up, forward them to
  // sign in (the login page itself redirects to the dashboard when a session
  // already exists) instead of leaving them on a dead "invalid link" screen.
  useEffect(() => {
    if (error === 'already') {
      const tmr = setTimeout(() => window.location.replace('/school-login'), 2500);
      return () => clearTimeout(tmr);
    }
  }, [error]);

  const validateToken = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://edusaga-360-production.up.railway.app';
      const response = await fetch(`${apiBase}/api/registration/onboarding/${token}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.error === 'TOKEN_EXPIRED') {
          setError('expired');
        } else if (data.error === 'ALREADY_COMPLETED') {
          setError('already');
        } else {
          setError('invalid');
        }
      } else {
        setRequest(data.request);
      }
    } catch (_e) {
      setError('network');
    } finally {
      setLoading(false);
    }
  };

  // Self-service: renew an expired link and drop straight back into setup.
  // The backend refreshes this token's expiry (and re-emails it), so we can
  // simply re-validate and continue — no support email or new link needed.
  const requestNewLink = async () => {
    setRenewing(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://edusaga-360-production.up.railway.app';
      const response = await fetch(`${apiBase}/api/registration/onboarding/${token}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('renew failed');
      toast.success('تم تجديد الرابط وإرساله إلى بريدك الإلكتروني');
      setError(null);
      setLoading(true);
      await validateToken();
    } catch {
      toast.error('تعذّر تجديد الرابط. يرجى التواصل مع الدعم.');
    } finally {
      setRenewing(false);
    }
  };

  const handleComplete = async () => {
    if (password !== confirmPassword) {
      toast.error('كلمات المرور غير متطابقة');
      return;
    }
    if (password.length < 10) {
      toast.error('كلمة المرور يجب أن تكون 10 أحرف على الأقل');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      toast.error('كلمة المرور يجب أن تحتوي على حرف كبير (A-Z)');
      return;
    }
    if (!/[a-z]/.test(password)) {
      toast.error('كلمة المرور يجب أن تحتوي على حرف صغير (a-z)');
      return;
    }
    if (!/[0-9]/.test(password)) {
      toast.error('كلمة المرور يجب أن تحتوي على رقم');
      return;
    }

    setSubmitting(true);
    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://edusaga-360-production.up.railway.app';
      const body = {
        password,
        default_language: defaultLanguage,
        ...(schoolLogo.trim() ? { school_logo: schoolLogo.trim() } : {}),
        ...(academicYearStart ? { academic_year_start: academicYearStart } : {}),
        ...(numGrades ? { num_grades: Number(numGrades) } : {}),
      };
      const response = await fetch(`${apiBase}/api/registration/onboarding/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (data.success) {
        setCompleted(true);
        // The backend creates the admin's auth user with the email pre-confirmed,
        // so sign them in with the password they just set and take them straight
        // to their new dashboard. If auto sign-in fails for any reason, fall back
        // to the login page rather than leaving them stuck on the wizard.
        try {
          const { error: loginError } = await login(request.contact_email, password);
          if (loginError) throw loginError;
          setTimeout(() => window.location.replace('/'), 1500);
        } catch (_signInErr) {
          setTimeout(() => window.location.replace('/school-login'), 1500);
        }
      } else {
        const msg = data.message || (data.errors ? Object.values(data.errors?.fieldErrors || {}).flat().join(' ') : null) || 'فشل في إكمال الإعداد';
        toast.error(msg);
      }
    } catch (_e) {
      toast.error('خطأ في الاتصال');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-najdi-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-najdi-900 border-t-emerald-400 rounded-full" />
      </div>
    );
  }

  if (error === 'expired') {
    return (
      <div className="min-h-screen bg-najdi-900 flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Clock className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-ink mb-2">انتهت صلاحية الرابط</h1>
            <p className="text-muted-foreground mb-5">انتهت صلاحية رابط الإعداد. اطلب رابطًا جديدًا للمتابعة — سنرسله إلى بريدك الإلكتروني ويمكنك إكمال الإعداد مباشرةً.</p>
            <Button onClick={requestNewLink} disabled={renewing} className="w-full bg-emerald-600 hover:bg-emerald-700 mb-4">
              {renewing
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> جاري التجديد...</span>
                : 'طلب رابط جديد'}
            </Button>
            <p className="text-xs text-muted-foreground">تحتاج مساعدة؟ <a href="mailto:info@edusaga360.com" className="text-emerald-600 font-medium hover:underline">info@edusaga360.com</a></p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error === 'already') {
    return (
      <div className="min-h-screen bg-najdi-900 flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-ink mb-2">تم إعداد حسابك بالفعل</h1>
            <p className="text-muted-foreground mb-4">حساب مدرستك جاهز للاستخدام. يتم تحويلك إلى تسجيل الدخول…</p>
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mx-auto" />
            <a href="/school-login" className="block mt-4 text-emerald-600 font-medium hover:underline">تسجيل الدخول الآن</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-najdi-900 flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-ink mb-2">رابط غير صالح</h1>
            <p className="text-muted-foreground">هذا الرابط غير صالح. تأكد من الرابط في البريد الإلكتروني أو تواصل مع الدعم.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (completed) {
    const ar = defaultLanguage !== 'en';
    return (
      <div className="min-h-screen bg-najdi-900 flex items-center justify-center p-4" dir={ar ? 'rtl' : 'ltr'}>
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-ink mb-2">{ar ? 'تم الإعداد بنجاح!' : 'Setup complete!'}</h1>
            <p className="text-muted-foreground mb-4">{ar ? 'يتم الآن تحويلك إلى لوحة التحكم...' : 'Taking you to your dashboard…'}</p>
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mx-auto" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-najdi-900 to-najdi-900 flex items-center justify-center p-4" dir="rtl">
      <Card className="max-w-lg w-full">
        <CardContent className="p-8">
          {/* Progress */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i <= step ? 'bg-emerald-600 text-white' : 'bg-sand-alt text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
                {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-emerald-600' : 'bg-sand-alt'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-4">
              <GraduationCap className="w-16 h-16 text-emerald-600 mx-auto" />
              <h1 className="text-2xl font-bold text-ink">مرحباً {request?.contact_name}!</h1>
              <p className="text-muted-foreground">أهلاً بك في EduSaga 360. لنقم بإعداد حساب مدرستك {request?.school_name}.</p>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setStep(1)}>
                ابدأ الإعداد
              </Button>
            </div>
          )}

          {/* Step 2: Set Password */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink">تعيين كلمة المرور</h2>
              <p className="text-sm text-muted-foreground">اختر كلمة مرور قوية لحسابك ({request?.contact_email})</p>
              <div>
                <Label>كلمة المرور</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="10 أحرف على الأقل" />
                <p className="text-xs text-muted-foreground">10 أحرف على الأقل، تشمل حرفاً كبيراً وحرفاً صغيراً ورقماً</p>
              </div>
              <div>
                <Label>تأكيد كلمة المرور</Label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>رجوع</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => {
                  if (password.length < 10) { toast.error('كلمة المرور يجب أن تكون 10 أحرف على الأقل'); return; }
                  if (password !== confirmPassword) { toast.error('كلمات المرور غير متطابقة'); return; }
                  setStep(2);
                }}>التالي</Button>
              </div>
            </div>
          )}

          {/* Step 3: School Settings */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink">إعدادات المدرسة</h2>
              <div>
                <Label>رابط شعار المدرسة (اختياري)</Label>
                <Input value={schoolLogo} onChange={e => setSchoolLogo(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>بداية العام الدراسي</Label>
                <Input type="date" value={academicYearStart} onChange={e => setAcademicYearStart(e.target.value)} />
              </div>
              <div>
                <Label>عدد المراحل الدراسية</Label>
                <Input type="number" min="1" max="20" value={numGrades} onChange={e => setNumGrades(e.target.value)} placeholder="مثال: 12" />
              </div>
              <div>
                <Label>اللغة الافتراضية</Label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={defaultLanguage}
                  onChange={e => setDefaultLanguage(e.target.value)}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>رجوع</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setStep(3)}>التالي</Button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-ink">تأكيد الإعداد</h2>
              <div className="bg-sand rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">المدرسة:</span><span className="font-medium">{request?.school_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المسؤول:</span><span className="font-medium">{request?.contact_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">البريد:</span><span className="font-medium">{request?.contact_email}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">اللغة:</span><span className="font-medium">{defaultLanguage === 'ar' ? 'العربية' : 'English'}</span></div>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>رجوع</Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={handleComplete} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  إكمال الإعداد
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
