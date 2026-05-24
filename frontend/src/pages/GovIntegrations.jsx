import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import PageHeader from '../components/ui/PageHeader';
import { 
  Settings, RefreshCw, CheckCircle, XCircle, 
  Clock, FileText, Shield, Loader2 
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const INTEGRATIONS = [
  { 
    id: 'gosi', 
    name_ar: 'التأمينات الاجتماعية', 
    name_en: 'GOSI',
    description_ar: 'التكامل مع نظام التأمينات الاجتماعية',
    description_en: 'Integration with General Organization for Social Insurance',
    icon: Shield,
    color: 'blue'
  },
  { 
    id: 'muqeem', 
    name_ar: 'مقيم', 
    name_en: 'Muqeem',
    description_ar: 'إدارة الإقامات والجوازات',
    description_en: 'Residency and passport management',
    icon: FileText,
    color: 'emerald'
  },
  { 
    id: 'mudad', 
    name_ar: 'مدد', 
    name_en: 'Mudad',
    description_ar: 'نظام مدد للتوطين',
    description_en: 'Mudad localization system',
    icon: FileText,
    color: 'purple'
  },
  { 
    id: 'qiwa', 
    name_ar: 'قوى', 
    name_en: 'QIWA',
    description_ar: 'منصة قوى لإدارة القوى العاملة',
    description_en: 'QIWA workforce management platform',
    icon: FileText,
    color: 'amber'
  },
  { 
    id: 'mol', 
    name_ar: 'وزارة الموارد البشرية', 
    name_en: 'Ministry of Labor',
    description_ar: 'التكامل مع وزارة الموارد البشرية',
    description_en: 'Integration with Ministry of Human Resources',
    icon: Shield,
    color: 'red'
  }
];

export default function GovIntegrations() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('overview');
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(null);

  const [configData, setConfigData] = useState({
    api_endpoint: '',
    api_key: '',
    client_id: '',
    client_secret: '',
    enabled: false,
    notes: ''
  });

  const { data: connectors = [] } = useQuery({
    queryKey: ['govIntegrations', tenantId],
    queryFn: () => tenantQuery('integration_connectors').select('*').match({ connector_type: 'government' }),
  });

  const { data: syncLogs = [] } = useQuery({
    queryKey: ['govSyncLogs', tenantId],
    queryFn: () => tenantQuery('integration_logs').select('*').order('-created_date', 50),
  });

  const handleConfigure = (integration) => {
    const existing = connectors.find(c => c.integration_id === integration.id);
    setSelectedIntegration(integration);
    setConfigData(existing || {
      api_endpoint: '',
      api_key: '',
      client_id: '',
      client_secret: '',
      enabled: false,
      notes: ''
    });
    setShowConfigDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const existing = connectors.find(c => c.integration_id === selectedIntegration.id);
      
      const data = {
        integration_id: selectedIntegration.id,
        integration_name: isRTL ? selectedIntegration.name_ar : selectedIntegration.name_en,
        connector_type: 'government',
        ...configData,
        last_updated: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      };

      if (existing) {
        await tenantQuery('integration_connectors').update(data);
      } else {
        await tenantQuery('integration_connectors').insert(data);
      }

      queryClient.invalidateQueries({ queryKey: ['govIntegrations'] });
      setShowConfigDialog(false);
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (integration) => {
    setSyncing(integration.id);
    try {
      await tenantQuery('integration_logs').insert({
        integration_id: integration.id,
        integration_name: isRTL ? integration.name_ar : integration.name_en,
        action: 'manual_sync',
        status: 'success',
        message: isRTL ? 'تمت المزامنة يدوياً' : 'Manual sync triggered',
        sync_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      });

      queryClient.invalidateQueries({ queryKey: ['govSyncLogs'] });
      toast.success(isRTL ? 'تمت المزامنة' : 'Sync completed');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSyncing(null);
    }
  };

  const getIntegrationStatus = (integrationId) => {
    const connector = connectors.find(c => c.integration_id === integrationId);
    return connector?.enabled ? 'connected' : 'disconnected';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'التكاملات الحكومية' : 'Government Integrations'}
        subtitle={isRTL ? 'إدارة الاتصال بالأنظمة الحكومية' : 'Manage connections with government systems'}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{isRTL ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="logs">{isRTL ? 'سجل المزامنة' : 'Sync Logs'}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {INTEGRATIONS.map(integration => {
              const Icon = integration.icon;
              const status = getIntegrationStatus(integration.id);
              const connector = connectors.find(c => c.integration_id === integration.id);
              
              return (
                <Card key={integration.id} className="relative overflow-hidden">
                  <div className={`absolute top-0 left-0 right-0 h-1 bg-${integration.color}-500`} />
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-${integration.color}-100 flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 text-${integration.color}-600`} />
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {isRTL ? integration.name_ar : integration.name_en}
                          </CardTitle>
                          <p className="text-sm text-slate-500">
                            {isRTL ? integration.description_ar : integration.description_en}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">{isRTL ? 'الحالة' : 'Status'}</span>
                        <Badge className={status === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
                          {status === 'connected' ? (
                            <><CheckCircle className="w-3 h-3 me-1" /> {isRTL ? 'متصل' : 'Connected'}</>
                          ) : (
                            <><XCircle className="w-3 h-3 me-1" /> {isRTL ? 'غير متصل' : 'Disconnected'}</>
                          )}
                        </Badge>
                      </div>
                      
                      {connector?.last_sync && (
                        <div className="text-xs text-slate-500">
                          {isRTL ? 'آخر مزامنة:' : 'Last sync:'} {format(new Date(connector.last_sync), 'dd/MM/yyyy HH:mm')}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleConfigure(integration)}
                        >
                          <Settings className="w-4 h-4 me-1" />
                          {isRTL ? 'إعدادات' : 'Configure'}
                        </Button>
                        {status === 'connected' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleSync(integration)}
                            disabled={syncing === integration.id}
                          >
                            {syncing === integration.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'سجل المزامنة' : 'Synchronization Logs'}</CardTitle>
            </CardHeader>
            <CardContent>
              {syncLogs.length === 0 ? (
                <p className="text-slate-500 text-center py-8">{isRTL ? 'لا توجد سجلات' : 'No logs available'}</p>
              ) : (
                <div className="space-y-2">
                  {syncLogs.map(log => (
                    <div key={log.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {log.status === 'success' ? (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        ) : log.status === 'error' ? (
                          <XCircle className="w-5 h-5 text-red-600" />
                        ) : (
                          <Clock className="w-5 h-5 text-amber-600" />
                        )}
                        <div>
                          <p className="font-medium">{log.integration_name}</p>
                          <p className="text-sm text-slate-500">{log.message}</p>
                        </div>
                      </div>
                      <div className="text-sm text-slate-500">
                        {format(new Date(log.created_date), 'dd/MM/yyyy HH:mm')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isRTL ? 'إعدادات' : 'Configure'} {selectedIntegration && (isRTL ? selectedIntegration.name_ar : selectedIntegration.name_en)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
              {isRTL 
                ? 'تنبيه: هذه الإعدادات للتحضير المستقبلي. التكامل الفعلي يتطلب موافقات وشهادات رسمية.'
                : 'Notice: These settings are for future preparation. Actual integration requires official approvals and certificates.'
              }
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'نقطة الوصول API' : 'API Endpoint'}</Label>
              <Input 
                value={configData.api_endpoint} 
                onChange={(e) => setConfigData(p => ({...p, api_endpoint: e.target.value}))}
                placeholder="https://api.example.gov.sa"
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'معرف العميل' : 'Client ID'}</Label>
              <Input 
                value={configData.client_id} 
                onChange={(e) => setConfigData(p => ({...p, client_id: e.target.value}))}
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'المفتاح السري' : 'Client Secret'}</Label>
              <Input 
                type="password"
                value={configData.client_secret} 
                onChange={(e) => setConfigData(p => ({...p, client_secret: e.target.value}))}
              />
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea 
                value={configData.notes} 
                onChange={(e) => setConfigData(p => ({...p, notes: e.target.value}))}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <input 
                type="checkbox"
                checked={configData.enabled}
                onChange={(e) => setConfigData(p => ({...p, enabled: e.target.checked}))}
                className="w-4 h-4"
              />
              <Label>{isRTL ? 'تفعيل التكامل' : 'Enable Integration'}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}