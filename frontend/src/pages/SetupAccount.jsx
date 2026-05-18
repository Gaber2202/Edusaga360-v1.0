import React, { useState, useEffect } from 'react';
import { supabase, callApi } from '../api/supabaseClient';
import navigateWithToken from '../utils/navigateWithToken';
import { Button } from '../components/ui/button';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  School,
  Mail,
  LogIn,
  UserPlus,
  Clock,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * /setup?token=XXX
 *
 * The landing page a user hits from the approval email. Distinguishes five
 * token validation states and renders a dedicated recovery UI per state:
 *
 *   no_token   — link has no ?token=… in the URL. User landed here by
 *                bookmark / outdated docs / manual nav. Steer to /register.
 *   not_found  — token is present but no RegistrationRequest matches.
 *                Either tampered or a deleted request. Steer to /register.
 *   expired    — token matches a request whose 48h window has lapsed. Offer
 *                a "Resend setup link" that calls resendSetupFromPublicToken
 *                to regenerate the token and re-send the email.
 *   consumed   — request already completed its setup; tenant exists. Nudge
 *                the user to sign in (no resend button — re-using the link
 *                would create a duplicate tenant if server logic ever drifted).
 *   valid      — proceed with the existing sign-in → completeSetupFromToken
 *                flow. Same UI as before.
 *
 * Server-side classification lives in base44/functions/validateSetupToken.
 */

const COPY = {
  ar: {
    dir: 'rtl',
    // Header / shared
    appName: 'EduSaga 360',
    switchLang: 'English',
    supportPrefix: 'للمساعدة:',
    supportEmail: 'Info@edusaga360.com',

    // Phases
    validatingTitle: 'جاري التحقق من رابط الإعداد...',

    // no_token
    noTokenTitle: 'مرحباً بك في EduSaga 360',
    noTokenBody:
      'صفحة الإعداد تُستخدم فقط عبر الرابط الذي يصلك بعد الموافقة على طلب تسجيل مدرستك. إذا لم تقم بالتسجيل بعد، ابدأ من هنا.',
    goRegister: 'تسجيل مدرسة جديدة',
    goLogin: 'لدي حساب بالفعل — تسجيل الدخول',

    // not_found
    notFoundTitle: 'رابط إعداد غير صحيح',
    notFoundBody:
      'الرابط الذي اتبعته لا يطابق أي طلب تسجيل في نظامنا. قد يكون الرابط معطوباً أو منتهياً. يمكنك تسجيل مدرستك من جديد أو التواصل مع الدعم.',

    // expired
    expiredTitle: 'انتهت صلاحية الرابط',
    expiredBody:
      'رابط الإعداد صالح لمدة 48 ساعة فقط ثم ينتهي لأسباب أمنية. يمكننا إرسال رابط جديد إلى بريدك الإلكتروني المسجل.',
    resendCta: 'إرسال رابط إعداد جديد',
    resendInFlight: 'جاري إرسال الرابط...',
    resendSuccessTitle: 'تم إرسال الرابط',
    resendSuccessBody: 'تحقق من بريدك الإلكتروني — قد يستغرق وصول الرسالة بضع دقائق.',
    resendCooldown: (sec) =>
      `يرجى الانتظار ${sec} ثانية قبل محاولة إرسال الرابط مرة أخرى.`,
    resendAlreadyUsed: 'تم إكمال الإعداد بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.',
    resendFailedGeneric: 'تعذر إرسال الرابط. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.',

    // consumed
    consumedTitle: 'تم استخدام هذا الرابط مسبقاً',
    consumedBody:
      'اكتمل إعداد هذا الحساب بالفعل. يمكنك تسجيل الدخول إلى مدرستك مباشرةً.',
    consumedLoginHint: (email) =>
      email ? `يرجى تسجيل الدخول باستخدام: ${email}` : 'يرجى تسجيل الدخول لمتابعة استخدام منصتك.',

    // login_required (existing phase)
    loginRequiredTitle: 'إعداد حسابك في EduSaga 360',
    loginRequiredSchool: 'المدرسة:',
    loginRequiredAccount: 'الحساب:',
    loginRequiredBody: 'يرجى تسجيل الدخول (أو إنشاء حساب) بالبريد الإلكتروني أعلاه لإكمال إعداد مدرستك.',
    loginRequiredCta: 'تسجيل الدخول / إنشاء حساب',

    // ready (existing phase)
    readyTitle: (name) => `مرحباً، ${name}!`,
    readyBody: 'أنت على وشك إنشاء بيئة مدرستك على EduSaga 360:',
    readyTrial: 'تجربة مجانية 30 يوماً • وصول فوري لجميع الوحدات',
    readyCta: '🚀 إنشاء بيئة مدرستي الآن',

    // completing / done
    completingTitle: 'جاري إنشاء بيئة مدرستك...',
    completingSub: 'قد يستغرق ذلك لحظة',
    doneTitle: 'تم بنجاح! 🎉',
    doneSub: 'جاري توجيهك لمعالج الإعداد...',

    // generic error (server-side during completion)
    errorTitle: 'حدث خطأ',
  },
  en: {
    dir: 'ltr',
    appName: 'EduSaga 360',
    switchLang: 'العربية',
    supportPrefix: 'Need help?',
    supportEmail: 'Info@edusaga360.com',

    validatingTitle: 'Validating your setup link…',

    noTokenTitle: 'Welcome to EduSaga 360',
    noTokenBody:
      'The setup page is reached via the link we email after your school registration is approved. If you haven’t registered yet, start here.',
    goRegister: 'Register a new school',
    goLogin: 'I already have an account — sign in',

    notFoundTitle: 'This setup link isn’t valid',
    notFoundBody:
      'The link you followed doesn’t match any registration in our system. It may be broken or has been revoked. You can register again, or contact support.',

    expiredTitle: 'This setup link has expired',
    expiredBody:
      'Setup links are valid for 48 hours before they expire for security. We can email you a fresh link to the address on file.',
    resendCta: 'Email me a new setup link',
    resendInFlight: 'Sending…',
    resendSuccessTitle: 'New link sent',
    resendSuccessBody:
      'Check your inbox — it can take a couple of minutes for the email to arrive.',
    resendCooldown: (sec) => `Please wait ${sec}s before requesting another link.`,
    resendAlreadyUsed: 'This account is already set up — please sign in instead.',
    resendFailedGeneric:
      'We couldn’t send a new link. Please try again or contact support.',

    consumedTitle: 'This link has already been used',
    consumedBody:
      'Setup is already complete for this school. You can sign in to your tenant directly.',
    consumedLoginHint: (email) =>
      email ? `Please sign in with: ${email}` : 'Please sign in to continue.',

    loginRequiredTitle: 'Set up your EduSaga 360 account',
    loginRequiredSchool: 'School:',
    loginRequiredAccount: 'Account:',
    loginRequiredBody:
      'Please sign in (or create an account) with the email above to finish setting up your school.',
    loginRequiredCta: 'Sign in / create account',

    readyTitle: (name) => `Welcome, ${name}!`,
    readyBody: 'You’re about to create your school environment on EduSaga 360:',
    readyTrial: '30-day free trial • Full module access',
    readyCta: '🚀 Create my school now',

    completingTitle: 'Creating your school environment…',
    completingSub: 'This takes a moment',
    doneTitle: 'All set! 🎉',
    doneSub: 'Redirecting to the onboarding wizard…',

    errorTitle: 'Something went wrong',
  },
};

