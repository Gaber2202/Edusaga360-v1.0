import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { useTenant } from '../components/TenantContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';




import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { 
  Settings as SettingsIcon, 
  Users,
  Globe,
  Building,
  Save,
  Upload
} from 'lucide-react';
import { toast } from 'sonner';



/* ─── My Profile Section ─── */
function MyProfileSection({ isRTL, user }) {
  const qc = useQueryClient();
  const { refreshUser } = useRole();
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    first_name_ar: user?.first_name_ar || '',
    last_name_ar: user?.last_name_ar || '',
    display_name: user?.display_name || '',
  });
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (user) {
      // Derive first/last from full_name if individual fields are empty
      const parts = (user.full_name || '').trim().split(' ');
      const derivedFirst = user.first_name || parts[0] || '';
      const derivedLast = user.last_name || parts.slice(1).join(' ') || '';
      setForm({
        first_name: derivedFirst,
        last_name: derivedLast,
        first_name_ar: user.first_name_ar || '',
        last_name_ar: user.last_name_ar || '',
        display_name: user.display_name || '',
      });
    }
  }, [user]);

  const handleTranslate = async () => {
    if (!form.first_name && !form.last_name) return;
    setTranslating(true);
    const result = await callApi('/api/ai/invoke-llm', {
      prompt: `Transliterate the following English name into Arabic script (not translation, just phonetic Arabic writing):
First Name: "${form.first_name}"
Last Name: "${form.last_name}"
Return ONLY a JSON object with keys "first_name_ar" and "last_name_ar". No explanation.`,
      response_json_schema: {
        type: 'object',
        properties: {
          first_name_ar: { type: 'string' },
          last_name_ar: { type: 'string' },
        }
      }
    });
    setForm(p => ({
      ...p,
      first_name_ar: result.first_name_ar || p.first_name_ar,
      last_name_ar: result.last_name_ar || p.last_name_ar,
    }));
    setTranslating(false);
  };

  const handleSave = async () => {
    setSaving(true);
    // If Arabic names are empty but English names exist, auto-fill Arabic with English as fallback
    const dataToSave = { ...form };
    if (!dataToSave.first_name_ar && dataToSave.first_name) dataToSave.first_name_ar = dataToSave.first_name;
    if (!dataToSave.last_name_ar && dataToSave.last_name) dataToSave.last_name_ar = dataToSave.last_name;
    await supabase.auth.updateUser({ data: dataToSave });
    await refreshUser();
    qc.invalidateQueries({ queryKey: ['currentUser'] });
    toast.success(isRTL ? 'تم حفظ الملف الشخصي' : 'Profile saved');
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* English names */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{isRTL ? 'الاسم الأول (إنجليزي)' : 'First Name (English)'}</Label>
          <Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} />
        </div>
        <div>
          <Label>{isRTL ? 'اسم العائلة (إنجليزي)' : 'Last Name (English)'}</Label>
          <Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} />
        </div>
      </div>

      {/* Translate button */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleTranslate} disabled={translating || (!form.first_name && !form.last_name)}>
          {translating ? (isRTL ? 'جاري الترجمة...' : 'Translating...') : (isRTL ? 'ترجمة الاسم تلقائياً للعربية' : 'Auto-translate to Arabic')}
        </Button>
        <span className="text-xs text-slate-400">{isRTL ? 'أو أدخل يدوياً أدناه' : 'or enter manually below'}</span>
      </div>

      {/* Arabic names */}
      <div className="grid grid-cols-2 gap-3" dir="rtl">
        <div>
          <Label>الاسم الأول (عربي)</Label>
          <Input value={form.first_name_ar} onChange={e => setForm(p => ({ ...p, first_name_ar: e.target.value }))} placeholder="محمد" />
        </div>
        <div>
          <Label>اسم العائلة (عربي)</Label>
          <Input value={form.last_name_ar} onChange={e => setForm(p => ({ ...p, last_name_ar: e.target.value }))} placeholder="حسن" />
        </div>
      </div>

      <div>
        <Label>{isRTL ? 'اسم العرض (اختياري)' : 'Display Name (optional)'}</Label>
        <Input value={form.display_name} onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))} placeholder={isRTL ? 'يُستخدم إذا تُرك الاسم الأول والأخير فارغاً' : 'Used if first/last name are empty'} />
      </div>
      <div className="flex justify-end pt-1">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
        </Button>
      </div>
    </div>
  );
}

