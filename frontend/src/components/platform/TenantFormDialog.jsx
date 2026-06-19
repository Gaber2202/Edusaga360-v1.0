import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { tenantQuery, callApi } from '../../api/supabaseClient';
import { logAuditEvent, AuditActions } from '../AuditService';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { RefreshCw, Send, Check, Users, Settings, School } from 'lucide-react';

/* ─── Constants ─── */
const ALL_MODULES = [
  { key: 'admissions',          labelEn: 'Admissions & Enrollment',  labelAr: 'القبول والتسجيل' },
  { key: 'students',            labelEn: 'Student Management',        labelAr: 'إدارة الطلاب' },
  { key: 'fees',                labelEn: 'Fees & Billing',            labelAr: 'الرسوم والفواتير' },
  { key: 'hr',                  labelEn: 'HR Module',                 labelAr: 'الموارد البشرية' },
  { key: 'payroll',             labelEn: 'Payroll',                   labelAr: 'الرواتب' },
  { key: 'government_relations',labelEn: 'Government Relations',      labelAr: 'العلاقات الحكومية' },
  { key: 'finance',             labelEn: 'Finance & Accounting',      labelAr: 'المالية والمحاسبة' },
  { key: 'assets',              labelEn: 'Fixed Assets',              labelAr: 'الأصول الثابتة' },
  { key: 'yamen',               labelEn: 'Yamen HR AI Assistant',     labelAr: 'يامن AI للموارد البشرية' },
  { key: 'reports',             labelEn: 'Reports & Analytics',       labelAr: 'التقارير والتحليلات' },
  { key: 'communications',      labelEn: 'Communications',            labelAr: 'الاتصالات' },
];

const DEFAULT_PLAN_LIMITS = {
  starter:    { max_employees: 50,    max_students: 300,   max_branches: 1,  yamen_ai_monthly_limit: 0,    max_users: 500  },
  growth:     { max_employees: 200,   max_students: 2000,  max_branches: 3,  yamen_ai_monthly_limit: 100,  max_users: 4000 },
  enterprise: { max_employees: 10000, max_students: 99999, max_branches: 20, yamen_ai_monthly_limit: 9999, max_users: 10000 },
};

const PLAN_MODULES = {
  starter:    ['admissions', 'students', 'fees'],
  growth:     ['admissions', 'students', 'fees', 'hr', 'payroll', 'government_relations', 'yamen'],
  enterprise: ['admissions', 'students', 'fees', 'hr', 'payroll', 'government_relations', 'finance', 'assets', 'yamen', 'reports', 'communications'],
};

/* ─── Auto-generate tenant code from English name ─── */
function generateCode(nameEn) {
  if (!nameEn) return '';
  const clean = nameEn.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  let code = words.length >= 2
    ? words.slice(0, 3).map(w => w.slice(0, 4)).join('_')
    : words[0]?.slice(0, 10) || '';
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${code}_${suffix}`;
}

/* ─── Module Checkbox ─── */
function ModuleToggle({ mod, checked, onChange, isRTL }) {
  return (
    <label className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors
      ${checked ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <input type="checkbox" className="hidden" checked={checked} onChange={e => onChange(mod.key, e.target.checked)} />
      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0
        ${checked ? 'bg-blue-600' : 'bg-white border border-slate-300'}`}>
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className="text-xs font-medium text-slate-700">{isRTL ? mod.labelAr : mod.labelEn}</span>
    </label>
  );
}

