import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { Button } from '../components/ui/button';
import { ShieldOff } from 'lucide-react';

export default function AccessDenied() {
  const { logout } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center">
        <ShieldOff className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-700 mb-2">{t('accessDenied')}</h1>
        <p className="text-slate-500 mb-6 max-w-sm">
          {t('accessDeniedDesc')}
        </p>
        <Button variant="outline" onClick={logout}>
          {t('signOut')}
        </Button>
      </div>
    </div>
  );
}
