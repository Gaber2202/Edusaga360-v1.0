import React, { useState, useEffect } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { tenantQuery } from '../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import PageHeader from '../components/ui/PageHeader';
import { Save, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function NotificationPreferences() {
  const { t: _t, isRTL } = useLanguage();
  const { user, userRole } = useRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState(null);

  useEffect(() => {
    fetchPreferences();
  }, [user?.email]);

  const fetchPreferences = async () => {
    if (!user?.email) return;
    
    setLoading(true);
    try {
      const prefs = await tenantQuery('notification_preferences').select('*').match({ user_email: user.email });
      
      if (prefs && prefs.length > 0) {
        setPreferences(prefs[0]);
      } else {
        // Set defaults based on role
        const defaults = getRoleDefaults(userRole);
        setPreferences({
          user_email: user.email,
          ...defaults
        });
      }
    } catch (error) {
      console.error('Error fetching preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleDefaults = (role) => {
    const defaults = {
      contracts_enabled: false,
      finance_enabled: false,
      admissions_enabled: false,
      hr_enabled: false,
      system_enabled: false,
      min_severity: 'info',
      frequency: 'realtime'
    };

    switch (role) {
      case 'creator':
        return { ...defaults, contracts_enabled: true, finance_enabled: true, admissions_enabled: true, hr_enabled: true, system_enabled: true };
      case 'ceo':
        return { ...defaults, contracts_enabled: true, finance_enabled: true, system_enabled: true };
      case 'cfo':
        return { ...defaults, finance_enabled: true, system_enabled: true };
      case 'hr_admin':
      case 'hr_officer':
        return { ...defaults, hr_enabled: true, system_enabled: true };
      case 'admin':
        return { ...defaults, admissions_enabled: true, contracts_enabled: true, system_enabled: true };
      case 'it_admin':
      case 'it_support':
        return { ...defaults, system_enabled: true };
      default:
        return defaults;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (preferences.id) {
        await tenantQuery('notification_preferences').update(preferences);
      } else {
        await tenantQuery('notification_preferences').insert(preferences);
      }
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Preferences saved successfully');
      fetchPreferences();
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (field) => {
    // Prevent disabling system notifications for IT/Creator roles
    if (field === 'system_enabled' && (userRole === 'creator' || userRole === 'it_admin' || userRole === 'it_support')) {
      toast.error(isRTL ? 'لا يمكن تعطيل إشعارات النظام الحرجة' : 'Cannot disable critical system notifications');
      return;
    }

    setPreferences(prev => ({ ...prev, [field]: !prev[field] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
      </div>
    );
  }

  const isSystemRequired = userRole === 'creator' || userRole === 'it_admin' || userRole === 'it_support';

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'تفضيلات الإشعارات' : 'Notification Preferences'}
        subtitle={isRTL ? 'إدارة إعدادات الإشعارات الخاصة بك' : 'Manage your notification settings'}
      />

      {/* Module Categories */}
      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'فئات الإشعارات' : 'Notification Categories'}</CardTitle>
          <CardDescription>
            {isRTL ? 'اختر الفئات التي تريد تلقي إشعارات منها' : 'Choose which categories you want to receive notifications from'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <Label className="font-semibold text-slate-900">
                {isRTL ? 'العقود' : 'Contracts'}
              </Label>
              <p className="text-sm text-slate-600 mt-1">
                {isRTL ? 'تجديد العقود، انتهاء الصلاحية' : 'Contract renewals, expirations'}
              </p>
            </div>
            <Switch
              checked={preferences?.contracts_enabled}
              onCheckedChange={() => handleToggle('contracts_enabled')}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <Label className="font-semibold text-slate-900">
                {isRTL ? 'المالية والفواتير' : 'Finance & Invoices'}
              </Label>
              <p className="text-sm text-slate-600 mt-1">
                {isRTL ? 'الفواتير المستحقة، المتأخرة، المدفوعات' : 'Due invoices, overdue, payments'}
              </p>
            </div>
            <Switch
              checked={preferences?.finance_enabled}
              onCheckedChange={() => handleToggle('finance_enabled')}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <Label className="font-semibold text-slate-900">
                {isRTL ? 'القبول والطلاب' : 'Admissions & Students'}
              </Label>
              <p className="text-sm text-slate-600 mt-1">
                {isRTL ? 'التسجيلات الجديدة، طلبات القبول' : 'New enrollments, admission requests'}
              </p>
            </div>
            <Switch
              checked={preferences?.admissions_enabled}
              onCheckedChange={() => handleToggle('admissions_enabled')}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <Label className="font-semibold text-slate-900">
                {isRTL ? 'الموارد البشرية' : 'Human Resources'}
              </Label>
              <p className="text-sm text-slate-600 mt-1">
                {isRTL ? 'التوظيف، الإجازات، الحضور' : 'Onboarding, leaves, attendance'}
              </p>
            </div>
            <Switch
              checked={preferences?.hr_enabled}
              onCheckedChange={() => handleToggle('hr_enabled')}
            />
          </div>

          <div className={`flex items-center justify-between p-4 rounded-lg ${isSystemRequired ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Label className="font-semibold text-slate-900">
                  {isRTL ? 'النظام والأخطاء الحرجة' : 'System & Critical Errors'}
                </Label>
                {isSystemRequired && (
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                )}
              </div>
              <p className="text-sm text-slate-600 mt-1">
                {isRTL ? 'أخطاء النظام الحرجة، التنبيهات' : 'Critical system errors, alerts'}
              </p>
              {isSystemRequired && (
                <p className="text-xs text-red-600 mt-1">
                  {isRTL ? 'مطلوب لدورك' : 'Required for your role'}
                </p>
              )}
            </div>
            <Switch
              checked={preferences?.system_enabled}
              onCheckedChange={() => handleToggle('system_enabled')}
              disabled={isSystemRequired}
            />
          </div>
        </CardContent>
      </Card>

      {/* Severity & Frequency */}
      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'التصفية والتكرار' : 'Filtering & Frequency'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الحد الأدنى للخطورة' : 'Minimum Severity'}</Label>
              <Select
                value={preferences?.min_severity}
                onValueChange={(v) => setPreferences(prev => ({ ...prev, min_severity: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">{isRTL ? 'معلومات وما فوق' : 'Info and above'}</SelectItem>
                  <SelectItem value="warning">{isRTL ? 'تحذير وما فوق' : 'Warning and above'}</SelectItem>
                  <SelectItem value="critical">{isRTL ? 'حرج فقط' : 'Critical only'}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {isRTL ? 'استقبال فقط الإشعارات بمستوى الخطورة المحدد أو أعلى' : 'Only receive notifications at this severity level or higher'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'التكرار' : 'Frequency'}</Label>
              <Select
                value={preferences?.frequency}
                onValueChange={(v) => setPreferences(prev => ({ ...prev, frequency: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="realtime">{isRTL ? 'فوري' : 'Real-time'}</SelectItem>
                  <SelectItem value="daily">{isRTL ? 'ملخص يومي' : 'Daily digest'}</SelectItem>
                  <SelectItem value="weekly">{isRTL ? 'ملخص أسبوعي' : 'Weekly digest'}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {isRTL ? 'كيفية تلقي الإشعارات' : 'How you want to receive notifications'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 bg-slate-900 hover:bg-slate-800">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" />
          {isRTL ? 'حفظ التفضيلات' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
}