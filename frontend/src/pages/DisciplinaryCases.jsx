import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, Search, Eye, Shield, Loader2, Bot } from 'lucide-react';
import { useTenantFilter } from '../hooks/useTenantFilter';

const CASE_TYPES = [
  { value: 'attendance', ar: 'غياب وتأخر', en: 'Attendance Issue' },
  { value: 'misconduct', ar: 'سلوك مخالف', en: 'Misconduct' },
  { value: 'performance', ar: 'أداء ضعيف', en: 'Poor Performance' },
  { value: 'harassment', ar: 'تحرش أو مضايقة', en: 'Harassment' },
  { value: 'policy_violation', ar: 'مخالفة سياسة', en: 'Policy Violation' },
  { value: 'fraud', ar: 'احتيال', en: 'Fraud' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

const OUTCOMES = [
  { value: 'warning', ar: 'إنذار', en: 'Warning' },
  { value: 'final_warning', ar: 'إنذار نهائي', en: 'Final Warning' },
  { value: 'suspension', ar: 'إيقاف مؤقت', en: 'Suspension' },
  { value: 'demotion', ar: 'خفض درجة', en: 'Demotion' },
  { value: 'termination', ar: 'إنهاء خدمة', en: 'Termination' },
  { value: 'no_action', ar: 'لا إجراء', en: 'No Action' },
  { value: 'cleared', ar: 'تبرئة', en: 'Cleared' },
];

const statusConfig = {
  open: { color: 'bg-blue-100 text-blue-700', ar: 'مفتوحة', en: 'Open' },
  under_investigation: { color: 'bg-amber-100 text-amber-700', ar: 'تحت التحقيق', en: 'Under Investigation' },
  hearing: { color: 'bg-purple-100 text-purple-700', ar: 'جلسة استماع', en: 'Hearing' },
  closed: { color: 'bg-green-100 text-green-700', ar: 'مغلقة', en: 'Closed' },
  escalated: { color: 'bg-red-100 text-red-700', ar: 'مصعّدة', en: 'Escalated' },
};

export default function DisciplinaryCases() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  const [activeTab, setActiveTab] = useState('cases');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  const [form, setForm] = useState({
    case_number: '', employee_id: '', employee_name: '', case_type: 'misconduct',
    incident_date: '', description: '', investigation_notes: '', evidence_urls: [],
    status: 'open', outcome: '', outcome_date: '', is_confidential: false,
    reported_by: '', assigned_investigator: '', grievance_notes: ''
  });

  const { data: cases = [], isLoading } = useQuery({
    queryKey: ['disciplinary_cases', tenantId],
    queryFn: () => fetchData(tenantQuery('disciplinary_cases').select('*').match(tenantFilter(), '-created_date')),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const filtered = cases.filter(c =>
    c.employee_name?.includes(search) ||
    c.case_number?.toLowerCase().includes(search.toLowerCase()) ||
    c.case_type?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.employee_name || !form.case_type) {
      toast.error(isRTL ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    setSaving(true);
    const data = {
      ...form,
      case_number: editingCase?.case_number || `DISC-${Date.now().toString(36).toUpperCase()}`,
    };
    if (editingCase?.id) {
      await tenantQuery('disciplinary_cases').update(data);
    } else {
      await tenantQuery('disciplinary_cases').insert(data);
    }
    queryClient.invalidateQueries({ queryKey: ['disciplinary_cases'] });
    setShowForm(false);
    resetForm();
    toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    setSaving(false);
  };

  const resetForm = () => {
    setEditingCase(null);
    setForm({
      case_number: '', employee_id: '', employee_name: '', case_type: 'misconduct',
      incident_date: '', description: '', investigation_notes: '', evidence_urls: [],
      status: 'open', outcome: '', outcome_date: '', is_confidential: false,
      reported_by: '', assigned_investigator: '', grievance_notes: ''
    });
  };

  const _handleUpdateStatus = async (c, newStatus) => {
    await tenantQuery('disciplinary_cases').update({ status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['disciplinary_cases'] });
    toast.success(isRTL ? 'تم التحديث' : 'Updated');
  };

  const handleAI = async () => {
    setLoadingAI(true);
    setAiInsight('');
    const typeCounts = CASE_TYPES.map(t => ({ type: t.en, count: cases.filter(c => c.case_type === t.value).length }));
    const prompt = `You are Yamen AI, an HR assistant. Analyze the following disciplinary case data for a Saudi school:
    - Total cases: ${cases.length}
    - Open: ${cases.filter(c => c.status === 'open').length}
    - Under investigation: ${cases.filter(c => c.status === 'under_investigation').length}
    - Closed: ${cases.filter(c => c.status === 'closed').length}
    - Escalated: ${cases.filter(c => c.status === 'escalated').length}
    - Case types: ${JSON.stringify(typeCounts)}
    - Repeat offenders (employees with 2+ cases): ${Object.values(cases.reduce((acc, c) => { acc[c.employee_id] = (acc[c.employee_id] || 0) + 1; return acc; }, {})).filter(v => v >= 2).length}
    Provide insights on patterns, risk indicators, and recommended actions in both Arabic and English.`;
    const res = await callApi('/api/ai/invoke-llm', { prompt });
    setAiInsight(res);
    setLoadingAI(false);
  };

  const columns = [
    { header: isRTL ? 'رقم القضية' : 'Case #', cell: r => <span className="font-mono text-sm">{r.case_number}</span> },
    { header: isRTL ? 'الموظف' : 'Employee', accessorKey: 'employee_name' },
    { header: isRTL ? 'النوع' : 'Type', cell: r => { const t = CASE_TYPES.find(t => t.value === r.case_type); return <span>{isRTL ? t?.ar : t?.en}</span>; } },
    { header: isRTL ? 'تاريخ الحادثة' : 'Incident Date', cell: r => r.incident_date ? format(new Date(r.incident_date), 'dd/MM/yyyy') : '-' },
    { header: isRTL ? 'سري' : 'Confidential', cell: r => r.is_confidential ? <Badge className="bg-slate-700 text-white">{isRTL ? 'سري' : 'Confidential'}</Badge> : '-' },
    { header: isRTL ? 'الحالة' : 'Status', cell: r => { const s = statusConfig[r.status]; return <span className={`px-2 py-1 rounded-full text-xs font-medium ${s?.color}`}>{isRTL ? s?.ar : s?.en}</span>; } },
    { header: isRTL ? 'إجراءات' : 'Actions', cell: r => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setShowDetails(r)}><Eye className="w-4 h-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditingCase(r); setForm({ ...r }); setShowForm(true); }}>{isRTL ? 'تعديل' : 'Edit'}</Button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'إدارة القضايا التأديبية' : 'Disciplinary Case Management'}
        subtitle={isRTL ? 'تتبع القضايا التأديبية والتحقيقات والمظالم' : 'Track disciplinary cases, investigations & grievances'}
        actionLabel={isRTL ? 'فتح قضية' : 'Open Case'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'إجمالي' : 'Total Cases'}</p>
          <p className="text-3xl font-bold text-slate-900">{cases.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'مفتوحة' : 'Open'}</p>
          <p className="text-3xl font-bold text-blue-600">{cases.filter(c => c.status === 'open').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'تحت التحقيق' : 'Under Investigation'}</p>
          <p className="text-3xl font-bold text-amber-600">{cases.filter(c => c.status === 'under_investigation').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'مصعّدة' : 'Escalated'}</p>
          <p className={`text-3xl font-bold ${cases.filter(c => c.status === 'escalated').length > 0 ? 'text-red-600' : 'text-slate-900'}`}>{cases.filter(c => c.status === 'escalated').length}</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="cases"><Shield className="w-4 h-4 me-2" />{isRTL ? 'القضايا' : 'Cases'}</TabsTrigger>
          <TabsTrigger value="ai"><Bot className="w-4 h-4 me-2" />Yamen AI</TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="space-y-4">
          <div className="relative max-w-md">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={isRTL ? 'بحث...' : 'Search...'} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
          </div>
          <DataTable columns={columns} data={filtered} loading={isLoading} emptyMessage={isRTL ? 'لا توجد قضايا' : 'No cases'} />
        </TabsContent>

        <TabsContent value="ai">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">Yamen AI — {isRTL ? 'تحليل القضايا' : 'Case Analysis'}</h3>
                <p className="text-sm text-slate-500">{isRTL ? 'كشف الأنماط وتقييم المخاطر' : 'Pattern detection & risk scoring'}</p>
              </div>
            </div>
            <Button onClick={handleAI} disabled={loadingAI} className="mb-4 gap-2 bg-purple-600 hover:bg-purple-700">
              {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {isRTL ? 'تحليل القضايا' : 'Analyze Cases'}
            </Button>
            {aiInsight && <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 whitespace-pre-wrap text-sm">{aiInsight}</div>}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCase ? (isRTL ? 'تعديل القضية' : 'Edit Case') : (isRTL ? 'فتح قضية تأديبية' : 'Open Disciplinary Case')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الموظف' : 'Employee'} *</Label>
                <Select value={form.employee_id} onValueChange={v => {
                  const emp = employees.find(e => e.id === v);
                  setForm(p => ({ ...p, employee_id: v, employee_name: emp?.name_ar || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر موظفًا' : 'Select employee'} /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع القضية' : 'Case Type'} *</Label>
                <Select value={form.case_type} onValueChange={v => setForm(p => ({ ...p, case_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{isRTL ? t.ar : t.en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الحادثة' : 'Incident Date'}</Label>
                <Input type="date" value={form.incident_date} onChange={e => setForm(p => ({ ...p, incident_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{isRTL ? v.ar : v.en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المحقق المكلف' : 'Assigned Investigator'}</Label>
                <Input value={form.assigned_investigator} onChange={e => setForm(p => ({ ...p, assigned_investigator: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النتيجة' : 'Outcome'}</Label>
                <Select value={form.outcome || ''} onValueChange={v => setForm(p => ({ ...p, outcome: v }))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{isRTL ? o.ar : o.en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'وصف الحادثة' : 'Incident Description'}</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات التحقيق' : 'Investigation Notes'}</Label>
              <Textarea value={form.investigation_notes} onChange={e => setForm(p => ({ ...p, investigation_notes: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات المظلمة (من الموظف)' : 'Grievance Notes (from employee)'}</Label>
              <Textarea value={form.grievance_notes} onChange={e => setForm(p => ({ ...p, grievance_notes: e.target.value }))} rows={2} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_confidential} onChange={e => setForm(p => ({ ...p, is_confidential: e.target.checked }))} />
              <span className="text-sm font-medium text-slate-700">{isRTL ? 'قضية سرية' : 'Confidential Case'}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      {showDetails && (
        <Dialog open={!!showDetails} onOpenChange={() => setShowDetails(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{isRTL ? 'تفاصيل القضية' : 'Case Details'} — {showDetails.case_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-slate-500">{isRTL ? 'الموظف' : 'Employee'}</Label><p className="font-medium">{showDetails.employee_name}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'النوع' : 'Type'}</Label><p>{CASE_TYPES.find(t => t.value === showDetails.case_type)?.[isRTL ? 'ar' : 'en']}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'الحالة' : 'Status'}</Label><p>{statusConfig[showDetails.status]?.[isRTL ? 'ar' : 'en']}</p></div>
                <div><Label className="text-slate-500">{isRTL ? 'النتيجة' : 'Outcome'}</Label><p>{OUTCOMES.find(o => o.value === showDetails.outcome)?.[isRTL ? 'ar' : 'en'] || '-'}</p></div>
              </div>
              {showDetails.description && <div><Label className="text-slate-500">{isRTL ? 'الوصف' : 'Description'}</Label><p className="mt-1 p-3 bg-slate-50 rounded-lg">{showDetails.description}</p></div>}
              {showDetails.investigation_notes && <div><Label className="text-slate-500">{isRTL ? 'ملاحظات التحقيق' : 'Investigation Notes'}</Label><p className="mt-1 p-3 bg-amber-50 rounded-lg">{showDetails.investigation_notes}</p></div>}
              {showDetails.grievance_notes && <div><Label className="text-slate-500">{isRTL ? 'مظلمة الموظف' : 'Employee Grievance'}</Label><p className="mt-1 p-3 bg-blue-50 rounded-lg">{showDetails.grievance_notes}</p></div>}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}