import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Calendar, Info } from 'lucide-react';

export default function DepreciationScheduler() {
  const { isRTL } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          {isRTL ? 'الجدولة التلقائية' : 'Auto-Scheduling'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-najdi-50 border border-najdi-100 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-najdi-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-najdi-900">
              {isRTL ? 'الجدولة التلقائية' : 'Automatic Scheduling'}
            </p>
            <p className="text-sm text-najdi-900 mt-1">
              {isRTL
                ? 'يمكن جدولة تشغيل الإهلاك الشهري تلقائياً من خلال قسم "Automations" في لوحة تحكم المنصة. تشغيل يدوي متاح من زر "تشغيل الإهلاك" أعلاه.'
                : 'Monthly depreciation can be scheduled automatically via the platform\'s Automations panel. Manual runs are available via the "Run Depreciation" button above.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}