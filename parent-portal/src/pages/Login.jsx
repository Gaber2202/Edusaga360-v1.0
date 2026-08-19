import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { useTheme } from '../lib/ThemeContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import Wordmark from '../components/Wordmark';
import { ArrowRight, Globe, Loader2, Moon, Sun } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const { t, isRTL, toggle } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-sand">
      <div
        aria-hidden
        className="pointer-events-none absolute -start-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-ink opacity-[0.04]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-5xl items-center justify-center p-4 sm:p-8">
        <div className="grid w-full overflow-hidden rounded-card border border-[color:var(--es-border)] bg-card shadow-panel md:grid-cols-2">
          <aside className="relative hidden overflow-hidden bg-[#0B3A29] p-10 text-[#F5F0E4] md:flex md:flex-col md:justify-between">
            <div
              aria-hidden
              className="pointer-events-none absolute -end-16 -bottom-20 h-64 w-64 rounded-full bg-cream opacity-[0.04]"
            />
            <Wordmark variant="cream" className="text-[28px]" />
            <div className="space-y-3">
              <p className="es-eyebrow !text-gold-400">{t('parentPortalEyebrow')}</p>
              <h1 className="text-balance text-[32px] font-semibold leading-[1.2]">
                {t('signInSubtitle')}
              </h1>
              <p className="max-w-sm text-[15px] font-light leading-relaxed text-[#C9D6CE]">
                {t('loginLead')}
              </p>
            </div>
            <p className="text-xs text-[#C9D6CE]/80" dir="ltr">EduSaga 360</p>
          </aside>

          <div className="relative p-8 sm:p-10">
            <div className="mb-8 flex items-center justify-between gap-2">
              <div className="md:hidden">
                <Wordmark className="text-[22px]" />
                <p className="mt-1 text-[13px] text-muted-foreground">{t('parentPortal')}</p>
              </div>
              <div className="ms-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-state hover:bg-sand-alt hover:text-ink"
                  aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={toggle}
                  className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-state hover:bg-sand-alt hover:text-ink"
                  aria-label="Toggle language"
                >
                  <Globe className="h-4 w-4" />
                  <span>{isRTL ? t('switchToEnglish') : t('switchToArabic')}</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="parent@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="rounded-[10px] border border-[#A8443A]/30 bg-[#F8E8E6] px-3 py-2 text-[13px] text-[#A8443A]">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('signIn')}
                {!loading ? <ArrowRight className="h-4 w-4 rtl:rotate-180" /> : null}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
