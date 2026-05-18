import React, { useState } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import GovComplianceDashboard from '../components/gov/GovComplianceDashboard';
import MuqeemServices from '../components/gov/MuqeemServices';
import QiwaServices from '../components/gov/QiwaServices';
import GOSIServices from '../components/gov/GOSIServices';
import MudadServices from '../components/gov/MudadServices';
import AbsherServices from '../components/gov/AbsherServices';
import ViolationsPenalties from '../components/gov/ViolationsPenalties';
import GovReports from '../components/gov/GovReports';
import QiwaContracts from '../components/gov/QiwaContracts';
import { Shield } from 'lucide-react';

export default function GovernmentRelations() {
  const { isRTL } = useLanguage();
  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    { id: 'dashboard', ar: 'لوحة الامتثال', en: 'Compliance' },
    { id: 'muqeem', ar: 'مقيم', en: 'Muqeem' },
    { id: 'qiwa', ar: 'قوى', en: 'Qiwa' },
    { id: 'qiwa_contracts', ar: 'عقود قوى', en: 'Qiwa Contracts' },
    { id: 'gosi', ar: 'التأمينات', en: 'GOSI' },
    { id: 'mudad', ar: 'مدد / WPS', en: 'Mudad / WPS' },
    { id: 'absher', ar: 'أبشر أعمال', en: 'Absher' },
    { id: 'violations', ar: 'المخالفات', en: 'Violations' },
    { id: 'reports', ar: 'التقارير', en: 'Reports' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center gap-4 shadow-sm">
        <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
          <Shield className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isRTL ? 'العلاقات الحكومية' : 'Government Relations'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isRTL ? 'إدارة الامتثال الحكومي والخدمات التنظيمية — السوق السعودي' : 'Government Compliance & Regulatory Services — Saudi Market'}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir={isRTL ? 'rtl' : 'ltr'}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-white border border-slate-200 p-1 rounded-lg shadow-sm">
          {tabs.map(tab => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="text-xs sm:text-sm px-3 py-2 font-medium text-slate-600 hover:text-slate-900 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm rounded-md transition-all"
            >
              {isRTL ? tab.ar : tab.en}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dashboard"><GovComplianceDashboard /></TabsContent>
        <TabsContent value="muqeem"><MuqeemServices /></TabsContent>
        <TabsContent value="qiwa"><QiwaServices /></TabsContent>
        <TabsContent value="qiwa_contracts"><QiwaContracts /></TabsContent>
        <TabsContent value="gosi"><GOSIServices /></TabsContent>
        <TabsContent value="mudad"><MudadServices /></TabsContent>
        <TabsContent value="absher"><AbsherServices /></TabsContent>
        <TabsContent value="violations"><ViolationsPenalties /></TabsContent>
        <TabsContent value="reports"><GovReports /></TabsContent>
      </Tabs>
    </div>
  );
}