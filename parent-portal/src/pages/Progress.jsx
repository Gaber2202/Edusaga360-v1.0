import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { GraduationCap } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

export default function Progress() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t('studentProgressTitle')}</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t('progressWillAppear')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('progressDataNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
