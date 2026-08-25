import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { tenantQuery } from '../../api/supabaseClient';
import { Settings2 } from 'lucide-react';
import { DEFAULT_ADMISSION_STAGES } from '../../lib/admissionsPipeline';

/**
 * School-configurable admissions stages (SCRUM-112).
 * Edits labels, SLA days, and active flag on `admission_pipeline_stages`.
 */
export default function AdmissionsStagesConfig({ open, onClose, stageRows = [], onSaved }) {
  const { isRTL } = useLanguage();
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => {
    if (stageRows.length) {
      return stageRows.map((r) => ({
        id: r.id,
        stage_key: r.stage_key,
        label_en: r.label_en,
        label_ar: r.label_ar,
        sla_days: r.sla_days ?? 3,
        is_active: r.is_active !== false,
        sort_order: r.sort_order ?? 0,
        is_terminal: !!r.is_terminal,
        color_token: r.color_token || null,
      }));
    }
    return DEFAULT_ADMISSION_STAGES.map((s, i) => ({
      id: null,
      stage_key: s.key,
      label_en: s.label_en,
      label_ar: s.label_ar,
      sla_days: s.sla,
      is_active: true,
      sort_order: (i + 1) * 10,
      is_terminal: !!s.is_terminal,
      color_token: null,
    }));
  }, [stageRows]);

  const [rows, setRows] = useState(initial);

  useEffect(() => {
    if (open) setRows(initial);
  }, [open, initial]);

  const updateRow = (key, patch) => {
    setRows((prev) => prev.map((r) => (r.stage_key === key ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const row of rows) {
        const payload = {
          label_en: row.label_en.trim(),
          label_ar: row.label_ar.trim(),
          sla_days: Number(row.sla_days) || 3,
          is_active: !!row.is_active,
          sort_order: row.sort_order,
        };
        if (row.id) {
          const { error } = await tenantQuery('admission_pipeline_stages').update(payload).eq('id', row.id);
          if (error) throw error;
        } else {
          const { error } = await tenantQuery('admission_pipeline_stages').insert({
            stage_key: row.stage_key,
            ...payload,
            is_terminal: row.is_terminal,
            color_token: row.color_token,
          });
          if (error) throw error;
        }
      }
      toast.success(isRTL ? 'تم حفظ مراحل القبول' : 'Pipeline stages saved');
      onSaved?.();
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            {isRTL ? 'إعداد مراحل القبول' : 'Configure admission stages'}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isRTL
            ? 'عدّل التسميات ومدة SLA وتفعيل/إيقاف المراحل لهذه المدرسة.'
            : 'Edit labels, SLA days, and active flags for this school.'}
        </p>
        <div className="space-y-3 mt-2">
          {rows.map((row) => (
            <div key={row.stage_key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center border border-border rounded-lg p-3">
              <div className="sm:col-span-2 text-xs font-mono text-muted-foreground">{row.stage_key}</div>
              <Input
                className="sm:col-span-3"
                value={row.label_en}
                onChange={(e) => updateRow(row.stage_key, { label_en: e.target.value })}
                placeholder="Label EN"
                dir="ltr"
              />
              <Input
                className="sm:col-span-3"
                value={row.label_ar}
                onChange={(e) => updateRow(row.stage_key, { label_ar: e.target.value })}
                placeholder="التسمية"
              />
              <Input
                className="sm:col-span-2"
                type="number"
                min={1}
                value={row.sla_days}
                onChange={(e) => updateRow(row.stage_key, { sla_days: e.target.value })}
                title="SLA days"
              />
              <div className="sm:col-span-2 flex items-center gap-2 justify-end">
                <span className="text-xs text-muted-foreground">{isRTL ? 'نشط' : 'Active'}</span>
                <Switch
                  checked={row.is_active}
                  onCheckedChange={(v) => updateRow(row.stage_key, { is_active: v })}
                />
              </div>
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
