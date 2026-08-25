import React, { useMemo } from 'react';
import { toast } from 'sonner';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Landmark, ShieldCheck, Users, FileText, IdCard, HeartPulse,
  GraduationCap, BookOpen, Banknote, Info,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useJurisdictionFeatures } from '../JurisdictionFeatureContext';
import { PLATFORM_INTEGRATION_FEATURES } from '../../lib/jurisdictionFeatures';

/**
 * Platform-managed connector catalog (SCRUM-139).
 *
 * Catalog entries are gated by jurisdiction_features (Phase 2 registry) via
 * useJurisdictionFeatures — no jurisdiction_code string compares in React.
 * SA-only connectors are hidden for AE/QA tenants; AE/QA entries appear when
 * their feature keys are enabled.
 */
const CATALOG = [
  {
    group_en: 'Government & Compliance', group_ar: 'الجهات الحكومية والامتثال',
    items: [
      { id: 'einvoice', featureKey: 'einvoicing', icon: FileText, name_en: 'ZATCA (Fatoora)', name_ar: 'هيئة الزكاة (فاتورة)', desc_en: 'E-invoicing clearance & reporting', desc_ar: 'الفوترة الإلكترونية' },
      { id: 'social_insurance', featureKey: 'gosi', icon: ShieldCheck, name_en: 'GOSI', name_ar: 'التأمينات الاجتماعية', desc_en: 'Social insurance registration & contributions', desc_ar: 'التسجيل والاشتراكات' },
      { id: 'labor_portal', featureKey: 'qiwa', icon: Users, name_en: 'Qiwa', name_ar: 'قوى', desc_en: 'Labor / Ministry of HR services', desc_ar: 'خدمات وزارة الموارد البشرية' },
      { id: 'wage_protection', featureKey: 'mudad', icon: Banknote, name_en: 'Mudad (WPS)', name_ar: 'مدد (حماية الأجور)', desc_en: 'Wage Protection System payroll filing', desc_ar: 'رفع ملفات حماية الأجور' },
      { id: 'residency', featureKey: 'muqeem', icon: FileText, name_en: 'Muqeem', name_ar: 'مقيم', desc_en: 'Residency & iqama management', desc_ar: 'إدارة الإقامات' },
      { id: 'wps_uae', featureKey: 'integration_wage_protection', icon: Banknote, name_en: 'UAE WPS', name_ar: 'حماية الأجور الإمارات', desc_en: 'UAE Wage Protection System filing', desc_ar: 'رفع ملفات حماية الأجور الإماراتية' },
    ],
  },
  {
    group_en: 'Education (SIS / LMS)', group_ar: 'التعليم (أنظمة الطلاب والتعلم)',
    items: [
      { id: 'sis_sa', featureKey: 'integration_sis', icon: GraduationCap, name_en: 'Noor System', name_ar: 'نظام نور', desc_en: 'Ministry of Education student system', desc_ar: 'نظام الطلاب بوزارة التعليم' },
      { id: 'lms_sa', featureKey: 'integration_lms', icon: BookOpen, name_en: 'Madrasati', name_ar: 'مدرستي', desc_en: 'National learning management platform', desc_ar: 'منصة التعلم الوطنية' },
      { id: 'moe_uae', featureKey: 'integration_moe_edu', icon: GraduationCap, name_en: 'UAE MoE / eSIS', name_ar: 'وزارة التربية الإمارات', desc_en: 'UAE Ministry of Education student systems', desc_ar: 'أنظمة الطلاب بوزارة التربية الإماراتية' },
      { id: 'nas', featureKey: 'integration_national_admissions', icon: GraduationCap, name_en: 'Qatar NAS', name_ar: 'نظام القبول الوطني', desc_en: 'Qatar national admissions / school systems', desc_ar: 'أنظمة القبول والمدارس في قطر' },
      { id: 'moe_qa', featureKey: 'integration_moe_he', icon: BookOpen, name_en: 'Qatar MoEHE', name_ar: 'وزارة التعليم قطر', desc_en: 'Ministry of Education and Higher Education', desc_ar: 'وزارة التربية والتعليم والتعليم العالي' },
    ],
  },
  {
    group_en: 'Identity & Records', group_ar: 'الهوية والسجلات',
    items: [
      { id: 'national_sso', featureKey: 'integration_national_sso', icon: IdCard, name_en: 'Nafath', name_ar: 'نفاذ', desc_en: 'National single sign-on', desc_ar: 'الدخول الوطني الموحد' },
      { id: 'gov_gateway', featureKey: 'integration_gov_gateway', icon: Landmark, name_en: 'Absher', name_ar: 'أبشر', desc_en: 'Government services gateway', desc_ar: 'بوابة الخدمات الحكومية' },
      { id: 'student_health', featureKey: 'integration_student_health', icon: HeartPulse, name_en: 'Sehhaty / Health', name_ar: 'صحتي', desc_en: 'Student health records (optional)', desc_ar: 'السجلات الصحية للطلاب' },
      { id: 'uae_pass', featureKey: 'uae_pass', icon: IdCard, name_en: 'UAE Pass', name_ar: 'الهوية الرقمية الإماراتية', desc_en: 'National digital identity & SSO', desc_ar: 'الهوية الرقمية الوطنية وتسجيل الدخول الموحد' },
      { id: 'health_ae', featureKey: 'integration_health_authority', icon: HeartPulse, name_en: 'DHA Health', name_ar: 'هيئة الصحة بدبي', desc_en: 'Dubai Health Authority student health', desc_ar: 'السجلات الصحية لهيئة الصحة بدبي' },
      { id: 'health_qa', featureKey: 'integration_public_health', icon: HeartPulse, name_en: 'Qatar MoPH', name_ar: 'وزارة الصحة العامة', desc_en: 'Ministry of Public Health records', desc_ar: 'سجلات وزارة الصحة العامة' },
    ],
  },
];

export default function PlatformManagedCatalog() {
  const { isRTL } = useLanguage();
  const { isFeatureEnabled, loading } = useJurisdictionFeatures();
  const T = (en, ar) => (isRTL ? ar : en);

  const visibleSections = useMemo(() => {
    return CATALOG.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const key = item.featureKey;
        if (!PLATFORM_INTEGRATION_FEATURES.includes(key)) return false;
        return isFeatureEnabled(key);
      }),
    })).filter((section) => section.items.length > 0);
  }, [isFeatureEnabled]);

  const request = (item) => {
    toast.info(
      T(`To enable ${item.name_en}, contact your EduSaga account manager — these integrations are provisioned by our team.`,
        `لتفعيل ${item.name_ar}، تواصل مع مدير حسابك في إيدوساغا — تتم تهيئة هذه التكاملات من قِبل فريقنا.`),
    );
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">{T('Loading integrations…', 'جاري تحميل التكاملات…')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 text-xs text-najdi-900 bg-najdi-50 p-3 rounded">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        {T('These regulated integrations are set up and maintained by the EduSaga team for your school — credentials and government onboarding are handled for you. Only connectors available in your jurisdiction are listed.',
           'تتم تهيئة هذه التكاملات المنظمة وصيانتها من قِبل فريق إيدوساغا لمدرستك. تُعرض فقط الموصلات المتاحة في ولايتك القضائية.')}
      </div>

      {visibleSections.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">
          {T('No platform-managed integrations are enabled for this jurisdiction yet.',
             'لا توجد تكاملات مُدارة بواسطة المنصة مفعّلة لهذه الولاية القضائية بعد.')}
        </p>
      )}

      {visibleSections.map((section) => (
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
