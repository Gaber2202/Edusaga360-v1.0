import { getCurrencySymbol } from '../../lib/localization';
import React, { useState } from 'react';
import { useTenant } from '../TenantContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../../api/supabaseClient';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Switch } from '../ui/switch';
import { Plus, Pencil, Star, Check, X, Zap, Building2, Crown } from 'lucide-react';

/* ─── Static plan definitions (display only) ─── */
const PLAN_DEFS = {
  starter: {
    icon: Zap,
    color: 'from-najdi-900 to-najdi-900',
    badge: 'bg-sand-alt text-ink border-border',
    accent: 'text-muted-foreground',
    price: '120,000',
    limits: { staff: 15, generalAccess: 500, branches: 1 },
    features: [
      { label: 'Core Platform Licence', included: true },
      { label: 'Academic & Operations', included: true },
      { label: 'Admissions & Enrollment', included: true },
      { label: 'Student Management', included: true },
      { label: 'Fee & Billing Management', included: true },
      { label: 'Basic Reports', included: true },
      { label: 'HR & Payroll', included: false },
      { label: 'Financials Standard ERP', included: false },
      { label: 'AI Capabilities', included: false },
      { label: 'Support', included: false, note: 'Add-on' },
    ],
  },
  growth: {
    icon: Building2,
    color: 'from-najdi-700 to-indigo-700',
    badge: 'bg-najdi-50 text-najdi-900 border-najdi-100',
    accent: 'text-najdi-700',
    price: '190,000',
    limits: { staff: 30, generalAccess: 2000, branches: 3 },
    features: [
      { label: 'Core Platform Licence', included: true },
      { label: 'Academic & Operations', included: true },
      { label: 'Admissions & Enrollment', included: true },
      { label: 'Student Management', included: true },
      { label: 'Fee & Billing Management', included: true },
      { label: 'Advanced Reports', included: true },
      { label: 'HR & Payroll', included: true },
      { label: 'Financials Standard ERP', included: true },
      { label: 'AI — Finance & Predictions (limited tokens)', included: true },
      { label: 'Support', included: false, note: 'Add-on' },
    ],
  },
  enterprise: {
    icon: Crown,
    color: 'from-amber-500 to-orange-600',
    badge: 'bg-amber-100 text-amber-700 border-amber-300',
    accent: 'text-amber-600',
    price: '342,000',
    limits: { staff: 100, generalAccess: 6000, branches: 10 },
    features: [
      { label: 'All Modules — Full ERP', included: true },
      { label: 'Academic & Operations', included: true },
      { label: 'Admissions & Enrollment', included: true },
      { label: 'Student Management', included: true },
      { label: 'Fee & Billing Management', included: true },
      { label: 'Full Analytics & Reports', included: true },
      { label: 'HR & Payroll', included: true },
      { label: 'Financials Standard ERP + Sandbox', included: true },
      { label: 'AI — Higher Token Limit', included: true },
      { label: 'Dedicated Support + SLA', included: true },
    ],
  },
};

