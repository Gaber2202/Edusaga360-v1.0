import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent } from '../components/ui/card';
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
import { Plus, AlertTriangle, CheckCircle2, Clock, Loader2, ArrowLeft, XCircle, Copy, MoveUp, MoveDown, BarChart3, Users } from 'lucide-react';
import MonthPicker from '../components/ui/MonthPicker';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { useTenantFilter } from '../hooks/useTenantFilter';

const BUILTIN_TEMPLATES = {
  teacher: [
    { kpi_name_ar: 'جودة التدريس', kpi_name_en: 'Teaching Quality', weight: 30 },
    { kpi_name_ar: 'الالتزام بالحضور', kpi_name_en: 'Attendance', weight: 25 },
    { kpi_name_ar: 'التواصل مع أولياء الأمور', kpi_name_en: 'Parent Communication', weight: 20 },
    { kpi_name_ar: 'التطوير المهني', kpi_name_en: 'Professional Development', weight: 15 },
    { kpi_name_ar: 'الالتزام بالسياسات', kpi_name_en: 'Policy Compliance', weight: 10 },
  ],
  driver: [
    { kpi_name_ar: 'الالتزام بالمواعيد', kpi_name_en: 'Punctuality', weight: 35 },
    { kpi_name_ar: 'سلامة القيادة', kpi_name_en: 'Driving Safety', weight: 40 },
    { kpi_name_ar: 'نظافة المركبة', kpi_name_en: 'Vehicle Cleanliness', weight: 15 },
    { kpi_name_ar: 'الالتزام بالسياسات', kpi_name_en: 'Policy Compliance', weight: 10 },
  ],
  admin: [
    { kpi_name_ar: 'جودة العمل', kpi_name_en: 'Work Quality', weight: 30 },
    { kpi_name_ar: 'الالتزام بالحضور', kpi_name_en: 'Attendance', weight: 20 },
    { kpi_name_ar: 'التعاون مع الفريق', kpi_name_en: 'Team Collaboration', weight: 20 },
    { kpi_name_ar: 'المبادرة والإبداع', kpi_name_en: 'Initiative', weight: 15 },
    { kpi_name_ar: 'خدمة العملاء الداخليين', kpi_name_en: 'Internal Customer Service', weight: 15 },
  ]
};

const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-700',
  submitted: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-amber-100 text-amber-700',
  approved: 'bg-purple-100 text-purple-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS = {
  draft: { ar: 'مسودة', en: 'Draft' },
  submitted: { ar: 'مقدم', en: 'Submitted' },
  reviewed: { ar: 'قيد المراجعة', en: 'Reviewed' },
  approved: { ar: 'معتمد', en: 'Approved' },
  completed: { ar: 'مكتمل', en: 'Completed' },
};

