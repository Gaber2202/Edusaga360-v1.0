import React, { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { LogIn, Eye, EyeOff, ArrowRight } from 'lucide-react';

/**
 * /school-login — Branded sign-in page for existing EduSaga 360 school admins.
 * Collects email + password then authenticates via Supabase Auth.
 */
export default function SchoolLogin() {
  const { login } = useAuth();
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('erp_language') || 'ar'; } catch { return 'ar'; }
  });

  // If already authenticated, go straight to the dashboard
  useEffect(() => {
    supabase.auth.getSession().then(r => !!r.data?.session).then((authed) => {
      if (authed) {
        window.location.replace('/');
      }
    });
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [authFailure, setAuthFailure] = useState('');

  const isRTL = lang === 'ar';
  const t = (ar, en) => isRTL ? ar : en;

  const validate = () => {
    const e = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = t('البريد الإلكتروني غير صحيح', 'Please enter a valid email');
    if (!password.trim())
      e.password = t('كلمة المرور مطلوبة', 'Password is required');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setAuthFailure('');
    try {
      const { error, data } = await login(email, password);
      if (error) {
        setAuthFailure(t('فشل تسجيل الدخول. تحقق من بريدك وكلمة المرور.', 'Login failed. Please check your email and password.'));
        setLoading(false);
        return;
      }
      logAuditEvent({ action: AuditActions.LOGIN, entityType: 'Session', entityId: null });
      const appMeta = data?.user?.app_metadata || {};
      if (appMeta.mfa_required && !appMeta.mfa_verified_at) {
        window.location.replace('/MfaVerify');
      } else {
        window.location.replace('/');
      }
    } catch {
      setAuthFailure(t('حدث خطأ. حاول مرة أخرى.', 'An error occurred. Please try again.'));
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
            <img
              src="/edusaga-logo.svg"
              alt="EduSaga 360"
              className="h-14 w-auto mx-auto"
            />
            <h1 className="text-2xl font-bold text-ink">EduSaga 360</h1>
            <p className="text-muted-foreground text-sm">
              {t('تسجيل الدخول إلى بيئة مدرستك', 'Sign in to your school environment')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">
                {t('البريد الإلكتروني', 'Email address')}
              </Label>
              <Input
                type="email"
                dir="ltr"
                placeholder="admin@yourschool.edu.sa"
                value={email}
                onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })); }}
                className={errors.email ? 'border-red-400' : ''}
                autoComplete="email"
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-ink">
                {t('كلمة المرور', 'Password')}
              </Label>
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  dir="ltr"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: '' })); }}
                  className={`pe-10 ${errors.password ? 'border-red-400' : ''}`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-muted-foreground"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            <div className="flex justify-end -mt-1">
              <a href="/forgot-password" className="text-xs text-najdi-700 hover:text-najdi-900 hover:underline">
                {t('نسيت كلمة المرور؟', 'Forgot password?')}
              </a>
            </div>

            {authFailure && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                {authFailure}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-semibold bg-najdi-700 hover:bg-najdi-900"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {t('جاري التحقق...', 'Signing in...')}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <LogIn className="w-5 h-5" />
                  {t('تسجيل الدخول', 'Sign In')}
                </span>
              )}
            </Button>
          </form>

          {/* Info box */}
          <div className="bg-najdi-50 border border-najdi-100 rounded-xl p-4 text-sm text-najdi-900 text-start">
            <p className="font-semibold mb-1">{t('للمسؤولين المعتمدين فقط', 'Approved administrators only')}</p>
            <p className="text-xs text-najdi-700">
              {t(
                'إذا لم تتلقَّ بيانات الدخول بعد، تحقق من بريدك الإلكتروني أو تواصل مع فريق الدعم.',
                'If you haven\'t received your login credentials yet, check your email or contact support.'
              )}
            </p>
          </div>

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

          <p className="text-xs text-muted-foreground text-center">
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