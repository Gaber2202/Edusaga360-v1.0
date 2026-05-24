import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import ServiceTile from './ServiceTile';
import ServiceWorkflowDialog from './ServiceWorkflowDialog';
import { Shield, AlertTriangle, Search } from 'lucide-react';

const ABSHER_SERVICES = [
  {
    code: 'ABSHER-AUTHORIZATIONS', nameAr: 'التفويضات', nameEn: 'Authorizations',
    descAr: 'إدارة وتحديث تفويضات المنشأة في أبشر أعمال', descEn: 'Manage and update establishment authorizations in Absher Business',
    icon: Shield, color: 'emerald',
  },
  {
    code: 'ABSHER-VIOLATIONS', nameAr: 'المخالفات', nameEn: 'Violations',
    descAr: 'الاطلاع على مخالفات المنشأة ومتابعة حالتها', descEn: 'View establishment violations and track their status',
    icon: AlertTriangle, color: 'red',
  },
  {
    code: 'ABSHER-RESIDENCY-INQUIRY', nameAr: 'الاستعلام عن الإقامة', nameEn: 'Residency Inquiry',
    descAr: 'الاستعلام عن حالة الإقامة وبيانات الموظفين', descEn: 'Inquire about residency status and employee data',
    icon: Search, color: 'blue',
  },
];

export default function AbsherServices() {
  const { isRTL } = useLanguage();
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-6 mt-4">
      <div className="p-4 rounded-xl bg-slate-800 border border-slate-700 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-white font-semibold">{isRTL ? 'أبشر أعمال' : 'Absher Business'}</h3>
          <p className="text-slate-400 text-sm mt-1">
            {isRTL
              ? 'منصة أبشر أعمال تتيح لأصحاب العمل إدارة شؤون موظفيهم وتراخيص منشآتهم إلكترونياً'
              : 'Absher Business platform enables employers to manage employee affairs and establishment licenses electronically'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {ABSHER_SERVICES.map(service => (
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