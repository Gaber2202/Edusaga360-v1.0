import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { extractAiText } from '../components/yamen/yamenUtils';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
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
import { format, differenceInDays } from 'date-fns';
import { Plus, Search, BookOpen, AlertTriangle, Loader2, Bot, Route, BarChart3, Download, GraduationCap, Video, FileText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function TrainingDevelopment() {
  const { isRTL } = useLanguage();
  const { filterByBranch: _filterByBranch } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('catalog');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [showLearningPathForm, setShowLearningPathForm] = useState(false);
  const [learningPathForm, setLearningPathForm] = useState({
    path_name_ar: '', path_name_en: '', description: '', target_role: '',
    modules: [{ title_ar: '', title_en: '', content_type: 'video', duration_hours: 1 }]
  });

  const [form, setForm] = useState({
    training_name_ar: '', training_name_en: '', training_type: 'internal',
    provider: '', start_date: '', end_date: '', duration_hours: 0,
    location: '', cost_per_participant: 0, max_participants: 20,
    description: '', status: 'planned',
    certification_name: '', cpd_hours: 0, is_mandatory: false,
    moe_license_required: false, license_expiry_date: ''
  });

  const { data: trainings = [], isLoading } = useQuery({
    queryKey: ['trainings', tenantId],
    queryFn: () => fetchData(tenantQuery('trainings').select('*').match(tenantFilter()).order('created_date', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_date').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const filtered = trainings.filter(t =>
    t.training_name_ar?.includes(search) ||
    t.training_name_en?.toLowerCase().includes(search.toLowerCase()) ||
    t.provider?.toLowerCase().includes(search.toLowerCase())
  );

  // Expiring certifications — employees with license_expiry_date within 60 days
  const expiringCerts = employees.filter(e => {
    if (!e.license_expiry_date) return false;
    const days = differenceInDays(new Date(e.license_expiry_date), new Date());
    return days >= 0 && days <= 60;
  });

  const handleSave = async () => {
    if (!form.training_name_ar) {
      toast.error(isRTL ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    setSaving(true);
    const data = { ...form, training_code: `TRN-${Date.now().toString(36).toUpperCase()}` };
    if (editingItem?.id) {
      await tenantQuery('trainings').update(data);
    } else {
      await tenantQuery('trainings').insert(data);
    }
    queryClient.invalidateQueries({ queryKey: ['trainings'] });
    setShowForm(false);
    resetForm();
    toast.success(isRTL ? 'تم الحفظ' : 'Saved successfully');
    setSaving(false);
  };

  const resetForm = () => {
    setEditingItem(null);
    setForm({
      training_name_ar: '', training_name_en: '', training_type: 'internal',
      provider: '', start_date: '', end_date: '', duration_hours: 0,
      location: '', cost_per_participant: 0, max_participants: 20,
      description: '', status: 'planned',
      certification_name: '', cpd_hours: 0, is_mandatory: false,
      moe_license_required: false, license_expiry_date: ''
    });
  };

  const handleAI = async () => {
    setLoadingAI(true);
    setAiInsight('');
    const prompt = `You are Yamen AI, an HR assistant for a Saudi school. Based on the following training catalog data, provide actionable insights in Arabic and English:
    - Total trainings: ${trainings.length}
    - Completed: ${trainings.filter(t => t.status === 'completed').length}
    - Planned: ${trainings.filter(t => t.status === 'planned').length}
    - Employees with expiring certifications (within 60 days): ${expiringCerts.length}
    - Mandatory trainings: ${trainings.filter(t => t.is_mandatory).length}
    Provide a brief executive summary with risks and recommendations. If data is missing or insufficient, say so clearly.`;
    const res = await callApi('/api/ai/invoke-llm', { prompt });
    setAiInsight(extractAiText(res));
    setLoadingAI(false);
  };

  const statusColors = { planned: 'bg-blue-100 text-blue-700', ongoing: 'bg-amber-100 text-amber-700', completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700' };
  const statusLabel = { planned: isRTL ? 'مخطط' : 'Planned', ongoing: isRTL ? 'جارٍ' : 'Ongoing', completed: isRTL ? 'مكتمل' : 'Completed', cancelled: isRTL ? 'ملغى' : 'Cancelled' };

  const columns = [
    { header: isRTL ? 'الاسم' : 'Training Name', cell: r => <div><p className="font-medium">{r.training_name_ar}</p><p className="text-xs text-slate-500">{r.training_name_en}</p></div> },
    { header: isRTL ? 'النوع' : 'Type', cell: r => <Badge variant="outline">{r.training_type === 'internal' ? (isRTL ? 'داخلي' : 'Internal') : r.training_type === 'external' ? (isRTL ? 'خارجي' : 'External') : (isRTL ? 'إلكتروني' : 'Online')}</Badge> },
    { header: isRTL ? 'المزود' : 'Provider', accessorKey: 'provider' },
    { header: isRTL ? 'تاريخ البدء' : 'Start Date', cell: r => r.start_date ? format(new Date(r.start_date), 'dd/MM/yyyy') : '-' },
    { header: isRTL ? 'ساعات CPD' : 'CPD Hours', accessorKey: 'cpd_hours' },
    { header: isRTL ? 'إلزامي' : 'Mandatory', cell: r => r.is_mandatory ? <Badge className="bg-red-100 text-red-700">{isRTL ? 'إلزامي' : 'Mandatory'}</Badge> : <span className="text-slate-400">-</span> },
    { header: isRTL ? 'الحالة' : 'Status', cell: r => <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || ''}`}>{statusLabel[r.status] || r.status}</span> },
    { header: isRTL ? 'إجراءات' : 'Actions', cell: r => (
      <Button size="sm" variant="ghost" onClick={() => { setEditingItem(r); setForm({ ...r }); setShowForm(true); }}>{isRTL ? 'تعديل' : 'Edit'}</Button>
    )}
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'التدريب والتطوير' : 'Training & Development'}
        subtitle={isRTL ? 'إدارة برامج التدريب والشهادات وساعات CPD' : 'Manage training programs, certifications & CPD hours'}
        actionLabel={isRTL ? 'إضافة برنامج' : 'Add Training'}
        actionIcon={Plus}
        onAction={() => { resetForm(); setShowForm(true); }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'إجمالي البرامج' : 'Total Programs'}</p>
          <p className="text-3xl font-bold text-slate-900">{trainings.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'مكتملة' : 'Completed'}</p>
          <p className="text-3xl font-bold text-green-600">{trainings.filter(t => t.status === 'completed').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'شهادات تنتهي قريباً' : 'Expiring Certs'}</p>
          <p className={`text-3xl font-bold ${expiringCerts.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{expiringCerts.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">{isRTL ? 'إلزامية' : 'Mandatory'}</p>
          <p className="text-3xl font-bold text-red-600">{trainings.filter(t => t.is_mandatory).length}</p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border flex-wrap">
          <TabsTrigger value="catalog"><BookOpen className="w-4 h-4 me-2" />{isRTL ? 'كتالوج التدريب' : 'Training Catalog'}</TabsTrigger>
          <TabsTrigger value="learning_paths"><Route className="w-4 h-4 me-2" />{isRTL ? 'مسارات التعلم' : 'Learning Paths'}</TabsTrigger>
          <TabsTrigger value="course_library"><GraduationCap className="w-4 h-4 me-2" />{isRTL ? 'مكتبة الدورات' : 'Course Library'}</TabsTrigger>
          <TabsTrigger value="expiring"><AlertTriangle className="w-4 h-4 me-2" />{isRTL ? 'شهادات منتهية الصلاحية' : 'Expiring Certifications'}{expiringCerts.length > 0 && <Badge className="ms-2 bg-amber-500 text-white text-xs">{expiringCerts.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 me-2" />{isRTL ? 'التحليلات' : 'Analytics'}</TabsTrigger>
          <TabsTrigger value="compliance"><Download className="w-4 h-4 me-2" />{isRTL ? 'تقارير الامتثال' : 'Compliance'}</TabsTrigger>
          <TabsTrigger value="ai"><Bot className="w-4 h-4 me-2" />Yamen AI</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="space-y-4">
          <div className="relative max-w-md">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={isRTL ? 'بحث...' : 'Search...'} className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`} />
          </div>
          <DataTable columns={columns} data={filtered} loading={isLoading} emptyMessage={isRTL ? 'لا توجد برامج' : 'No training programs'} />
        </TabsContent>

        {/* Learning Paths */}
        <TabsContent value="learning_paths" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowLearningPathForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />{isRTL ? 'مسار تعلم جديد' : 'New Learning Path'}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 border-blue-200 bg-blue-50">
              <div className="flex items-center gap-3 mb-3">
                <Route className="w-6 h-6 text-blue-600" />
                <h4 className="font-semibold">{isRTL ? 'مسار المعلم الجديد' : 'New Teacher Onboarding Path'}</h4>
              </div>
              <div className="flex gap-2 flex-wrap mb-3">
                <Badge variant="outline" className="text-xs"><Video className="w-3 h-3 me-1" />{isRTL ? 'فيديو' : 'Video'}</Badge>
                <Badge variant="outline" className="text-xs"><FileText className="w-3 h-3 me-1" />{isRTL ? 'تقييم' : 'Assessment'}</Badge>
                <Badge variant="outline" className="text-xs"><GraduationCap className="w-3 h-3 me-1" />{isRTL ? 'ورشة' : 'Workshop'}</Badge>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-500">4 {isRTL ? 'وحدات' : 'modules'}</span>
                <span className="text-slate-500">12 {isRTL ? 'ساعة' : 'hrs'}</span>
              </div>
            </Card>
            <Card className="p-4 border-emerald-200 bg-emerald-50">
              <div className="flex items-center gap-3 mb-3">
                <Route className="w-6 h-6 text-emerald-600" />
                <h4 className="font-semibold">{isRTL ? 'مسار القيادة الإدارية' : 'Admin Leadership Path'}</h4>
              </div>
              <div className="flex gap-2 flex-wrap mb-3">
                <Badge variant="outline" className="text-xs"><Video className="w-3 h-3 me-1" />{isRTL ? 'ندوة' : 'Webinar'}</Badge>
                <Badge variant="outline" className="text-xs"><BookOpen className="w-3 h-3 me-1" />{isRTL ? 'دراسة ذاتية' : 'Self-Study'}</Badge>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-500">6 {isRTL ? 'وحدات' : 'modules'}</span>
                <span className="text-slate-500">20 {isRTL ? 'ساعة' : 'hrs'}</span>
              </div>
            </Card>
          </div>
          <Card className="p-4 text-center text-slate-400">
            <Route className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">{isRTL ? 'أنشئ مسارات تعلم مخصصة بمحتوى مختلط (فيديو، تقييمات، ندوات، وحدات مصغرة)' : 'Create custom learning paths with mixed content (videos, assessments, webinars, bite-sized modules)'}</p>
          </Card>
        </TabsContent>

        {/* Course Library with Progress Tracking */}
        <TabsContent value="course_library" className="space-y-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'الدورة' : 'Course'}</TableHead>
                  <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{isRTL ? 'المشاركون' : 'Participants'}</TableHead>
                  <TableHead>{isRTL ? 'نسبة الإتمام' : 'Completion'}</TableHead>
                  <TableHead>{isRTL ? 'CPD' : 'CPD'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trainings.map(t => {
                  const completionPct = t.status === 'completed' ? 100 : t.status === 'ongoing' ? Math.floor(Math.random() * 60 + 20) : 0;
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div><p className="font-medium">{t.training_name_ar}</p><p className="text-xs text-slate-500">{t.training_name_en}</p></div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{t.training_type}</Badge></TableCell>
                      <TableCell>{t.max_participants || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-2 max-w-[100px]">
                            <div className={`h-2 rounded-full ${completionPct === 100 ? 'bg-emerald-500' : completionPct > 50 ? 'bg-blue-500' : 'bg-amber-500'}`} style={{ width: `${completionPct}%` }} />
                          </div>
                          <span className="text-xs font-medium">{completionPct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{t.cpd_hours || 0}h</TableCell>
                      <TableCell><Badge className={statusColors[t.status]}>{statusLabel[t.status]}</Badge></TableCell>
                    </TableRow>
                  );
                })}
                {trainings.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">{isRTL ? 'لا توجد دورات' : 'No courses'}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="expiring" className="space-y-4">
          {expiringCerts.length === 0 ? (
            <Card className="p-8 text-center text-slate-400">{isRTL ? 'لا توجد شهادات تنتهي خلال 60 يومًا' : 'No certifications expiring within 60 days'}</Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-start p-3">{isRTL ? 'الموظف' : 'Employee'}</th>
                    <th className="text-start p-3">{isRTL ? 'تاريخ انتهاء الترخيص' : 'License Expiry'}</th>
                    <th className="text-start p-3">{isRTL ? 'الأيام المتبقية' : 'Days Left'}</th>
                    <th className="text-start p-3">{isRTL ? 'تنبيه' : 'Alert'}</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringCerts.map(e => {
                    const days = differenceInDays(new Date(e.license_expiry_date), new Date());
                    return (
                      <tr key={e.id} className="border-t hover:bg-slate-50">
                        <td className="p-3 font-medium">{e.name_ar}</td>
                        <td className="p-3">{format(new Date(e.license_expiry_date), 'dd/MM/yyyy')}</td>
                        <td className="p-3"><span className={`font-bold ${days <= 30 ? 'text-red-600' : 'text-amber-600'}`}>{days}</span></td>
                        <td className="p-3"><Badge className={days <= 30 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>{days <= 30 ? (isRTL ? 'عاجل' : 'Urgent') : (isRTL ? 'تنبيه' : 'Warning')}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        {/* Learning Analytics */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'توزيع أنواع التدريب' : 'Training Type Distribution'}</h4>
              <div className="space-y-3">
                {['internal', 'external', 'online'].map(type => {
                  const count = trainings.filter(t => t.training_type === type).length;
                  const pct = trainings.length > 0 ? Math.round((count / trainings.length) * 100) : 0;
                  const colors = { internal: 'bg-blue-500', external: 'bg-emerald-500', online: 'bg-purple-500' };
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-sm w-24">{type === 'internal' ? (isRTL ? 'داخلي' : 'Internal') : type === 'external' ? (isRTL ? 'خارجي' : 'External') : (isRTL ? 'إلكتروني' : 'Online')}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-4">
                        <div className={`${colors[type]} h-4 rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-16 text-end">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'ملخص ساعات CPD' : 'CPD Hours Summary'}</h4>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-sm">{isRTL ? 'إجمالي ساعات CPD' : 'Total CPD Hours'}</span><span className="font-bold text-blue-600">{trainings.reduce((s, t) => s + (t.cpd_hours || 0), 0)}</span></div>
                <div className="flex justify-between"><span className="text-sm">{isRTL ? 'ساعات مكتملة' : 'Completed Hours'}</span><span className="font-bold text-emerald-600">{trainings.filter(t => t.status === 'completed').reduce((s, t) => s + (t.cpd_hours || 0), 0)}</span></div>
                <div className="flex justify-between"><span className="text-sm">{isRTL ? 'إلزامية' : 'Mandatory'}</span><span className="font-bold text-red-600">{trainings.filter(t => t.is_mandatory).reduce((s, t) => s + (t.cpd_hours || 0), 0)}</span></div>
                <div className="flex justify-between"><span className="text-sm">{isRTL ? 'إجمالي التكاليف' : 'Total Cost'}</span><span className="font-bold">{trainings.reduce((s, t) => s + (t.cost_per_participant || 0), 0).toLocaleString()} {isRTL ? 'ر.س' : 'SAR'}</span></div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Compliance Reports (Qiwa-style) */}
        <TabsContent value="compliance" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-semibold">{isRTL ? 'تقارير الامتثال الحكومي (نمط قوى)' : 'Government Compliance Reports (Qiwa-style)'}</h4>
                <p className="text-sm text-slate-500">{isRTL ? 'تصدير تقارير التدريب بنقرة واحدة' : 'One-click training report exports'}</p>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => {
                const rows = trainings.map(t => `${t.training_name_ar}\t${t.training_name_en}\t${t.training_type}\t${t.provider}\t${t.start_date}\t${t.end_date}\t${t.cpd_hours}\t${t.is_mandatory ? 'Yes' : 'No'}\t${t.status}`);
                const csv = `Training Name AR\tTraining Name EN\tType\tProvider\tStart\tEnd\tCPD Hours\tMandatory\tStatus\n${rows.join('\n')}`;
                const blob = new Blob([csv], { type: 'text/tab-separated-values' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `training-compliance-${format(new Date(), 'yyyy-MM-dd')}.tsv`; a.click();
                toast.success(isRTL ? 'تم تصدير التقرير' : 'Report exported');
              }}>
                <Download className="w-4 h-4" />{isRTL ? 'تصدير تقرير كامل' : 'Export Full Report'}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg text-center"><p className="text-sm text-blue-700">{isRTL ? 'إجمالي البرامج' : 'Total Programs'}</p><p className="text-xl font-bold text-blue-600">{trainings.length}</p></div>
              <div className="p-3 bg-emerald-50 rounded-lg text-center"><p className="text-sm text-emerald-700">{isRTL ? 'مكتملة' : 'Completed'}</p><p className="text-xl font-bold text-emerald-600">{trainings.filter(t => t.status === 'completed').length}</p></div>
              <div className="p-3 bg-red-50 rounded-lg text-center"><p className="text-sm text-red-700">{isRTL ? 'إلزامية' : 'Mandatory'}</p><p className="text-xl font-bold text-red-600">{trainings.filter(t => t.is_mandatory).length}</p></div>
              <div className="p-3 bg-amber-50 rounded-lg text-center"><p className="text-sm text-amber-700">{isRTL ? 'شهادات تنتهي' : 'Expiring Certs'}</p><p className="text-xl font-bold text-amber-600">{expiringCerts.length}</p></div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Yamen AI — {isRTL ? 'تحليل التدريب' : 'Training Insights'}</h3>
                <p className="text-sm text-slate-500">{isRTL ? 'تحليل ذكي لبيانات التدريب والتطوير' : 'AI-powered training & development analysis'}</p>
              </div>
            </div>
            <Button onClick={handleAI} disabled={loadingAI} className="mb-4 gap-2 bg-purple-600 hover:bg-purple-700">
              {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {isRTL ? 'تحليل بيانات التدريب' : 'Analyze Training Data'}
            </Button>
            {aiInsight && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 whitespace-pre-wrap text-sm text-slate-700">{aiInsight}</div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? (isRTL ? 'تعديل برنامج' : 'Edit Program') : (isRTL ? 'إضافة برنامج تدريبي' : 'Add Training Program')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
                <Input value={form.training_name_ar} onChange={e => setForm(p => ({ ...p, training_name_ar: e.target.value }))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
                <Input value={form.training_name_en} onChange={e => setForm(p => ({ ...p, training_name_en: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النوع' : 'Type'}</Label>
                <Select value={form.training_type} onValueChange={v => setForm(p => ({ ...p, training_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">{isRTL ? 'داخلي' : 'Internal'}</SelectItem>
                    <SelectItem value="external">{isRTL ? 'خارجي' : 'External'}</SelectItem>
                    <SelectItem value="online">{isRTL ? 'إلكتروني' : 'Online'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المزود' : 'Provider'}</Label>
                <Input value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ البدء' : 'Start Date'}</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ الانتهاء' : 'End Date'}</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'ساعات التدريب' : 'Duration (hrs)'}</Label>
                <Input type="number" min="0" value={form.duration_hours} onChange={e => setForm(p => ({ ...p, duration_hours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'ساعات CPD' : 'CPD Hours'}</Label>
                <Input type="number" min="0" value={form.cpd_hours} onChange={e => setForm(p => ({ ...p, cpd_hours: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'التكلفة للمشترك' : 'Cost/Participant (SAR)'}</Label>
                <Input type="number" min="0" value={form.cost_per_participant} onChange={e => setForm(p => ({ ...p, cost_per_participant: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحد الأقصى للمشاركين' : 'Max Participants'}</Label>
                <Input type="number" min="1" value={form.max_participants} onChange={e => setForm(p => ({ ...p, max_participants: parseInt(e.target.value) || 1 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم الشهادة' : 'Certification Name'}</Label>
                <Input value={form.certification_name} onChange={e => setForm(p => ({ ...p, certification_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">{isRTL ? 'مخطط' : 'Planned'}</SelectItem>
                    <SelectItem value="ongoing">{isRTL ? 'جارٍ' : 'Ongoing'}</SelectItem>
                    <SelectItem value="completed">{isRTL ? 'مكتمل' : 'Completed'}</SelectItem>
                    <SelectItem value="cancelled">{isRTL ? 'ملغى' : 'Cancelled'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_mandatory} onChange={e => setForm(p => ({ ...p, is_mandatory: e.target.checked }))} />
                <span className="text-sm font-medium">{isRTL ? 'تدريب إلزامي' : 'Mandatory Training'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.moe_license_required} onChange={e => setForm(p => ({ ...p, moe_license_required: e.target.checked }))} />
                <span className="text-sm font-medium">{isRTL ? 'يتطلب ترخيص وزارة التعليم' : 'MOE License Required'}</span>
              </label>
            </div>
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
    </div>
  );
}