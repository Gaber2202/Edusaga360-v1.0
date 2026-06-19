import React from 'react';
import { Card, CardContent } from '../components/ui/card';
import { ClipboardCheck } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

export default function Attendance() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">{t('attendanceRecords')}</h1>
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">{t('attendanceWillAppear')}</p>
          <p className="text-xs text-slate-400 mt-1">{t('attendanceDataNote')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
