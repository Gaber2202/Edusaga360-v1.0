import React, { useState, useEffect } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import PageHeader from '../components/ui/PageHeader';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

const DEFAULT_SETTINGS = [
  { key: 'contract_renewal_days', value: '30', description: 'Days before contract renewal to send notification' },
  { key: 'invoice_due_days', value: '7', description: 'Days before invoice due date to send notification' },
  { key: 'invoice_overdue_days', value: '1', description: 'Days after invoice overdue to send notification' },
  { key: 'error_burst_threshold', value: '3', description: 'Number of errors to trigger critical alert' },
  { key: 'error_burst_window', value: '10', description: 'Time window in minutes for error burst detection' }
];

export default function NotificationSettings() {
  const { t: _t, isRTL } = useLanguage();
  const { userRole } = useRole();
  const { tenantFilter, tenantId: _tenantId } = useTenantFilter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({});

  const isAuthorized = userRole === 'creator' || userRole === 'admin';

  useEffect(() => {
    if (!isAuthorized) return;
    fetchSettings();
     
  }, [isAuthorized]);

  // Only Creator/Admin can access
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md w-full p-6">
          <div className="text-center">
            <p className="text-slate-600">{isRTL ? 'غير مصرح' : 'Unauthorized'}</p>
          </div>
        </Card>
      </div>
    );
  }

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data: allSettings = [] } = await tenantQuery('notification_settings').select('*').match(tenantFilter());
      const settingsMap = {};
      
      for (const setting of DEFAULT_SETTINGS) {
        const existing = allSettings.find(s => s.setting_key === setting.key);
        settingsMap[setting.key] = existing ? existing.setting_value : setting.value;
      }
      
      setSettings(settingsMap);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: allSettings = [] } = await tenantQuery('notification_settings').select('*').match(tenantFilter());
      
      for (const setting of DEFAULT_SETTINGS) {
        const existing = allSettings.find(s => s.setting_key === setting.key);
        
        if (existing) {
          await tenantQuery('notification_settings').update({
            setting_value: settings[setting.key],
            updated_by: (await supabase.auth.getUser().then(r => r.data?.user))?.email
          });
        } else {
          await tenantQuery('notification_settings').insert({
            setting_key: setting.key,
            setting_value: settings[setting.key],
            description: setting.description,
            updated_by: (await supabase.auth.getUser().then(r => r.data?.user))?.email
          });
        }
      }
      
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إعدادات الإشعارات' : 'Notification Settings'}
        subtitle={isRTL ? 'تكوين عتبات وتفضيلات النظام' : 'Configure system thresholds and preferences'}
      />

      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'عتبات التنبيهات' : 'Alert Thresholds'}</CardTitle>
          <CardDescription>
            {isRTL ? 'تحديد متى يتم إرسال الإشعارات' : 'Define when notifications should be sent'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <Label>{isRTL ? 'تجديد العقود (أيام قبل انتهاء الصلاحية)' : 'Contract Renewals (days before expiry)'}</Label>
                <p className="text-sm text-slate-500">
                  {isRTL ? 'إرسال إشعار عندما يقترب موعد تجديد العقد' : 'Send notification when contract renewal is approaching'}
                </p>
              </div>
              <Input
                type="number"
                value={settings.contract_renewal_days || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, contract_renewal_days: e.target.value }))}
                min="1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <Label>{isRTL ? 'الفواتير القريبة من الاستحقاق (أيام قبل)' : 'Invoices Due Soon (days before)'}</Label>
                <p className="text-sm text-slate-500">
                  {isRTL ? 'إرسال إشعار عندما تقترب الفاتورة من موعد الاستحقاق' : 'Send notification when invoice is approaching due date'}
                </p>
              </div>
              <Input
                type="number"
                value={settings.invoice_due_days || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, invoice_due_days: e.target.value }))}
                min="1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <Label>{isRTL ? 'الفواتير المتأخرة (أيام بعد الاستحقاق)' : 'Invoices Overdue (days after due)'}</Label>
                <p className="text-sm text-slate-500">
                  {isRTL ? 'إرسال إشعار عندما تتأخر الفاتورة' : 'Send notification when invoice becomes overdue'}
                </p>
              </div>
              <Input
                type="number"
                value={settings.invoice_overdue_days || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, invoice_overdue_days: e.target.value }))}
                min="1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <Label>{isRTL ? 'عتبة الأخطاء المتكررة (عدد الأخطاء)' : 'Error Burst Threshold (number of errors)'}</Label>
                <p className="text-sm text-slate-500">
                  {isRTL ? 'عدد الأخطاء لإرسال تنبيه حرج' : 'Number of errors to trigger critical alert'}
                </p>
              </div>
              <Input
                type="number"
                value={settings.error_burst_threshold || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, error_burst_threshold: e.target.value }))}
                min="1"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <Label>{isRTL ? 'نافذة الأخطاء المتكررة (دقائق)' : 'Error Burst Window (minutes)'}</Label>
                <p className="text-sm text-slate-500">
                  {isRTL ? 'الإطار الزمني لاكتشاف الأخطاء المتكررة' : 'Time window for error burst detection'}
                </p>
              </div>
              <Input
                type="number"
                value={settings.error_burst_window || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, error_burst_window: e.target.value }))}
                min="1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 bg-slate-900 hover:bg-slate-800">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" />
          {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}