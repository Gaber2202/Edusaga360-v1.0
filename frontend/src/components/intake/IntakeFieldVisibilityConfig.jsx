import React, { useEffect, useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { tenantQuery } from '../../api/supabaseClient';
import { Settings2 } from 'lucide-react';
import { INTAKE_FORM_FIELDS, resolveVisibleFields } from '../../lib/intakeFormFields';

/**
 * SCRUM-114: school show/hide for registration-template fields (no custom fields).
 * Persists to platform_settings key intake_visible_fields_{tenantId}.
 */
export default function IntakeFieldVisibilityConfig({
  open,
  onClose,
  tenantId,
  initialConfig,
  onSaved,
}) {
  const { isRTL } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(() => resolveVisibleFields(initialConfig));

  useEffect(() => {
    if (open) setVisible(resolveVisibleFields(initialConfig));
  }, [open, initialConfig]);

  const toggle = (key, value) => {
    const field = INTAKE_FORM_FIELDS.find((f) => f.key === key);
    if (field?.required) return;
    setVisible((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload = resolveVisibleFields(visible);
      const { error } = await tenantQuery('platform_settings').upsert({
        key: `intake_visible_fields_${tenantId}`,
        value: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      // platform_settings may be platform-scoped — fall back to supabase raw if needed
      if (error) {
        const { supabase } = await import('../../api/supabaseClient');
        const { error: e2 } = await supabase.from('platform_settings').upsert({
          key: `intake_visible_fields_${tenantId}`,
          value: payload,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
        if (e2) throw e2;
      }
      toast.success(isRTL ? 'تم حفظ حقول النموذج' : 'Form fields saved');
      onSaved?.(payload);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || (isRTL ? 'تعذر الحفظ' : 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            {isRTL ? 'إظهار / إخفاء حقول التسجيل' : 'Show / hide registration fields'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isRTL
            ? 'الحقول المطلوبة تبقى ظاهرة دائماً. لا يمكن إضافة حقول مخصصة.'
            : 'Required fields stay visible. Custom fields are not supported.'}
        </p>
        <div className="space-y-2 mt-3">
          {INTAKE_FORM_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between gap-3 border border-border rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium text-ink">{isRTL ? f.label_ar : f.label_en}</p>
                {f.required && (
                  <p className="text-xs text-muted-foreground">{isRTL ? 'مطلوب' : 'Required'}</p>
                )}
              </div>
              <Switch
                checked={visible[f.key] !== false}
                disabled={!!f.required}
                onCheckedChange={(v) => toggle(f.key, v)}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ' : 'Save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
