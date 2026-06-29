import React, { useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

/**
 * /reset-password — Landing page for recovery links (admin- or self-initiated).
 *
 * Supabase establishes a short-lived recovery session from the link's tokens
 * (detectSessionInUrl). Once that session is present we show the new-password
 * form; if no session can be established the link is invalid or expired.
 */
export default function ResetPassword() {
  const { isAuthenticated, isLoadingAuth, updatePassword } = useAuth();
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('erp_language') || 'ar'; } catch { return 'ar'; }
  });
  // checking → waiting on Supabase to parse the link; ready → show form;
  // invalid → no recovery session; done → password changed.
  const [phase, setPhase] = useState('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const isRTL = lang === 'ar';
  const t = (ar, en) => (isRTL ? ar : en);

  // A recovery link fires PASSWORD_RECOVERY once the tokens are parsed.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPhase((p) => (p === 'done' ? p : 'ready'));
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fall back to the resolved session state: a valid link yields a session;
  // its absence (after auth finishes loading) means the link is bad/expired.
  useEffect(() => {
    if (phase === 'done' || phase === 'ready') return;
    if (isLoadingAuth) return;
    setPhase(isAuthenticated ? 'ready' : 'invalid');
  }, [isAuthenticated, isLoadingAuth, phase]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل', 'Password must be at least 8 characters'));
      return;
    }
    if (password !== confirm) {
      setError(t('كلمتا المرور غير متطابقتين', 'Passwords do not match'));
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      setPhase('done');
      setTimeout(() => window.location.replace('/'), 1800);
    } catch (err) {
      setError(err?.message || t('تعذّر تحديث كلمة المرور. قد يكون الرابط منتهي الصلاحية.', 'Could not update the password. The link may have expired.'));
      setSaving(false);
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
              {t('تعيين كلمة مرور جديدة', 'Set a new password')}
            </h1>
          </div>

          {phase === 'checking' && (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
              <p className="text-sm">{t('جاري التحقق من الرابط...', 'Verifying your link...')}</p>
            </div>
          )}

          {phase === 'invalid' && (
            <div className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">{t('رابط غير صالح أو منتهي الصلاحية', 'Invalid or expired link')}</p>
                  <p className="text-xs text-amber-700">
                    {t(
                      'روابط إعادة التعيين تُستخدم مرة واحدة وتنتهي صلاحيتها بسرعة. اطلب رابطًا جديدًا للمتابعة.',
                      'Reset links are single-use and expire quickly. Request a new one to continue.',
                    )}
                  </p>
                </div>
              </div>
              <a
                href="/forgot-password"
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-najdi-700 hover:bg-najdi-900 text-white font-medium rounded-xl transition-colors text-sm"
              >
                <KeyRound className="w-4 h-4" />
                {t('طلب رابط جديد', 'Request a new link')}
              </a>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-sm text-emerald-800">
                  <p className="font-semibold mb-1">{t('تم تحديث كلمة المرور', 'Password updated')}</p>
                  <p className="text-xs text-emerald-700">
                    {t('جارٍ تحويلك إلى لوحة التحكم...', 'Redirecting you to your dashboard...')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {phase === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-muted-foreground text-sm text-center">
                {t('اختر كلمة مرور جديدة لحسابك', 'Choose a new password for your account')}
              </p>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-ink">
                  {t('كلمة المرور الجديدة', 'New password')}
                </Label>
                <div className="relative">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    dir="ltr"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    className="pe-10"
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-muted-foreground"
                    tabIndex={-1}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-ink">
                  {t('تأكيد كلمة المرور', 'Confirm password')}
                </Label>
                <Input
                  type={showPass ? 'text' : 'password'}
                  dir="ltr"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={saving}
                className="w-full h-12 text-base font-semibold bg-najdi-700 hover:bg-najdi-900"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('جاري الحفظ...', 'Saving...')}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-5 h-5" />
                    {t('تحديث كلمة المرور', 'Update password')}
                  </span>
                )}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
