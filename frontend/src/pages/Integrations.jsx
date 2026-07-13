import React, { useMemo } from 'react';
import { KeyRound, Users, Mail, Building2, MessageSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import ApiKeysTab from '../components/integrations/ApiKeysTab';
import AtsConnectorsTab from '../components/integrations/AtsConnectorsTab';
import EmailConnectorsTab from '../components/integrations/EmailConnectorsTab';
import MessagingConnectorsTab from '../components/integrations/MessagingConnectorsTab';
import PlatformManagedCatalog from '../components/integrations/PlatformManagedCatalog';

/**
 * Integrations — a technical/IT area (gated to admin + it_admin), split into:
 *
 *   Self-service — the school's IT admin configures these directly:
 *     • API keys → external /api/v1 access (legacy import, custom systems)
 *     • ATS      → hiring connectors (admin/HR only)
 *     • Email    → school mailbox (SMTP/Gmail/Microsoft 365/custom)
 *
 *   Platform-managed — regulated Saudi connectors (ZATCA, GOSI, Qiwa/Mudad,
 *     Noor, Madrasati, Nafath, …) that EduSaga provisions per school.
 *
 * Tabs are shown per role so a user is never offered a tab whose backend would
 * reject them (e.g. ATS is admin/HR-owned).
 */
const IT_ROLES = ['admin', 'creator', 'it_admin'];
const HR_ROLES = ['admin', 'creator', 'hr_head', 'hr_admin', 'hr_officer'];

export default function Integrations() {
  const { isRTL } = useLanguage();
  const { userRole } = useRole();
  const T = (en, ar) => (isRTL ? ar : en);

  const canIt = IT_ROLES.includes(userRole);
  const canHr = HR_ROLES.includes(userRole);

  // First self-service tab the user is allowed to see (drives the default).
  const defaultTab = useMemo(() => {
    if (canIt) return 'api-keys';
    if (canHr) return 'ats';
    return 'platform';
  }, [canIt, canHr]);

  return (
    <div className="p-6 max-w-6xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        title={T('Integrations', 'التكاملات')}
        subtitle={T('Technical area for your IT admin. Configure self-service connectors, or request an EduSaga-managed integration.',
                    'منطقة تقنية لمسؤول تقنية المعلومات. هيّئ التكاملات الذاتية أو اطلب تكاملاً يُدار بواسطة إيدوساغا.')}
      />

      {/* key on the resolved default so the tab selection is correct once the
          user's role finishes loading (Tabs is uncontrolled). */}
      <Tabs key={defaultTab} defaultValue={defaultTab} className="mt-6">
        <TabsList>
          {canIt && (
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" />{T('API Keys', 'مفاتيح API')}
            </TabsTrigger>
          )}
          {canHr && (
            <TabsTrigger value="ats" className="flex items-center gap-2">
              <Users className="w-4 h-4" />{T('ATS / Hiring', 'تتبع المتقدمين')}
            </TabsTrigger>
          )}
          {canIt && (
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />{T('Email', 'البريد')}
            </TabsTrigger>
          )}
          {canIt && (
            <TabsTrigger value="messaging" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />{T('SMS / WhatsApp', 'الرسائل وواتساب')}
            </TabsTrigger>
          )}
          <TabsTrigger value="platform" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />{T('Platform-managed', 'المُدارة بواسطة المنصة')}
          </TabsTrigger>
        </TabsList>

        {canIt && <TabsContent value="api-keys" className="mt-4"><ApiKeysTab /></TabsContent>}
        {canHr && <TabsContent value="ats" className="mt-4"><AtsConnectorsTab /></TabsContent>}
        {canIt && <TabsContent value="email" className="mt-4"><EmailConnectorsTab /></TabsContent>}
        {canIt && <TabsContent value="messaging" className="mt-4"><MessagingConnectorsTab /></TabsContent>}
        <TabsContent value="platform" className="mt-4"><PlatformManagedCatalog /></TabsContent>
      </Tabs>
    </div>
  );
}
