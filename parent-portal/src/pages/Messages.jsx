import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { MessageSquare } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

export default function Messages() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-ink">{t('messagesTitle')}</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t('messagesWillAppear')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('messagesNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
