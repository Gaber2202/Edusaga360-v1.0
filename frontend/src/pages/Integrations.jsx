import React from 'react';
import { KeyRound, Users, Mail } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { useLanguage } from '../components/LanguageContext';
import ApiKeysTab from '../components/integrations/ApiKeysTab';
import AtsConnectorsTab from '../components/integrations/AtsConnectorsTab';
import EmailConnectorsTab from '../components/integrations/EmailConnectorsTab';

/**
 * Integrations — control plane for the platform's real integration backends:
 *   • API keys      → external /api/v1 access (legacy import, custom systems)
 *   • ATS           → hiring connectors (LinkedIn/Indeed/Greenhouse/Workday/custom)
 *   • Email         → school mailbox (SMTP/Gmail/Microsoft 365/custom)
 *
 * Each tab talks to the Express backend via the integrations API client, which
 * carries the Supabase JWT. Credentials are encrypted server-side and never
 * returned, so this screen only ever handles metadata + one-time secrets.
 */
export default function Integrations() {
  const { isRTL } = useLanguage();
  const T = (en, ar) => (isRTL ? ar : en);

  return (
    <div className="p-6 max-w-6xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        title={T('Integrations', 'التكاملات')}
        subtitle={T('Connect external systems, applicant tracking, and email to EduSaga 360.',
                    'اربط الأنظمة الخارجية وتتبع المتقدمين والبريد بمنصة إيدوساغا 360.')}
      />

      <Tabs defaultValue="api-keys" className="mt-6">
        <TabsList>
          <TabsTrigger value="api-keys" className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" />{T('API Keys', 'مفاتيح API')}
          </TabsTrigger>
          <TabsTrigger value="ats" className="flex items-center gap-2">
            <Users className="w-4 h-4" />{T('ATS / Hiring', 'تتبع المتقدمين')}
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />{T('Email', 'البريد')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys" className="mt-4"><ApiKeysTab /></TabsContent>
        <TabsContent value="ats" className="mt-4"><AtsConnectorsTab /></TabsContent>
        <TabsContent value="email" className="mt-4"><EmailConnectorsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
