import React, { useState, useEffect } from 'react';
import { supabase, callApi } from '../api/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

/**
 * MFA verification page.
 *
 * After email+password login, users with mfa_required in app_metadata are
 * redirected here. We send an Infobip SMS/WhatsApp/Email OTP, collect the
 * 6-digit code, and refresh the Supabase session so the updated app_metadata
 * (mfa_verified_at) is picked up.
 */
export default function MfaVerify() {
  const { user, requiresMfa } = useAuth();
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('erp_language') || 'ar'; } catch { return 'ar'; }
  });
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [otp, setOtp] = useState(null);
  const [countdown, setCountdown] = useState(0);

  const isRTL = lang === 'ar';
  const t = (ar, en) => (isRTL ? ar : en);

  useEffect(() => {
    if (!requiresMfa && user) {
      window.location.replace('/');
      return;
    }
    sendCode();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const sendCode = async () => {
    setSending(true);
    setError('');
    setInfo('');
    try {
      const res = await callApi('/api/auth/mfa/send', { language: lang });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || t('فشل إرسال الرمز.', 'Failed to send code.'));
      }
      const data = await res.json();
      setOtp(data);
      setInfo(
        t(
          `تم إرسال رمز التحقق إلى ${data.destination_masked} عبر ${data.channel}.`,
          `A verification code was sent to ${data.destination_masked} via ${data.channel}.`,
        ),
      );
      setCountdown(30);
    } catch (err) {
      setError(err.message || t('تعذر إرسال رمز التحقق.', 'Could not send verification code.'));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!otp || code.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await callApi('/api/auth/mfa/verify', { otp_id: otp.otp_id, code });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || t('رمز غير صحيح.', 'Invalid code.'));
      }
      // Refresh the Supabase session so the new mfa_verified_at app_metadata claim is loaded.
      await supabase.auth.refreshSession();
      window.location.replace('/');
    } catch (err) {
      setError(err.message || t('فشل التحقق. حاول مرة أخرى.', 'Verification failed. Try again.'));
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

      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="flex justify-end">
          <button
            onClick={() => {
              const next = lang === 'ar' ? 'en' : 'ar';
              setLang(next);
              try { localStorage.setItem('erp_language', next); } catch {}
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isRTL ? 'English' : 'العربية'}
          </button>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-ink">
            {t('التحقق بخطوتين', 'Two-Factor Verification')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('أدخل رمز التحقق المكون من 6 أرقام.', 'Enter the 6-digit verification code.')}
          </p>
        </div>

        {info && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm text-center">
            {info}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-ink">
              {t('رمز التحقق', 'Verification Code')}
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={6}
              dir="ltr"
              className="text-center text-2xl tracking-[0.5em]"
              value={code}
              onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder="000000"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || sending || code.length !== 6}>
            {loading ? t('جارٍ التحقق...', 'Verifying...') : t('تحقق', 'Verify')}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={sendCode}
            disabled={sending || countdown > 0}
            className="text-sm text-najdi-700 hover:text-najdi-800 disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            {countdown > 0
              ? t(`إعادة الإرسال خلال ${countdown} ث`, `Resend in ${countdown}s`)
              : t('إعادة إرسال الرمز', 'Resend code')}
          </button>
        </div>
      </div>
    </div>
  );
}
