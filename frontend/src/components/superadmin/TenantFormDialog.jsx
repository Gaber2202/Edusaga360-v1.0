import React, { useState } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';
import { Loader2, Building2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { PLAN_DEFINITIONS } from '../../hooks/useModuleAccess';
import { logAuditEvent, AuditActions } from '../AuditService';

export default function TenantFormDialog({ open, onClose, onCreated }) {
  const { isRTL } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    admin_email: '',
    admin_name: '',
    city: '',
    phone: '',
    plan_code: 'free_trial',
    employee_count_range: '1-10',
  });

  const handleCreate = async () => {
    if (!form.name_ar || !form.name_en || !form.admin_email) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    setSaving(true);
    try {
      const tenantCode = `T-${form.name_en.replace(/\s+/g, '').substring(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
      const plan = PLAN_DEFINITIONS[form.plan_code] || PLAN_DEFINITIONS.free_trial;
      const today = format(new Date(), 'yyyy-MM-dd');

      const tenantData = {
        tenant_code: tenantCode,
        name_ar: form.name_ar,
        name_en: form.name_en,
        admin_email: form.admin_email,
        admin_name: form.admin_name,
        city: form.city,
        phone: form.phone,
        country: 'KSA',
        plan_code: form.plan_code,
        status: form.plan_code === 'free_trial' ? 'trial' : 'active',
        trial_start_date: form.plan_code === 'free_trial' ? today : null,
        trial_end_date: form.plan_code === 'free_trial' ? format(addDays(new Date(), plan.durationDays || 14), 'yyyy-MM-dd') : null,
        subscription_start_date: today,
        max_users: plan.maxUsers,
        max_employees: plan.maxEmployees,
        max_students: plan.maxStudents,
        max_branches: plan.maxBranches,
        max_modules: plan.maxSelectableModules,
        ai_enabled: plan.aiEnabled,
        yamen_ai_monthly_limit: plan.aiEnabled ? 100 : 0,
        enabled_modules: plan.includedModules,
        employee_count_range: form.employee_count_range,
        current_users: 0,
        current_employees: 0,
        current_students: 0,
        current_branches: 0,
        is_active: true,
        monthly_revenue: plan.priceMonthly,
        billing_cycle: 'monthly',
        has_demo_data: false,
        last_activity_date: today,
      };

      const created = await tenantQuery('tenants').insert(tenantData);

      await logAuditEvent({
        action: AuditActions.CREATE,
        entityType: 'Tenant',
        entityId: created?.id,
        newValues: {
          tenant_code: tenantCode,
          name_ar: form.name_ar,
          name_en: form.name_en,
          admin_email: form.admin_email,
          plan_code: form.plan_code,
          status: tenantData.status,
        },
        notes: `Platform admin created tenant ${tenantCode}`,
      });

      toast.success(isRTL 
        ? `تم إنشاء المؤسسة "${form.name_ar}" بنجاح — الكود: ${tenantCode}`
        : `Tenant "${form.name_en}" created — Code: ${tenantCode}`
      );
      onCreated?.(created);
    } catch (error) {
      toast.error(isRTL ? `خطأ: ${error.message}` : `Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            {isRTL ? 'إنشاء مؤسسة جديدة' : 'Create New Tenant'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالعربي *' : 'Arabic Name *'}</Label>
              <Input dir="rtl" value={form.name_ar} onChange={e => setForm(p => ({ ...p, name_ar: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم بالإنجليزي *' : 'English Name *'}</Label>
              <Input value={form.name_en} onChange={e => setForm(p => ({ ...p, name_en: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'بريد المشرف *' : 'Admin Email *'}</Label>
              <Input type="email" value={form.admin_email} onChange={e => setForm(p => ({ ...p, admin_email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'اسم المشرف' : 'Admin Name'}</Label>
              <Input value={form.admin_name} onChange={e => setForm(p => ({ ...p, admin_name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'المدينة' : 'City'}</Label>
              <Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الهاتف' : 'Phone'}</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الخطة' : 'Plan'}</Label>
              <Select value={form.plan_code} onValueChange={v => setForm(p => ({ ...p, plan_code: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free_trial">{isRTL ? 'تجربة مجانية (30 يوم)' : 'Free Trial (30 days)'}</SelectItem>
                  <SelectItem value="startup">{isRTL ? 'خطة الانطلاق' : 'Startup Plan'}</SelectItem>
                  <SelectItem value="enterprise">{isRTL ? 'خطة المؤسسات' : 'Enterprise Plan'}</SelectItem>
                  <SelectItem value="government">{isRTL ? 'الخطة الحكومية' : 'Government Plan'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'عدد الموظفين' : 'Employee Count'}</Label>
              <Select value={form.employee_count_range} onValueChange={v => setForm(p => ({ ...p, employee_count_range: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1–10</SelectItem>
                  <SelectItem value="11-50">11–50</SelectItem>
                  <SelectItem value="51-200">51–200</SelectItem>
                  <SelectItem value="201-500">201–500</SelectItem>
                  <SelectItem value="500+">500+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={handleCreate} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isRTL ? 'إنشاء المؤسسة' : 'Create Tenant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}