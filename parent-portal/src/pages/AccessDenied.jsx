import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { Button } from '../components/ui/button';
import Wordmark from '../components/Wordmark';
import IconTile from '../components/IconTile';
import { ShieldOff } from 'lucide-react';

export default function AccessDenied() {
  const { logout } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sand p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -end-24 -top-24 h-[22rem] w-[22rem] rounded-full bg-ink opacity-[0.04]"
      />
      <div className="relative w-full max-w-md rounded-card border border-[color:var(--es-border)] bg-card p-10 text-center shadow-card">
        <Wordmark className="text-[22px]" />
        <div className="mt-8 flex justify-center">
          <IconTile tone="danger">
            <ShieldOff />
          </IconTile>
        </div>
        <h1 className="mt-5 font-sans text-[28px] font-semibold tracking-tight text-ink">
          {t('accessDenied')}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] font-light leading-relaxed text-muted-foreground">
          {t('accessDeniedDesc')}
        </p>
        <Button variant="outline" className="mt-8" onClick={logout}>
          {t('signOut')}
        </Button>
      </div>
    </div>
  );
}
