import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { KeyRound, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * /forgot-password — Request a password-reset link.
 * Submits the email to the backend, which emails a single-use recovery link.
 * Always shows a generic confirmation (no account-existence disclosure).
 */
export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('erp_language') || 'ar'; } catch { return 'ar'; }
  });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const isRTL = lang === 'ar';
  const t = (ar, en) => (isRTL ? ar : en);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('البريد الإلكتروني غير صحيح', 'Please enter a valid email'));
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch {
      // Surface a soft error but still guide the user — the backend is designed
      // not to reveal whether the address exists.
      setError(t('تعذّر إرسال الرابط. حاول مرة أخرى.', 'Could not send the link. Please try again.'));
    } finally {
      setLoading(false);
    }
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
        <div className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">

          {/* Language toggle */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                const next = lang === 'ar' ? 'en' : 'ar';
                setLang(next);
                try { localStorage.setItem('erp_language', next); } catch {}
              }}
              className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              {isRTL ? 'English' : 'العربية'}
            </button>
          </div>

          {/* Logo */}
          <div className="text-center space-y-2">
            <img src="/edusaga-logo.svg" alt="EduSaga 360" className="h-14 w-auto mx-auto" />
            <h1 className="text-2xl font-bold text-ink">
              {t('استعادة كلمة المرور', 'Reset your password')}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t(
                'أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة التعيين',
                "Enter your email and we'll send you a reset link",
              )}
            </p>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-sm text-emerald-800">
                  <p className="font-semibold mb-1">{t('تحقق من بريدك الإلكتروني', 'Check your email')}</p>
                  <p className="text-xs text-emerald-700">
                    {t(
                      'إذا كان هناك حساب مرتبط بهذا البريد، فستصلك رسالة تحتوي على رابط لإعادة تعيين كلمة المرور خلال دقائق.',
                      'If an account exists for that address, a message with a password-reset link is on its way. It may take a few minutes to arrive.',
                    )}
                  </p>
                </div>
              </div>
              <a
                href="/school-login"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-border text-muted-foreground font-medium rounded-xl hover:bg-sand transition-colors text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('العودة لتسجيل الدخول', 'Back to sign in')}
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-ink">
                  {t('البريد الإلكتروني', 'Email address')}
                </Label>
                <Input
                  type="email"
                  dir="ltr"
                  placeholder="admin@yourschool.edu.sa"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  className={error ? 'border-red-400' : ''}
                  autoComplete="email"
                  autoFocus
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-base font-semibold bg-najdi-700 hover:bg-najdi-900"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('جاري الإرسال...', 'Sending...')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-5 h-5" />
                    {t('إرسال رابط إعادة التعيين', 'Send reset link')}
                  </span>
                )}
              </Button>

              <a
                href="/school-login"
                className="flex items-center justify-center gap-2 w-full text-sm text-muted-foreground hover:text-ink transition-colors pt-1"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('العودة لتسجيل الدخول', 'Back to sign in')}
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