/* ─── Plan Card ─── */
function PlanCard({ plan, def, isRTL, onEdit }) {
  const { tenant } = useTenant();
  const label = (ar, en) => isRTL ? ar : en;
  const Icon = def.icon;
  const limits = def.limits;

  return (
    <div className={`relative bg-white rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col`}>
      {/* Header gradient */}
      <div className={`bg-gradient-to-br ${def.color} p-5 text-white`}>
        <div className="flex items-center justify-between mb-3">
          <Icon className="w-6 h-6 opacity-90" />
          {plan.is_featured && <Star className="w-5 h-5 text-amber-300 fill-amber-300" />}
        </div>
        <h3 className="text-xl font-bold">{isRTL ? plan.name_ar : plan.name_en}</h3>
        <p className="text-sm opacity-75 mt-0.5">{isRTL ? plan.description_ar : plan.description_en}</p>


      </div>

      {/* Price */}
      <div className="px-5 py-2 bg-sand/80 border-b border-border">
        <p className="text-xs text-muted-foreground">{label(`السعر السنوي (${getCurrencySymbol(tenant?.localization, isRTL)})`, `Annual price (${getCurrencySymbol(tenant?.localization, isRTL)}, excl. VAT)`)}</p>
        <p className="text-lg font-bold text-ink">{def.price} <span className="text-xs font-normal text-muted-foreground">{getCurrencySymbol(tenant?.localization, isRTL)}/{isRTL ? 'سنة' : 'yr'}</span></p>
      </div>

      {/* Limits */}
      <div className="px-5 py-3 bg-sand border-b border-border">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { key: 'staff',         label: label('موظفو النظام', 'Staff users')       },
            { key: 'generalAccess', label: label('أولياء / بوابة', 'General access')  },
            { key: 'branches',      label: label('الفروع',        'Branches')          },
          ].map(({ key, label: lbl }) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{lbl}</span>
              <span className="font-semibold text-ink">{limits[key]?.toLocaleString?.() ?? limits[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature list */}
      <div className="px-5 py-4 flex-1">
        <ul className="space-y-2">
          {def.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {f.included
                ? <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${def.accent}`} />
                : <X className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
              }
              <span className={f.included ? 'text-ink' : 'text-muted-foreground'}>
                {f.label}
                {f.note && <span className="ms-1 text-xs text-amber-600">({f.note})</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
        <Badge className={`text-xs border ${def.badge}`}>
          {plan.plan_code?.toUpperCase()}
        </Badge>
        <Button variant="ghost" size="sm" onClick={() => onEdit(plan)}>
          <Pencil className="w-3.5 h-3.5 me-1" />
          {label('تعديل', 'Edit')}
        </Button>
      </div>
    </div>
  );
}

/* ─── Main Tab ─── */
export default function SubscriptionPlansTab({ isRTL }) {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  const label = (ar, en) => isRTL ? ar : en;

  const { data: plans = [], isLoading } = useQuery({ enabled: false /* subscription_plans table not built */, queryKey: ['subscriptionPlans'], queryFn: () => fetchData(tenantQuery('subscription_plans').select('*').order('display_order')), initialData: [] });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const openNew = () => {
    setEditing(null);
    setForm({
      plan_code: '', name_ar: '', name_en: '', description_ar: '', description_en: '',
      price_monthly_sar: 0, price_yearly_sar: 0, trial_days: 30,
      max_employees: 50, max_students: 300, max_branches: 1,
      yamen_ai_monthly_limit: 0, storage_gb: 10,
      is_active: true, is_featured: false, display_order: plans.length + 1,
      enabled_modules: [],
    });
    setDialogOpen(true);
  };

  const openEdit = (plan) => { setEditing(plan); setForm({ ...plan }); setDialogOpen(true); };
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    if (editing) await tenantQuery('subscription_plans').update(form);
    else await tenantQuery('subscription_plans').insert(form);
    qc.invalidateQueries({ queryKey: ['subscriptionPlans'] });
    setSaving(false);
    setDialogOpen(false);
  };

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">{label('جاري التحميل...', 'Loading...')}</div>;

  // Merge DB plans with static defs; fall back to starter style if unknown code
  const orderedCodes = ['starter', 'growth', 'enterprise'];
  const sorted = [...plans].sort((a, b) => {
    const ai = orderedCodes.indexOf(a.plan_code);
    const bi = orderedCodes.indexOf(b.plan_code);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-ink">{label('خطط الاشتراك', 'Subscription Plans')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{label('الأسعار تُحدد حسب عدد المستخدمين والوحدات المفعّلة', 'Pricing is defined per users & enabled modules')}</p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 me-1" />{label('خطة جديدة', 'New Plan')}
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="mb-3">{label('لا توجد خطط بعد', 'No plans yet')}</p>
          <Button variant="outline" size="sm" onClick={openNew}>{label('إضافة خطة', 'Add Plan')}</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {sorted.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              def={PLAN_DEFS[plan.plan_code] || PLAN_DEFS.starter}
              isRTL={isRTL}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? label('تعديل الخطة', 'Edit Plan') : label('خطة جديدة', 'New Plan')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{label('الاسم بالعربي', 'Name (AR)')}</Label><Input value={form.name_ar || ''} onChange={e => set('name_ar', e.target.value)} /></div>
              <div><Label>{label('الاسم بالإنجليزي', 'Name (EN)')}</Label><Input value={form.name_en || ''} onChange={e => set('name_en', e.target.value)} /></div>
            </div>
            <div>
              <Label>{label('رمز الخطة', 'Plan Code')}</Label>
              <Input value={form.plan_code || ''} onChange={e => set('plan_code', e.target.value.toLowerCase())} placeholder="starter / growth / enterprise" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{label('وصف عربي', 'Description (AR)')}</Label><Input value={form.description_ar || ''} onChange={e => set('description_ar', e.target.value)} /></div>
              <div><Label>{label('وصف إنجليزي', 'Description (EN)')}</Label><Input value={form.description_en || ''} onChange={e => set('description_en', e.target.value)} /></div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground mb-2">{label('الأسعار (اختياري - اتركها فارغة للتسعير المخصص)', 'Pricing (optional — leave 0 for custom pricing)')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{label(`السعر الشهري (${getCurrencySymbol(tenant?.localization, isRTL)})`, `Monthly Price (${getCurrencySymbol(tenant?.localization, isRTL)})`)}</Label><Input type="number" value={form.price_monthly_sar || 0} onChange={e => set('price_monthly_sar', +e.target.value)} /></div>
                <div><Label>{label(`السعر السنوي (${getCurrencySymbol(tenant?.localization, isRTL)})`, `Yearly Price (${getCurrencySymbol(tenant?.localization, isRTL)})`)}</Label><Input type="number" value={form.price_yearly_sar || 0} onChange={e => set('price_yearly_sar', +e.target.value)} /></div>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-xs text-muted-foreground mb-2">{label('الحدود', 'Limits')}</p>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>{label('موظفون', 'Employees')}</Label><Input type="number" value={form.max_employees || 0} onChange={e => set('max_employees', +e.target.value)} /></div>
                <div><Label>{label('طلاب', 'Students')}</Label><Input type="number" value={form.max_students || 0} onChange={e => set('max_students', +e.target.value)} /></div>
                <div><Label>{label('فروع', 'Branches')}</Label><Input type="number" value={form.max_branches || 0} onChange={e => set('max_branches', +e.target.value)} /></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{label('يامن AI/شهر', 'Yamen AI/mo')}</Label><Input type="number" value={form.yamen_ai_monthly_limit || 0} onChange={e => set('yamen_ai_monthly_limit', +e.target.value)} /></div>
              <div><Label>{label('أيام التجربة', 'Trial Days')}</Label><Input type="number" value={form.trial_days || 30} onChange={e => set('trial_days', +e.target.value)} /></div>
            </div>
            <div className="flex items-center justify-between">
              <Label>{label('نشط', 'Active')}</Label>
              <Switch checked={!!form.is_active} onCheckedChange={v => set('is_active', v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>{label('خطة مميزة', 'Featured Plan')}</Label>
              <Switch checked={!!form.is_featured} onCheckedChange={v => set('is_featured', v)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{label('إلغاء', 'Cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !form.name_ar || !form.plan_code}>
              {saving ? label('جاري الحفظ...', 'Saving...') : label('حفظ', 'Save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}