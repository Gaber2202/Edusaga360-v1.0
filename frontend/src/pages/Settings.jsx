import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, callApi, fetchData } from '../api/supabaseClient';
import { createPageUrl } from '../utils';
import { filterSettingsCatalog } from '../lib/settingsSearch';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { useTenant } from '../components/TenantContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';




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
  Users,
  Globe,
  Building,
  Save,
  Upload,
  Search,
  ArrowLeft,
  ChevronRight,
  GraduationCap,
  DollarSign,
  Banknote,
  CreditCard,
  BookOpen,
  CalendarRange,
  ShieldCheck,
  Bell,
  BellRing,
  UserCircle,
} from 'lucide-react';
import { toast } from 'sonner';



/* ─── Reusable section header (icon chip + title + description) ─── */
function SectionHeader({ icon: Icon, title, description, color = 'slate' }) {
  const chips = {
    slate:  'bg-slate-100 text-slate-600',
    blue:   'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald:'bg-emerald-50 text-emerald-600',
    amber:  'bg-amber-50 text-amber-600',
  };
  return (
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${chips[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className="font-semibold text-slate-900 leading-tight">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

/* ─── Settings hub catalog (grouped, searchable) ─── */
const SETTINGS_CATALOG = [
  {
    key: 'general', titleEn: 'General', titleAr: 'عام',
    items: [
      { key: 'profile', section: 'profile', icon: UserCircle, titleEn: 'My Profile', titleAr: 'الملف الشخصي', descEn: 'Your name and display preferences', descAr: 'اسمك وتفضيلات العرض' },
      { key: 'school', section: 'school', icon: Building, titleEn: 'School Information', titleAr: 'معلومات المدرسة', descEn: 'School profile, logo and contact details', descAr: 'بيانات المدرسة والشعار ومعلومات الاتصال' },
      { key: 'language', section: 'language', icon: Globe, titleEn: 'Language & Localization', titleAr: 'اللغة والتعريب', descEn: 'Interface language (English / Arabic)', descAr: 'لغة الواجهة (إنجليزي / عربي)' },
    ],
  },
  {
    key: 'academic', titleEn: 'Academic', titleAr: 'الأكاديمية',
    items: [
      { key: 'grades', page: 'GradeConfiguration', icon: GraduationCap, titleEn: 'Grades & Year Setup', titleAr: 'إعداد الصفوف والسنوات', descEn: 'Grade levels and academic structure', descAr: 'المراحل الدراسية والهيكل الأكاديمي' },
      { key: 'fees', page: 'TuitionFeesConfiguration', icon: DollarSign, titleEn: 'Fee Structures', titleAr: 'هياكل الرسوم', descEn: 'Tuition and fees per grade and academic year', descAr: 'الرسوم الدراسية لكل صف وعام دراسي' },
    ],
  },
  {
    key: 'finance', titleEn: 'Finance', titleAr: 'المالية',
    items: [
      { key: 'banks', page: 'BankManagement', icon: Banknote, titleEn: 'Payment Methods & Banks', titleAr: 'طرق الدفع والبنوك', descEn: 'Bank accounts and payment options', descAr: 'الحسابات البنكية وخيارات الدفع' },
      { key: 'cheques', page: 'ChequeManagement', icon: CreditCard, titleEn: 'Cheque Management', titleAr: 'إدارة الشيكات', descEn: 'Post-dated cheque lifecycle', descAr: 'دورة حياة الشيكات الآجلة' },
      { key: 'coa', page: 'ChartOfAccounts', icon: BookOpen, titleEn: 'Chart of Accounts', titleAr: 'دليل الحسابات', descEn: 'General ledger account structure', descAr: 'هيكل حسابات الأستاذ العام' },
      { key: 'fiscal', page: 'FiscalPeriods', icon: CalendarRange, titleEn: 'Fiscal Periods', titleAr: 'الفترات المالية', descEn: 'Accounting periods and period close', descAr: 'الفترات المحاسبية وإقفالها' },
    ],
  },
  {
    key: 'access', titleEn: 'People & Access', titleAr: 'الأشخاص والصلاحيات',
    items: [
      { key: 'users', section: 'users', icon: Users, titleEn: 'Users', titleAr: 'المستخدمون', descEn: 'Active users in your account', descAr: 'المستخدمون النشطون في حسابك' },
      { key: 'roles', page: 'RolesPermissions', icon: ShieldCheck, titleEn: 'Roles & Permissions', titleAr: 'الأدوار والصلاحيات', descEn: 'Access control by role', descAr: 'التحكم في الوصول حسب الدور' },
    ],
  },
  {
    key: 'notifications', titleEn: 'Notifications', titleAr: 'الإشعارات',
    items: [
      { key: 'notif-settings', page: 'NotificationSettings', icon: Bell, titleEn: 'Notification Settings', titleAr: 'إعدادات الإشعارات', descEn: 'School-wide notification rules', descAr: 'قواعد الإشعارات على مستوى المدرسة' },
      { key: 'notif-prefs', page: 'NotificationPreferences', icon: BellRing, titleEn: 'Notification Preferences', titleAr: 'تفضيلات الإشعارات', descEn: 'Your personal notification channels', descAr: 'قنوات الإشعارات الشخصية' },
    ],
  },
];

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
      if (isPlatformOwner) return fetchData(tenantQuery('users').select('*').order());
      if (tenantId) return fetchData(tenantQuery('users').select('*').match({ tenant_id: tenantId }));
      return [];
    },
    enabled: userRole === 'admin' && hasTenantAccess,
  });

  const [search, setSearch] = useState('');
  const [openSection, setOpenSection] = useState(null);
  const filteredCatalog = useMemo(() => filterSettingsCatalog(SETTINGS_CATALOG, search), [search]);

  if (userRole !== 'admin') {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('settings')}
          subtitle={isRTL ? 'إعدادات الحساب' : 'Account Settings'}
        />

        <Card className="p-6">
          <SectionHeader
            icon={Globe}
            color="indigo"
            title={isRTL ? 'اللغة' : 'Language'}
            description={isRTL ? 'لغة عرض الواجهة' : 'Interface display language'}
          />
          <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-600">
              {isRTL ? 'اللغة الحالية' : 'Current Language'}:{' '}
              <span className="font-semibold text-slate-900">{language === 'ar' ? 'العربية' : 'English'}</span>
            </p>
            <Button onClick={toggleLanguage} variant="outline" size="sm" className="gap-2">
              <Globe className="w-3.5 h-3.5" />
              {language === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeader
            icon={Users}
            color="blue"
            title={isRTL ? 'الملف الشخصي' : 'My Profile'}
            description={isRTL ? 'معلوماتك الشخصية واسم العرض' : 'Your personal information and display name'}
          />
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-400">{isRTL ? 'البريد الإلكتروني' : 'Email'}</p>
              <p className="text-sm font-medium text-slate-700 truncate">{user?.email}</p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-400">{isRTL ? 'الدور' : 'Role'}</p>
              <p className="text-sm font-medium text-slate-700">{t(userRole)}</p>
            </div>
          </div>
          <MyProfileSection isRTL={isRTL} user={user} />
        </Card>
      </div>
    );
  }

  const inlineSection = (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2 -ms-2" onClick={() => setOpenSection(null)}>
        <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
        {isRTL ? 'كل الإعدادات' : 'All settings'}
      </Button>

      {openSection === 'language' && (
        <Card className="p-6">
          <SectionHeader icon={Globe} color="indigo" title={isRTL ? 'اللغة' : 'Language'} description={isRTL ? 'لغة عرض الواجهة' : 'Interface display language'} />
          <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-600">
              {isRTL ? 'اللغة الحالية' : 'Current Language'}:{' '}
              <span className="font-semibold text-slate-900">{language === 'ar' ? 'العربية' : 'English'}</span>
            </p>
            <Button onClick={toggleLanguage} variant="outline" size="sm" className="gap-2">
              <Globe className="w-3.5 h-3.5" />
              {language === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
            </Button>
          </div>
        </Card>
      )}

      {openSection === 'profile' && (
        <Card className="p-6">
          <SectionHeader icon={Users} color="blue" title={isRTL ? 'الملف الشخصي' : 'My Profile'} description={isRTL ? 'معلوماتك الشخصية واسم العرض' : 'Your personal information and display name'} />
          <div className="mt-5 mb-5">
            <div className="inline-flex flex-col rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-400">{isRTL ? 'البريد الإلكتروني' : 'Email'}</p>
              <p className="text-sm font-medium text-slate-700">{user?.email}</p>
            </div>
          </div>
          <MyProfileSection isRTL={isRTL} user={user} />
        </Card>
      )}

      {openSection === 'school' && (
        <Card className="p-6">
          <SectionHeader icon={Building} color="emerald" title={isRTL ? 'معلومات المدرسة' : 'School Information'} description={isRTL ? 'بيانات المدرسة الرسمية والشعار ومعلومات الاتصال' : 'Official school details, logo and contact information'} />
          <div className="mt-5">
            <SchoolInfoSection isRTL={isRTL} />
          </div>
        </Card>
      )}

      {openSection === 'users' && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <SectionHeader icon={Users} color="blue" title={isRTL ? 'المستخدمين' : 'Users'} description={isRTL ? 'المستخدمون النشطون في حسابك' : 'Active users in your account'} />
              <span className="text-sm font-semibold text-slate-700 bg-slate-100 rounded-full px-3 py-1">{users.length}</span>
            </div>
          </Card>
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
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-slate-400 text-sm">
                      {isRTL ? 'لا يوجد مستخدمون' : 'No users found'}
                    </TableCell>
                  </TableRow>
                ) : users.map(u => (
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
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings')}
        subtitle={isRTL ? 'إعدادات النظام' : 'System Settings'}
      />

      {openSection ? inlineSection : (
        <>
          <div className="relative max-w-md">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'end-3' : 'start-3'}`} />
            <Input
              className={isRTL ? 'pe-9' : 'ps-9'}
              placeholder={isRTL ? 'ابحث في الإعدادات...' : 'Search settings...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filteredCatalog.length === 0 ? (
            <Card className="p-10 text-center text-slate-400 text-sm">{isRTL ? 'لا توجد إعدادات مطابقة' : 'No matching settings'}</Card>
          ) : filteredCatalog.map((cat) => (
            <div key={cat.key} className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">{isRTL ? cat.titleAr : cat.titleEn}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cat.items.map((it) => {
                  const Tile = (
                    <div className="h-full flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm transition-all">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
                        <it.icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 leading-tight">{isRTL ? it.titleAr : it.titleEn}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{isRTL ? it.descAr : it.descEn}</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-300 ms-auto flex-shrink-0 self-center ${isRTL ? 'rotate-180' : ''}`} />
                    </div>
                  );
                  return it.page ? (
                    <Link key={it.key} to={createPageUrl(it.page)} className="block">{Tile}</Link>
                  ) : (
                    <button key={it.key} type="button" className="block text-start w-full" onClick={() => setOpenSection(it.section)}>{Tile}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}