/* ─── Main Component ─── */
export default function TenantFormDialog({ open, onClose, tenant, isRTL }) {
  const qc = useQueryClient();
  const isEdit = !!tenant?.id;
  const [saving, setSaving] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [activeSection, setActiveSection] = useState('basic'); // basic | modules | users

  const defaultForm = () => ({
    tenant_code: '', name_ar: '', name_en: '', school_name_en: '', school_name_ar: '',
    admin_email: '', admin_name: '',
    plan_code: 'starter', status: 'trial',
    trial_end_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    phone: '', city: '', notes: '',
    ...DEFAULT_PLAN_LIMITS.starter,
    enabled_modules: [...PLAN_MODULES.starter],
  });

  const [form, setForm] = useState(defaultForm());

  useEffect(() => {
    if (open) {
      if (tenant) setForm({ ...defaultForm(), ...tenant });
      else { setForm(defaultForm()); setInviteSent(false); setActiveSection('basic'); }
    }
  }, [tenant, open]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleNameEnChange = (val) => {
    setForm(p => ({
      ...p,
      name_en: val,
      // auto-generate code only if user hasn't manually set one
      tenant_code: p._codeManual ? p.tenant_code : generateCode(val),
    }));
  };

  const regenerateCode = () => {
    setForm(p => ({ ...p, tenant_code: generateCode(p.name_en), _codeManual: false }));
  };

  const handlePlanChange = (plan) => {
    const limits = DEFAULT_PLAN_LIMITS[plan] || {};
    const modules = PLAN_MODULES[plan] || [];
    setForm(p => ({ ...p, plan_code: plan, ...limits, enabled_modules: [...modules] }));
  };

  const toggleModule = (key, checked) => {
    setForm(p => ({
      ...p,
      enabled_modules: checked
        ? [...(p.enabled_modules || []), key]
        : (p.enabled_modules || []).filter(m => m !== key),
    }));
  };

  const handleSendInvitation = async () => {
    if (!form.admin_email) return;
    try {
      await callApi('/api/auth/invite', { email: form.admin_email, role: 'admin' });
      setInviteSent(true);
    } catch (e) {
      console.error('Invite failed', e);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const { _codeManual, ...data } = form;
    const saveData = { ...data, is_active: data.status !== 'cancelled' && data.status !== 'suspended' };

    if (isEdit) {
      await tenantQuery('tenants').update(saveData);
      await logAuditEvent({
        action: AuditActions.UPDATE,
        entityType: 'Tenant',
        entityId: tenant.id,
        oldValues: {
          status: tenant.status,
          plan_code: tenant.plan_code,
          enabled_modules: tenant.enabled_modules,
        },
        newValues: {
          status: saveData.status,
          plan_code: saveData.plan_code,
          enabled_modules: saveData.enabled_modules,
        },
        notes: `Platform admin updated tenant ${tenant.tenant_code || tenant.id}`,
      });
    } else {
      const created = await tenantQuery('tenants').insert({ ...saveData, trial_start_date: format(new Date(), 'yyyy-MM-dd') });
      await logAuditEvent({
        action: AuditActions.CREATE,
        entityType: 'Tenant',
        entityId: created?.id,
        newValues: {
          tenant_code: saveData.tenant_code,
          name_ar: saveData.name_ar,
          name_en: saveData.name_en,
          admin_email: saveData.admin_email,
          plan_code: saveData.plan_code,
          status: saveData.status,
        },
        notes: `Platform admin created tenant ${saveData.tenant_code || created?.id}`,
      });
      // Send invitation automatically on create
      if (form.admin_email && created?.id) {
        try { await callApi('/api/auth/invite', { email: form.admin_email, role: 'admin' }); setInviteSent(true); } catch (_e) {}
        try {
          const { data: users = [] } = await tenantQuery('users').select('*').match({ email: form.admin_email });
          if (users?.[0]) await tenantQuery('users').update({ tenant_id: created.id, tenant_code: form.tenant_code });
        } catch (_e) {}
      }
    }

    qc.invalidateQueries({ queryKey: ['tenants'] });
    setSaving(false);
    onClose();
  };

  const label = (ar, en) => isRTL ? ar : en;

  const sections = [
    { id: 'basic',   icon: School,   title: label('المعلومات الأساسية', 'Basic Info') },
    { id: 'modules', icon: Settings, title: label('الوحدات', 'Modules') },
    { id: 'users',   icon: Users,    title: label('المستخدمون والدعوة', 'Users & Invite') },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEdit ? label('تعديل المستأجر', 'Edit Tenant') : label('إضافة مستأجر جديد', 'New Tenant')}</DialogTitle>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 flex-shrink-0">
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors
                ${activeSection === s.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <s.icon className="w-3.5 h-3.5" />
              {s.title}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-4 px-1">

          {/* ── BASIC INFO ── */}
          {activeSection === 'basic' && (
            <div className="space-y-4">
              {/* School Names */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{label('اسم المدرسة', 'School Name')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{label('اسم المدرسة بالعربي', 'School Name (Arabic)')}</Label>
                    <Input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} placeholder="مدرسة النجاح" />
                  </div>
                  <div>
                    <Label>{label('اسم المدرسة بالإنجليزي', 'School Name (English)')}</Label>
                    <Input value={form.name_en} onChange={e => handleNameEnChange(e.target.value)} placeholder="Al Najah School" />
                  </div>
                </div>
              </div>

              {/* Tenant Code */}
              <div>
                <Label>{label('رمز المستأجر (تلقائي)', 'Tenant Code (auto-generated)')}</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.tenant_code}
                    onChange={e => setForm(p => ({ ...p, tenant_code: e.target.value.toUpperCase(), _codeManual: true }))}
                    placeholder="AL_NAJA_123"
                    className="font-mono"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={regenerateCode} title="Regenerate">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-1">{label('يُنشأ تلقائياً من الاسم — يمكنك تعديله', 'Auto-generated from name — you can edit it')}</p>
              </div>

              {/* City & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{label('المدينة', 'City')}</Label>
                  <Input value={form.city} onChange={e => set('city', e.target.value)} />
                </div>
                <div>
                  <Label>{label('رقم الهاتف', 'Phone')}</Label>
                  <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
              </div>

              {/* Plan & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{label('الخطة', 'Plan')}</Label>
                  <Select value={form.plan_code} onValueChange={handlePlanChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{label('الحالة', 'Status')}</Label>
                  <Select value={form.status} onValueChange={v => set('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trial">{label('تجريبي', 'Trial')}</SelectItem>
                      <SelectItem value="active">{label('نشط', 'Active')}</SelectItem>
                      <SelectItem value="suspended">{label('موقوف', 'Suspended')}</SelectItem>
                      <SelectItem value="cancelled">{label('ملغى', 'Cancelled')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.status === 'trial' && (
                <div>
                  <Label>{label('تاريخ انتهاء التجربة', 'Trial End Date')}</Label>
                  <Input type="date" value={form.trial_end_date} onChange={e => set('trial_end_date', e.target.value)} />
                </div>
              )}

              {/* Resource Limits */}
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{label('حدود الموارد', 'Resource Limits')}</p>
                <div className="grid grid-cols-4 gap-2">
                  <div><Label className="text-xs">{label('موظفون', 'Employees')}</Label><Input type="number" value={form.max_employees} onChange={e => set('max_employees', +e.target.value)} /></div>
                  <div><Label className="text-xs">{label('طلاب', 'Students')}</Label><Input type="number" value={form.max_students} onChange={e => set('max_students', +e.target.value)} /></div>
                  <div><Label className="text-xs">{label('فروع', 'Branches')}</Label><Input type="number" value={form.max_branches} onChange={e => set('max_branches', +e.target.value)} /></div>
                  <div><Label className="text-xs">{label('يامن AI', 'Yamen AI')}</Label><Input type="number" value={form.yamen_ai_monthly_limit} onChange={e => set('yamen_ai_monthly_limit', +e.target.value)} /></div>
                </div>
              </div>

              <div>
                <Label>{label('ملاحظات', 'Notes')}</Label>
                <Input value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          )}

          {/* ── MODULES ── */}
          {activeSection === 'modules' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{label('الوحدات المفعّلة لهذا المستأجر', 'Enabled Modules for this Tenant')}</p>
                  <p className="text-xs text-slate-400">{label('هذه الوحدات ستظهر لمسؤول المستأجر', 'These modules will be visible to the tenant admin')}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {(form.enabled_modules || []).length} / {ALL_MODULES.length}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map(mod => (
                  <ModuleToggle
                    key={mod.key}
                    mod={mod}
                    checked={(form.enabled_modules || []).includes(mod.key)}
                    onChange={toggleModule}
                    isRTL={isRTL}
                  />
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => set('enabled_modules', ALL_MODULES.map(m => m.key))}>
                  {label('تحديد الكل', 'Select All')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => set('enabled_modules', [])}>
                  {label('إلغاء الكل', 'Clear All')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => handlePlanChange(form.plan_code)}>
                  {label('إعادة للخطة', 'Reset to Plan')}
                </Button>
              </div>
            </div>
          )}

          {/* ── USERS & INVITE ── */}
          {activeSection === 'users' && (
            <div className="space-y-5">
              {/* Admin account */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{label('حساب المسؤول', 'Admin Account')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{label('إيميل المسؤول', 'Admin Email')}</Label>
                    <Input type="email" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} placeholder="admin@school.edu.sa" />
                  </div>
                  <div>
                    <Label>{label('اسم المسؤول', 'Admin Name')}</Label>
                    <Input value={form.admin_name} onChange={e => set('admin_name', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* User limit */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-700">{label('حد المستخدمين', 'User Limit')}</p>
                </div>
                <p className="text-xs text-slate-400">
                  {label(
                    'تحديد الحد الأقصى لعدد المستخدمين الذين يمكن لمسؤول المستأجر دعوتهم',
                    'Set the maximum number of users the tenant admin can invite to their school'
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    className="w-40"
                    value={form.max_users || 500}
                    onChange={e => set('max_users', +e.target.value)}
                    min={1}
                  />
                  <span className="text-xs text-slate-500">{label('مستخدم كحد أقصى', 'max users')}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[100, 500, 1000, 4000, 10000].map(n => (
                    <button key={n} onClick={() => set('max_users', n)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors
                        ${form.max_users === n ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {n.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Send invitation */}
              <div className={`border rounded-xl p-4 space-y-3 ${inviteSent ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                <div className="flex items-center gap-2">
                  <Send className={`w-4 h-4 ${inviteSent ? 'text-emerald-600' : 'text-slate-500'}`} />
                  <p className="text-sm font-semibold text-slate-700">{label('إرسال دعوة الدخول', 'Send Invitation')}</p>
                </div>
                {inviteSent ? (
                  <div className="flex items-center gap-2 text-emerald-700 text-sm">
                    <Check className="w-4 h-4" />
                    {label('تم إرسال الدعوة بنجاح', 'Invitation sent successfully!')}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-400">
                      {label(
                        'سيتلقى المسؤول إيميل دعوة للدخول للنظام. يتم الإرسال تلقائياً عند حفظ المستأجر الجديد.',
                        'The admin will receive an invitation email to access the platform. Sent automatically when saving a new tenant.'
                      )}
                    </p>
                    {isEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSendInvitation}
                        disabled={!form.admin_email}
                        className="gap-2"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {label('إرسال الدعوة الآن', 'Send Invitation Now')}
                      </Button>
                    )}
                    {!isEdit && (
                      <p className="text-xs text-blue-600 font-medium">
                        ✓ {label('ستُرسل الدعوة تلقائياً عند الحفظ', 'Invitation will be sent automatically on save')}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-slate-200 flex-shrink-0">
          <div className="text-xs text-slate-400">
            {!isEdit && form.admin_email && (
              <span className="flex items-center gap-1 text-blue-600">
                <Send className="w-3 h-3" />
                {label(`سيتم دعوة ${form.admin_email}`, `Will invite ${form.admin_email}`)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{label('إلغاء', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !form.name_ar || !form.tenant_code}>
              {saving ? label('جاري الحفظ...', 'Saving...') : label('حفظ وإرسال الدعوة', isEdit ? 'Save' : 'Save & Send Invite')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}