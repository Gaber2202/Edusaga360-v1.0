import React from 'react';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Landmark, ShieldCheck, Users, FileText, IdCard, HeartPulse,
  GraduationCap, BookOpen, Banknote, Info,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';

/**
 * Platform-managed connector catalog.
 *
 * These are the heavy / regulated Saudi integrations that EduSaga provisions per
 * school (credentials, compliance, and government onboarding are handled by the
 * EduSaga team — not self-service). This screen makes the full catalog visible
 * again and lets a school register interest; the request/provision workflow is
 * delivered in a later phase, so for now "Request" points the admin at their
 * EduSaga account manager rather than faking a submission.
 */
const CATALOG = [
  {
    group_en: 'Government & Compliance', group_ar: 'الجهات الحكومية والامتثال',
    items: [
      { id: 'zatca', icon: FileText, name_en: 'ZATCA (Fatoora)', name_ar: 'هيئة الزكاة (فاتورة)', desc_en: 'E-invoicing clearance & reporting', desc_ar: 'الفوترة الإلكترونية' },
      { id: 'gosi', icon: ShieldCheck, name_en: 'GOSI', name_ar: 'التأمينات الاجتماعية', desc_en: 'Social insurance registration & contributions', desc_ar: 'التسجيل والاشتراكات' },
      { id: 'qiwa', icon: Users, name_en: 'Qiwa', name_ar: 'قوى', desc_en: 'Labor / Ministry of HR services', desc_ar: 'خدمات وزارة الموارد البشرية' },
      { id: 'mudad', icon: Banknote, name_en: 'Mudad (WPS)', name_ar: 'مدد (حماية الأجور)', desc_en: 'Wage Protection System payroll filing', desc_ar: 'رفع ملفات حماية الأجور' },
      { id: 'muqeem', icon: FileText, name_en: 'Muqeem', name_ar: 'مقيم', desc_en: 'Residency & iqama management', desc_ar: 'إدارة الإقامات' },
    ],
  },
  {
    group_en: 'Education (SIS / LMS)', group_ar: 'التعليم (أنظمة الطلاب والتعلم)',
    items: [
      { id: 'noor', icon: GraduationCap, name_en: 'Noor System', name_ar: 'نظام نور', desc_en: 'Ministry of Education student system', desc_ar: 'نظام الطلاب بوزارة التعليم' },
      { id: 'madrasati', icon: BookOpen, name_en: 'Madrasati', name_ar: 'مدرستي', desc_en: 'National learning management platform', desc_ar: 'منصة التعلم الوطنية' },
    ],
  },
  {
    group_en: 'Identity & Records', group_ar: 'الهوية والسجلات',
    items: [
      { id: 'nafath', icon: IdCard, name_en: 'Nafath', name_ar: 'نفاذ', desc_en: 'National single sign-on', desc_ar: 'الدخول الوطني الموحد' },
      { id: 'absher', icon: Landmark, name_en: 'Absher', name_ar: 'أبشر', desc_en: 'Government services gateway', desc_ar: 'بوابة الخدمات الحكومية' },
      { id: 'health', icon: HeartPulse, name_en: 'Sehhaty / Health', name_ar: 'صحتي', desc_en: 'Student health records (optional)', desc_ar: 'السجلات الصحية للطلاب' },
    ],
  },
];

export default function PlatformManagedCatalog() {
  const { isRTL } = useLanguage();
  const T = (en, ar) => (isRTL ? ar : en);

  const request = (item) => {
    toast.info(
      T(`To enable ${item.name_en}, contact your EduSaga account manager — these integrations are provisioned by our team.`,
        `لتفعيل ${item.name_ar}، تواصل مع مدير حسابك في إيدوساغا — تتم تهيئة هذه التكاملات من قِبل فريقنا.`),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 text-xs text-najdi-900 bg-najdi-50 p-3 rounded">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        {T('These regulated integrations are set up and maintained by the EduSaga team for your school — credentials and government onboarding are handled for you. Request one to get started.',
           'تتم تهيئة هذه التكاملات المنظمة وصيانتها من قِبل فريق إيدوساغا لمدرستك. اطلب التكامل للبدء.')}
      </div>

      {CATALOG.map((section) => (
        <div key={section.group_en}>
          <h3 className="text-sm font-semibold mb-2">{T(section.group_en, section.group_ar)}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded bg-sand"><Icon className="w-4 h-4 text-najdi-700" /></div>
                      <div>
                        <div className="text-sm font-medium">{T(item.name_en, item.name_ar)}</div>
                        <div className="text-[11px] text-muted-foreground">{T(item.desc_en, item.desc_ar)}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <Badge className="bg-najdi-50 text-najdi-700 text-[10px]">{T('Managed by EduSaga', 'يُدار بواسطة إيدوساغا')}</Badge>
                    <Button variant="outline" size="sm" onClick={() => request(item)}>{T('Request', 'طلب')}</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
