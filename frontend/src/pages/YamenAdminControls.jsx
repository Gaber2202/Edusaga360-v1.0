import React, { useState } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import PageHeader from '../components/ui/PageHeader';
import { Bot, Shield, Settings, BarChart3, FileText, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';

const HR_MODULES = [
  { key: 'employees', ar: 'الموظفون', en: 'Employees' },
  { key: 'recruitment', ar: 'التوظيف', en: 'Recruitment' },
  { key: 'attendance', ar: 'الحضور', en: 'Attendance' },
  { key: 'leaves', ar: 'الإجازات', en: 'Leave' },
  { key: 'payroll', ar: 'الرواتب', en: 'Payroll' },
  { key: 'eos', ar: 'نهاية الخدمة', en: 'End of Service' },
  { key: 'performance', ar: 'الأداء', en: 'Performance' },
  { key: 'government', ar: 'العلاقات الحكومية', en: 'Government Relations' },
  { key: 'approvals', ar: 'الموافقات', en: 'Approvals' },
  { key: 'overtime', ar: 'العمل الإضافي', en: 'Overtime' },
  { key: 'training', ar: 'التدريب', en: 'Training' },
];

const ROLES = ['admin', 'hr_manager', 'branch_manager', 'employee'];

export default function YamenAdminControls() {
  const { isRTL } = useLanguage();

  const [moduleEnabled, setModuleEnabled] = useState(
    HR_MODULES.reduce((acc, m) => ({ ...acc, [m.key]: true }), {})
  );
  const [roleVisibility, setRoleVisibility] = useState(
    ROLES.reduce((acc, r) => ({ ...acc, [r]: r !== 'employee' }), {})
  );
  const [monthlyLimit, setMonthlyLimit] = useState(500);
  const [defaultLang, setDefaultLang] = useState('ar');
  const [strictMode, setStrictMode] = useState(false);
  const [predictiveMode, setPredictiveMode] = useState(true);
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);

  // Mock usage data
  const usageData = {
    thisMonth: 142,
    limit: monthlyLimit,
    byModule: HR_MODULES.slice(0, 5).map(m => ({ module: isRTL ? m.ar : m.en, calls: Math.floor(Math.random() * 40) + 5 })),
  };

  const handleSaveSettings = () => {
    toast.success(isRTL ? 'تم حفظ إعدادات يامن AI' : 'Yamen AI settings saved');
  };

  const handleResetContext = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      toast.warning(isRTL ? 'اضغط مرة أخرى للتأكيد' : 'Click again to confirm reset');
      setTimeout(() => setResetConfirm(false), 5000);
    } else {
      setResetConfirm(false);
      toast.success(isRTL ? 'تم إعادة تعيين سياق يامن AI' : 'Yamen AI context reset');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'يامن AI — لوحة التحكم' : 'Yamen AI — Admin Controls'}
        subtitle={isRTL ? 'تحكم كامل في أداء وصلاحيات يامن AI' : 'Full control over Yamen AI behavior and permissions'}
      />

      <Tabs defaultValue="modules">
        <TabsList className="bg-white border flex-wrap h-auto gap-1">
          <TabsTrigger value="modules" className="gap-2"><Settings className="w-4 h-4" />{isRTL ? 'الوحدات' : 'Modules'}</TabsTrigger>
          <TabsTrigger value="roles" className="gap-2"><Shield className="w-4 h-4" />{isRTL ? 'الأدوار' : 'Roles'}</TabsTrigger>
          <TabsTrigger value="limits" className="gap-2"><BarChart3 className="w-4 h-4" />{isRTL ? 'الحدود والاستخدام' : 'Limits & Usage'}</TabsTrigger>
          <TabsTrigger value="behavior" className="gap-2"><Bot className="w-4 h-4" />{isRTL ? 'السلوك' : 'Behavior'}</TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2"><FileText className="w-4 h-4" />{isRTL ? 'قاعدة المعرفة' : 'Knowledge Base'}</TabsTrigger>
        </TabsList>

        {/* Module Enable/Disable */}
        <TabsContent value="modules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="w-5 h-5 text-purple-600" />
                {isRTL ? 'تفعيل يامن AI لكل وحدة' : 'Enable Yamen AI per Module'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {HR_MODULES.map(m => (
                <div key={m.key} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{isRTL ? m.ar : m.en}</p>
                    <p className="text-xs text-slate-500">{isRTL ? m.en : m.ar}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={moduleEnabled[m.key] ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}>
                      {moduleEnabled[m.key] ? (isRTL ? 'مفعّل' : 'Enabled') : (isRTL ? 'معطّل' : 'Disabled')}
                    </Badge>
                    <Switch
                      checked={moduleEnabled[m.key]}
                      onCheckedChange={(v) => setModuleEnabled(p => ({ ...p, [m.key]: v }))}
                    />
                  </div>
                </div>
              ))}
              <Button onClick={handleSaveSettings} className="mt-4 bg-purple-600 hover:bg-purple-700">
                {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Role Visibility */}
        <TabsContent value="roles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                {isRTL ? 'رؤية يامن AI حسب الدور' : 'Yamen AI Visibility by Role'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ROLES.map(role => (
                <div key={role} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium capitalize">{role.replace('_', ' ')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={roleVisibility[role] ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}>
                      {roleVisibility[role] ? (isRTL ? 'مرئي' : 'Visible') : (isRTL ? 'مخفي' : 'Hidden')}
                    </Badge>
                    <Switch
                      checked={roleVisibility[role]}
                      onCheckedChange={(v) => setRoleVisibility(p => ({ ...p, [role]: v }))}
                    />
                  </div>
                </div>
              ))}
              <Button onClick={handleSaveSettings} className="mt-4 bg-purple-600 hover:bg-purple-700">
                {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Limits & Usage */}
        <TabsContent value="limits" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{isRTL ? 'حدود الاستخدام الشهري' : 'Monthly Usage Limits'}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{isRTL ? 'الحد الشهري (استدعاءات AI)' : 'Monthly Limit (AI calls)'}</Label>
                  <Input type="number" min="0" value={monthlyLimit} onChange={(e) => setMonthlyLimit(parseInt(e.target.value) || 0)} />
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-purple-800">{isRTL ? 'الاستخدام هذا الشهر' : 'This Month Usage'}</p>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <span>{usageData.thisMonth} {isRTL ? 'استدعاء' : 'calls'}</span>
                      <span>{usageData.limit} {isRTL ? 'الحد' : 'limit'}</span>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-2">
                      <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${Math.min((usageData.thisMonth / usageData.limit) * 100, 100)}%` }} />
                    </div>
                    <p className="text-xs text-purple-600 mt-1">{Math.round((usageData.thisMonth / usageData.limit) * 100)}% {isRTL ? 'مُستخدم' : 'used'}</p>
                  </div>
                </div>
                <Button onClick={handleSaveSettings} className="bg-purple-600 hover:bg-purple-700 w-full">
                  {isRTL ? 'حفظ الحد' : 'Save Limit'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{isRTL ? 'توزيع الاستخدام حسب الوحدة' : 'Usage by Module'}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {usageData.byModule.map(item => (
                  <div key={item.module} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{item.module}</span>
                      <span className="font-medium text-purple-700">{item.calls}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min((item.calls / usageData.thisMonth) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Behavior Settings */}
        <TabsContent value="behavior" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="w-5 h-5 text-purple-600" />{isRTL ? 'إعدادات سلوك يامن AI' : 'Yamen AI Behavior Settings'}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium">{isRTL ? 'الوضع الصارم' : 'Strict Mode'}</p>
                  <p className="text-xs text-slate-500">{isRTL ? 'يمنع التنبؤات ويقتصر على البيانات الفعلية' : 'No predictions — only factual data analysis'}</p>
                </div>
                <Switch checked={strictMode} onCheckedChange={setStrictMode} />
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <div>
                  <p className="font-medium">{isRTL ? 'الوضع التنبؤي' : 'Predictive Mode'}</p>
                  <p className="text-xs text-slate-500">{isRTL ? 'يامن يتنبأ بالمخاطر والاتجاهات المستقبلية' : 'Yamen predicts risks and future trends'}</p>
                </div>
                <Switch checked={predictiveMode} onCheckedChange={setPredictiveMode} />
              </div>
              <div className="space-y-2 py-2 border-b">
                <Label>{isRTL ? 'لغة الرد الافتراضية' : 'Default Response Language'}</Label>
                <Select value={defaultLang} onValueChange={setDefaultLang}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">{isRTL ? 'العربية أولاً' : 'Arabic First'}</SelectItem>
                    <SelectItem value="en">{isRTL ? 'الإنجليزية أولاً' : 'English First'}</SelectItem>
                    <SelectItem value="both">{isRTL ? 'ثنائي اللغة' : 'Bilingual'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="pt-2 flex gap-3">
                <Button onClick={handleSaveSettings} className="bg-purple-600 hover:bg-purple-700">
                  {isRTL ? 'حفظ الإعدادات' : 'Save Settings'}
                </Button>
                <Button
                  variant="outline"
                  className={`gap-2 ${resetConfirm ? 'border-red-500 text-red-600' : ''}`}
                  onClick={handleResetContext}
                >
                  <RefreshCw className="w-4 h-4" />
                  {resetConfirm ? (isRTL ? 'تأكيد إعادة التعيين؟' : 'Confirm Reset?') : (isRTL ? 'إعادة تعيين السياق' : 'Reset AI Context')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Knowledge Base */}
        <TabsContent value="knowledge" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-5 h-5 text-purple-600" />{isRTL ? 'قاعدة معرفة يامن AI' : 'Yamen AI Knowledge Base'}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-500">
                {isRTL
                  ? 'أضف مستندات السياسات، واللوائح، ونظام العمل السعودي لتحسين دقة إجابات يامن AI.'
                  : 'Upload policy documents, regulations, and Saudi Labor Law content to improve Yamen AI accuracy.'}
              </p>
              <div className="border-2 border-dashed border-purple-200 rounded-xl p-8 text-center">
                <Upload className="w-10 h-10 text-purple-400 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">{isRTL ? 'رفع مستند' : 'Upload Document'}</p>
                <p className="text-xs text-slate-400 mt-1">{isRTL ? 'PDF، Word، نص عادي' : 'PDF, Word, Plain Text'}</p>
                <Button variant="outline" className="mt-4">{isRTL ? 'اختيار ملف' : 'Choose File'}</Button>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'أو أدخل المحتوى مباشرة' : 'Or Enter Content Directly'}</Label>
                <Textarea
                  value={knowledgeBase}
                  onChange={(e) => setKnowledgeBase(e.target.value)}
                  rows={6}
                  placeholder={isRTL ? 'أدخل سياسات HR، نظام العمل، اللوائح...' : 'Enter HR policies, labor law, regulations...'}
                />
              </div>
              <Button onClick={() => toast.success(isRTL ? 'تم حفظ قاعدة المعرفة' : 'Knowledge base saved')} className="bg-purple-600 hover:bg-purple-700 gap-2">
                <FileText className="w-4 h-4" />
                {isRTL ? 'حفظ قاعدة المعرفة' : 'Save Knowledge Base'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}