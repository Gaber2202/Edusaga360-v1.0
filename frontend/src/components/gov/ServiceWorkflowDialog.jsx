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
  draft: 'text-slate-400',
  submitted: 'text-blue-400',
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
    queryFn: () => fetchData(tenantQuery('employees').select('*').order()),
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
      <DialogContent className="max-w-lg bg-slate-900 border border-slate-700 text-white">
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
                <div className={`flex items-center gap-1 text-xs ${past || active ? STEP_COLORS[s] : 'text-slate-600'}`}>
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:block">{isRTL
                    ? { draft: 'مسودة', submitted: 'مرسل', in_progress: 'قيد التنفيذ', completed: 'مكتمل' }[s]
                    : { draft: 'Draft', submitted: 'Submitted', in_progress: 'In Progress', completed: 'Done' }[s]
                  }</span>
                </div>
                {i < WORKFLOW_STEPS.length - 1 && <div className={`flex-1 h-px ${past ? 'bg-emerald-600' : 'bg-slate-700'}`} />}
              </React.Fragment>
            );
          })}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-400">
              {isRTL ? service.descAr : service.descEn}
            </div>

            <div className="space-y-1">
              <Label className="text-slate-300">{isRTL ? 'اختر الموظف' : 'Select Employee'} *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
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
              <Label className="text-slate-300">{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Input
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder={isRTL ? 'أضف ملاحظاتك...' : 'Add notes...'}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-slate-300">{isRTL ? 'رابط المستند (اختياري)' : 'Document URL (optional)'}</Label>
              <div className="flex gap-2">
                <Input
                  value={form.document_url}
                  onChange={e => setForm(p => ({ ...p, document_url: e.target.value }))}
                  placeholder={isRTL ? 'رابط الملف...' : 'File URL...'}
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                />
                <Button variant="outline" size="icon" className="border-slate-700 text-slate-400">
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
              <p className="text-slate-400 text-sm mt-1">{isRTL ? 'رقم المرجع:' : 'Reference:'} <span className="text-emerald-400 font-mono font-bold">{refNumber}</span></p>
              <p className="text-slate-500 text-xs mt-2">{format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-left space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">{isRTL ? 'الخدمة' : 'Service'}:</span>
                <span className="text-white">{isRTL ? service.nameAr : service.nameEn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isRTL ? 'الموظف' : 'Employee'}:</span>
                <span className="text-white">{employees.find(e => e.id === form.employee_id)?.name_ar || employees.find(e => e.id === form.employee_id)?.name_en || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isRTL ? 'الحالة' : 'Status'}:</span>
                <Badge className="bg-blue-900/60 text-blue-300 border border-blue-700 text-xs">{isRTL ? 'مرسل' : 'Submitted'}</Badge>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="border-slate-700 text-slate-300 hover:bg-slate-800">
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