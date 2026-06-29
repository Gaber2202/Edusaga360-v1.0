import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { useTenantFilter } from '../../hooks/useTenantFilter';

export default function PayslipSettings({ open, onClose }) {
  const { t, isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();

  const [settings, setSettings] = useState({
    auto_send_enabled: false,
    send_trigger: 'on_approval',
    monthly_send_day: 27,
    days_after_posting: 1,
    auto_channels: ['email'],
    max_retries: 3,
    email_template_ar: 'مرحباً {{employee_name}},\n\nقسيمة راتبك لشهر {{period}} جاهزة.\n\nصافي الراتب: {{net_salary}} ريال',
    email_template_en: 'Dear {{employee_name}},\n\nYour payslip for {{period}} is ready.\n\nNet Salary: {{net_salary}} SAR',
    whatsapp_template_ar: 'قسيمة راتب {{period}} جاهزة. صافي الراتب: {{net_salary}} ريال',
    whatsapp_template_en: 'Payslip for {{period}} is ready. Net: {{net_salary}} SAR',
    pdf_password_enabled: false,
    password_rule: 'employee_id_phone',
    password_pattern: '',
    password_hint_ar: 'رقم الموظف + آخر 4 أرقام من الجوال',
    password_hint_en: 'Employee ID + Last 4 digits of phone',
    watermark_enabled: false,
    watermark_type: 'confidential',
    watermark_custom_text_ar: '',
    watermark_custom_text_en: '',
    watermark_placement: 'diagonal'
  });

  const { data: existingSettings } = useQuery({
    queryKey: ['payslipSettings', tenantId],
    queryFn: async () => {
      const { data: all = [] } = await tenantQuery('payslip_settings').select('*').order();
      return all[0];
    },
  });

  useEffect(() => {
    if (existingSettings) {
      setSettings(existingSettings);
    }
  }, [existingSettings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existingSettings?.id) {
        return await tenantQuery('payslip_settings').update(data);
      } else {
        return await tenantQuery('payslip_settings').insert(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payslipSettings'] });
      toast.success(isRTL ? 'تم حفظ الإعدادات' : 'Settings saved');
      onClose();
    },
  });

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إعدادات قسائم الراتب' : 'Payslip Settings'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Auto Send */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'الإرسال التلقائي' : 'Automatic Sending'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{isRTL ? 'تفعيل الإرسال التلقائي' : 'Enable Auto-Send'}</Label>
                <Switch
                  checked={settings.auto_send_enabled}
                  onCheckedChange={(checked) => setSettings(prev => ({ ...prev, auto_send_enabled: checked }))}
                />
              </div>

              {settings.auto_send_enabled && (
                <>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'متى يتم الإرسال' : 'Send Trigger'}</Label>
                    <Select 
                      value={settings.send_trigger} 
                      onValueChange={(v) => setSettings(prev => ({ ...prev, send_trigger: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="on_approval">{isRTL ? 'عند الاعتماد' : 'On Approval'}</SelectItem>
                        <SelectItem value="monthly_day">{isRTL ? 'يوم محدد من الشهر' : 'Monthly Day'}</SelectItem>
                        <SelectItem value="after_posting">{isRTL ? 'بعد الترحيل' : 'After Posting'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {settings.send_trigger === 'monthly_day' && (
                    <div className="space-y-2">
                      <Label>{isRTL ? 'اليوم من الشهر' : 'Day of Month'}</Label>
                      <Input
                        type="number"
                        min="25"
                        max="30"
                        value={settings.monthly_send_day}
                        onChange={(e) => setSettings(prev => ({ ...prev, monthly_send_day: parseInt(e.target.value) }))}
                      />
                    </div>
                  )}

                  {settings.send_trigger === 'after_posting' && (
                    <div className="space-y-2">
                      <Label>{isRTL ? 'عدد الأيام بعد الترحيل' : 'Days After Posting'}</Label>
                      <Input
                        type="number"
                        min="0"
                        max="5"
                        value={settings.days_after_posting}
                        onChange={(e) => setSettings(prev => ({ ...prev, days_after_posting: parseInt(e.target.value) }))}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>{isRTL ? 'طرق الإرسال' : 'Delivery Channels'}</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={settings.auto_channels.includes('email')}
                          onCheckedChange={(checked) => {
                            setSettings(prev => ({
                              ...prev,
                              auto_channels: checked 
                                ? [...prev.auto_channels, 'email']
                                : prev.auto_channels.filter(c => c !== 'email')
                            }));
                          }}
                        />
                        <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={settings.auto_channels.includes('whatsapp')}
                          onCheckedChange={(checked) => {
                            setSettings(prev => ({
                              ...prev,
                              auto_channels: checked 
                                ? [...prev.auto_channels, 'whatsapp']
                                : prev.auto_channels.filter(c => c !== 'whatsapp')
                            }));
                          }}
                        />
                        <Label>{isRTL ? 'واتساب' : 'WhatsApp'}</Label>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{isRTL ? 'عدد المحاولات عند الفشل' : 'Max Retries on Failure'}</Label>
                    <Input
                      type="number"
                      min="0"
                      max="5"
                      value={settings.max_retries}
                      onChange={(e) => setSettings(prev => ({ ...prev, max_retries: parseInt(e.target.value) }))}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'إعدادات الأمان' : 'Security Settings'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* PDF Password Protection */}
              <div className="space-y-4 border-b pb-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    {isRTL ? 'حماية ملف PDF بكلمة مرور' : 'PDF Password Protection'}
                  </Label>
                  <Switch
                    checked={settings.pdf_password_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, pdf_password_enabled: checked }))}
                  />
                </div>

                {settings.pdf_password_enabled && (
                  <div className="space-y-4 ml-6">
                    <div className="space-y-2">
                      <Label>{isRTL ? 'قاعدة كلمة المرور' : 'Password Rule'}</Label>
                      <Select 
                        value={settings.password_rule} 
                        onValueChange={(v) => setSettings(prev => ({ ...prev, password_rule: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="employee_id_phone">
                            {isRTL ? 'رقم الموظف + آخر 4 أرقام من الجوال' : 'Employee ID + Last 4 digits of phone'}
                          </SelectItem>
                          <SelectItem value="national_id_employee_id">
                            {isRTL ? 'آخر 4 أرقام من الهوية + رقم الموظف' : 'Last 4 digits of National ID + Employee ID'}
                          </SelectItem>
                          <SelectItem value="custom">
                            {isRTL ? 'نمط مخصص' : 'Custom Pattern'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {settings.password_rule === 'custom' && (
                      <div className="space-y-2">
                        <Label>{isRTL ? 'النمط المخصص' : 'Custom Pattern'}</Label>
                        <Input
                          value={settings.password_pattern}
                          onChange={(e) => setSettings(prev => ({ ...prev, password_pattern: e.target.value }))}
                          placeholder="{{employee_id}}{{phone_last4}}"
                        />
                        <p className="text-xs text-muted-foreground">
                          {isRTL ? 'المتغيرات: {{employee_id}}, {{phone_last4}}, {{national_id_last4}}' : 'Variables: {{employee_id}}, {{phone_last4}}, {{national_id_last4}}'}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>{isRTL ? 'تلميح كلمة المرور (عربي)' : 'Password Hint (Arabic)'}</Label>
                      <Input
                        value={settings.password_hint_ar}
                        onChange={(e) => setSettings(prev => ({ ...prev, password_hint_ar: e.target.value }))}
                        placeholder="مثال: رقم الموظف + آخر 4 أرقام من الجوال"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{isRTL ? 'تلميح كلمة المرور (إنجليزي)' : 'Password Hint (English)'}</Label>
                      <Input
                        value={settings.password_hint_en}
                        onChange={(e) => setSettings(prev => ({ ...prev, password_hint_en: e.target.value }))}
                        placeholder="Example: Employee ID + Last 4 digits of phone"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Watermark */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    {isRTL ? 'علامة مائية على PDF' : 'PDF Watermark'}
                  </Label>
                  <Switch
                    checked={settings.watermark_enabled}
                    onCheckedChange={(checked) => setSettings(prev => ({ ...prev, watermark_enabled: checked }))}
                  />
                </div>

                {settings.watermark_enabled && (
                  <div className="space-y-4 ml-6">
                    <div className="space-y-2">
                      <Label>{isRTL ? 'نوع العلامة المائية' : 'Watermark Type'}</Label>
                      <Select 
                        value={settings.watermark_type} 
                        onValueChange={(v) => setSettings(prev => ({ ...prev, watermark_type: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confidential">
                            {isRTL ? 'سري' : 'CONFIDENTIAL'}
                          </SelectItem>
                          <SelectItem value="confidential_employee">
                            {isRTL ? 'سري - {الموظف} - {الرقم}' : 'CONFIDENTIAL - {Employee} - {ID}'}
                          </SelectItem>
                          <SelectItem value="custom">
                            {isRTL ? 'نص مخصص' : 'Custom Text'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {settings.watermark_type === 'custom' && (
                      <>
                        <div className="space-y-2">
                          <Label>{isRTL ? 'النص المخصص (عربي)' : 'Custom Text (Arabic)'}</Label>
                          <Input
                            value={settings.watermark_custom_text_ar}
                            onChange={(e) => setSettings(prev => ({ ...prev, watermark_custom_text_ar: e.target.value }))}
                            placeholder="سري - شركة الأنوار"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{isRTL ? 'النص المخصص (إنجليزي)' : 'Custom Text (English)'}</Label>
                          <Input
                            value={settings.watermark_custom_text_en}
                            onChange={(e) => setSettings(prev => ({ ...prev, watermark_custom_text_en: e.target.value }))}
                            placeholder="CONFIDENTIAL - Al-Anwar Company"
                          />
                        </div>
                      </>
                    )}

                    <div className="space-y-2">
                      <Label>{isRTL ? 'موضع العلامة المائية' : 'Watermark Placement'}</Label>
                      <Select 
                        value={settings.watermark_placement} 
                        onValueChange={(v) => setSettings(prev => ({ ...prev, watermark_placement: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="diagonal">
                            {isRTL ? 'قطرياً عبر الصفحة' : 'Diagonal Across Page'}
                          </SelectItem>
                          <SelectItem value="footer">
                            {isRTL ? 'ختم في التذييل' : 'Footer Stamp'}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Templates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{isRTL ? 'قوالب الرسائل' : 'Message Templates'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'قالب البريد (عربي)' : 'Email Template (Arabic)'}</Label>
                <Textarea
                  rows={4}
                  value={settings.email_template_ar}
                  onChange={(e) => setSettings(prev => ({ ...prev, email_template_ar: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {isRTL ? 'المتغيرات: {{employee_name}}, {{period}}, {{net_salary}}' : 'Variables: {{employee_name}}, {{period}}, {{net_salary}}'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{isRTL ? 'قالب البريد (إنجليزي)' : 'Email Template (English)'}</Label>
                <Textarea
                  rows={4}
                  value={settings.email_template_en}
                  onChange={(e) => setSettings(prev => ({ ...prev, email_template_en: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>{isRTL ? 'قالب واتساب (عربي)' : 'WhatsApp Template (Arabic)'}</Label>
                <Textarea
                  rows={3}
                  value={settings.whatsapp_template_ar}
                  onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_template_ar: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>{isRTL ? 'قالب واتساب (إنجليزي)' : 'WhatsApp Template (English)'}</Label>
                <Textarea
                  rows={3}
                  value={settings.whatsapp_template_en}
                  onChange={(e) => setSettings(prev => ({ ...prev, whatsapp_template_en: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 me-2" />
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}