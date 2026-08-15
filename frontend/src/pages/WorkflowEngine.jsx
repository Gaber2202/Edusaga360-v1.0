import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import { Plus, GitBranch, Clock, Settings, Trash2, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const MODULE_LABELS = {
  hr: { ar: 'الموارد البشرية', en: 'HR' },
  finance: { ar: 'المالية', en: 'Finance' },
  admissions: { ar: 'القبول', en: 'Admissions' },
  assets: { ar: 'الأصول', en: 'Assets' },
  procurement: { ar: 'المشتريات', en: 'Procurement' },
  general: { ar: 'عام', en: 'General' },
};

const ROLES_LIST = [
  { value: 'admin', ar: 'مدير النظام', en: 'Admin' },
  { value: 'hr_admin', ar: 'مدير الموارد البشرية', en: 'HR Admin' },
  { value: 'hr_officer', ar: 'موظف الموارد البشرية', en: 'HR Officer' },
  { value: 'finance', ar: 'المالية', en: 'Finance' },
  { value: 'branch_manager', ar: 'مدير الفرع', en: 'Branch Manager' },
  { value: 'cfo', ar: 'المدير المالي', en: 'CFO' },
  { value: 'ceo', ar: 'الرئيس التنفيذي', en: 'CEO' },
  { value: 'procurement', ar: 'المشتريات', en: 'Procurement' },
];

export default function WorkflowEngine() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  const [activeTab, setActiveTab] = useState('templates');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [saving, setSaving] = useState(false);

  const emptyTemplate = () => ({
    template_code: '',
    name_ar: '',
    name_en: '',
    module: 'hr',
    entity_type: '',
    is_active: true,
    stages: [
      { stage_order: 1, stage_name_ar: 'مقدم', stage_name_en: 'Submitted', approver_role: 'hr_admin', sla_hours: 24, escalate_to_role: 'admin' }
    ],
    notes: ''
  });

  const [form, setForm] = useState(emptyTemplate());

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({ enabled: false /* workflow_templates table not built */, queryKey: ['workflowTemplates', tenantId], queryFn: () => fetchData(tenantQuery('workflow_templates').select('*').match(tenantFilter()).order('created_at', { ascending: false })), initialData: [] });

  const { data: instances = [], isLoading: loadingInstances } = useQuery({ enabled: false /* workflow_instances table not built */, queryKey: ['workflowInstances', tenantId], queryFn: () => fetchData(tenantQuery('workflow_instances').select('*').match(tenantFilter()).order('created_at', { ascending: false }).limit()), initialData: [] });

  const addStage = () => {
    setForm(prev => ({
      ...prev,
      stages: [...prev.stages, {
        stage_order: prev.stages.length + 1,
        stage_name_ar: '', stage_name_en: '',
        approver_role: 'hr_admin', sla_hours: 24, escalate_to_role: 'admin'
      }]
    }));
  };

  const removeStage = (idx) => {
    setForm(prev => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stage_order: i + 1 }))
    }));
  };

  const updateStage = (idx, field, value) => {
    setForm(prev => {
      const stages = [...prev.stages];
      stages[idx] = { ...stages[idx], [field]: value };
      return { ...prev, stages };
    });
  };

  const handleSave = async () => {
    if (!form.name_ar || !form.module) { toast.error(isRTL ? 'يرجى تعبئة الحقول المطلوبة' : 'Fill required fields'); return; }
    setSaving(true);
    try {
      const data = { ...form, template_code: form.template_code || `WF-${Date.now().toString(36).toUpperCase()}` };
      if (editingTemplate) {
        await tenantQuery('workflow_templates').update(data);
        await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'WorkflowTemplate', entityId: editingTemplate.id, newValues: data });
      } else {
        const created = await tenantQuery('workflow_templates').insert(data);
        await logAuditEvent({ action: AuditActions.CREATE, entityType: 'WorkflowTemplate', entityId: created.id, newValues: data });
      }
      queryClient.invalidateQueries({ queryKey: ['workflowTemplates'] });
      setShowTemplateDialog(false);
      setForm(emptyTemplate());
      setEditingTemplate(null);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleToggle = async (tmpl) => {
    await tenantQuery('workflow_templates').update({ is_active: !tmpl.is_active });
    queryClient.invalidateQueries({ queryKey: ['workflowTemplates'] });
    toast.success(isRTL ? 'تم التحديث' : 'Updated');
  };

  const STATUS_COLORS = {
    in_progress: 'bg-najdi-50 text-najdi-900',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-sand-alt text-ink',
    escalated: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'محرك سير العمل' : 'Workflow Engine'}
        subtitle={isRTL ? 'إعداد وإدارة مسارات الاعتماد والموافقات' : 'Configure and manage approval workflows'}
        action actionLabel={isRTL ? 'قالب جديد' : 'New Template'} actionIcon={Plus}
        onAction={() => { setForm(emptyTemplate()); setEditingTemplate(null); setShowTemplateDialog(true); }}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates"><GitBranch className="w-4 h-4 me-2 inline" />{isRTL ? 'القوالب' : 'Templates'}</TabsTrigger>
          <TabsTrigger value="instances"><Clock className="w-4 h-4 me-2 inline" />{isRTL ? 'المسارات الجارية' : 'Active Flows'}</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingTemplates ? (
              <div className="col-span-3 text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" /></div>
            ) : templates.length === 0 ? (
              <div className="col-span-3 text-center py-12 text-muted-foreground">
                <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>{isRTL ? 'لا توجد قوالب بعد' : 'No workflow templates yet'}</p>
              </div>
            ) : templates.map(tmpl => (
              <Card key={tmpl.id} className={`border-2 ${tmpl.is_active ? 'border-najdi-100' : 'border-border opacity-60'}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{isRTL ? tmpl.name_ar : tmpl.name_en}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">{tmpl.template_code} • {isRTL ? MODULE_LABELS[tmpl.module]?.ar : MODULE_LABELS[tmpl.module]?.en}</p>
                    </div>
                    <Badge className={tmpl.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-sand-alt text-muted-foreground'}>
                      {tmpl.is_active ? (isRTL ? 'مفعل' : 'Active') : (isRTL ? 'معطل' : 'Inactive')}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {(tmpl.stages || []).map((s, i) => (
                      <React.Fragment key={i}>
                        <span className="text-xs bg-sand-alt rounded px-2 py-1 whitespace-nowrap">
                          {isRTL ? s.stage_name_ar : s.stage_name_en}
                        </span>
                        {i < tmpl.stages.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                      setEditingTemplate(tmpl);
                      setForm({ ...tmpl });
                      setShowTemplateDialog(true);
                    }}>
                      <Settings className="w-3 h-3 me-1" />{isRTL ? 'تعديل' : 'Edit'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleToggle(tmpl)}>
                      {tmpl.is_active ? (isRTL ? 'تعطيل' : 'Disable') : (isRTL ? 'تفعيل' : 'Enable')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="instances" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الوحدة' : 'Entity'}</TableHead>
                  <TableHead>{isRTL ? 'الموديول' : 'Module'}</TableHead>
                  <TableHead>{isRTL ? 'المرحلة الحالية' : 'Current Stage'}</TableHead>
                  <TableHead>{isRTL ? 'المعتمد المطلوب' : 'Pending Approver'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isRTL ? 'التاريخ' : 'Date'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInstances ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : instances.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{isRTL ? 'لا توجد مسارات جارية' : 'No active workflow instances'}</TableCell></TableRow>
                ) : instances.map(inst => (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium">{inst.entity_label || inst.entity_id}</TableCell>
                    <TableCell>{isRTL ? MODULE_LABELS[inst.module]?.ar : MODULE_LABELS[inst.module]?.en}</TableCell>
                    <TableCell>{isRTL ? inst.current_stage_name_ar : inst.current_stage_name_en}</TableCell>
                    <TableCell>{inst.current_approver_role || inst.current_approver_email || '—'}</TableCell>
                    <TableCell><Badge className={STATUS_COLORS[inst.status] || 'bg-sand-alt text-ink'}>{inst.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inst.created_at ? format(new Date(inst.created_at), 'dd/MM/yyyy') : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? (isRTL ? 'تعديل القالب' : 'Edit Template') : (isRTL ? 'قالب سير عمل جديد' : 'New Workflow Template')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={form.name_ar} onChange={(e) => setForm(p => ({ ...p, name_ar: e.target.value }))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={form.name_en} onChange={(e) => setForm(p => ({ ...p, name_en: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الموديول' : 'Module'} *</Label>
                <Select value={form.module} onValueChange={(v) => setForm(p => ({ ...p, module: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODULE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{isRTL ? v.ar : v.en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الكيان' : 'Entity Type'}</Label>
                <Input placeholder="e.g. LeaveRequest, Invoice" value={form.entity_type} onChange={(e) => setForm(p => ({ ...p, entity_type: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{isRTL ? 'مراحل سير العمل' : 'Workflow Stages'}</Label>
                <Button size="sm" variant="outline" onClick={addStage}>
                  <Plus className="w-3 h-3 me-1" />{isRTL ? 'إضافة مرحلة' : 'Add Stage'}
                </Button>
              </div>
              {form.stages.map((stage, idx) => (
                <Card key={idx} className="border-l-4 border-l-blue-400">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-najdi-900">{isRTL ? `المرحلة ${stage.stage_order}` : `Stage ${stage.stage_order}`}</span>
                      {form.stages.length > 1 && (
                        <Button size="sm" variant="ghost" onClick={() => removeStage(idx)} className="text-red-500 hover:text-red-700 h-6 w-6 p-0">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{isRTL ? 'الاسم (عربي)' : 'Name (AR)'}</Label>
                        <Input className="h-8 text-sm" value={stage.stage_name_ar} onChange={(e) => updateStage(idx, 'stage_name_ar', e.target.value)} dir="rtl" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{isRTL ? 'الاسم (إنجليزي)' : 'Name (EN)'}</Label>
                        <Input className="h-8 text-sm" value={stage.stage_name_en} onChange={(e) => updateStage(idx, 'stage_name_en', e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{isRTL ? 'دور المعتمد' : 'Approver Role'}</Label>
                        <Select value={stage.approver_role} onValueChange={(v) => updateStage(idx, 'approver_role', v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES_LIST.map(r => <SelectItem key={r.value} value={r.value}>{isRTL ? r.ar : r.en}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{isRTL ? 'SLA (ساعة)' : 'SLA (hours)'}</Label>
                        <Input className="h-8 text-sm" type="number" value={stage.sla_hours} onChange={(e) => updateStage(idx, 'sla_hours', parseInt(e.target.value) || 24)} />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label className="text-xs">{isRTL ? 'تصعيد إلى (عند التأخر)' : 'Escalate to (if overdue)'}</Label>
                        <Select value={stage.escalate_to_role || 'admin'} onValueChange={(v) => updateStage(idx, 'escalate_to_role', v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES_LIST.map(r => <SelectItem key={r.value} value={r.value}>{isRTL ? r.ar : r.en}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-najdi-700 hover:bg-najdi-900">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}