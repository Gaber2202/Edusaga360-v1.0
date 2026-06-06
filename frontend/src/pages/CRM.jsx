import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
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
  AlertCircle, CheckCircle, Clock, User, Eye
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function CRM() {
  const { t: _t, isRTL } = useLanguage();
  const { selectedBranch: _selectedBranch, selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  
  const [activeTab, setActiveTab] = useState('tickets');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ['serviceTickets', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('service_tickets').select('*').match(tenantFilter(branchFilter({ ticket_type: 'crm' }))).order('created_date', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('customers').select('*').match(tenantFilter(branchFilter())).order('created_date', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  // Stats
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const inProgressTickets = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedToday = tickets.filter(t => 
    t.status === 'resolved' && 
    t.resolution_date && 
    format(new Date(t.resolution_date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
  ).length;
  const slaBreached = tickets.filter(t => t.sla_status === 'breached').length;

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = !searchTerm || 
      ticket.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
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
      <Badge variant="outline">{row.category}</Badge>
    )},
    { key: 'priority', label: isRTL ? 'الأولوية' : 'Priority', render: (_, row) => {
      const colors = { low: 'bg-gray-100', medium: 'bg-blue-100', high: 'bg-orange-100', critical: 'bg-red-100' };
      return <Badge className={colors[row.priority]}>{row.priority}</Badge>;
    }},
    { key: 'status', label: isRTL ? 'الحالة' : 'Status', render: (_, row) => {
      const colors = { 
        open: 'bg-blue-100 text-blue-800', 
        in_progress: 'bg-yellow-100 text-yellow-800',
        waiting: 'bg-purple-100 text-purple-800',
        resolved: 'bg-green-100 text-green-800',
        closed: 'bg-gray-100 text-gray-800'
      };
      return <Badge className={colors[row.status] || 'bg-gray-100'}>{row.status}</Badge>;
    }},
    { key: 'sla_status', label: 'SLA', render: (_, row) => {
      const colors = { on_track: 'text-green-600', at_risk: 'text-yellow-600', breached: 'text-red-600' };
      return <span className={colors[row.sla_status]}>{row.sla_status}</span>;
    }},
    { key: 'created_date', label: isRTL ? 'التاريخ' : 'Date', render: (val) => val ? format(new Date(val), 'yyyy-MM-dd') : '-' },
    { key: 'actions', label: '', render: (_, row) => (
      <Link to={createPageUrl(`TicketDetails?id=${row.id}`)}>
        <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
      </Link>
    )}
  ];

  const customerColumns = [
    { key: 'customer_number', label: isRTL ? 'رقم العميل' : 'Customer #' },
    { key: 'name_ar', label: isRTL ? 'الاسم' : 'Name' },
    { key: 'phone', label: isRTL ? 'الهاتف' : 'Phone' },
    { key: 'email', label: isRTL ? 'البريد' : 'Email' },
    { key: 'segment', label: isRTL ? 'التصنيف' : 'Segment', render: (_, row) => {
      const colors = { prospect: 'bg-blue-100', active: 'bg-green-100', vip: 'bg-purple-100', withdrawn: 'bg-red-100' };
      return <Badge className={colors[row.segment] || 'bg-gray-100'}>{row.segment}</Badge>;
    }},
    { key: 'total_interactions', label: isRTL ? 'التفاعلات' : 'Interactions' },
    { key: 'actions', label: '', render: (_, row) => (
      <Link to={createPageUrl(`CustomerDetails?id=${row.id}`)}>
        <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
      </Link>
    )}
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isRTL ? 'تذاكر مفتوحة' : 'Open Tickets'}
          value={openTickets}
          icon={Ticket}
          iconClassName="bg-blue-50"
        />
        <StatCard
          title={isRTL ? 'قيد المعالجة' : 'In Progress'}
          value={inProgressTickets}
          icon={Clock}
          iconClassName="bg-yellow-50"
        />
        <StatCard
          title={isRTL ? 'تم الحل اليوم' : 'Resolved Today'}
          value={resolvedToday}
          icon={CheckCircle}
          iconClassName="bg-green-50"
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
              <TabsTrigger value="tickets">
                <Ticket className="h-4 w-4 mr-2" />
                {isRTL ? 'التذاكر' : 'Tickets'}
              </TabsTrigger>
              <TabsTrigger value="customers">
                <Users className="h-4 w-4 mr-2" />
                {isRTL ? 'العملاء' : 'Customers'}
              </TabsTrigger>
            </TabsList>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={isRTL ? 'بحث...' : 'Search...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
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
    segment: 'active',
    branch_id: ''
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const customerNumber = `CUS-${Date.now().toString().slice(-6)}`;
      return tenantQuery('customers').insert({ ...data, customer_number: customerNumber });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isRTL ? 'تم إنشاء العميل' : 'Customer created');
      onOpenChange(false);
      setFormData({ customer_type: 'parent', name_ar: '', name_en: '', phone: '', email: '', segment: 'active', branch_id: '' });
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