export default function PerformanceEvaluation() {
  const { isRTL } = useLanguage();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('evaluations');
  const [showDialog, setShowDialog] = useState(false);
  const [viewEval, setViewEval] = useState(null);
  const [saving, setSaving] = useState(false);
  const [roleTemplate, setRoleTemplate] = useState('teacher');

  const emptyForm = () => ({
    employee_id: '',
    employee_name: '',
    branch_id: selectedBranchId || '',
    evaluation_period: format(new Date(), 'yyyy-MM'),
    cycle_type: 'monthly',
    evaluation_date: format(new Date(), 'yyyy-MM-dd'),
    evaluator_id: '',
    evaluator_name: '',
    kpi_scores: BUILTIN_TEMPLATES.teacher.map(k => ({ ...k, score: 3, weighted_score: (k.weight * 3 / 5) })),
    total_score: 0,
    rating: 'meets_expectations',
    strengths: '',
    areas_for_improvement: '',
    development_plan: '',
    recommended_bonus: 0,
    status: 'draft',
    notes: ''
  });

  const [form, setForm] = useState(emptyForm());

  const { data: evaluations = [], isLoading } = useQuery({
    queryKey: ['performanceEvals', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('performance_evaluations').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: customTemplates = [] } = useQuery({
    queryKey: ['evalTemplates', tenantId],
    queryFn: () => fetchData(tenantQuery('eval_criteria_templates').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  const filtered = filterByBranch(evaluations);

  const applyTemplate = (role) => {
    setRoleTemplate(role);
    // Check custom templates first
    const custom = customTemplates.find(t => t.id === role);
    const criteria = custom ? custom.criteria : BUILTIN_TEMPLATES[role] || BUILTIN_TEMPLATES.admin;
    setForm(prev => ({
      ...prev,
      kpi_scores: criteria.map(k => ({ ...k, score: 3, weighted_score: (k.weight * 3 / 5) }))
    }));
  };

  const updateScore = (idx, score) => {
    const scores = [...form.kpi_scores];
    scores[idx] = { ...scores[idx], score, weighted_score: (scores[idx].weight * score / 5) };
    const total = scores.reduce((s, k) => s + k.weighted_score, 0);
    let rating = 'meets_expectations';
    if (total >= 90) rating = 'outstanding';
    else if (total >= 75) rating = 'exceeds_expectations';
    else if (total >= 60) rating = 'meets_expectations';
    else if (total >= 40) rating = 'needs_improvement';
    else rating = 'unsatisfactory';
    setForm(prev => ({ ...prev, kpi_scores: scores, total_score: Math.round(total), rating }));
  };

  const handleSave = async (advanceStatus) => {
    if (!form.employee_id) { toast.error(isRTL ? 'يرجى اختيار الموظف' : 'Select an employee'); return; }
    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...form,
        evaluator_name: user.full_name,
        evaluator_id: user.email,
        status: advanceStatus || form.status,
        evaluation_number: `EVL-${Date.now().toString(36).toUpperCase()}`
      };
      const created = await tenantQuery('performance_evaluations').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'PerformanceEvaluation', entityId: created.id, newValues: data });
      queryClient.invalidateQueries({ queryKey: ['performanceEvals'] });
      setShowDialog(false);
      setForm(emptyForm());
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAdvance = async (evalItem) => {
    const flow = ['draft', 'submitted', 'reviewed', 'approved', 'completed'];
    const next = flow[flow.indexOf(evalItem.status) + 1];
    if (!next) return;
    await tenantQuery('performance_evaluations').update({ status: next });
    await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'PerformanceEvaluation', entityId: evalItem.id, newValues: { status: next } });
    queryClient.invalidateQueries({ queryKey: ['performanceEvals'] });
    toast.success(isRTL ? 'تم تحديث الحالة' : 'Status updated');
    if (viewEval?.id === evalItem.id) setViewEval({ ...evalItem, status: next });
  };

  const handleGoBack = async (evalItem) => {
    const flow = ['draft', 'submitted', 'reviewed', 'approved', 'completed'];
    const idx = flow.indexOf(evalItem.status);
    if (idx <= 0) return;
    const prev = flow[idx - 1];
    await tenantQuery('performance_evaluations').update({ status: prev });
    await logAuditEvent({ action: AuditActions.UPDATE, entityType: 'PerformanceEvaluation', entityId: evalItem.id, newValues: { status: prev }, notes: 'Rolled back to previous stage' });
    queryClient.invalidateQueries({ queryKey: ['performanceEvals'] });
    toast.success(isRTL ? 'تم الرجوع للمرحلة السابقة' : 'Rolled back to previous stage');
    if (viewEval?.id === evalItem.id) setViewEval({ ...evalItem, status: prev });
  };

  const handleAbort = async (evalItem) => {
    if (!window.confirm(isRTL ? 'هل تريد إلغاء هذا التقييم؟ سيتم حذفه نهائياً.' : 'Abort this evaluation? It will be permanently deleted.')) return;
    await tenantQuery('performance_evaluations').delete().eq('id', evalItem.id);
    await logAuditEvent({ action: AuditActions.DELETE, entityType: 'PerformanceEvaluation', entityId: evalItem.id, notes: 'Aborted by user' });
    queryClient.invalidateQueries({ queryKey: ['performanceEvals'] });
    setViewEval(null);
    toast.success(isRTL ? 'تم إلغاء التقييم' : 'Evaluation aborted');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'تقييم الأداء' : 'Performance Evaluation'}
        subtitle={isRTL ? 'دورات التقييم وتتبع أداء الموظفين' : 'Evaluation cycles and employee performance tracking'}
        action actionLabel={isRTL ? 'تقييم جديد' : 'New Evaluation'} actionIcon={Plus}
        onAction={() => { setForm(emptyForm()); setShowDialog(true); }}
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'إجمالي التقييمات' : 'Total Evals'}</p><p className="text-2xl font-bold">{evaluations.length}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'مكتملة' : 'Completed'}</p><p className="text-2xl font-bold text-emerald-600">{evaluations.filter(e => e.status === 'completed').length}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'قيد المراجعة' : 'In Review'}</p><p className="text-2xl font-bold text-amber-600">{evaluations.filter(e => ['submitted','reviewed'].includes(e.status)).length}</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'متوسط الدرجات' : 'Avg Score'}</p><p className="text-2xl font-bold text-blue-600">{evaluations.length > 0 ? Math.round(evaluations.reduce((s, e) => s + (e.total_score || 0), 0) / evaluations.length) : 0}%</p></Card>
        <Card className="p-4"><p className="text-sm text-slate-500">{isRTL ? 'أداء ممتاز' : 'Outstanding'}</p><p className="text-2xl font-bold text-purple-600">{evaluations.filter(e => e.rating === 'outstanding' || e.rating === 'exceeds_expectations').length}</p></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="evaluations">{isRTL ? 'التقييمات' : 'Evaluations'}</TabsTrigger>
          <TabsTrigger value="360feedback" className="gap-1"><Users className="w-4 h-4" />{isRTL ? 'تقييم 360°' : '360° Feedback'}</TabsTrigger>
          <TabsTrigger value="templates">{isRTL ? 'قوالب المعايير' : 'Criteria Templates'}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1"><BarChart3 className="w-4 h-4" />{isRTL ? 'تحليلات الأداء' : 'Analytics'}</TabsTrigger>
          <TabsTrigger value="warnings">{isRTL ? 'الإنذارات' : 'Warnings'}</TabsTrigger>
        </TabsList>

        <TabsContent value="evaluations" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead>{isRTL ? 'الفترة' : 'Period'}</TableHead>
                  <TableHead>{isRTL ? 'الدرجة' : 'Score'}</TableHead>
                  <TableHead>{isRTL ? 'التقييم' : 'Rating'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{isRTL ? 'لا توجد تقييمات' : 'No evaluations'}</TableCell></TableRow>
                ) : filtered.map(ev => (
                  <TableRow key={ev.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setViewEval(ev)}>
                    <TableCell className="font-medium">{ev.employee_name}</TableCell>
                    <TableCell>{ev.evaluation_period}</TableCell>
                    <TableCell>
                      <span className="font-bold text-blue-700">{ev.total_score || 0}%</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">{ev.rating?.replace(/_/g, ' ')}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[ev.status]}>
                        {isRTL ? STATUS_LABELS[ev.status]?.ar : STATUS_LABELS[ev.status]?.en}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {ev.status !== 'completed' && (
                          <Button size="sm" variant="ghost" title={isRTL ? 'تقدم' : 'Advance'} onClick={(e) => { e.stopPropagation(); handleAdvance(ev); }}>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          </Button>
                        )}
                        {['submitted','reviewed','approved'].includes(ev.status) && (
                          <Button size="sm" variant="ghost" title={isRTL ? 'رجوع' : 'Go Back'} onClick={(e) => { e.stopPropagation(); handleGoBack(ev); }}>
                            <ArrowLeft className="w-4 h-4 text-amber-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* 360-Degree Feedback Tab */}
        <TabsContent value="360feedback" className="mt-4 space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
              <div>
                <h3 className="font-semibold">{isRTL ? 'تقييم 360 درجة' : '360-Degree Feedback'}</h3>
                <p className="text-sm text-slate-500">{isRTL ? 'تقييم ذاتي، من الأقران، المرؤوسين، والمدير' : 'Self, peer, upward, and manager evaluations'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="p-4 bg-blue-50 border-blue-200">
                <p className="text-sm text-blue-700 font-medium">{isRTL ? 'تقييم ذاتي' : 'Self Assessment'}</p>
                <p className="text-xs text-blue-500 mt-1">{isRTL ? 'الموظف يقيّم نفسه' : 'Employee evaluates themselves'}</p>
              </Card>
              <Card className="p-4 bg-emerald-50 border-emerald-200">
                <p className="text-sm text-emerald-700 font-medium">{isRTL ? 'تقييم الأقران' : 'Peer Review'}</p>
                <p className="text-xs text-emerald-500 mt-1">{isRTL ? 'زملاء العمل يقيّمون بعضهم' : 'Colleagues evaluate each other'}</p>
              </Card>
              <Card className="p-4 bg-purple-50 border-purple-200">
                <p className="text-sm text-purple-700 font-medium">{isRTL ? 'تقييم تصاعدي' : 'Upward Review'}</p>
                <p className="text-xs text-purple-500 mt-1">{isRTL ? 'تقييم المرؤوسين للمدير' : 'Subordinates evaluate manager'}</p>
              </Card>
              <Card className="p-4 bg-amber-50 border-amber-200">
                <p className="text-sm text-amber-700 font-medium">{isRTL ? 'تقييم المدير' : 'Manager Review'}</p>
                <p className="text-xs text-amber-500 mt-1">{isRTL ? 'المدير المباشر يقيّم الموظف' : 'Direct manager evaluates employee'}</p>
              </Card>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead>{isRTL ? 'ذاتي' : 'Self'}</TableHead>
                  <TableHead>{isRTL ? 'أقران' : 'Peers'}</TableHead>
                  <TableHead>{isRTL ? 'تصاعدي' : 'Upward'}</TableHead>
                  <TableHead>{isRTL ? 'مدير' : 'Manager'}</TableHead>
                  <TableHead>{isRTL ? 'المتوسط' : 'Average'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.slice(0, 10).map(emp => {
                  const empEvals = evaluations.filter(e => e.employee_id === emp.id && e.status === 'completed');
                  const avgScore = empEvals.length > 0 ? Math.round(empEvals.reduce((s, e) => s + (e.total_score || 0), 0) / empEvals.length) : null;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.name_ar || emp.name_en}</TableCell>
                      <TableCell><Badge variant="outline">{isRTL ? 'في الانتظار' : 'Pending'}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{isRTL ? 'في الانتظار' : 'Pending'}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{isRTL ? 'في الانتظار' : 'Pending'}</Badge></TableCell>
                      <TableCell>{avgScore !== null ? <span className="font-bold text-blue-600">{avgScore}%</span> : <Badge variant="outline">{isRTL ? 'في الانتظار' : 'Pending'}</Badge>}</TableCell>
                      <TableCell>{avgScore !== null ? <Badge className="bg-blue-100 text-blue-700">{avgScore}%</Badge> : '-'}</TableCell>
                    </TableRow>
                  );
                })}
                {employees.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{isRTL ? 'لا توجد بيانات' : 'No data'}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <CriteriaTemplatesTab isRTL={isRTL} />
        </TabsContent>

        {/* Performance Analytics Dashboard */}
        <TabsContent value="analytics" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'توزيع التقييمات' : 'Rating Distribution'}</h4>
              <div className="space-y-3">
                {['outstanding', 'exceeds_expectations', 'meets_expectations', 'needs_improvement', 'unsatisfactory'].map(rating => {
                  const count = evaluations.filter(e => e.rating === rating).length;
                  const pct = evaluations.length > 0 ? Math.round((count / evaluations.length) * 100) : 0;
                  const colors = { outstanding: 'bg-purple-500', exceeds_expectations: 'bg-blue-500', meets_expectations: 'bg-emerald-500', needs_improvement: 'bg-amber-500', unsatisfactory: 'bg-red-500' };
                  return (
                    <div key={rating} className="flex items-center gap-3">
                      <span className="text-sm w-40 truncate">{rating.replace(/_/g, ' ')}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-4">
                        <div className={`${colors[rating]} h-4 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-12 text-end">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'الموظفون الأعلى أداءً' : 'Top Performers'}</h4>
              <div className="space-y-2">
                {evaluations.filter(e => e.status === 'completed').sort((a, b) => (b.total_score || 0) - (a.total_score || 0)).slice(0, 8).map((ev, i) => (
                  <div key={ev.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i+1}</span>
                      <span className="text-sm font-medium">{ev.employee_name}</span>
                    </div>
                    <Badge className={ev.total_score >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}>{ev.total_score}%</Badge>
                  </div>
                ))}
                {evaluations.filter(e => e.status === 'completed').length === 0 && (
                  <p className="text-center text-slate-400 py-4">{isRTL ? 'لا توجد تقييمات مكتملة' : 'No completed evaluations'}</p>
                )}
              </div>
            </Card>
            <Card className="p-6 md:col-span-2">
              <h4 className="font-semibold mb-4">{isRTL ? 'حالة سير العمل التلقائي' : 'Automated Workflow Status'}</h4>
              <div className="grid grid-cols-5 gap-2">
                {['draft', 'submitted', 'reviewed', 'approved', 'completed'].map(status => {
                  const count = evaluations.filter(e => e.status === status).length;
                  return (
                    <div key={status} className="text-center p-3 rounded-lg bg-slate-50 border">
                      <Badge className={STATUS_COLORS[status]}>{isRTL ? STATUS_LABELS[status]?.ar : STATUS_LABELS[status]?.en}</Badge>
                      <p className="text-2xl font-bold mt-2">{count}</p>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="warnings" className="mt-4">
          <WarningsTab isRTL={isRTL} selectedBranchId={selectedBranchId} filterByBranch={filterByBranch} employees={employees} />
        </TabsContent>
      </Tabs>

      {/* New Evaluation Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تقييم أداء جديد' : 'New Performance Evaluation'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
                <Select value={form.employee_id} onValueChange={(v) => {
                  const emp = employees.find(e => e.id === v);
                  setForm(p => ({ ...p, employee_id: v, employee_name: emp?.name_ar || emp?.name_en || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الموظف' : 'Select employee'} /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name_ar || e.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الفترة' : 'Period'}</Label>
                <MonthPicker value={form.evaluation_period} onChange={(v) => setForm(p => ({ ...p, evaluation_period: v }))} isRTL={isRTL} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الدورة' : 'Cycle Type'}</Label>
                <Select value={form.cycle_type} onValueChange={(v) => setForm(p => ({ ...p, cycle_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{isRTL ? 'شهري' : 'Monthly'}</SelectItem>
                    <SelectItem value="quarterly">{isRTL ? 'ربع سنوي' : 'Quarterly'}</SelectItem>
                    <SelectItem value="annual">{isRTL ? 'سنوي' : 'Annual'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'قالب المعايير' : 'Criteria Template'}</Label>
                <Select value={roleTemplate} onValueChange={applyTemplate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teacher">{isRTL ? 'معلم (افتراضي)' : 'Teacher (Built-in)'}</SelectItem>
                    <SelectItem value="driver">{isRTL ? 'سائق (افتراضي)' : 'Driver (Built-in)'}</SelectItem>
                    <SelectItem value="admin">{isRTL ? 'إداري (افتراضي)' : 'Admin (Built-in)'}</SelectItem>
                    {customTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        ★ {isRTL ? t.template_name_ar : (t.template_name_en || t.template_name_ar)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* KPI Scoring */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">{isRTL ? 'معايير التقييم' : 'Evaluation Criteria'}</Label>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>{isRTL ? 'المعيار' : 'Criterion'}</TableHead>
                      <TableHead>{isRTL ? 'الوزن%' : 'Weight%'}</TableHead>
                      <TableHead>{isRTL ? 'الدرجة (1-5)' : 'Score (1-5)'}</TableHead>
                      <TableHead>{isRTL ? 'المرجح' : 'Weighted'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.kpi_scores.map((kpi, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{isRTL ? kpi.kpi_name_ar : kpi.kpi_name_en}</TableCell>
                        <TableCell>{kpi.weight}%</TableCell>
                        <TableCell>
                          <Select value={String(kpi.score)} onValueChange={(v) => updateScore(idx, parseInt(v))}>
                            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="font-medium">{kpi.weighted_score?.toFixed(1)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <span className="text-sm font-semibold text-blue-700">
                  {isRTL ? 'الإجمالي:' : 'Total:'} {form.total_score}% — {form.rating?.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'نقاط القوة' : 'Strengths'}</Label>
              <Textarea rows={2} value={form.strengths} onChange={(e) => setForm(p => ({ ...p, strengths: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'مجالات التحسين' : 'Areas for Improvement'}</Label>
              <Textarea rows={2} value={form.areas_for_improvement} onChange={(e) => setForm(p => ({ ...p, areas_for_improvement: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'خطة التطوير' : 'Development Plan'}</Label>
              <Textarea rows={2} value={form.development_plan} onChange={(e) => setForm(p => ({ ...p, development_plan: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="outline" onClick={() => handleSave('draft')} disabled={saving}>{isRTL ? 'حفظ مسودة' : 'Save Draft'}</Button>
            <Button onClick={() => handleSave('submitted')} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إرسال للمراجعة' : 'Submit for Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      {viewEval && (
        <Dialog open={!!viewEval} onOpenChange={() => setViewEval(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewEval.employee_name} — {viewEval.evaluation_period}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Badge className={STATUS_COLORS[viewEval.status]}>{isRTL ? STATUS_LABELS[viewEval.status]?.ar : STATUS_LABELS[viewEval.status]?.en}</Badge>
                <span className="text-2xl font-bold text-blue-700">{viewEval.total_score}%</span>
              </div>
              <div className="space-y-1">
                {(viewEval.kpi_scores || []).map((k, i) => (
                  <div key={i} className="flex justify-between text-sm py-1 border-b">
                    <span>{isRTL ? k.kpi_name_ar : k.kpi_name_en}</span>
                    <span className="font-medium">{k.score}/5 ({k.weighted_score?.toFixed(1)})</span>
                  </div>
                ))}
              </div>
              {viewEval.strengths && <div><Label>{isRTL ? 'نقاط القوة' : 'Strengths'}</Label><p className="text-sm mt-1">{viewEval.strengths}</p></div>}
              {viewEval.development_plan && <div><Label>{isRTL ? 'خطة التطوير' : 'Development Plan'}</Label><p className="text-sm mt-1">{viewEval.development_plan}</p></div>}
              <div className="flex flex-col gap-2 pt-2">
                {viewEval.status !== 'completed' && (
                  <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => handleAdvance(viewEval)}>
                    <CheckCircle2 className="w-4 h-4 me-2" />
                    {isRTL ? 'تقدم إلى المرحلة التالية' : 'Advance to Next Stage'}
                  </Button>
                )}
                {['submitted','reviewed','approved'].includes(viewEval.status) && (
                  <Button variant="outline" className="w-full" onClick={() => handleGoBack(viewEval)}>
                    <ArrowLeft className="w-4 h-4 me-2" />
                    {isRTL ? 'رجوع للمرحلة السابقة' : 'Go Back to Previous Stage'}
                  </Button>
                )}
                {['draft','submitted'].includes(viewEval.status) && (
                  <Button variant="outline" className="w-full text-red-600 hover:bg-red-50 border-red-200" onClick={() => handleAbort(viewEval)}>
                    <XCircle className="w-4 h-4 me-2" />
                    {isRTL ? 'إلغاء التقييم' : 'Abort Evaluation'}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

const EMPTY_TEMPLATE = { template_name_ar: '', template_name_en: '', role_type: '', criteria: [{ kpi_name_ar: '', kpi_name_en: '', weight: 0 }] };

function CriteriaTemplatesTab({ isRTL }) {
  const qc = useQueryClient();
  const { tenantId } = useTenantFilter();
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_TEMPLATE);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['evalTemplates', tenantId],
    queryFn: () => fetchData(tenantQuery('eval_criteria_templates').select('*').order('created_at', { ascending: false })),
  });

  const totalWeight = form.criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const weightOk = totalWeight === 100;
  const remaining = 100 - totalWeight;

  const openNew = () => { setForm(EMPTY_TEMPLATE); setShowDialog(true); };

  const duplicateTemplate = (t) => {
    setForm({
      template_name_ar: t.template_name_ar + ' (نسخة)',
      template_name_en: (t.template_name_en || '') + ' (copy)',
      role_type: t.role_type,
      criteria: (t.criteria || []).map(c => ({ ...c }))
    });
    setShowDialog(true);
  };

  const addCriterion = () => setForm(p => ({ ...p, criteria: [...p.criteria, { kpi_name_ar: '', kpi_name_en: '', weight: 0 }] }));
  const removeCriterion = (i) => setForm(p => ({ ...p, criteria: p.criteria.filter((_, idx) => idx !== i) }));
  const updateCriterion = (i, field, val) => setForm(p => {
    const c = [...p.criteria];
    c[i] = { ...c[i], [field]: val };
    return { ...p, criteria: c };
  });
  const moveCriterion = (i, dir) => setForm(p => {
    const c = [...p.criteria];
    const j = i + dir;
    if (j < 0 || j >= c.length) return p;
    [c[i], c[j]] = [c[j], c[i]];
    return { ...p, criteria: c };
  });

  const autoDistribute = () => {
    const n = form.criteria.length;
    if (!n) return;
    const base = Math.floor(100 / n);
    const rem = 100 - base * n;
    setForm(p => ({
      ...p,
      criteria: p.criteria.map((c, i) => ({ ...c, weight: base + (i === 0 ? rem : 0) }))
    }));
  };

  const handleSave = async () => {
    if (!form.template_name_ar || !form.role_type) { toast.error(isRTL ? 'يرجى تعبئة الحقول المطلوبة' : 'Fill required fields'); return; }
    if (!weightOk) { toast.error(isRTL ? 'مجموع الأوزان يجب أن يساوي 100%' : 'Weights must total 100%'); return; }
    const emptyCrit = form.criteria.some(c => !c.kpi_name_ar);
    if (emptyCrit) { toast.error(isRTL ? 'يرجى تعبئة جميع أسماء المعايير' : 'Fill all criterion names'); return; }
    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('eval_criteria_templates').insert({ ...form, total_weight: totalWeight, is_active: true, created_by: user.email });
      qc.invalidateQueries({ queryKey: ['evalTemplates'] });
      setShowDialog(false);
      setForm(EMPTY_TEMPLATE);
      toast.success(isRTL ? 'تم حفظ القالب' : 'Template saved');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(isRTL ? 'حذف هذا القالب؟' : 'Delete this template?')) return;
    await tenantQuery('eval_criteria_templates').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['evalTemplates'] });
    toast.success(isRTL ? 'تم الحذف' : 'Deleted');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 me-2" />{isRTL ? 'قالب جديد' : 'New Template'}
        </Button>
      </div>
      <div className="grid gap-4">
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
        : templates.length === 0 ? (
          <div className="text-center py-10 text-slate-400">{isRTL ? 'لا توجد قوالب مخصصة بعد' : 'No custom templates yet'}</div>
        ) : templates.map(t => (
          <Card key={t.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{isRTL ? t.template_name_ar : (t.template_name_en || t.template_name_ar)}</p>
                  <p className="text-sm text-slate-500">{t.role_type} • {t.criteria?.length || 0} {isRTL ? 'معيار' : 'criteria'}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" title={isRTL ? 'نسخ' : 'Duplicate'} onClick={() => duplicateTemplate(t)}>
                    <Copy className="w-4 h-4 text-slate-400" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDelete(t.id)}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {(t.criteria || []).map((c, i) => (
                  <div key={i} className="flex justify-between text-sm py-0.5">
                    <span>{isRTL ? c.kpi_name_ar : (c.kpi_name_en || c.kpi_name_ar)}</span>
                    <span className="font-medium text-emerald-500">{c.weight}%</span>
                  </div>
                ))}
                <div className={`flex justify-between text-sm font-bold pt-1 border-t ${t.total_weight === 100 ? 'text-emerald-500' : 'text-red-400'}`}>
                  <span>{isRTL ? 'المجموع' : 'Total'}</span>
                  <span>{t.total_weight || 0}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{isRTL ? 'قالب معايير جديد' : 'New Criteria Template'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 px-1 py-1">
            {/* Names + Role */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300">{isRTL ? 'اسم القالب (عربي)' : 'Template Name (AR)'} *</label>
                <Input value={form.template_name_ar} onChange={e => setForm(p => ({ ...p, template_name_ar: e.target.value }))} dir="rtl" placeholder="اسم القالب" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300">{isRTL ? 'اسم القالب (إنجليزي)' : 'Template Name (EN)'}</label>
                <Input value={form.template_name_en} onChange={e => setForm(p => ({ ...p, template_name_en: e.target.value }))} placeholder="Template name" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300">{isRTL ? 'نوع الوظيفة / الدور' : 'Role / Job Type'} *</label>
              <Input value={form.role_type} onChange={e => setForm(p => ({ ...p, role_type: e.target.value }))} placeholder={isRTL ? 'مثال: معلم، سائق، إداري' : 'e.g. Teacher, Driver, Admin'} />
            </div>

            {/* Weight header */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-200">{isRTL ? 'المعايير والأوزان' : 'Criteria & Weights'}</label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={autoDistribute} type="button">
                  {isRTL ? 'توزيع تلقائي' : 'Auto-distribute'}
                </Button>
                <span className={`text-sm font-bold ${weightOk ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalWeight}% / 100% {weightOk ? '✓' : `(${isRTL ? `متبقي ${remaining}%` : `${remaining}% remaining`})`}
                </span>
              </div>
            </div>

            {/* Criteria rows */}
            <div className="space-y-2">
              {/* Column headers */}
              <div className="grid grid-cols-[24px_1fr_1fr_80px_56px] gap-2 px-1 text-xs text-slate-500">
                <span></span>
                <span>{isRTL ? 'المعيار (عربي)' : 'Criterion (AR)'}</span>
                <span>{isRTL ? 'المعيار (إنجليزي)' : 'Criterion (EN)'}</span>
                <span>{isRTL ? 'الوزن%' : 'Weight%'}</span>
                <span></span>
              </div>
              {form.criteria.map((c, i) => (
                <div key={i} className="grid grid-cols-[24px_1fr_1fr_80px_56px] gap-2 items-center">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button type="button" onClick={() => moveCriterion(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-slate-300 disabled:opacity-20">
                      <MoveUp className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => moveCriterion(i, 1)} disabled={i === form.criteria.length - 1} className="text-slate-500 hover:text-slate-300 disabled:opacity-20">
                      <MoveDown className="w-3 h-3" />
                    </button>
                  </div>
                  <Input value={c.kpi_name_ar} onChange={e => updateCriterion(i, 'kpi_name_ar', e.target.value)} placeholder={isRTL ? 'الاسم بالعربي' : 'Arabic name'} dir="rtl" className="text-sm" />
                  <Input value={c.kpi_name_en} onChange={e => updateCriterion(i, 'kpi_name_en', e.target.value)} placeholder="English name" className="text-sm" />
                  <div className="flex items-center gap-1">
                    <Input type="number" min="0" max="100" value={c.weight} onChange={e => updateCriterion(i, 'weight', Number(e.target.value))} className="text-sm px-2" />
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeCriterion(i)} className="text-red-400 hover:text-red-300 px-2" disabled={form.criteria.length <= 1}>
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addCriterion} className="w-full">
              <Plus className="w-3 h-3 me-1" />{isRTL ? 'إضافة معيار' : 'Add Criterion'}
            </Button>

            {/* Preview */}
            {form.criteria.some(c => c.kpi_name_ar) && (
              <div className="rounded-lg border border-slate-700 p-3 bg-slate-900/40">
                <p className="text-xs text-slate-400 mb-2">{isRTL ? 'معاينة التوزيع' : 'Distribution Preview'}</p>
                {form.criteria.filter(c => c.kpi_name_ar).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-slate-700 rounded-full h-2">
                      <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${c.weight}%` }} />
                    </div>
                    <span className="text-xs text-slate-300 w-32 truncate">{isRTL ? c.kpi_name_ar : (c.kpi_name_en || c.kpi_name_ar)}</span>
                    <span className="text-xs font-bold text-emerald-400 w-10 text-end">{c.weight}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div className="flex-shrink-0 border-t border-slate-700 pt-4 flex justify-end gap-3 mt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving || !weightOk}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ القالب' : 'Save Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WarningsTab({ isRTL, selectedBranchId, filterByBranch, employees }) {
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', employee_name: '', warning_type: 'verbal',
    reason: '', incident_date: format(new Date(), 'yyyy-MM-dd'),
    warning_date: format(new Date(), 'yyyy-MM-dd'), description: '',
    improvement_plan: '', status: 'draft'
  });

  const { data: warnings = [], isLoading } = useQuery({
    queryKey: ['disciplinaryWarnings', tenantId],
    queryFn: () => fetchData(tenantQuery('disciplinary_warnings').select('*').order('created_at', { ascending: false })),
  });

  const filtered = filterByBranch(warnings);

  const TYPE_LABELS = {
    verbal: { ar: 'إنذار شفهي', en: 'Verbal', color: 'bg-blue-100 text-blue-700' },
    written: { ar: 'إنذار كتابي', en: 'Written', color: 'bg-amber-100 text-amber-700' },
    final: { ar: 'إنذار نهائي', en: 'Final', color: 'bg-orange-100 text-orange-700' },
    termination_recommendation: { ar: 'توصية بإنهاء الخدمة', en: 'Termination Rec.', color: 'bg-red-100 text-red-700' },
  };

  const handleSave = async () => {
    if (!form.employee_id || !form.reason) { toast.error(isRTL ? 'يرجى تعبئة الحقول المطلوبة' : 'Fill required fields'); return; }
    setSaving(true);
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const data = {
        ...form,
        branch_id: selectedBranchId || '',
        issued_by: user.email,
        warning_number: `WARN-${Date.now().toString(36).toUpperCase()}`,
        status: 'issued'
      };
      const created = await tenantQuery('disciplinary_warnings').insert(data);
      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'DisciplinaryWarning', entityId: created.id, newValues: data });
      queryClient.invalidateQueries({ queryKey: ['disciplinaryWarnings'] });
      setShowDialog(false);
      toast.success(isRTL ? 'تم إصدار الإنذار' : 'Warning issued');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowDialog(true)}>
          <AlertTriangle className="w-4 h-4 me-2" />
          {isRTL ? 'إصدار إنذار' : 'Issue Warning'}
        </Button>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isRTL ? 'الموظف' : 'Employee'}</TableHead>
              <TableHead>{isRTL ? 'نوع الإنذار' : 'Type'}</TableHead>
              <TableHead>{isRTL ? 'السبب' : 'Reason'}</TableHead>
              <TableHead>{isRTL ? 'التاريخ' : 'Date'}</TableHead>
              <TableHead>{isRTL ? 'الإقرار' : 'Acknowledged'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">{isRTL ? 'لا توجد إنذارات' : 'No warnings'}</TableCell></TableRow>
            ) : filtered.map(w => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.employee_name}</TableCell>
                <TableCell><Badge className={TYPE_LABELS[w.warning_type]?.color}>{isRTL ? TYPE_LABELS[w.warning_type]?.ar : TYPE_LABELS[w.warning_type]?.en}</Badge></TableCell>
                <TableCell className="max-w-xs truncate">{w.reason}</TableCell>
                <TableCell>{w.warning_date}</TableCell>
                <TableCell>
                  {w.employee_acknowledged
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <Clock className="w-4 h-4 text-amber-400" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{isRTL ? 'إصدار إنذار' : 'Issue Warning'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
              <Select value={form.employee_id} onValueChange={(v) => {
                const emp = employees.find(e => e.id === v);
                setForm(p => ({ ...p, employee_id: v, employee_name: emp?.name_ar || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar || e.name_en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'نوع الإنذار' : 'Warning Type'}</Label>
              <Select value={form.warning_type} onValueChange={(v) => setForm(p => ({ ...p, warning_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="verbal">{isRTL ? 'شفهي' : 'Verbal'}</SelectItem>
                  <SelectItem value="written">{isRTL ? 'كتابي' : 'Written'}</SelectItem>
                  <SelectItem value="final">{isRTL ? 'نهائي' : 'Final'}</SelectItem>
                  <SelectItem value="termination_recommendation">{isRTL ? 'توصية بإنهاء الخدمة' : 'Termination Recommendation'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الحادثة' : 'Incident Date'}</Label>
                <Input type="date" value={form.incident_date} onChange={(e) => setForm(p => ({ ...p, incident_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الإنذار' : 'Warning Date'}</Label>
                <Input type="date" value={form.warning_date} onChange={(e) => setForm(p => ({ ...p, warning_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'السبب' : 'Reason'} *</Label>
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف التفصيلي' : 'Description'}</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'خطة التحسين' : 'Improvement Plan'}</Label>
              <Textarea rows={2} value={form.improvement_plan} onChange={(e) => setForm(p => ({ ...p, improvement_plan: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700">
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إصدار الإنذار' : 'Issue Warning'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}