function initialLang() {
  try {
    const stored = localStorage.getItem('erp_language');
    if (stored === 'ar' || stored === 'en') return stored;
  } catch (_e) {
    // localStorage blocked — fall through.
  }
  return 'ar';
}

/**
 * All error phases render through this skeleton: icon, title, body, then
 * a stack of recovery actions. Keeps the five states visually consistent.
 */
function RecoveryCard({ icon: Icon, iconColor, iconBg, title, body, children, support }) {
  return (
    <div className="space-y-4">
      <div className={`w-16 h-16 ${iconBg} rounded-full flex items-center justify-center mx-auto`}>
        <Icon className={`w-8 h-8 ${iconColor}`} />
      </div>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
      {children && <div className="pt-2 space-y-2">{children}</div>}
      <p className="text-xs text-slate-400 pt-2">
        {support.prefix}{' '}
        <a className="text-blue-600 hover:underline" href={`mailto:${support.email}`}>
          {support.email}
        </a>
      </p>
    </div>
  );
}

export default function SetupAccount() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  const [lang, setLang] = useState(initialLang);
  const t = COPY[lang];

  // phase ∈ validating | no_token | not_found | expired | consumed
  //       | login_required | ready | completing | done | error
  const [phase, setPhase] = useState('validating');
  const [tokenInfo, setTokenInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [user, setUser] = useState(null);
  const [resendState, setResendState] = useState('idle'); // idle | sending | success

  const toggleLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    try {
      localStorage.setItem('erp_language', next);
    } catch (_e) {
      // ignore storage errors
    }
  };

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const init = async () => {
    // Server-side classification does the heavy lifting, but handle the
    // trivial "no token" case client-side so we don't round-trip for it.
    if (!token) {
      setPhase('no_token');
      return;
    }

    try {
      const res = await callApi('/api/functions/validateSetupToken', { token });
      const data = res.data || {};
      // Prefer the new `state` field; fall back to legacy `error` mapping
      // so this client keeps working if the server hasn't deployed yet.
      const state =
        data.state ||
        (data.valid
          ? 'valid'
          : data.error === 'TOKEN_EXPIRED'
            ? 'expired'
            : data.error === 'ALREADY_USED'
              ? 'consumed'
              : 'not_found');

      if (state === 'valid') {
        setTokenInfo({
          request_id: data.request_id,
          school_name: data.school_name,
          full_name: data.full_name,
          email: data.email,
        });
      } else if (state === 'expired') {
        setTokenInfo({ request_id: data.request_id });
        setPhase('expired');
        return;
      } else if (state === 'consumed') {
        setTokenInfo({ request_id: data.request_id, email: data.email });
        setPhase('consumed');
        return;
      } else {
        setPhase('not_found');
        return;
      }
    } catch (_e) {
      setPhase('not_found');
      return;
    }

    // Valid token — carry on with the existing login / ready flow.
    try {
      const me = await supabase.auth.getUser().then(r => r.data?.user);
      setUser(me);
      if (me?.tenant_id) {
        window.location.href = '/';
        return;
      }
      setPhase('ready');
    } catch (_e) {
      setPhase('login_required');
    }
  };

  const handleComplete = async () => {
    setPhase('completing');
    try {
      const res = await callApi('/api/functions/completeSetupFromToken', { token });
      if (res.data?.success) {
        setPhase('done');
        setTimeout(() => {
          navigateWithToken('/OnboardingWizard');
        }, 2000);
      } else if (res.data?.error_code === 'EMAIL_MISMATCH') {
        // Logged-in user's email doesn't match the registration
        setErrorMsg(
          lang === 'ar'
            ? `يجب تسجيل الدخول بالبريد المستخدم في طلب التسجيل: ${res.data.expected_email}`
            : `Please sign in with the email used to register: ${res.data.expected_email}`
        );
        setPhase('error');
      } else {
        setErrorMsg(res.data?.error || '');
        setPhase('error');
      }
    } catch (e) {
      setErrorMsg(e.message || '');
      setPhase('error');
    }
  };

  const handleLogin = () => {
    // Go to school login, pass current /setup?token=... as the return URL
    const returnUrl = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `/school-login?return=${returnUrl}`;
  };

  const handleGoRegister = () => {
    window.location.href = '/register';
  };

  const handleGoLogin = () => {
    window.location.href = '/school-login';
  };

  const handleResend = async () => {
    if (!token || resendState === 'sending') return;
    setResendState('sending');
    try {
      const res = await callApi('/api/functions/resendSetupFromPublicToken', { token });
      const data = res.data || {};
      if (data.success) {
        setResendState('success');
        toast.success(t.resendSuccessBody);
      } else if (data.error === 'COOLDOWN') {
        setResendState('idle');
        toast.error(t.resendCooldown(data.retry_after_seconds ?? 60));
      } else if (data.error === 'ALREADY_USED') {
        setResendState('idle');
        setPhase('consumed');
        toast.info(t.resendAlreadyUsed);
      } else {
        setResendState('idle');
        toast.error(t.resendFailedGeneric);
      }
    } catch (_e) {
      setResendState('idle');
      toast.error(t.resendFailedGeneric);
    }
  };

  const support = { prefix: t.supportPrefix, email: t.supportEmail };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4"
      dir={t.dir}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        * { font-family: 'IBM Plex Sans Arabic', sans-serif; }
      `}</style>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-5 relative">
        <button
          type="button"
          onClick={toggleLang}
          className="absolute top-4 end-4 text-xs text-slate-400 hover:text-slate-600 transition"
          aria-label="Toggle language"
        >
          {t.switchLang}
        </button>

        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6964bc9bb6c7937565369920/d84349133_EduSaga.png"
          alt={t.appName}
          className="h-12 w-auto mx-auto"
        />

        {phase === 'validating' && (
          <div className="space-y-3 py-4">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
            <p className="text-slate-600">{t.validatingTitle}</p>
          </div>
        )}

        {phase === 'no_token' && (
          <RecoveryCard
            icon={KeyRound}
            iconColor="text-blue-600"
            iconBg="bg-blue-100"
            title={t.noTokenTitle}
            body={t.noTokenBody}
            support={support}
          >
            <Button className="w-full" onClick={handleGoRegister} data-testid="setup-go-register">
              <UserPlus className="w-4 h-4 me-2" />
              {t.goRegister}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleGoLogin} data-testid="setup-go-login">
              <LogIn className="w-4 h-4 me-2" />
              {t.goLogin}
            </Button>
          </RecoveryCard>
        )}

        {phase === 'not_found' && (
          <RecoveryCard
            icon={AlertCircle}
            iconColor="text-red-600"
            iconBg="bg-red-100"
            title={t.notFoundTitle}
            body={t.notFoundBody}
            support={support}
          >
            <Button className="w-full" onClick={handleGoRegister} data-testid="setup-go-register">
              <UserPlus className="w-4 h-4 me-2" />
              {t.goRegister}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleGoLogin} data-testid="setup-go-login">
              <LogIn className="w-4 h-4 me-2" />
              {t.goLogin}
            </Button>
          </RecoveryCard>
        )}

        {phase === 'expired' && (
          <RecoveryCard
            icon={Clock}
            iconColor="text-amber-600"
            iconBg="bg-amber-100"
            title={t.expiredTitle}
            body={resendState === 'success' ? t.resendSuccessBody : t.expiredBody}
            support={support}
          >
            {resendState === 'success' ? (
              <div className="w-full rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2 justify-center">
                <CheckCircle className="w-4 h-4" />
                {t.resendSuccessTitle}
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={handleResend}
                disabled={resendState === 'sending'}
                data-testid="setup-resend"
              >
                {resendState === 'sending' ? (
                  <>
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                    {t.resendInFlight}
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 me-2" />
                    {t.resendCta}
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={handleGoLogin} data-testid="setup-go-login">
              <LogIn className="w-4 h-4 me-2" />
              {t.goLogin}
            </Button>
          </RecoveryCard>
        )}

        {phase === 'consumed' && (
          <RecoveryCard
            icon={CheckCircle}
            iconColor="text-emerald-600"
            iconBg="bg-emerald-100"
            title={t.consumedTitle}
            body={t.consumedBody}
            support={support}
          >
            <p className="text-slate-500 text-sm">{t.consumedLoginHint(tokenInfo?.email)}</p>
            <Button className="w-full" onClick={handleGoLogin} data-testid="setup-go-login">
              <LogIn className="w-4 h-4 me-2" />
              {t.goLogin}
            </Button>
          </RecoveryCard>
        )}

        {phase === 'error' && (
          <RecoveryCard
            icon={AlertCircle}
            iconColor="text-red-600"
            iconBg="bg-red-100"
            title={t.errorTitle}
            body={errorMsg || t.notFoundBody}
            support={support}
          >
            <Button className="w-full" onClick={handleGoRegister} data-testid="setup-go-register">
              <UserPlus className="w-4 h-4 me-2" />
              {t.goRegister}
            </Button>
            <Button variant="outline" className="w-full" onClick={handleGoLogin} data-testid="setup-go-login">
              <LogIn className="w-4 h-4 me-2" />
              {t.goLogin}
            </Button>
          </RecoveryCard>
        )}

        {phase === 'login_required' && tokenInfo && (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <School className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">{t.loginRequiredTitle}</h2>
            <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1 text-start">
              <p className="text-slate-500">{t.loginRequiredSchool}</p>
              <p className="font-semibold text-slate-900">{tokenInfo.school_name}</p>
              <p className="text-slate-500 mt-2">{t.loginRequiredAccount}</p>
              <p className="font-medium text-slate-700">{tokenInfo.email}</p>
            </div>
            <p className="text-slate-500 text-sm">{t.loginRequiredBody}</p>
            <Button className="w-full" onClick={handleLogin}>
              {t.loginRequiredCta}
            </Button>
          </div>
        )}

        {phase === 'ready' && tokenInfo && (
          <div className="space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <School className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {t.readyTitle(user?.full_name || tokenInfo.full_name || '')}
            </h2>
            <p className="text-slate-500 text-sm">{t.readyBody}</p>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-start">
              <p className="font-semibold text-emerald-800 text-sm">{tokenInfo.school_name}</p>
              <p className="text-xs text-emerald-600 mt-1">{t.readyTrial}</p>
            </div>
            <Button className="w-full h-11 bg-emerald-600 hover:bg-emerald-700" onClick={handleComplete}>
              {t.readyCta}
            </Button>
          </div>
        )}

        {phase === 'completing' && (
          <div className="space-y-3 py-4">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto" />
            <p className="text-slate-600 font-medium">{t.completingTitle}</p>
            <p className="text-slate-400 text-sm">{t.completingSub}</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-4 py-4">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">{t.doneTitle}</h2>
            <p className="text-slate-500 text-sm">{t.doneSub}</p>
          </div>
        )}
      </div>
    </div>
  );
}