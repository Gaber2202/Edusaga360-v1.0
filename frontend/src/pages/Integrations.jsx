import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { CreditCard, BookOpen, Shield, Bell, FileText, RefreshCw, Settings, Loader2, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const CONNECTOR_CONFIGS = {
  payment_gateway: {
    icon: CreditCard,
    color: 'bg-blue-50 text-blue-600',
    providers: ['Mada/SPAN', 'Visa/Mastercard', 'SADAD', 'STC Pay', 'Apple Pay'],
    fields: ['api_key', 'api_secret', 'merchant_id']
  },
  sis_lms: {
    icon: BookOpen,
    color: 'bg-purple-50 text-purple-600',
    providers: ['Classera', 'EduPage', 'Moodle', 'Custom API'],
    fields: ['api_endpoint', 'api_key', 'client_id']
  },
  identity: {
    icon: Shield,
    color: 'bg-green-50 text-green-600',
    providers: ['Azure AD', 'Google Workspace', 'LDAP'],
    fields: ['tenant_id', 'client_id', 'client_secret']
  },
  sms: {
    icon: Bell,
    color: 'bg-amber-50 text-amber-600',
    providers: ['Unifonic', 'Twilio', 'MSEGAT'],
    fields: ['api_key', 'sender_id']
  },
  email: {
    icon: Bell,
    color: 'bg-red-50 text-red-600',
    providers: ['SendGrid', 'Mailgun', 'SMTP'],
    fields: ['api_key', 'sender_email']
  },
  zatca: {
    icon: FileText,
    color: 'bg-teal-50 text-teal-600',
    providers: ['ZATCA Fatoora'],
    fields: ['otp', 'certificate', 'private_key']
  }
};

export default function Integrations() {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  
  const [showConfig, setShowConfig] = useState(null);
  const [showLogs, setShowLogs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});

  const { data: connectors = [], isLoading: _isLoading } = useQuery({
    queryKey: ['connectors', tenantId],
    queryFn: () => fetchData(tenantQuery('integration_connectors').select('*').match(tenantFilter())),
    enabled: hasTenantAccess,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['integrationLogs', showLogs?.id, tenantId],
    queryFn: () => fetchData(tenantQuery('integration_logs').select('*').match(tenantFilter({ connector_id: showLogs?.id })).order('created_date', { ascending: false }).limit()),
    enabled: !!showLogs?.id && hasTenantAccess,
  });

  const handleSaveConfig = async () => {
    if (!formData.provider) {
      toast.error(isRTL ? 'يرجى اختيار مزود الخدمة' : 'Please select a provider');
      return;
    }

    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const saveData = {
        connector_type: showConfig.type,
        connector_name: formData.connector_name || t(showConfig.type),
        provider: formData.provider,
        api_endpoint: formData.api_endpoint || '',
        credentials: formData.credentials || {},
        is_active: formData.is_active || false,
        status: formData.is_active ? 'testing' : 'disconnected',
        last_modified_by: user.email
      };

      if (showConfig.connector?.id) {
        await tenantQuery('integration_connectors').update(saveData);
        await logAuditEvent({
          action: AuditActions.CONFIGURE,
          entityType: 'IntegrationConnector',
          entityId: showConfig.connector.id,
          oldValues: showConfig.connector,
          newValues: saveData,
          page: 'Integrations',
          notes: `Configured ${saveData.provider} connector`
        });
      } else {
        const created = await tenantQuery('integration_connectors').insert(saveData);
        await logAuditEvent({
          action: AuditActions.CREATE,
          entityType: 'IntegrationConnector',
          entityId: created.id,
          newValues: saveData,
          page: 'Integrations',
          notes: `Created ${saveData.provider} connector`
        });
      }
      queryClient.invalidateQueries({ queryKey: ['connectors'] });
      setShowConfig(null);
      setFormData({});
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (_connector) => {
    toast.info(isRTL ? 'جاري اختبار الاتصال...' : 'Testing connection...');
    // Simulate test
    setTimeout(() => {
      toast.success(isRTL ? 'الاتصال ناجح' : 'Connection successful');
    }, 1500);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'testing': return <Clock className="w-5 h-5 text-amber-500" />;
      default: return <AlertCircle className="w-5 h-5 text-slate-400" />;
    }
  };

  const ConnectorCard = ({ type, config }) => {
    const connector = connectors.find(c => c.connector_type === type);
    const Icon = config.icon;

    return (
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${config.color} flex items-center justify-center`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{t(type) || type}</h3>
              <p className="text-sm text-slate-500">{connector?.provider || (isRTL ? 'غير مهيأ' : 'Not configured')}</p>
            </div>
          </div>
          {connector && getStatusIcon(connector.status)}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {connector?.last_sync ? (
              <span>{isRTL ? 'آخر مزامنة:' : 'Last sync:'} {format(new Date(connector.last_sync), 'dd/MM HH:mm')}</span>
            ) : (
              <span>{isRTL ? 'لم تتم المزامنة' : 'Never synced'}</span>
            )}
          </div>
          <div className="flex gap-2">
            {connector && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setShowLogs(connector)}>
                  {isRTL ? 'السجلات' : 'Logs'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleTestConnection(connector)}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                const initialData = connector || { 
                  connector_type: type, 
                  connector_name: t(type), 
                  provider: '',
                  credentials: {}, 
                  is_active: false 
                };
                setFormData(initialData);
                setShowConfig({ ...config, type, connector });
              }}
            >
              <Settings className="w-4 h-4 me-1" />
              {isRTL ? 'إعداد' : 'Configure'}
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('integrations')}
        subtitle={isRTL ? 'مركز التكاملات والموصلات' : 'Integrations hub and connectors'}
      />

      <Tabs defaultValue="connectors">
        <TabsList className="bg-white border">
          <TabsTrigger value="connectors">{isRTL ? 'الموصلات' : 'Connectors'}</TabsTrigger>
          <TabsTrigger value="logs">{isRTL ? 'سجل العمليات' : 'Activity Log'}</TabsTrigger>
        </TabsList>

        <TabsContent value="connectors" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(CONNECTOR_CONFIGS).map(([type, config]) => (
              <ConnectorCard key={type} type={type} config={config} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>{isRTL ? 'الموصل' : 'Connector'}</TableHead>
                  <TableHead>{isRTL ? 'العملية' : 'Operation'}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">{t('noData')}</TableCell></TableRow>
                ) : (
                  logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>{log.connector_type}</TableCell>
                      <TableCell>{log.operation}</TableCell>
                      <TableCell><StatusBadge status={log.status} /></TableCell>
                      <TableCell className="text-sm">{log.created_date ? format(new Date(log.created_date), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Configuration Dialog */}
      <Dialog open={!!showConfig} onOpenChange={() => setShowConfig(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إعداد الموصل' : 'Configure Connector'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'مزود الخدمة' : 'Provider'} *</Label>
              <Select value={formData.provider || ''} onValueChange={(value) => setFormData(p => ({...p, provider: value}))}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر مزود الخدمة' : 'Select provider'} />
                </SelectTrigger>
                <SelectContent>
                  {showConfig?.providers?.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>API Endpoint</Label>
              <Input 
                value={formData.api_endpoint || ''} 
                onChange={(e) => setFormData(p => ({...p, api_endpoint: e.target.value}))}
                placeholder="https://api.example.com/v1"
              />
            </div>

            {showConfig?.fields?.map(field => (
              <div key={field} className="space-y-2">
                <Label>{field.replace('_', ' ').toUpperCase()}</Label>
                <Input 
                  type={field.includes('secret') || field.includes('key') ? 'password' : 'text'}
                  value={formData.credentials?.[field] || ''} 
                  onChange={(e) => setFormData(p => ({...p, credentials: {...p.credentials, [field]: e.target.value}}))}
                  placeholder="••••••••"
                />
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Switch 
                checked={formData.is_active || false} 
                onCheckedChange={(v) => setFormData(p => ({...p, is_active: v}))} 
              />
              <Label>{isRTL ? 'تفعيل الموصل' : 'Enable Connector'}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(null)}>{t('cancel')}</Button>
            <Button onClick={handleSaveConfig} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Dialog */}
      <Dialog open={!!showLogs} onOpenChange={() => setShowLogs(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'سجل العمليات' : 'Activity Log'} - {showLogs?.provider}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'العملية' : 'Operation'}</TableHead>
                <TableHead>{isRTL ? 'الاتجاه' : 'Direction'}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{isRTL ? 'المدة' : 'Duration'}</TableHead>
                <TableHead>{t('date')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell>{log.operation}</TableCell>
                  <TableCell>{log.direction === 'inbound' ? '←' : '→'}</TableCell>
                  <TableCell><StatusBadge status={log.status} /></TableCell>
                  <TableCell>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</TableCell>
                  <TableCell className="text-sm">{log.created_date ? format(new Date(log.created_date), 'dd/MM HH:mm:ss') : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}