/* ─── School Info Section ─── */
function SchoolInfoSection({ isRTL }) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name_ar: '', name_en: '', city: '', phone: '', email: '', website: '', logo_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (tenant) {
      setForm({
        name_ar:   tenant.name_ar   || '',
        name_en:   tenant.name_en   || '',
        city:      tenant.city      || '',
        phone:     tenant.phone     || '',
        email:     tenant.email     || '',
        website:   tenant.website   || '',
        logo_url:  tenant.logo_url  || '',
      });
    }
  }, [tenant]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await callApi('/api/files/upload', { file });
    set('logo_url', file_url);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!tenant?.id) return;
    setSaving(true);
    await tenantQuery('tenants').update(form);
    qc.invalidateQueries({ queryKey: ['tenant'] });
    toast.success(isRTL ? 'تم حفظ معلومات المدرسة' : 'School information saved');
    setSaving(false);
  };

  if (!tenant) return (
    <div className="text-center py-8 text-slate-400 text-sm">
      {isRTL ? 'لا توجد بيانات مدرسة مرتبطة بهذا الحساب' : 'No school profile linked to this account'}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Logo */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {form.logo_url
            ? <img src={form.logo_url} alt="logo" className="w-full h-full object-contain" />
            : <Building className="w-8 h-8 text-slate-300" />}
        </div>
        <div>
          <Label className="mb-1 block">{isRTL ? 'شعار المدرسة' : 'School Logo'}</Label>
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <Button variant="outline" size="sm" asChild>
              <span className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5" />
                {uploading ? (isRTL ? 'جاري الرفع...' : 'Uploading...') : (isRTL ? 'رفع شعار' : 'Upload Logo')}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* Names */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{isRTL ? 'اسم المدرسة بالعربي' : 'School Name (Arabic)'}</Label>
          <Input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} />
        </div>
        <div>
          <Label>{isRTL ? 'اسم المدرسة بالإنجليزي' : 'School Name (English)'}</Label>
          <Input value={form.name_en} onChange={e => set('name_en', e.target.value)} />
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{isRTL ? 'المدينة' : 'City'}</Label>
          <Input value={form.city} onChange={e => set('city', e.target.value)} />
        </div>
        <div>
          <Label>{isRTL ? 'رقم الهاتف' : 'Phone'}</Label>
          <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'}</Label>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <Label>{isRTL ? 'الموقع الإلكتروني' : 'Website'}</Label>
          <Input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://" />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ المعلومات' : 'Save Information')}
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { t, isRTL, language, toggleLanguage } = useLanguage();
  const { userRole, user } = useRole();
  const { tenantId, hasTenantAccess, isPlatformOwner } = useTenantFilter();


  const { data: users = [], isLoading: _loadingUsers } = useQuery({
    queryKey: ['users', tenantId],
    queryFn: () => {
      if (isPlatformOwner) return tenantQuery('users').select('*').order();
      if (tenantId) return tenantQuery('users').select('*').match({ tenant_id: tenantId });
      return [];
    },
    enabled: userRole === 'admin' && hasTenantAccess,
  });



  if (userRole !== 'admin') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('settings')}
          subtitle={isRTL ? 'إعدادات الحساب' : 'Account Settings'}
        />

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5" />
            {isRTL ? 'اللغة' : 'Language'}
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-600">
                {isRTL ? 'اللغة الحالية' : 'Current Language'}: {language === 'ar' ? 'العربية' : 'English'}
              </p>
            </div>
            <Button onClick={toggleLanguage} variant="outline">
              {language === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            {isRTL ? 'الملف الشخصي' : 'My Profile'}
          </h3>
          <div className="space-y-3 mb-4 text-sm text-slate-500">
            <p>{isRTL ? 'البريد الإلكتروني' : 'Email'}: <span className="font-medium text-slate-700">{user?.email}</span></p>
            <p>{isRTL ? 'الدور' : 'Role'}: <span className="font-medium text-slate-700">{t(userRole)}</span></p>
          </div>
          <MyProfileSection isRTL={isRTL} user={user} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings')}
        subtitle={isRTL ? 'إعدادات النظام' : 'System Settings'}
      />

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="general" className="gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <SettingsIcon className="w-4 h-4" />
            {isRTL ? 'عام' : 'General'}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <Users className="w-4 h-4" />
            {isRTL ? 'المستخدمين' : 'Users'}
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5" />
              {isRTL ? 'اللغة' : 'Language'}
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600">
                  {isRTL ? 'اللغة الحالية' : 'Current Language'}: {language === 'ar' ? 'العربية' : 'English'}
                </p>
              </div>
              <Button onClick={toggleLanguage} variant="outline">
                {language === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              {isRTL ? 'الملف الشخصي' : 'My Profile'}
            </h3>
            <div className="text-sm text-slate-500 mb-4">
              <p>{isRTL ? 'البريد الإلكتروني' : 'Email'}: <span className="font-medium text-slate-700">{user?.email}</span></p>
            </div>
            <MyProfileSection isRTL={isRTL} user={user} />
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-slate-900 mb-5 flex items-center gap-2">
              <Building className="w-5 h-5" />
              {isRTL ? 'معلومات المدرسة' : 'School Information'}
            </h3>
            <SchoolInfoSection isRTL={isRTL} />
          </Card>
        </TabsContent>



        {/* Users */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">
              {isRTL ? 'المستخدمين' : 'Users'}
            </h3>
          </div>

          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead>{t('email')}</TableHead>
                  <TableHead>{isRTL ? 'الدور' : 'Role'}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{t(u.user_role || u.role)}</TableCell>
                    <TableCell>
                      <StatusBadge status={u.is_active !== false ? 'active' : 'inactive'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>


    </div>
  );
}