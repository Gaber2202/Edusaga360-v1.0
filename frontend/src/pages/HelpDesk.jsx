import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { Headphones, Plus, Search, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTenantFilter } from '../hooks/useTenantFilter';

/** Industry-default SLA hours (overridable per ticket). SCRUM-132 */
const SLA_DEFAULTS = { P1: 4, P2: 24, P3: 72 };

const REQUESTER_TYPES = [
  { value: 'staff', ar: 'موظف', en: 'Staff' },
  { value: 'parent', ar: 'ولي أمر', en: 'Parent' },
  { value: 'student', ar: 'طالب', en: 'Student' },
  { value: 'management', ar: 'إدارة', en: 'Management' },
];

const FALLBACK_DEPARTMENTS = [
  { value: 'IT', ar: 'تقنية المعلومات', en: 'IT' },
  { value: 'Facilities', ar: 'المرافق', en: 'Facilities' },
  { value: 'Finance', ar: 'المالية', en: 'Finance' },
  { value: 'HR', ar: 'الموارد البشرية', en: 'HR' },
  { value: 'Admissions', ar: 'القبول', en: 'Admissions' },
  { value: 'Academics', ar: 'الأكاديمية', en: 'Academics' },
  { value: 'Transport', ar: 'النقل', en: 'Transport' },
  { value: 'Clinic', ar: 'العيادة', en: 'Clinic' },
  { value: 'Library', ar: 'المكتبة', en: 'Library' },
  { value: 'Canteen', ar: 'المقصف', en: 'Canteen' },
  { value: 'Security', ar: 'الأمن', en: 'Security' },
  { value: 'Other', ar: 'أخرى', en: 'Other' },
];

const emptyForm = () => ({
  subject: '',
  description: '',
  department: '',
  department_id: '',
  requester_type: 'staff',
  requester_name: '',
  requester_email: '',
  priority: 'P2',
  sla_target_hours: SLA_DEFAULTS.P2,
  asset_id: '',
  routed_to: '',
  branch_id: '',
  status: 'open',
});

