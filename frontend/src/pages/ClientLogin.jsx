import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { LogIn, ArrowRight } from 'lucide-react';

/**
 * /client/login — A branded sign-in entry point for existing school admins.
 * Delegates the actual auth to the platform's SSO; we just provide the branded UI.
 */
export default function ClientLogin() {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('erp_language') || 'ar'; } catch { return 'ar'; }
  });
  const isRTL = lang === 'ar';
  const t = (ar, en) => isRTL ? ar : en;

  const handleLogin = () => {
    window.location.href = '/login';
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)' }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: ${isRTL ? "'IBM Plex Sans Arabic', sans-serif" : "'Inter', sans-serif"}; }
      `}</style>

      <div className="max-w-md w-full">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center space-y-6">
          {/* Language toggle */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                const next = lang === 'ar' ? 'en' : 'ar';
                setLang(next);
                try { localStorage.setItem('erp_language', next); } catch {}
              }}
              className="text-xs text-muted-foreground hover:text-muted-foreground"
            >
              {isRTL ? 'English' : 'العربية'}
            </button>
          </div>

          {/* Logo */}
          <div className="space-y-2">
            <img
              src="/edusaga-logo.svg"
              alt="EduSaga 360"
              className="h-14 w-auto mx-auto"
            />
            <h1 className="text-2xl font-bold text-ink">EduSaga 360</h1>
            <p className="text-muted-foreground text-sm">
              {t('تسجيل الدخول إلى حسابك المدرسي', 'Sign in to your school account')}
            </p>
          </div>

          {/* Info box */}
          <div className="bg-najdi-50 border border-najdi-100 rounded-xl p-4 text-sm text-najdi-900 text-start">
            <p className="font-semibold mb-1">{t('للمسؤولين المعتمدين فقط', 'Approved administrators only')}</p>
            <p className="text-xs text-najdi-700">
              {t(
                'إذا لم تتلقَّ رابط الإعداد بعد، يرجى التحقق من بريدك الإلكتروني أو التواصل مع فريق الدعم.',
                'If you haven\'t received your setup link yet, check your email or contact support.'
              )}
            </p>
          </div>

          {/* Sign in button */}
          <Button
            className="w-full h-12 text-base font-semibold bg-najdi-700 hover:bg-najdi-900"
            onClick={handleLogin}
          >
            <LogIn className="w-5 h-5 me-2" />
            {t('تسجيل الدخول ←', 'Sign In →')}
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground bg-white px-3">
              {t('مدرسة جديدة؟', 'New school?')}
            </div>
          </div>

          {/* Register link */}
          <a
            href="/register"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-border text-muted-foreground font-medium rounded-xl hover:bg-sand transition-colors text-sm"
          >
            <ArrowRight className="w-4 h-4" />
            {t('تسجيل مدرسة جديدة', 'Register a new school')}
          </a>

          <p className="text-xs text-muted-foreground">
            {t('للمساعدة: ', 'Need help? ')}
            <a href="mailto:Info@edusaga360.com" className="text-najdi-500 hover:underline">
              Info@edusaga360.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}