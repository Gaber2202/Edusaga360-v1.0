import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, supabase } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import { 
  Users, Ticket, Plus, Search,
  AlertCircle, CheckCircle, Clock, User, Eye, Kanban, ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTenantFilter } from '../hooks/useTenantFilter';
import {
  ticketStatusLabel, priorityLabel, slaLabel, segmentLabel, crmCategoryLabel,
  pipelineStageLabel, pipelineStageBadge, crmActivityLabel, CRM_PIPELINE_STAGES,
} from '../lib/crmLabels';

async function logCrmActivity({ customerId, activityType, subject, body, fromStage, toStage, admissionsApplicationId }) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await tenantQuery('crm_activities').insert({
    customer_id: customerId,
    activity_type: activityType,
    subject: subject || null,
    body: body || null,
    from_stage: fromStage || null,
    to_stage: toStage || null,
    admissions_application_id: admissionsApplicationId || null,
    created_by: auth?.user?.id ?? null,
    created_by_name: auth?.user?.email ?? null,
  });
  if (error) console.warn('CRM activity log skipped:', error);
}

/**
 * Qualify a CRM lead: create/link an Admissions Inquiry application and move to Qualified.
 * Mirrors ApplicationForm inquiry insert pattern (status + pipeline_stage = inquiry).
 */
async function qualifyCustomer(customer) {
  const stage = customer.pipeline_stage || 'lead';
  if (stage === 'qualified' && customer.admissions_application_id) {
    return { applicationId: customer.admissions_application_id, created: false };
  }

  let applicationId = customer.admissions_application_id || null;
  let created = false;

  if (!applicationId) {
    const appNumber = `APP-CRM-${Date.now().toString().slice(-6)}`;
    const displayName = customer.name_en || customer.name_ar || 'Prospect';
    const { data: createdApp, error: insertError } = await tenantQuery('applications').insert({
      student_name_ar: customer.name_ar || displayName,
      student_name_en: customer.name_en || displayName,
      guardian_name_ar: customer.name_ar || displayName,
      guardian_name_en: customer.name_en || displayName,
      guardian_relationship: 'guardian',
      guardian_phone: customer.phone || null,
      guardian_whatsapp: customer.phone || null,
      guardian_email: customer.email || null,
      branch_id: customer.branch_id || null,
      application_number: appNumber,
      status: 'inquiry',
      pipeline_stage: 'inquiry',
      source: 'crm',
      notes: `Created from CRM customer ${customer.customer_number || customer.id}`,
    }).select('id').single();
    if (insertError) throw insertError;
    applicationId = createdApp?.id;
    created = true;

    if (applicationId) {
      const { data: auth } = await supabase.auth.getUser();
      try {
        await tenantQuery('application_stage_history').insert({
          application_id: applicationId,
          from_status: null,
          to_status: 'inquiry',
          note: 'CRM Lead qualified → Admissions Inquiry',
          changed_by: auth?.user?.id ?? null,
          changed_by_name: auth?.user?.email ?? null,
        });
      } catch (histErr) {
        console.warn('Stage history seed skipped:', histErr);
      }
    }
  }

  const { error: updateError } = await tenantQuery('customers').update({
    pipeline_stage: 'qualified',
    admissions_application_id: applicationId,
    segment: customer.segment === 'prospect' ? 'active' : customer.segment,
    total_interactions: (customer.total_interactions || 0) + 1,
  }).eq('id', customer.id);
  if (updateError) throw updateError;

  await logCrmActivity({
    customerId: customer.id,
    activityType: 'qualified',
    subject: 'Lead → Qualified',
    body: created
      ? `Created Admissions Inquiry ${applicationId}`
      : `Linked existing Admissions application ${applicationId}`,
    fromStage: stage,
    toStage: 'qualified',
    admissionsApplicationId: applicationId,
  });

  if (created && applicationId) {
    await logCrmActivity({
      customerId: customer.id,
      activityType: 'application_linked',
      subject: 'Admissions Inquiry created',
      body: applicationId,
      admissionsApplicationId: applicationId,
    });
  }

  return { applicationId, created };
}

