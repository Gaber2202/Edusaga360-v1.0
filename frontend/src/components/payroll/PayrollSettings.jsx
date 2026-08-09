import React, { useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { useJurisdictionFeatures } from '../JurisdictionFeatureContext';
import { getCurrencySymbol } from '../../lib/localization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { toast } from 'sonner';
import {
  Landmark,
  Calculator,
  Calendar,
  Bell,
  Shield,
  Save,
  Loader2
} from 'lucide-react';

export default function PayrollSettings() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const { isFeatureEnabled } = useJurisdictionFeatures();
  const gosiEnabled = isFeatureEnabled('gosi');
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    // GOSI Settings
    gosi_saudi_employee_rate: 9.75,
    gosi_saudi_employer_rate: 11.75,
    gosi_non_saudi_employer_rate: 2,
    gosi_wage_ceiling: 45000,
    gosi_enabled: true,

    // Payroll Settings
    payroll_day: 27,
    attendance_lock_days: 3,
    auto_calculate_overtime: true,
    overtime_rate: 1.5,
    weekend_overtime_rate: 2,

    // Loan Settings
    max_loan_months: 24,
    max_loan_salary_multiple: 3,
    loan_approval_required: true,

    // Tuition Advance Settings
    tuition_max_installments: 12,
    tuition_approval_required: true,
    auto_settle_invoice: true,

    // Notifications
    notify_hr_on_loan_request: true,
    notify_finance_on_approval: true,
    notify_employee_on_payslip: true,

    // Integration
    auto_post_journal: false,
    journal_approval_required: true
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      // In production, save to settings entity or config
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(isRTL ? 'تم حفظ الإعدادات' : 'Settings saved');
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{isRTL ? 'إعدادات الرواتب' : 'Payroll Settings'}</h2>
          <p className="text-sm text-muted-foreground">{isRTL ? 'تكوين نظام الرواتب' : 'Configure payroll system'}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
          <Save className="w-4 h-4 me-2" />
          {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}
        </Button>
      </div>

      <Tabs defaultValue={gosiEnabled ? 'gosi' : 'payroll'}>
        <TabsList className={`grid grid-cols-${gosiEnabled ? '5' : '4'} w-full max-w-2xl`}>
          {gosiEnabled && (
            <TabsTrigger value="gosi" className="gap-2">
              <Landmark className="w-4 h-4" />
              {isRTL ? 'التأمينات' : 'GOSI'}
            </TabsTrigger>
          )}
          <TabsTrigger value="payroll" className="gap-2">
            <Calculator className="w-4 h-4" />
            {isRTL ? 'الرواتب' : 'Payroll'}
          </TabsTrigger>
          <TabsTrigger value="loans" className="gap-2">
            <Calendar className="w-4 h-4" />
            {isRTL ? 'القروض' : 'Loans'}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            {isRTL ? 'التنبيهات' : 'Notifications'}
          </TabsTrigger>
          <TabsTrigger value="integration" className="gap-2">
            <Shield className="w-4 h-4" />
            {isRTL ? 'التكامل' : 'Integration'}
          </TabsTrigger>
        </TabsList>

        {/* GOSI Settings */}
        {gosiEnabled && <TabsContent value="gosi" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'إعدادات التأمينات الاجتماعية' : 'GOSI Settings'}</CardTitle>
              <CardDescription>
                {isRTL ? 'تكوين نسب وقواعد التأمينات الاجتماعية' : 'Configure GOSI rates and rules'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{isRTL ? 'تفعيل حساب التأمينات' : 'Enable GOSI Calculation'}</Label>
                  <p className="text-sm text-muted-foreground">{isRTL ? 'حساب التأمينات تلقائياً' : 'Auto-calculate GOSI contributions'}</p>
                </div>
                <Switch 
                  checked={settings.gosi_enabled}
                  onCheckedChange={(v) => setSettings({...settings, gosi_enabled: v})}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-emerald-700">{isRTL ? 'السعوديين' : 'Saudi Employees'}</h4>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'نسبة الموظف %' : 'Employee Rate %'}</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={settings.gosi_saudi_employee_rate}
                      onChange={(e) => setSettings({...settings, gosi_saudi_employee_rate: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'نسبة صاحب العمل %' : 'Employer Rate %'}</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={settings.gosi_saudi_employer_rate}
                      onChange={(e) => setSettings({...settings, gosi_saudi_employer_rate: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium text-najdi-900">{isRTL ? 'غير السعوديين' : 'Non-Saudi Employees'}</h4>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'نسبة صاحب العمل %' : 'Employer Rate %'}</Label>
                    <Input 
                      type="number"
                      step="0.01"
                      value={settings.gosi_non_saudi_employer_rate}
                      onChange={(e) => setSettings({...settings, gosi_non_saudi_employer_rate: parseFloat(e.target.value)})}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isRTL ? 'غير السعوديين: صاحب العمل فقط' : 'Non-Saudis: Employer contribution only'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{isRTL ? `الحد الأقصى للأجر الخاضع (${getCurrencySymbol(tenant?.localization, isRTL)})` : `Wage Ceiling (${getCurrencySymbol(tenant?.localization, isRTL)})`}</Label>
                <Input 
                  type="number"
                  value={settings.gosi_wage_ceiling}
                  onChange={(e) => setSettings({...settings, gosi_wage_ceiling: parseFloat(e.target.value)})}
                />
                <p className="text-sm text-muted-foreground">
                  {isRTL ? `الحد الأقصى للراتب الخاضع للتأمينات (45,000 ${getCurrencySymbol(tenant?.localization, isRTL)})` : `Maximum salary subject to GOSI (45,000 ${getCurrencySymbol(tenant?.localization, isRTL)})`}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>}

        {/* Payroll Settings */}
        <TabsContent value="payroll" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'إعدادات الرواتب العامة' : 'General Payroll Settings'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>{isRTL ? 'يوم صرف الرواتب' : 'Payroll Day'}</Label>
                  <Input 
                    type="number"
                    min="1"
                    max="28"
                    value={settings.payroll_day}
                    onChange={(e) => setSettings({...settings, payroll_day: parseInt(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'أيام قفل الحضور' : 'Attendance Lock Days'}</Label>
                  <Input 
                    type="number"
                    value={settings.attendance_lock_days}
                    onChange={(e) => setSettings({...settings, attendance_lock_days: parseInt(e.target.value)})}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{isRTL ? 'حساب الوقت الإضافي تلقائياً' : 'Auto-calculate Overtime'}</Label>
                  <p className="text-sm text-muted-foreground">{isRTL ? 'من سجلات الحضور' : 'From attendance records'}</p>
                </div>
                <Switch 
                  checked={settings.auto_calculate_overtime}
                  onCheckedChange={(v) => setSettings({...settings, auto_calculate_overtime: v})}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>{isRTL ? 'معدل الوقت الإضافي' : 'Overtime Rate'}</Label>
                  <Input 
                    type="number"
                    step="0.1"
                    value={settings.overtime_rate}
                    onChange={(e) => setSettings({...settings, overtime_rate: parseFloat(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? 'معدل عطلة نهاية الأسبوع' : 'Weekend Overtime Rate'}</Label>
                  <Input 
                    type="number"
                    step="0.1"
                    value={settings.weekend_overtime_rate}
                    onChange={(e) => setSettings({...settings, weekend_overtime_rate: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Loans Settings */}
        <TabsContent value="loans" className="mt-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{isRTL ? 'إعدادات القروض' : 'Loan Settings'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>{isRTL ? 'الحد الأقصى للأشهر' : 'Max Loan Months'}</Label>
                    <Input 
                      type="number"
                      value={settings.max_loan_months}
                      onChange={(e) => setSettings({...settings, max_loan_months: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{isRTL ? 'مضاعف الراتب' : 'Max Salary Multiple'}</Label>
                    <Input 
                      type="number"
                      value={settings.max_loan_salary_multiple}
                      onChange={(e) => setSettings({...settings, max_loan_salary_multiple: parseFloat(e.target.value)})}
                    />
                    <p className="text-xs text-muted-foreground">{isRTL ? 'الحد الأقصى للقرض = الراتب × المضاعف' : 'Max loan = Salary × Multiple'}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{isRTL ? 'يتطلب موافقة' : 'Require Approval'}</Label>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'المدير ← HR ← المالية' : 'Manager → HR → Finance'}</p>
                  </div>
                  <Switch 
                    checked={settings.loan_approval_required}
                    onCheckedChange={(v) => setSettings({...settings, loan_approval_required: v})}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isRTL ? 'إعدادات سلف الرسوم' : 'Tuition Advance Settings'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>{isRTL ? 'الحد الأقصى للأقساط' : 'Max Installments'}</Label>
                  <Input 
                    type="number"
                    value={settings.tuition_max_installments}
                    onChange={(e) => setSettings({...settings, tuition_max_installments: parseInt(e.target.value)})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">{isRTL ? 'تسوية الفاتورة تلقائياً' : 'Auto-settle Invoice'}</Label>
                    <p className="text-sm text-muted-foreground">{isRTL ? 'تسوية فاتورة الطالب عند التفعيل' : 'Settle student invoice on activation'}</p>
                  </div>
                  <Switch 
                    checked={settings.auto_settle_invoice}
                    onCheckedChange={(v) => setSettings({...settings, auto_settle_invoice: v})}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'إعدادات التنبيهات' : 'Notification Settings'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{isRTL ? 'إشعار HR عند طلب قرض' : 'Notify HR on Loan Request'}</Label>
                </div>
                <Switch 
                  checked={settings.notify_hr_on_loan_request}
                  onCheckedChange={(v) => setSettings({...settings, notify_hr_on_loan_request: v})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{isRTL ? 'إشعار المالية عند الاعتماد' : 'Notify Finance on Approval'}</Label>
                </div>
                <Switch 
                  checked={settings.notify_finance_on_approval}
                  onCheckedChange={(v) => setSettings({...settings, notify_finance_on_approval: v})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{isRTL ? 'إشعار الموظف بكشف الراتب' : 'Notify Employee on Payslip'}</Label>
                </div>
                <Switch 
                  checked={settings.notify_employee_on_payslip}
                  onCheckedChange={(v) => setSettings({...settings, notify_employee_on_payslip: v})}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integration */}
        <TabsContent value="integration" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'إعدادات التكامل المالي' : 'Finance Integration'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{isRTL ? 'ترحيل القيود تلقائياً' : 'Auto-post Journal Entries'}</Label>
                  <p className="text-sm text-muted-foreground">{isRTL ? 'ترحيل قيود الرواتب للدفتر العام' : 'Post payroll entries to GL automatically'}</p>
                </div>
                <Switch 
                  checked={settings.auto_post_journal}
                  onCheckedChange={(v) => setSettings({...settings, auto_post_journal: v})}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{isRTL ? 'يتطلب موافقة للترحيل' : 'Require Journal Approval'}</Label>
                </div>
                <Switch 
                  checked={settings.journal_approval_required}
                  onCheckedChange={(v) => setSettings({...settings, journal_approval_required: v})}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}