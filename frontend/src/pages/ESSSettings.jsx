import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import PageHeader from '../components/ui/PageHeader';
import { Save, Loader2, TestTube } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function ESSSettings() {
  const { t: _t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [saving, setSaving] = useState(false);

  const { data: essSettings, isLoading } = useQuery({
    queryKey: ['essSettings', tenantId],
    queryFn: async () => {
      const settings = await tenantQuery('ess_settings').select('*').match(tenantFilter());
      return settings[0] || { test_mode_enabled: false, test_employee_id: '', test_employee_name: '' };
    },
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const [formData, setFormData] = useState({
    test_mode_enabled: false,
    test_employee_id: '',
    test_employee_name: ''
  });

  React.useEffect(() => {
    if (essSettings) {
      setFormData({
        test_mode_enabled: essSettings.test_mode_enabled || false,
        test_employee_id: essSettings.test_employee_id || '',
        test_employee_name: essSettings.test_employee_name || ''
      });
    }
  }, [essSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const selectedEmployee = employees.find(e => e.id === formData.test_employee_id);

      const data = {
        ...formData,
        test_employee_name: selectedEmployee ? selectedEmployee.name_ar : '',
        updated_by: user.email,
        updated_date: new Date().toISOString()
      };

      if (essSettings?.id) {
        await tenantQuery('ess_settings').update(data);
      } else {
        await tenantQuery('ess_settings').insert(data);
      }

      queryClient.invalidateQueries({ queryKey: ['essSettings'] });
      toast.success(isRTL ? 'تم الحفظ' : 'Settings saved');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إعدادات ESS' : 'ESS Settings'}
        subtitle={isRTL ? 'إدارة إعدادات بوابة الخدمة الذاتية' : 'Manage Employee Self-Service settings'}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="w-5 h-5" />
            {isRTL ? 'وضع الاختبار' : 'Test Mode'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div>
              <Label className="text-base font-medium">{isRTL ? 'تفعيل وضع الاختبار' : 'Enable Test Mode'}</Label>
              <p className="text-sm text-slate-600 mt-1">
                {isRTL 
                  ? 'عند التفعيل، سيظهر ESS موظف واحد فقط للاختبار'
                  : 'When enabled, ESS will show only one employee for testing'}
              </p>
            </div>
            <Switch
              checked={formData.test_mode_enabled}
              onCheckedChange={(checked) => setFormData({...formData, test_mode_enabled: checked})}
            />
          </div>

          {formData.test_mode_enabled && (
            <div>
              <Label>{isRTL ? 'الموظف التجريبي' : 'Test Employee'}</Label>
              <Select 
                value={formData.test_employee_id} 
                onValueChange={(v) => setFormData({...formData, test_employee_id: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? 'اختر موظف' : 'Select employee'} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name_ar} ({emp.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-2">
                {isRTL 
                  ? 'سيظهر هذا الموظف فقط في بوابة ESS أثناء وضع الاختبار'
                  : 'Only this employee will appear in ESS portal during test mode'}
              </p>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              <Save className="w-4 h-4 me-2" />
              {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}