export default function HelpDesk() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const { selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['schoolHelpdeskTickets', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('service_tickets')
        .select('*')
        .match(tenantFilter(branchFilter({ ticket_type: 'school_helpdesk' })))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments', tenantId],
    queryFn: () => fetchData(tenantQuery('departments').select('*').match(tenantFilter()).order('name_en', { ascending: true })),
    enabled: hasTenantAccess,
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['fixed_assets_helpdesk', tenantId, selectedBranchId],
    queryFn: () => fetchData(tenantQuery('fixed_assets').select('id, asset_code, name_ar, name_en, name, category, status').match(tenantFilter(branchFilter({ status: 'active' }))).order('created_at', { ascending: false })),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees_helpdesk_route', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, name_ar, name_en, department_id, status').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const deptOptions = departments.length > 0
    ? departments.map((d) => ({
        value: d.name_en || d.name_ar || d.id,
        id: d.id,
        ar: d.name_ar || d.name_en,
        en: d.name_en || d.name_ar,
      }))
    : FALLBACK_DEPARTMENTS.map((d) => ({ ...d, id: '' }));

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgress = tickets.filter((t) => t.status === 'in_progress').length;
  const p1Count = tickets.filter((t) => t.priority === 'P1' && t.status !== 'closed' && t.status !== 'resolved').length;

  const filtered = tickets.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch = !search
      || t.ticket_number?.toLowerCase().includes(q)
      || t.subject?.toLowerCase().includes(q)
      || t.department?.toLowerCase().includes(q)
      || t.requester_name?.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const ticketNumber = `HD-${Date.now().toString().slice(-6)}`;
      const hours = Number(data.sla_target_hours) || SLA_DEFAULTS[data.priority] || 24;
      const assignee = employees.find((e) => e.id === data.routed_to);
      const payload = {
        ticket_type: 'school_helpdesk',
        ticket_number: ticketNumber,
        title: data.subject,
        subject: data.subject,
        description: data.description,
        category: data.department,
        department: data.department,
        department_id: data.department_id || null,
        requester_type: data.requester_type,
        requester_name: data.requester_name || null,
        requester_email: data.requester_email || null,
        priority: data.priority,
        sla_target_hours: hours,
        sla_due_date: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
        asset_id: data.asset_id || null,
        routed_to: data.routed_to || null,
        routed_to_name: assignee ? (assignee.name_ar || assignee.name_en) : null,
        assigned_to: data.routed_to || null,
        branch_id: data.branch_id || selectedBranchId || null,
        status: 'open',
      };
      return tenantQuery('service_tickets').insert(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schoolHelpdeskTickets'] });
      toast.success(isRTL ? 'تم إنشاء التذكرة' : 'Ticket created');
      setShowForm(false);
      setForm(emptyForm());
    },
    onError: (err) => {
      toast.error(err?.message || (isRTL ? 'فشل الإنشاء' : 'Create failed'));
    },
  });

  const columns = [
    { header: isRTL ? 'رقم التذكرة' : 'Ticket #', accessorKey: 'ticket_number' },
    { header: isRTL ? 'الموضوع' : 'Subject', accessorKey: 'subject', primary: true },
    {
      header: isRTL ? 'القسم' : 'Department',
      accessorKey: 'department',
      cell: (row) => <Badge variant="outline">{row.department || '-'}</Badge>,
    },
    {
      header: isRTL ? 'نوع مقدم الطلب' : 'Requester',
      accessorKey: 'requester_type',
      cell: (row) => {
        const rt = REQUESTER_TYPES.find((r) => r.value === row.requester_type);
        return (
          <span className="text-sm">
            {rt ? (isRTL ? rt.ar : rt.en) : row.requester_type || '-'}
            {row.requester_name ? ` · ${row.requester_name}` : ''}
          </span>
        );
      },
    },
    {
      header: isRTL ? 'الأولوية' : 'Priority',
      accessorKey: 'priority',
      cell: (row) => {
        const colors = { P1: 'bg-red-100 text-red-800', P2: 'bg-orange-100 text-orange-800', P3: 'bg-najdi-50 text-najdi-900' };
        return (
          <Badge className={colors[row.priority] || 'bg-gray-100'}>
            {row.priority || '-'} ({row.sla_target_hours ?? SLA_DEFAULTS[row.priority] ?? '-'}h)
          </Badge>
        );
      },
    },
    {
      header: isRTL ? 'التوجيه' : 'Routed To',
      accessorKey: 'routed_to_name',
      cell: (row) => row.routed_to_name || '—',
    },
    {
      header: isRTL ? 'الحالة' : 'Status',
      accessorKey: 'status',
      cell: (row) => {
        const colors = {
          open: 'bg-najdi-50 text-najdi-900',
          in_progress: 'bg-yellow-100 text-yellow-800',
          resolved: 'bg-green-100 text-green-800',
          closed: 'bg-gray-100 text-gray-800',
        };
        return <Badge className={colors[row.status] || 'bg-gray-100'}>{row.status}</Badge>;
      },
    },
    {
      header: isRTL ? 'التاريخ' : 'Date',
      accessorKey: 'created_at',
      cell: (row) => (row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd HH:mm') : '-'),
    },
    {
      header: '',
      accessorKey: 'actions',
      hideOnMobileCard: true,
      cell: (row) => (
        <Link to={createPageUrl(`TicketDetails?id=${row.id}`)}>
          <Button variant="ghost" size="sm">{isRTL ? 'عرض' : 'View'}</Button>
        </Link>
      ),
    },
  ];

  const setPriority = (priority) => {
    setForm((p) => ({
      ...p,
      priority,
      sla_target_hours: SLA_DEFAULTS[priority] ?? p.sla_target_hours,
    }));
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRTL ? 'مكتب المساعدة المدرسي' : 'School Help Desk'}
        subtitle={isRTL ? 'تذاكر تشغيلية عبر أقسام المدرسة مع SLA وتوجيه وربط الأصول' : 'School-ops tickets by department with SLA, routing, and fixed-asset linkage'}
        actionLabel={isRTL ? 'تذكرة جديدة' : 'New Ticket'}
        actionIcon={Plus}
        onAction={() => {
          setForm({ ...emptyForm(), branch_id: selectedBranchId || '' });
          setShowForm(true);
        }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'مفتوحة' : 'Open'} value={openCount} icon={Headphones} iconClassName="bg-najdi-50" />
        <StatCard title={isRTL ? 'قيد المعالجة' : 'In Progress'} value={inProgress} icon={Clock} iconClassName="bg-yellow-50" />
        <StatCard title={isRTL ? 'أولوية P1' : 'P1 Open'} value={p1Count} icon={AlertTriangle} iconClassName="bg-red-50" />
        <StatCard title={isRTL ? 'الإجمالي' : 'Total'} value={tickets.length} icon={CheckCircle} iconClassName="bg-green-50" />
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRTL ? 'بحث...' : 'Search...'}
              className={isRTL ? 'pr-10' : 'pl-10'}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
              <SelectItem value="open">{isRTL ? 'مفتوح' : 'Open'}</SelectItem>
              <SelectItem value="in_progress">{isRTL ? 'قيد المعالجة' : 'In Progress'}</SelectItem>
              <SelectItem value="resolved">{isRTL ? 'تم الحل' : 'Resolved'}</SelectItem>
              <SelectItem value="closed">{isRTL ? 'مغلق' : 'Closed'}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          loading={isLoading}
          emptyMessage={isRTL ? 'لا توجد تذاكر' : 'No tickets yet'}
        />
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'إنشاء تذكرة تشغيلية' : 'Create School Ops Ticket'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'القسم (التصنيف)' : 'Department (category)'} *</Label>
                <Select
                  value={form.department}
                  onValueChange={(v) => {
                    const d = deptOptions.find((x) => x.value === v);
                    setForm((p) => ({ ...p, department: v, department_id: d?.id || '' }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    {deptOptions.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{isRTL ? d.ar : d.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع مقدم الطلب' : 'Requester type'} *</Label>
                <Select value={form.requester_type} onValueChange={(v) => setForm((p) => ({ ...p, requester_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REQUESTER_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{isRTL ? r.ar : r.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'اسم مقدم الطلب' : 'Requester name'}</Label>
                <Input value={form.requester_name} onChange={(e) => setForm((p) => ({ ...p, requester_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'البريد' : 'Email'}</Label>
                <Input type="email" value={form.requester_email} onChange={(e) => setForm((p) => ({ ...p, requester_email: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'الموضوع' : 'Subject'} *</Label>
              <Input value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الأولوية' : 'Priority'}</Label>
                <Select value={form.priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P1">P1 — {SLA_DEFAULTS.P1}h</SelectItem>
                    <SelectItem value="P2">P2 — {SLA_DEFAULTS.P2}h</SelectItem>
                    <SelectItem value="P3">P3 — {SLA_DEFAULTS.P3}h</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'هدف SLA (ساعات)' : 'SLA target (hours)'}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.sla_target_hours}
                  onChange={(e) => setForm((p) => ({ ...p, sla_target_hours: parseInt(e.target.value, 10) || 1 }))}
                />
                <p className="text-xs text-muted-foreground">
                  {isRTL ? 'افتراضي قابل للتجاوز: P1=4، P2=24، P3=72' : 'Defaults (overridable): P1=4, P2=24, P3=72'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'أصل ثابت (اختياري)' : 'Fixed asset (optional)'}</Label>
              <Select value={form.asset_id || '__none'} onValueChange={(v) => setForm((p) => ({ ...p, asset_id: v === '__none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'بدون' : 'None'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{isRTL ? 'بدون' : 'None'}</SelectItem>
                  {assets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.asset_code ? `${a.asset_code} — ` : ''}{a.name_ar || a.name_en || a.name || a.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'التوجيه إلى' : 'Route to'}</Label>
                <Select value={form.routed_to || '__none'} onValueChange={(v) => setForm((p) => ({ ...p, routed_to: v === '__none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{isRTL ? 'غير معيّن' : 'Unassigned'}</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name_ar || e.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
                <Select value={form.branch_id || '__none'} onValueChange={(v) => setForm((p) => ({ ...p, branch_id: v === '__none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{isRTL ? '—' : '—'}</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button
              disabled={!form.department || !form.subject || !form.requester_type || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
