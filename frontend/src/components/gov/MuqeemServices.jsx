import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import ServiceTile from './ServiceTile';
import ServiceWorkflowDialog from './ServiceWorkflowDialog';
import {
  FileText, RefreshCw, ArrowLeftRight, Briefcase, XCircle,
  PlaneTakeoff, Clock, LogOut, User, BarChart2, FileSearch
} from 'lucide-react';

const MUQEEM_SERVICES = [
  // Iqama
  {
    code: 'MUQEEM-IQAMA-ISSUE', nameAr: 'إصدار إقامة', nameEn: 'Issue Iqama',
    descAr: 'إصدار إقامة عمل جديدة للموظف', descEn: 'Issue a new work residence permit for an employee',
    icon: FileText, color: 'emerald', group: 'iqama',
  },
  {
    code: 'MUQEEM-IQAMA-RENEW', nameAr: 'تجديد إقامة', nameEn: 'Renew Iqama',
    descAr: 'تجديد إقامة موظف منتهية أو قريبة من الانتهاء', descEn: 'Renew expiring or expired employee residence permit',
    icon: RefreshCw, color: 'blue', group: 'iqama',
  },
  {
    code: 'MUQEEM-IQAMA-TRANSFER', nameAr: 'نقل كفالة', nameEn: 'Transfer Sponsorship',
    descAr: 'نقل كفالة الموظف إلى جهة عمل أخرى', descEn: 'Transfer employee sponsorship to another employer',
    icon: ArrowLeftRight, color: 'amber', group: 'iqama',
  },
  {
    code: 'MUQEEM-IQAMA-PROFESSION', nameAr: 'تغيير المهنة', nameEn: 'Change Profession',
    descAr: 'تعديل المسمى الوظيفي في الإقامة', descEn: 'Update the job title on the residence permit',
    icon: Briefcase, color: 'purple', group: 'iqama',
  },
  {
    code: 'MUQEEM-IQAMA-CANCEL', nameAr: 'إلغاء إقامة', nameEn: 'Cancel Iqama',
    descAr: 'إلغاء إقامة موظف منتهية الخدمة', descEn: 'Cancel residence permit for terminated employee',
    icon: XCircle, color: 'red', group: 'iqama',
  },
  // Visa
  {
    code: 'MUQEEM-VISA-EXIT-REENTRY', nameAr: 'إصدار تأشيرة خروج وعودة', nameEn: 'Issue Exit/Re-entry Visa',
    descAr: 'إصدار تأشيرة للخروج والعودة للموظف', descEn: 'Issue exit/re-entry visa for employee travel',
    icon: PlaneTakeoff, color: 'blue', group: 'visa',
  },
  {
    code: 'MUQEEM-VISA-EXTEND', nameAr: 'تمديد تأشيرة', nameEn: 'Extend Visa',
    descAr: 'تمديد مدة صلاحية التأشيرة الحالية', descEn: 'Extend the validity of current visa',
    icon: Clock, color: 'amber', group: 'visa',
  },
  {
    code: 'MUQEEM-VISA-FINAL-EXIT', nameAr: 'تأشيرة خروج نهائي', nameEn: 'Final Exit Visa',
    descAr: 'إصدار تأشيرة خروج نهائي للموظف', descEn: 'Issue final exit visa for departing employee',
    icon: LogOut, color: 'red', group: 'visa',
  },
  {
    code: 'MUQEEM-VISA-CANCEL', nameAr: 'إلغاء تأشيرة', nameEn: 'Cancel Visa',
    descAr: 'إلغاء تأشيرة موظف', descEn: 'Cancel an employee visa',
    icon: XCircle, color: 'red', group: 'visa',
  },
  // Passport
  {
    code: 'MUQEEM-PASSPORT-UPDATE', nameAr: 'تحديث بيانات المقيم', nameEn: 'Update Resident Info',
    descAr: 'تحديث بيانات جواز السفر أو المعلومات الشخصية', descEn: 'Update passport or personal information for resident',
    icon: User, color: 'teal', group: 'passport',
  },
  // Reports
  {
    code: 'MUQEEM-REPORT-OPS', nameAr: 'تقرير العمليات', nameEn: 'Operations Report',
    descAr: 'تقرير شامل عن عمليات المقيم', descEn: 'Comprehensive operations report from Muqeem',
    icon: BarChart2, color: 'purple', group: 'reports',
  },
  {
    code: 'MUQEEM-REPORT-STATUS', nameAr: 'تقرير حالة المقيمين', nameEn: 'Resident Status Report',
    descAr: 'تقرير بحالة جميع المقيمين المسجلين', descEn: 'Status report for all registered residents',
    icon: FileSearch, color: 'blue', group: 'reports',
  },
];

const GROUPS = [
  { key: 'iqama', ar: 'خدمات الإقامة', en: 'Iqama Services' },
  { key: 'visa', ar: 'خدمات التأشيرات', en: 'Visa Services' },
  { key: 'passport', ar: 'خدمات الجواز', en: 'Passport Services' },
  { key: 'reports', ar: 'التقارير', en: 'Reports' },
];

export default function MuqeemServices() {
  const { isRTL } = useLanguage();
  const [selected, setSelected] = useState(null);

  return (
    <div className="space-y-8 mt-4">
      {GROUPS.map(group => {
        const services = MUQEEM_SERVICES.filter(s => s.group === group.key);
        return (
          <div key={group.key}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-white font-semibold text-base">{isRTL ? group.ar : group.en}</h2>
              <div className="flex-1 h-px bg-slate-700" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {services.map(service => (
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
          </div>
        );
      })}

      <ServiceWorkflowDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        service={selected}
        isRTL={isRTL}
      />
    </div>
  );
}