export default function CRM() {
  const { t: _t, isRTL } = useLanguage();
  const { selectedBranch: _selectedBranch, selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('pipeline');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [qualifyingId, setQualifyingId] = useState(null);
  const [activityCustomerId, setActivityCustomerId] = useState(null);
  
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ['serviceTickets', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('service_tickets').select('*').match(tenantFilter(branchFilter({ category: 'crm' }))).order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['customers', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('customers').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    initialData: [],
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: activities = [] } = useQuery({
    enabled: hasTenantAccess && !!activityCustomerId,
    queryKey: ['crmActivities', tenantId, activityCustomerId],
    queryFn: () => fetchData(
      tenantQuery('crm_activities')
        .select('*')
        .match(tenantFilter({ customer_id: activityCustomerId }))
        .order('created_at', { ascending: false })
        .limit(20),
    ),
    initialData: [],
  });

  const qualifyMutation = useMutation({
    mutationFn: qualifyCustomer,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['crmActivities'] });
      toast.success(
        isRTL
          ? (result.created ? 'تم التأهيل وإنشاء طلب قبول (استفسار)' : 'تم التأهيل وربط طلب القبول')
          : (result.created ? 'Qualified — Admissions Inquiry created' : 'Qualified — Admissions application linked'),
      );
      setQualifyingId(null);
    },
    onError: (err) => {
      console.error(err);
      toast.error(isRTL ? 'فشل التأهيل' : 'Qualify failed');
      setQualifyingId(null);
    },
  });

  // Stats
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const slaBreached = tickets.filter(t => t.sla_status === 'breached').length;
  const leadCount = customers.filter(c => (c.pipeline_stage || 'lead') === 'lead').length;
  const qualifiedCount = customers.filter(c => c.pipeline_stage === 'qualified').length;

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = !searchTerm || 
      ticket.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    return matchesStatus && matchesSearch;
  });

  const filteredCustomers = customers.filter(customer => {
    return !searchTerm || 
      customer.name_ar?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.name_en?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone?.includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const ticketColumns = [
    { key: 'ticket_number', label: isRTL ? 'رقم التذكرة' : 'Ticket #' },
    { key: 'subject', label: isRTL ? 'الموضوع' : 'Subject' },
    { key: 'customer_name', label: isRTL ? 'العميل' : 'Customer' },
    { key: 'category', label: isRTL ? 'التصنيف' : 'Category', render: (_, row) => (
      <Badge variant="outline">{crmCategoryLabel(row.category, isRTL)}</Badge>
    )},
    { key: 'priority', label: isRTL ? 'الأولوية' : 'Priority', render: (_, row) => {
      const colors = { low: 'bg-gray-100', medium: 'bg-najdi-50', high: 'bg-orange-100', critical: 'bg-red-100' };
      return <Badge className={colors[row.priority]}>{priorityLabel(row.priority, isRTL)}</Badge>;
    }},
    { key: 'status', label: isRTL ? 'الحالة' : 'Status', render: (_, row) => {
      const colors = {
        open: 'bg-najdi-50 text-najdi-900',
        in_progress: 'bg-yellow-100 text-yellow-800',
        waiting: 'bg-purple-100 text-purple-800',
        resolved: 'bg-green-100 text-green-800',
        closed: 'bg-gray-100 text-gray-800'
      };
      return <Badge className={colors[row.status] || 'bg-gray-100'}>{ticketStatusLabel(row.status, isRTL)}</Badge>;
    }},
    { key: 'sla_status', label: 'SLA', render: (_, row) => {
      const colors = { on_track: 'text-green-600', at_risk: 'text-yellow-600', breached: 'text-red-600' };
      return <span className={colors[row.sla_status]}>{slaLabel(row.sla_status, isRTL)}</span>;
    }},
    { key: 'created_at', label: isRTL ? 'التاريخ' : 'Date', render: (val) => val ? format(new Date(val), 'yyyy-MM-dd') : '-' },
    { key: 'actions', label: '', render: (_, row) => (
      <Link to={createPageUrl(`TicketDetails?id=${row.id}`)}>
        <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
      </Link>
    )}
  ];

  const customerColumns = [
    { key: 'customer_number', label: isRTL ? 'رقم العميل' : 'Customer #' },
    { key: 'name_ar', label: isRTL ? 'الاسم' : 'Name', render: (_, row) => (isRTL ? (row.name_ar || row.name_en) : (row.name_en || row.name_ar)) || '-' },
    { key: 'phone', label: isRTL ? 'الهاتف' : 'Phone' },
    { key: 'email', label: isRTL ? 'البريد' : 'Email' },
    { key: 'pipeline_stage', label: isRTL ? 'المرحلة' : 'Stage', render: (_, row) => (
      <Badge className={pipelineStageBadge(row.pipeline_stage)}>
        {pipelineStageLabel(row.pipeline_stage || 'lead', isRTL)}
      </Badge>
    )},
    { key: 'segment', label: isRTL ? 'التصنيف' : 'Segment', render: (_, row) => {
      const colors = { prospect: 'bg-najdi-50', active: 'bg-green-100', vip: 'bg-purple-100', withdrawn: 'bg-red-100' };
      return <Badge className={colors[row.segment] || 'bg-gray-100'}>{segmentLabel(row.segment, isRTL)}</Badge>;
    }},
    { key: 'total_interactions', label: isRTL ? 'التفاعلات' : 'Interactions' },
    { key: 'actions', label: '', render: (_, row) => {
      const isLead = (row.pipeline_stage || 'lead') === 'lead';
      return (
        <div className="flex items-center gap-1">
          {isLead && (
            <Button
              size="sm"
              variant="outline"
              disabled={qualifyingId === row.id}
              onClick={() => {
                setQualifyingId(row.id);
                qualifyMutation.mutate(row);
              }}
            >
              {isRTL ? 'تأهيل' : 'Qualify'}
              <ArrowRight className="h-3 w-3 ms-1" />
            </Button>
          )}
          {row.admissions_application_id && (
            <Link to={createPageUrl(`ApplicationDetails?id=${row.admissions_application_id}`)}>
              <Button variant="ghost" size="sm" title={isRTL ? 'طلب القبول' : 'Admissions'}>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={() => setActivityCustomerId(row.id)}>
            <Clock className="h-4 w-4" />
          </Button>
          <Link to={createPageUrl(`CustomerDetails?id=${row.id}`)}>
            <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
          </Link>
        </div>
      );
    }}
  ];

  const renderPipelineCard = (customer) => {
    const isLead = (customer.pipeline_stage || 'lead') === 'lead';
    const name = (isRTL ? (customer.name_ar || customer.name_en) : (customer.name_en || customer.name_ar)) || '-';
    return (
      <Card key={customer.id} className="p-3 space-y-2 shadow-none border">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium">{name}</div>
            <div className="text-xs text-muted-foreground">{customer.customer_number || customer.phone || '—'}</div>
          </div>
          <Badge className={pipelineStageBadge(customer.pipeline_stage)}>
            {pipelineStageLabel(customer.pipeline_stage || 'lead', isRTL)}
          </Badge>
        </div>
        {customer.email && <div className="text-xs text-muted-foreground truncate">{customer.email}</div>}
        <div className="flex flex-wrap gap-1 pt-1">
          {isLead && (
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={qualifyingId === customer.id}
              onClick={() => {
                setQualifyingId(customer.id);
                qualifyMutation.mutate(customer);
              }}
            >
              {isRTL ? 'نقل إلى مؤهّل' : 'Move to Qualified'}
            </Button>
          )}
          {customer.admissions_application_id && (
            <Link to={createPageUrl(`ApplicationDetails?id=${customer.admissions_application_id}`)}>
              <Button size="sm" variant="outline" className="h-7 text-xs">
                {isRTL ? 'طلب القبول' : 'Admissions'}
              </Button>
            </Link>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setActivityCustomerId(customer.id)}>
            {isRTL ? 'النشاط' : 'Activity'}
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isRTL ? 'عملاء محتملون' : 'Leads'}
          value={leadCount}
          icon={Kanban}
          iconClassName="bg-najdi-50"
        />
        <StatCard
          title={isRTL ? 'مؤهّلون' : 'Qualified'}
          value={qualifiedCount}
          icon={CheckCircle}
          iconClassName="bg-green-50"
        />
        <StatCard
          title={isRTL ? 'تذاكر مفتوحة' : 'Open Tickets'}
          value={openTickets}
          icon={Ticket}
          iconClassName="bg-najdi-50"
        />
        <StatCard
          title={isRTL ? 'تجاوز SLA' : 'SLA Breached'}
          value={slaBreached}
          icon={AlertCircle}
          iconClassName="bg-red-50"
        />
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>{isRTL ? 'إدارة علاقات العملاء' : 'Customer Relationship Management'}</CardTitle>
            <div className="flex gap-2">
              <NewTicketDialog 
                open={showNewTicket} 
                onOpenChange={setShowNewTicket}
                branches={branches}
                customers={customers}
                isRTL={isRTL}
              />
              <NewCustomerDialog
                open={showNewCustomer}
                onOpenChange={setShowNewCustomer}
                branches={branches}
                isRTL={isRTL}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="pipeline">
                <Kanban className="h-4 w-4 me-2" />
                {isRTL ? 'خط المبيعات' : 'Pipeline'}
              </TabsTrigger>
              <TabsTrigger value="customers">
                <Users className="h-4 w-4 me-2" />
                {isRTL ? 'العملاء' : 'Customers'}
              </TabsTrigger>
              <TabsTrigger value="tickets">
                <Ticket className="h-4 w-4 me-2" />
                {isRTL ? 'التذاكر' : 'Tickets'}
              </TabsTrigger>
            </TabsList>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={isRTL ? 'بحث...' : 'Search...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ps-10"
                />
              </div>
              {activeTab === 'tickets' && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isRTL ? 'الكل' : 'All'}</SelectItem>
                    <SelectItem value="open">{isRTL ? 'مفتوح' : 'Open'}</SelectItem>
                    <SelectItem value="in_progress">{isRTL ? 'قيد المعالجة' : 'In Progress'}</SelectItem>
                    <SelectItem value="waiting">{isRTL ? 'بانتظار الرد' : 'Waiting'}</SelectItem>
                    <SelectItem value="resolved">{isRTL ? 'تم الحل' : 'Resolved'}</SelectItem>
                    <SelectItem value="closed">{isRTL ? 'مغلق' : 'Closed'}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <TabsContent value="pipeline">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CRM_PIPELINE_STAGES.map((stage) => {
                  const stageCustomers = filteredCustomers.filter(
                    (c) => (c.pipeline_stage || 'lead') === stage.key,
                  );
                  return (
                    <div key={stage.key} className="rounded-lg border bg-sand/40 p-3 space-y-3 min-h-[200px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={stage.badge}>{isRTL ? stage.ar : stage.en}</Badge>
                          <span className="text-xs text-muted-foreground">{stageCustomers.length}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {customersLoading && (
                          <p className="text-sm text-muted-foreground text-center py-6">…</p>
                        )}
                        {!customersLoading && stageCustomers.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            {isRTL ? 'لا عملاء في هذه المرحلة' : 'No customers in this stage'}
                          </p>
                        )}
                        {stageCustomers.map(renderPipelineCard)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="tickets">
              <DataTable
                columns={ticketColumns}
                data={filteredTickets}
                isLoading={ticketsLoading}
                emptyMessage={isRTL ? 'لا توجد تذاكر' : 'No tickets found'}
              />
            </TabsContent>

            <TabsContent value="customers">
              <DataTable
                columns={customerColumns}
                data={filteredCustomers}
                isLoading={customersLoading}
                emptyMessage={isRTL ? 'لا يوجد عملاء' : 'No customers found'}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!activityCustomerId} onOpenChange={(open) => !open && setActivityCustomerId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isRTL ? 'أنشطة العميل' : 'Customer Activities'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[360px] overflow-y-auto">
            {activities.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {isRTL ? 'لا أنشطة بعد' : 'No activities yet'}
              </p>
            )}
            {activities.map((a) => (
              <div key={a.id} className="border rounded p-3 text-sm space-y-1">
                <div className="flex justify-between gap-2">
                  <Badge variant="outline">{crmActivityLabel(a.activity_type, isRTL)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {a.created_at ? format(new Date(a.created_at), 'yyyy-MM-dd HH:mm') : ''}
                  </span>
                </div>
                {a.subject && <div className="font-medium">{a.subject}</div>}
                {a.body && <div className="text-xs text-muted-foreground">{a.body}</div>}
                {(a.from_stage || a.to_stage) && (
                  <div className="text-xs text-muted-foreground">
                    {pipelineStageLabel(a.from_stage, isRTL)} → {pipelineStageLabel(a.to_stage, isRTL)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewTicketDialog({ open, onOpenChange, branches, customers, isRTL }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    ticket_type: 'crm',
    category: '',
    subject: '',
    description: '',
    priority: 'medium',
    customer_id: '',
    branch_id: '',
    source: 'portal'
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const ticketNumber = `CRM-${Date.now().toString().slice(-6)}`;
      const customer = customers.find(c => c.id === data.customer_id);
      return tenantQuery('service_tickets').insert({
        ...data,
        ticket_number: ticketNumber,
        customer_name: customer?.name_ar || '',
        sla_due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serviceTickets'] });
      toast.success(isRTL ? 'تم إنشاء التذكرة' : 'Ticket created');
      onOpenChange(false);
      setFormData({
        ticket_type: 'crm', category: '', subject: '', description: '',
        priority: 'medium', customer_id: '', branch_id: '', source: 'portal'
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />{isRTL ? 'تذكرة جديدة' : 'New Ticket'}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إنشاء تذكرة جديدة' : 'Create New Ticket'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الفرع' : 'Select Branch'} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'العميل' : 'Customer'}</Label>
              <Select value={formData.customer_id} onValueChange={(v) => setFormData({ ...formData, customer_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر العميل' : 'Select Customer'} /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'التصنيف' : 'Category'}</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر التصنيف' : 'Select Category'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="academic">{isRTL ? 'أكاديمي' : 'Academic'}</SelectItem>
                  <SelectItem value="financial">{isRTL ? 'مالي' : 'Financial'}</SelectItem>
                  <SelectItem value="transport">{isRTL ? 'نقل' : 'Transport'}</SelectItem>
                  <SelectItem value="facilities">{isRTL ? 'مرافق' : 'Facilities'}</SelectItem>
                  <SelectItem value="it_portal">{isRTL ? 'بوابة/تقنية' : 'IT/Portal'}</SelectItem>
                  <SelectItem value="other">{isRTL ? 'أخرى' : 'Other'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'الأولوية' : 'Priority'}</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{isRTL ? 'منخفضة' : 'Low'}</SelectItem>
                  <SelectItem value="medium">{isRTL ? 'متوسطة' : 'Medium'}</SelectItem>
                  <SelectItem value="high">{isRTL ? 'عالية' : 'High'}</SelectItem>
                  <SelectItem value="critical">{isRTL ? 'حرجة' : 'Critical'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{isRTL ? 'الموضوع' : 'Subject'}</Label>
            <Input 
              value={formData.subject} 
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            />
          </div>
          <div>
            <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
            <Textarea 
              value={formData.description} 
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button 
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.branch_id || !formData.category || !formData.subject}
            >
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewCustomerDialog({ open, onOpenChange, branches, isRTL }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    customer_type: 'parent',
    name_ar: '',
    name_en: '',
    phone: '',
    email: '',
    segment: 'prospect',
    pipeline_stage: 'lead',
    branch_id: ''
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const customerNumber = `CUS-${Date.now().toString().slice(-6)}`;
      const { data: created, error } = await tenantQuery('customers')
        .insert({
          ...data,
          customer_number: customerNumber,
          pipeline_stage: 'lead',
          total_interactions: 0,
        })
        .select('id')
        .single();
      if (error) throw error;
      if (created?.id) {
        await logCrmActivity({
          customerId: created.id,
          activityType: 'created',
          subject: 'Customer created',
          toStage: 'lead',
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isRTL ? 'تم إنشاء العميل' : 'Customer created');
      onOpenChange(false);
      setFormData({
        customer_type: 'parent', name_ar: '', name_en: '', phone: '', email: '',
        segment: 'prospect', pipeline_stage: 'lead', branch_id: '',
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline"><User className="h-4 w-4 mr-2" />{isRTL ? 'عميل جديد' : 'New Customer'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إضافة عميل جديد' : 'Add New Customer'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الاسم بالعربي' : 'Name (Arabic)'}</Label>
              <Input value={formData.name_ar} onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })} />
            </div>
            <div>
              <Label>{isRTL ? 'الاسم بالإنجليزي' : 'Name (English)'}</Label>
              <Input value={formData.name_en} onChange={(e) => setFormData({ ...formData, name_en: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الهاتف' : 'Phone'}</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            </div>
            <div>
              <Label>{isRTL ? 'البريد' : 'Email'}</Label>
              <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر الفرع' : 'Select Branch'} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'التصنيف' : 'Segment'}</Label>
              <Select value={formData.segment} onValueChange={(v) => setFormData({ ...formData, segment: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">{isRTL ? 'محتمل' : 'Prospect'}</SelectItem>
                  <SelectItem value="active">{isRTL ? 'نشط' : 'Active'}</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {isRTL ? 'المرحلة الابتدائية: عميل محتمل (Lead)' : 'Starts at pipeline stage: Lead'}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={!formData.name_ar || !formData.phone}>
              {isRTL ? 'إضافة' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
