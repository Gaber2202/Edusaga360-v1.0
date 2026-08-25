import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { useTenant } from '../components/TenantContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { FolderOpen, Plus, Search, Landmark, Wallet, Flag, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { createJournalEntry } from '../api/journalEntry';
import { formatCurrency } from '../lib/localization';

/** SA v1 posting accounts (chart codes) — CapEx capitalizes; OpEx expenses. */
const SA_GL = {
  capex_asset: '1510',
  opex_expense: '6010',
  credit: '2060', // AP / Supplier
};

const emptyProject = () => ({
  name_en: '',
  name_ar: '',
  project_type: 'opex',
  status: 'draft',
  description: '',
  main_gl_account: SA_GL.opex_expense,
  asset_gl_account: SA_GL.capex_asset,
  expense_gl_account: SA_GL.opex_expense,
  start_date: format(new Date(), 'yyyy-MM-dd'),
  end_date: '',
  branch_id: '',
  notes: '',
});

function isSaudiJurisdiction(tenant) {
  const code = (tenant?.jurisdiction_code || tenant?.localization?.jurisdiction || '').toUpperCase();
  return code === 'SA' || code === 'KSA' || code.startsWith('SA-');
}

export default function Projects() {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showCostForm, setShowCostForm] = useState(false);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [projectForm, setProjectForm] = useState(emptyProject());
  const [budgetForm, setBudgetForm] = useState({ line_name: '', category: '', gl_account: '', amount: 0, notes: '' });
  const [costForm, setCostForm] = useState({ description: '', category: '', amount: 0, cost_date: format(new Date(), 'yyyy-MM-dd'), gl_account: '', vendor_name: '' });
  const [milestoneForm, setMilestoneForm] = useState({ title: '', description: '', due_date: '', status: 'pending' });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('projects')
        .select('*')
        .match(tenantFilter(branchFilter()))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const projectId = selectedProject?.id;

  const { data: budgets = [] } = useQuery({
    queryKey: ['project_budgets', tenantId, projectId],
    queryFn: () => fetchData(tenantQuery('project_budgets').select('*').match(tenantFilter({ project_id: projectId })).order('created_at', { ascending: false })),
    enabled: hasTenantAccess && !!projectId,
  });

  const { data: costs = [] } = useQuery({
    queryKey: ['project_costs', tenantId, projectId],
    queryFn: () => fetchData(tenantQuery('project_costs').select('*').match(tenantFilter({ project_id: projectId })).order('cost_date', { ascending: false })),
    enabled: hasTenantAccess && !!projectId,
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ['project_milestones', tenantId, projectId],
    queryFn: () => fetchData(tenantQuery('project_milestones').select('*').match(tenantFilter({ project_id: projectId })).order('sort_order', { ascending: true })),
    enabled: hasTenantAccess && !!projectId,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const filtered = projects.filter((p) => {
    const q = search.toLowerCase();
    return !search
      || p.name_en?.toLowerCase().includes(q)
      || p.name_ar?.includes(search)
      || p.project_code?.toLowerCase().includes(q)
      || p.project_type?.toLowerCase().includes(q);
  });

  const capexCount = projects.filter((p) => p.project_type === 'capex').length;
  const opexCount = projects.filter((p) => p.project_type === 'opex').length;
  const activeCount = projects.filter((p) => p.status === 'active').length;

  const createProject = useMutation({
    mutationFn: async (data) => {
      const code = `PRJ-${Date.now().toString(36).toUpperCase()}`;
      const mainGl = data.project_type === 'capex'
        ? (data.asset_gl_account || SA_GL.capex_asset)
        : (data.expense_gl_account || SA_GL.opex_expense);
      return tenantQuery('projects').insert({
        ...data,
        project_code: code,
        main_gl_account: data.main_gl_account || mainGl,
        branch_id: data.branch_id || selectedBranchId || null,
        end_date: data.end_date || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(isRTL ? 'تم إنشاء المشروع' : 'Project created');
      setShowProjectForm(false);
      setProjectForm(emptyProject());
    },
    onError: (err) => toast.error(err?.message || 'Failed'),
  });

  const addBudget = useMutation({
    mutationFn: (data) => tenantQuery('project_budgets').insert({
      ...data,
      project_id: projectId,
      amount: Number(data.amount) || 0,
      gl_account: data.gl_account || selectedProject?.main_gl_account || null,
    }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['project_budgets'] });
      const total = budgets.reduce((s, b) => s + Number(b.amount || 0), 0) + Number(budgetForm.amount || 0);
      await tenantQuery('projects').update({ total_budget: total }).eq('id', projectId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(isRTL ? 'تمت إضافة الميزانية' : 'Budget line added');
      setShowBudgetForm(false);
      setBudgetForm({ line_name: '', category: '', gl_account: '', amount: 0, notes: '' });
    },
    onError: (err) => toast.error(err?.message || 'Failed'),
  });

  const addCost = useMutation({
    mutationFn: async (data) => {
      const amount = Number(data.amount) || 0;
      const glAccount = data.gl_account
        || selectedProject?.main_gl_account
        || (selectedProject?.project_type === 'capex' ? SA_GL.capex_asset : SA_GL.opex_expense);

      let journal_entry_id = null;
      let journal_number = null;
      let posting_status = 'skipped';
      let posting_error = null;

      // SCRUM-129: SA posting rules for v1 — attempt GL via createJournalEntry
      if (isSaudiJurisdiction(tenant) && amount > 0) {
        try {
          const jeNumber = `JE-PRJ-${Date.now().toString(36).toUpperCase()}`;
          const debitAccount = selectedProject?.project_type === 'capex'
            ? (selectedProject.asset_gl_account || glAccount || SA_GL.capex_asset)
            : (selectedProject?.expense_gl_account || glAccount || SA_GL.opex_expense);
          const entry = await createJournalEntry({
            branch_id: selectedProject?.branch_id || selectedBranchId || undefined,
            journal_number: jeNumber,
            journal_type: 'general',
            date: data.cost_date || format(new Date(), 'yyyy-MM-dd'),
            description: `Project ${selectedProject?.project_type?.toUpperCase()} cost — ${selectedProject?.name_en || projectId}: ${data.description}`,
            lines: [
              { account_code: debitAccount, debit: amount, credit: 0, description: data.description },
              { account_code: SA_GL.credit, debit: 0, credit: amount, description: data.vendor_name || 'AP / Supplier' },
            ],
          });
          journal_entry_id = entry?.id || null;
          journal_number = entry?.journal_number || jeNumber;
          posting_status = 'posted';
        } catch (err) {
          posting_status = 'failed';
          posting_error = err?.message || String(err);
          // Keep cost record even if GL fails — operator can retry/post manually
        }
      } else if (!isSaudiJurisdiction(tenant)) {
        // TODO(SCRUM-129): Non-SA jurisdictions — wire country-pack GL posting rules
        // via createJournalEntry / integrationHandlers once AE/QA project posting is defined.
        posting_status = 'skipped';
        posting_error = 'GL auto-post is SA-only for v1';
      }

      return tenantQuery('project_costs').insert({
        project_id: projectId,
        branch_id: selectedProject?.branch_id || selectedBranchId || null,
        description: data.description,
        category: data.category || null,
        amount,
        cost_date: data.cost_date,
        gl_account: glAccount,
        vendor_name: data.vendor_name || null,
        journal_entry_id,
        journal_number,
        posting_status,
        posting_error,
      });
    },
    onSuccess: async (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project_costs'] });
      const total = costs.reduce((s, c) => s + Number(c.amount || 0), 0) + Number(vars.amount || 0);
      await tenantQuery('projects').update({ total_actual: total }).eq('id', projectId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(isRTL ? 'تم تسجيل التكلفة' : 'Cost recorded');
      setShowCostForm(false);
      setCostForm({ description: '', category: '', amount: 0, cost_date: format(new Date(), 'yyyy-MM-dd'), gl_account: '', vendor_name: '' });
    },
    onError: (err) => toast.error(err?.message || 'Failed'),
  });

  const addMilestone = useMutation({
    mutationFn: (data) => tenantQuery('project_milestones').insert({
      project_id: projectId,
      title: data.title,
      description: data.description || null,
      due_date: data.due_date || null,
      status: data.status || 'pending',
      sort_order: milestones.length,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_milestones'] });
      toast.success(isRTL ? 'تمت إضافة المعلم' : 'Milestone added');
      setShowMilestoneForm(false);
      setMilestoneForm({ title: '', description: '', due_date: '', status: 'pending' });
    },
    onError: (err) => toast.error(err?.message || 'Failed'),
  });

  const updateMilestoneStatus = async (m, status) => {
    await tenantQuery('project_milestones').update({
      status,
      completed_date: status === 'completed' ? format(new Date(), 'yyyy-MM-dd') : null,
    }).eq('id', m.id);
    queryClient.invalidateQueries({ queryKey: ['project_milestones'] });
  };

  const projectColumns = [
    { header: isRTL ? 'الرمز' : 'Code', accessorKey: 'project_code' },
    {
      header: isRTL ? 'المشروع' : 'Project',
      accessorKey: 'name_en',
      primary: true,
      cell: (row) => (isRTL ? row.name_ar || row.name_en : row.name_en || row.name_ar),
    },
    {
      header: isRTL ? 'النوع' : 'Type',
      accessorKey: 'project_type',
      cell: (row) => (
        <Badge className={row.project_type === 'capex' ? 'bg-najdi-50 text-najdi-900' : 'bg-emerald-50 text-emerald-800'}>
          {row.project_type === 'capex' ? 'CapEx' : 'OpEx'}
        </Badge>
      ),
    },
    {
      header: isRTL ? 'حساب GL' : 'Main GL',
      accessorKey: 'main_gl_account',
      cell: (row) => <span className="font-mono text-sm">{row.main_gl_account || '—'}</span>,
    },
    {
      header: isRTL ? 'الميزانية' : 'Budget',
      accessorKey: 'total_budget',
      cell: (row) => formatCurrency(Number(row.total_budget) || 0, tenant?.localization, isRTL),
    },
    {
      header: isRTL ? 'الفعلي' : 'Actual',
      accessorKey: 'total_actual',
      cell: (row) => formatCurrency(Number(row.total_actual) || 0, tenant?.localization, isRTL),
    },
    {
      header: isRTL ? 'الحالة' : 'Status',
      accessorKey: 'status',
      cell: (row) => <Badge variant="outline">{row.status}</Badge>,
    },
    {
      header: '',
      accessorKey: 'actions',
      hideOnMobileCard: true,
      cell: (row) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedProject(row)}>
          {isRTL ? 'إدارة' : 'Manage'}
        </Button>
      ),
    },
  ];

  const onTypeChange = (project_type) => {
    setProjectForm((p) => ({
      ...p,
      project_type,
      main_gl_account: project_type === 'capex' ? (p.asset_gl_account || SA_GL.capex_asset) : (p.expense_gl_account || SA_GL.opex_expense),
    }));
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRTL ? 'المشاريع' : 'Projects'}
        subtitle={isRTL ? 'CapEx / OpEx مع ميزانيات وتكاليف ومعالم وربط دفتر الأستاذ' : 'CapEx / OpEx with budgets, costs, milestones, and main GL linkage'}
        actionLabel={isRTL ? 'مشروع جديد' : 'New Project'}
        actionIcon={Plus}
        onAction={() => {
          setProjectForm({ ...emptyProject(), branch_id: selectedBranchId || '' });
          setShowProjectForm(true);
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'الإجمالي' : 'Projects'} value={projects.length} icon={FolderOpen} iconClassName="bg-najdi-50" />
        <StatCard title="CapEx" value={capexCount} icon={Landmark} iconClassName="bg-blue-50" />
        <StatCard title="OpEx" value={opexCount} icon={Wallet} iconClassName="bg-emerald-50" />
        <StatCard title={isRTL ? 'نشطة' : 'Active'} value={activeCount} icon={Flag} iconClassName="bg-amber-50" />
      </div>

      <Card className="p-4 space-y-4">
        <div className="relative max-w-md">
          <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRTL ? 'بحث...' : 'Search projects...'}
            className={isRTL ? 'pr-10' : 'pl-10'}
          />
        </div>
        <DataTable columns={projectColumns} data={filtered} loading={isLoading} emptyMessage={isRTL ? 'لا توجد مشاريع' : 'No projects yet'} />
      </Card>

      {selectedProject && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {isRTL ? selectedProject.name_ar || selectedProject.name_en : selectedProject.name_en || selectedProject.name_ar}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selectedProject.project_code} · {selectedProject.project_type?.toUpperCase()} · GL {selectedProject.main_gl_account || '—'}
                {isSaudiJurisdiction(tenant) ? (isRTL ? ' · ترحيل SA مفعّل' : ' · SA GL posting on') : (isRTL ? ' · ترحيل GL لـ SA فقط (v1)' : ' · SA-only GL auto-post (v1)')}
              </p>
            </div>
            <Button variant="ghost" onClick={() => setSelectedProject(null)}>{isRTL ? 'إغلاق' : 'Close'}</Button>
          </div>

          <Tabs defaultValue="budgets">
            <TabsList>
              <TabsTrigger value="budgets">{isRTL ? 'الميزانية' : 'Budgets'}</TabsTrigger>
              <TabsTrigger value="costs">{isRTL ? 'التكاليف' : 'Costs'}</TabsTrigger>
              <TabsTrigger value="milestones">{isRTL ? 'المعالم' : 'Milestones'}</TabsTrigger>
            </TabsList>

            <TabsContent value="budgets" className="space-y-3 mt-4">
              <Button size="sm" onClick={() => setShowBudgetForm(true)}><Plus className="h-4 w-4 me-1" />{isRTL ? 'سطر ميزانية' : 'Budget line'}</Button>
              <DataTable
                columns={[
                  { header: isRTL ? 'البند' : 'Line', accessorKey: 'line_name', primary: true },
                  { header: isRTL ? 'الفئة' : 'Category', accessorKey: 'category' },
                  { header: 'GL', accessorKey: 'gl_account' },
                  { header: isRTL ? 'المبلغ' : 'Amount', accessorKey: 'amount', cell: (row) => formatCurrency(Number(row.amount) || 0, tenant?.localization, isRTL) },
                ]}
                data={budgets}
                emptyMessage={isRTL ? 'لا توجد بنود' : 'No budget lines'}
              />
            </TabsContent>

            <TabsContent value="costs" className="space-y-3 mt-4">
              <Button size="sm" onClick={() => setShowCostForm(true)}><Receipt className="h-4 w-4 me-1" />{isRTL ? 'تسجيل تكلفة' : 'Record cost'}</Button>
              <DataTable
                columns={[
                  { header: isRTL ? 'التاريخ' : 'Date', accessorKey: 'cost_date' },
                  { header: isRTL ? 'الوصف' : 'Description', accessorKey: 'description', primary: true },
                  { header: isRTL ? 'المبلغ' : 'Amount', accessorKey: 'amount', cell: (row) => formatCurrency(Number(row.amount) || 0, tenant?.localization, isRTL) },
                  { header: 'GL', accessorKey: 'gl_account' },
                  {
                    header: isRTL ? 'الترحيل' : 'Posting',
                    accessorKey: 'posting_status',
                    cell: (row) => (
                      <span className="text-sm">
                        <Badge variant="outline">{row.posting_status}</Badge>
                        {row.journal_number ? ` · ${row.journal_number}` : ''}
                      </span>
                    ),
                  },
                ]}
                data={costs}
                emptyMessage={isRTL ? 'لا توجد تكاليف' : 'No costs yet'}
              />
            </TabsContent>

            <TabsContent value="milestones" className="space-y-3 mt-4">
              <Button size="sm" onClick={() => setShowMilestoneForm(true)}><Flag className="h-4 w-4 me-1" />{isRTL ? 'معلم' : 'Milestone'}</Button>
              <DataTable
                columns={[
                  { header: isRTL ? 'العنوان' : 'Title', accessorKey: 'title', primary: true },
                  { header: isRTL ? 'الاستحقاق' : 'Due', accessorKey: 'due_date' },
                  {
                    header: isRTL ? 'الحالة' : 'Status',
                    accessorKey: 'status',
                    cell: (row) => (
                      <Select value={row.status} onValueChange={(nv) => updateMilestoneStatus(row, nv)}>
                        <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">pending</SelectItem>
                          <SelectItem value="in_progress">in_progress</SelectItem>
                          <SelectItem value="completed">completed</SelectItem>
                          <SelectItem value="skipped">skipped</SelectItem>
                        </SelectContent>
                      </Select>
                    ),
                  },
                ]}
                data={milestones}
                emptyMessage={isRTL ? 'لا توجد معالم' : 'No milestones'}
              />
            </TabsContent>
          </Tabs>
        </Card>
      )}

      {/* New project */}
      <Dialog open={showProjectForm} onOpenChange={setShowProjectForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إنشاء مشروع' : 'Create project'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (EN)' : 'Name (EN)'} *</Label>
                <Input value={projectForm.name_en} onChange={(e) => setProjectForm((p) => ({ ...p, name_en: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (AR)' : 'Name (AR)'}</Label>
                <Input value={projectForm.name_ar} onChange={(e) => setProjectForm((p) => ({ ...p, name_ar: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CapEx / OpEx *</Label>
                <Select value={projectForm.project_type} onValueChange={onTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capex">CapEx</SelectItem>
                    <SelectItem value="opex">OpEx</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                <Select value={projectForm.status} onValueChange={(v) => setProjectForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">draft</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="on_hold">on_hold</SelectItem>
                    <SelectItem value="completed">completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'حساب GL الرئيسي' : 'Main GL account'}</Label>
              <Input
                value={projectForm.main_gl_account}
                onChange={(e) => setProjectForm((p) => ({ ...p, main_gl_account: e.target.value }))}
                placeholder={projectForm.project_type === 'capex' ? SA_GL.capex_asset : SA_GL.opex_expense}
              />
              <p className="text-xs text-muted-foreground">
                {isRTL
                  ? 'قواعد SA v1: CapEx → أصل ثابت، OpEx → مصروف عند تسجيل التكلفة'
                  : 'SA v1: CapEx → fixed-asset debit; OpEx → expense debit on cost entry'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'تاريخ البدء' : 'Start'}</Label>
                <Input type="date" value={projectForm.start_date} onChange={(e) => setProjectForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
                <Select value={projectForm.branch_id || '__none'} onValueChange={(v) => setProjectForm((p) => ({ ...p, branch_id: v === '__none' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
              <Textarea rows={3} value={projectForm.description} onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProjectForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button disabled={!projectForm.name_en || createProject.isPending} onClick={() => createProject.mutate(projectForm)}>
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBudgetForm} onOpenChange={setShowBudgetForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isRTL ? 'سطر ميزانية' : 'Budget line'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{isRTL ? 'البند' : 'Line name'} *</Label>
              <Input value={budgetForm.line_name} onChange={(e) => setBudgetForm((p) => ({ ...p, line_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'الفئة' : 'Category'}</Label>
                <Input value={budgetForm.category} onChange={(e) => setBudgetForm((p) => ({ ...p, category: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المبلغ' : 'Amount'} *</Label>
                <Input type="number" value={budgetForm.amount} onChange={(e) => setBudgetForm((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>GL</Label>
              <Input value={budgetForm.gl_account} onChange={(e) => setBudgetForm((p) => ({ ...p, gl_account: e.target.value }))} placeholder={selectedProject?.main_gl_account || ''} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBudgetForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button disabled={!budgetForm.line_name || addBudget.isPending} onClick={() => addBudget.mutate(budgetForm)}>{isRTL ? 'إضافة' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCostForm} onOpenChange={setShowCostForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isRTL ? 'تسجيل تكلفة' : 'Record cost'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف' : 'Description'} *</Label>
              <Input value={costForm.description} onChange={(e) => setCostForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'المبلغ' : 'Amount'} *</Label>
                <Input type="number" value={costForm.amount} onChange={(e) => setCostForm((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'التاريخ' : 'Date'}</Label>
                <Input type="date" value={costForm.cost_date} onChange={(e) => setCostForm((p) => ({ ...p, cost_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>GL</Label>
                <Input value={costForm.gl_account} onChange={(e) => setCostForm((p) => ({ ...p, gl_account: e.target.value }))} placeholder={selectedProject?.main_gl_account || ''} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'المورد' : 'Vendor'}</Label>
                <Input value={costForm.vendor_name} onChange={(e) => setCostForm((p) => ({ ...p, vendor_name: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCostForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button disabled={!costForm.description || !costForm.amount || addCost.isPending} onClick={() => addCost.mutate(costForm)}>
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMilestoneForm} onOpenChange={setShowMilestoneForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isRTL ? 'معلم' : 'Milestone'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{isRTL ? 'العنوان' : 'Title'} *</Label>
              <Input value={milestoneForm.title} onChange={(e) => setMilestoneForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الاستحقاق' : 'Due date'}</Label>
              <Input type="date" value={milestoneForm.due_date} onChange={(e) => setMilestoneForm((p) => ({ ...p, due_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
              <Textarea rows={2} value={milestoneForm.description} onChange={(e) => setMilestoneForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMilestoneForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button disabled={!milestoneForm.title || addMilestone.isPending} onClick={() => addMilestone.mutate(milestoneForm)}>
              {isRTL ? 'إضافة' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
