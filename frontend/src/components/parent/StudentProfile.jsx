import React from 'react';
import { useLanguage } from '../LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export default function StudentProfile({ student }) {
  const { isRTL } = useLanguage();

  if (!student) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          {isRTL ? 'يرجى اختيار طالب' : 'Please select a student'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'معلومات الاتصال' : 'Contact Information'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{isRTL ? 'العنوان' : 'Address'}</p>
            <p className="font-medium">{student.address || (isRTL ? 'غير محدد' : 'Not provided')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{isRTL ? 'المدينة' : 'City'}</p>
            <p className="font-medium">{student.city || (isRTL ? 'غير محدد' : 'Not provided')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{isRTL ? 'جهة الاتصال الطارئة' : 'Emergency Contact'}</p>
            <p className="font-medium">{student.emergency_contact || (isRTL ? 'غير محدد' : 'Not provided')}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{isRTL ? 'رقم الهاتف الطارئ' : 'Emergency Phone'}</p>
            <p className="font-medium">{student.emergency_phone || (isRTL ? 'غير محدد' : 'Not provided')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'معلومات صحية' : 'Health Information'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">{isRTL ? 'ملاحظات طبية' : 'Medical Notes'}</p>
          <p className="font-medium">{student.medical_notes || (isRTL ? 'لا توجد ملاحظات' : 'No notes')}</p>
        </CardContent>
      </Card>
    </div>
  );
}