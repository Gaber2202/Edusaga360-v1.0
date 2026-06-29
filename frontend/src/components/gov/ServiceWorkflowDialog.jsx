import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Upload, CheckCircle, Clock, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { supabase, tenantQuery, fetchData } from '../../api/supabaseClient';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

const WORKFLOW_STEPS = ['draft', 'submitted', 'in_progress', 'completed'];
const STEP_ICONS = {
  draft: Clock,
  submitted: FileText,
  in_progress: AlertTriangle,
  completed: CheckCircle,
  rejected: XCircle,
};
const STEP_COLORS = {
  draft: 'text-muted-foreground',
  submitted: 'text-najdi-500',
  in_progress: 'text-amber-400',
  completed: 'text-emerald-400',
  rejected: 'text-red-400',
};

export default function ServiceWorkflowDialog({ open, onClose, service, isRTL }) {
  const [step, setStep] = useState(0); // 0=form, 1=confirm, 2=done
  const [form, setForm] = useState({ employee_id: '', notes: '', document_url: '' });
  const [workflowStatus, setWorkflowStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [refNumber, setRefNumber] = useState('');

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order()),
    enabled: open,
  });

  if (!service) return null;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const ref = `${service.code}-${Date.now().toString(36).toUpperCase()}`;
      const emp = employees.find(e => e.id === form.employee_id);

      // Log the action to AuditLog
      await tenantQuery('audit_logs').insert({
        action: 'generate',
        entity_type: 'GovernmentService',
        entity_id: ref,
        user_email: (await supabase.auth.getUser().then(r => r.data?.user))?.email || 'system',
        user_name: (await supabase.auth.getUser().then(r => r.data?.user))?.full_name || '',
        user_role: 'hr_admin',
        new_values: {
          service: service.code,
          service_name_ar: service.nameAr,
          service_name_en: service.nameEn,
          employee_id: form.employee_id,
          employee_name: emp?.name_ar || emp?.name_en || 'N/A',
          notes: form.notes,
          status: 'submitted',
        },
        notes: `Gov service request: ${service.nameEn}`,
        timestamp: new Date().toISOString(),
      });

      setRefNumber(ref);
      setWorkflowStatus('submitted');
      setStep(2);
      toast.success(isRTL ? 'تم رفع الطلب بنجاح' : 'Request submitted successfully');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setForm({ employee_id: '', notes: '', document_url: '' });
    setWorkflowStatus('draft');
    setRefNumber('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-najdi-900 border border-najdi-900 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <span className="text-emerald-400">{isRTL ? service.nameAr : service.nameEn}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Workflow stepper */}
        <div className="flex items-center gap-1 mb-4">
          {WORKFLOW_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[s];
            const active = workflowStatus === s;
            const past = WORKFLOW_STEPS.indexOf(workflowStatus) > i;
            return (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1 text-xs ${past || active ? STEP_COLORS[s] : 'text-muted-foreground'}`}>
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:block">{isRTL
                    ? { draft: 'مسودة', submitted: 'مرسل', in_progress: 'قيد التنفيذ', completed: 'مكتمل' }[s]
                    : { draft: 'Draft', submitted: 'Submitted', in_progress: 'In Progress', completed: 'Done' }[s]
                  }</span>
                </div>
                {i < WORKFLOW_STEPS.length - 1 && <div className={`flex-1 h-px ${past ? 'bg-emerald-600' : 'bg-ink'}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-najdi-900 border border-najdi-900 text-sm text-muted-foreground">
              {isRTL ? service.descAr : service.descEn}
            </div>

            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'اختر الموظف' : 'Select Employee'} *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger className="bg-najdi-900 border-najdi-900 text-white">
                  <SelectValue placeholder={isRTL ? 'اختر موظفاً...' : 'Choose employee...'} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {isRTL ? (e.name_ar || e.name_en) : (e.name_en || e.name_ar)} — {e.employee_id || e.id.slice(0, 6)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder={isRTL ? 'أضف ملاحظاتك...' : 'Add notes...'}
                className="bg-najdi-900 border-najdi-900 text-white placeholder:text-muted-foreground"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-muted-foreground">{isRTL ? 'رابط المستند (اختياري)' : 'Document URL (optional)'}</Label>
              <div className="flex gap-2">
                <Input
                  value={form.document_url}
                  onChange={e => setForm(p => ({ ...p, document_url: e.target.value }))}
                  placeholder={isRTL ? 'رابط الملف...' : 'File URL...'}
                  className="bg-najdi-900 border-najdi-900 text-white placeholder:text-muted-foreground"
                />
                <Button variant="outline" size="icon" className="border-najdi-900 text-muted-foreground">
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-center py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-900/40 border border-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{isRTL ? 'تم إرسال الطلب بنجاح' : 'Request Submitted Successfully'}</p>
              <p className="text-muted-foreground text-sm mt-1">{isRTL ? 'رقم المرجع:' : 'Reference:'} <span className="text-emerald-400 font-mono font-bold">{refNumber}</span></p>
              <p className="text-muted-foreground text-xs mt-2">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            <div className="bg-najdi-900 border border-najdi-900 rounded-lg p-3 text-sm text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isRTL ? 'الخدمة' : 'Service'}:</span>
                <span className="text-white">{isRTL ? service.nameAr : service.nameEn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isRTL ? 'الموظف' : 'Employee'}:</span>
                <span className="text-white">{employees.find(e => e.id === form.employee_id)?.name_ar || employees.find(e => e.id === form.employee_id)?.name_en || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{isRTL ? 'الحالة' : 'Status'}:</span>
                <Badge className="bg-najdi-900/60 text-najdi-500 border border-najdi-700 text-xs">{isRTL ? 'مرسل' : 'Submitted'}</Badge>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="border-najdi-900 text-muted-foreground hover:bg-najdi-900">
            {step === 2 ? (isRTL ? 'إغلاق' : 'Close') : (isRTL ? 'إلغاء' : 'Cancel')}
          </Button>
          {step === 0 && (
            <Button
              onClick={handleSubmit}
              disabled={saving || !form.employee_id}
              className="bg-emerald-700 hover:bg-emerald-600 text-white"
            >
              {saving ? (isRTL ? 'جاري الإرسال...' : 'Submitting...') : (isRTL ? 'إرسال الطلب' : 'Submit Request')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}