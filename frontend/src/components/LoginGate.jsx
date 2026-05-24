import React, { useState } from 'react';

/**
 * Shown to unauthenticated visitors who land inside the app shell. Two
 * options are offered, with **Register** as the primary CTA so new schools
 * see the path to onboarding first; existing users still have a clearly
 * visible "Sign In" link.
 *
 * Note: this component only renders when our React SPA mounts for an
 * unauth user. If Base44's hosted /login page intercepts before the SPA
 * mounts (the platform-level signup gate), this component is never seen
 * — that's a Builder-config issue, not a code issue here.
 */
export default function LoginGate() {
  const [lang, setLang] = useState('ar');
  const isRTL = lang === 'ar';
  const t = (ar, en) => (isRTL ? ar : en);

  const handleLogin = () => {
    window.location.href = '/login';
  };

  const handleRegister = () => {
    window.location.href = '/register';
  };

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: ${isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Inter', sans-serif"}; }
      `}</style>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-6">
        {/* Language toggle */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            {isRTL ? 'English' : 'العربية'}
          </button>
        </div>

        {/* Logo */}
        <div>
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6964bc9bb6c7937565369920/d84349133_EduSaga.png"
            alt="EduSaga 360"
            className="h-14 w-auto mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-slate-900">EduSaga 360</h1>
          <p className="text-slate-500 text-sm mt-1">
            {t('منصة إدارة المدارس', 'School Management Platform')}
          </p>
        </div>

        {/* Primary: Register your school */}
        <div className="space-y-2">
          <button
            onClick={handleRegister}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {t('📩 تسجيل مدرسة جديدة', '📩 Register your school')}
          </button>
          <p className="text-xs text-slate-400">
            {t(
              'تجربة مجانية 30 يوماً — لا بطاقة ائتمان مطلوبة',
              '30-day free trial — no credit card required',
            )}
          </p>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs text-slate-400 bg-white px-3">
            {t('لديك حساب؟', 'Already a customer?')}
          </div>
        </div>

        {/* Secondary: Sign in */}
        <div>
          <button
            onClick={handleLogin}
            className="w-full py-2.5 px-4 border border-blue-200 text-blue-600 font-medium rounded-xl hover:bg-blue-50 transition-colors text-sm"
          >
            {t('تسجيل الدخول →', 'Sign in →')}
          </button>
          <p className="text-xs text-slate-400 mt-2">
            {t(
              'يجب أن يكون حسابك معتمداً قبل تسجيل الدخول.',
              'Your account must be approved before you can sign in.',
            )}
          </p>
        </div>
      </div>
    </div>
  );
}