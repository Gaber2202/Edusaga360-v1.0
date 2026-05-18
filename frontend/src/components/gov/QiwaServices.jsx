import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import ServiceTile from './ServiceTile';
import ServiceWorkflowDialog from './ServiceWorkflowDialog';
import { ArrowLeftRight, FileText, Briefcase, Shield, BarChart2 } from 'lucide-react';

const QIWA_SERVICES = [
  {
    code: 'QIWA-TRANSFER', nameAr: 'نقل موظف', nameEn: 'Employee Transfer',
    descAr: 'إتمام عملية نقل موظف عبر منصة قوى', descEn: 'Complete employee transfer via Qiwa platform',
    icon: ArrowLeftRight, color: 'emerald',
  },
  {
    code: 'QIWA-JOB-OFFER', nameAr: 'إدارة عروض العمل', nameEn: 'Job Offer Management',
    descAr: 'إصدار وإدارة عروض العمل الرسمية', descEn: 'Issue and manage official job offers',
    icon: FileText, color: 'blue',
  },
  {
    code: 'QIWA-CONTRACT', nameAr: 'توثيق العقود', nameEn: 'Contract Documentation',
    descAr: 'توثيق عقود العمل وتسجيلها في المنصة', descEn: 'Document and register employment contracts on Qiwa',
    icon: Briefcase, color: 'amber',
  },
  {
    code: 'QIWA-SAUDIZATION', nameAr: 'مراقبة السعودة', nameEn: 'Saudization Monitoring',
    descAr: 'متابعة نسب التوطين وتحقيق الأهداف', descEn: 'Monitor Saudization quotas and track compliance',
    icon: BarChart2, color: 'teal',
  },
  {
    code: 'QIWA-AUTHORIZATION', nameAr: 'تفويض المنشأة', nameEn: 'Establishment Authorization',
    descAr: 'إدارة تفويضات المنشأة وصلاحيات المستخدمين', descEn: 'Manage establishment authorizations and user permissions',
    icon: Shield, color: 'purple',
  },
];

export default function QiwaServices() {
  const { isRTL } = useLanguage();
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {QIWA_SERVICES.map(service => (
          <ServiceTile
            key={service.code}
            icon={service.icon}
            nameAr={service.nameAr}
            nameEn={service.nameEn}
            descAr={service.descAr}
            descEn={service.descEn}
            color={service.color}
            isRTL={isRTL}
            onStart={() => setSelected(service)}
          />
        ))}
      </div>
      <ServiceWorkflowDialog open={!!selected} onClose={() => setSelected(null)} service={selected} isRTL={isRTL} />
    </div>
  );
}