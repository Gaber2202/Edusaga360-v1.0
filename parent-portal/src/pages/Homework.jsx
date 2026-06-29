import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { FileText } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

export default function Homework() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t('homeworkAssignments')}</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t('homeworkWillAppear')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('homeworkNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
