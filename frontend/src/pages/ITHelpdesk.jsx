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
  Monitor, Ticket, Plus, Search, Server, Laptop, Printer, Wifi, Clock, Wrench, Eye, HardDrive
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function ITHelpdesk() {
  const { t: _t, isRTL } = useLanguage();
  const { selectedBranch: _selectedBranch, selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate: _getTenantIdForCreate } = useTenantFilter();
  
  const [activeTab, setActiveTab] = useState('tickets');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showNewAsset, setShowNewAsset] = useState(false);
  
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ['itTickets', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('service_tickets').select('*').match(tenantFilter(branchFilter({ ticket_type: 'it_helpdesk' }))).order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['itAssets', tenantId, selectedBranchId],
    queryFn: async () => {
      const { data = [], error } = await tenantQuery('it_assets').select('*').match(tenantFilter(branchFilter())).order('created_at', { ascending: false });
      if (error) throw error;
      return filterByBranch(data);
    },
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['employees', tenantId],
    queryFn: () => fetchData(tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  // Stats
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const inProgressTickets = tickets.filter(t => t.status === 'in_progress').length;
  const activeAssets = assets.filter(a => a.lifecycle_status === 'active').length;
  const assetsInRepair = assets.filter(a => a.lifecycle_status === 'in_repair').length;

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = !searchTerm || 
      ticket.ticket_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ticket.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredAssets = assets.filter(asset => {
    return !searchTerm || 
      asset.asset_tag?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.asset_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.serial_number?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const ticketColumns = [
    { key: 'ticket_number', label: isRTL ? 'رقم التذكرة' : 'Ticket #' },
    { key: 'subject', label: isRTL ? 'الموضوع' : 'Subject' },
    { key: 'requester_email', label: isRTL ? 'مقدم الطلب' : 'Requester' },
    { key: 'category', label: isRTL ? 'التصنيف' : 'Category', render: (_, row) => {
      const icons = { hardware: HardDrive, software: Monitor, network: Wifi, access: Server };
      const Icon = icons[row.category] || Monitor;
      return <Badge variant="outline"><Icon className="h-3 w-3 mr-1" />{row.category}</Badge>;
    }},
    { key: 'priority', label: isRTL ? 'الأولوية' : 'Priority', render: (_, row) => {
      const colors = { low: 'bg-gray-100', medium: 'bg-najdi-50', high: 'bg-orange-100', critical: 'bg-red-100' };
      return <Badge className={colors[row.priority]}>{row.priority}</Badge>;
    }},
    { key: 'status', label: isRTL ? 'الحالة' : 'Status', render: (_, row) => {
      const colors = { 
        open: 'bg-najdi-50 text-najdi-900', 
        in_progress: 'bg-yellow-100 text-yellow-800',
        resolved: 'bg-green-100 text-green-800',
        closed: 'bg-gray-100 text-gray-800'
      };
      return <Badge className={colors[row.status] || 'bg-gray-100'}>{row.status}</Badge>;
    }},
    { key: 'assigned_to', label: isRTL ? 'المسؤول' : 'Assigned To' },
    { key: 'created_at', label: isRTL ? 'التاريخ' : 'Date', render: (val) => val ? format(new Date(val), 'yyyy-MM-dd') : '-' },
    { key: 'actions', label: '', render: (_, row) => (
      <Link to={createPageUrl(`TicketDetails?id=${row.id}`)}>
        <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
      </Link>
    )}
  ];

  const assetColumns = [
    { key: 'asset_tag', label: isRTL ? 'رمز الأصل' : 'Asset Tag' },
    { key: 'asset_name', label: isRTL ? 'الاسم' : 'Name' },
    { key: 'asset_type', label: isRTL ? 'النوع' : 'Type', render: (_, row) => {
      const icons = { desktop: Monitor, laptop: Laptop, server: Server, printer: Printer, network_device: Wifi };
      const Icon = icons[row.asset_type] || Monitor;
      return <span className="flex items-center gap-1"><Icon className="h-4 w-4" />{row.asset_type}</span>;
    }},
    { key: 'serial_number', label: isRTL ? 'الرقم التسلسلي' : 'Serial #' },
    { key: 'assigned_to_name', label: isRTL ? 'المستخدم' : 'Assigned To' },
    { key: 'lifecycle_status', label: isRTL ? 'الحالة' : 'Status', render: (_, row) => {
      const colors = { active: 'bg-green-100', in_repair: 'bg-yellow-100', retired: 'bg-gray-100', disposed: 'bg-red-100' };
      return <Badge className={colors[row.lifecycle_status]}>{row.lifecycle_status}</Badge>;
    }},
    { key: 'warranty_expiry', label: isRTL ? 'انتهاء الضمان' : 'Warranty', render: (val) => val ? format(new Date(val), 'yyyy-MM-dd') : '-' }
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isRTL ? 'تذاكر مفتوحة' : 'Open Tickets'}
          value={openTickets}
          icon={Ticket}
          iconClassName="bg-najdi-50"
        />
        <StatCard
          title={isRTL ? 'قيد المعالجة' : 'In Progress'}
          value={inProgressTickets}
          icon={Clock}
          iconClassName="bg-yellow-50"
        />
        <StatCard
          title={isRTL ? 'الأجهزة النشطة' : 'Active Assets'}
          value={activeAssets}
          icon={Monitor}
          iconClassName="bg-green-50"
        />
        <StatCard
          title={isRTL ? 'قيد الصيانة' : 'In Repair'}
          value={assetsInRepair}
          icon={Wrench}
          iconClassName="bg-orange-50"
        />
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>{isRTL ? 'مكتب المساعدة التقني' : 'IT Helpdesk'}</CardTitle>
            <div className="flex gap-2">
              <ITTicketDialog 
                open={showNewTicket} 
                onOpenChange={setShowNewTicket}
                branches={branches}
                employees={employees}
                isRTL={isRTL}
              />
              <ITAssetDialog
                open={showNewAsset}
                onOpenChange={setShowNewAsset}
                branches={branches}
                employees={employees}
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
              <TabsTrigger value="assets">
                <Monitor className="h-4 w-4 mr-2" />
                {isRTL ? 'الأجهزة' : 'Assets'}
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

            <TabsContent value="assets">
              <DataTable
                columns={assetColumns}
                data={filteredAssets}
                isLoading={assetsLoading}
                emptyMessage={isRTL ? 'لا توجد أجهزة' : 'No assets found'}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function ITTicketDialog({ open, onOpenChange, branches, employees: _employees, isRTL }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    ticket_type: 'it_helpdesk',
    category: '',
    subject: '',
    description: '',
    priority: 'medium',
    branch_id: '',
    requester_email: ''
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const ticketNumber = `IT-${Date.now().toString().slice(-6)}`;
      return tenantQuery('service_tickets').insert({
        ...data,
        ticket_number: ticketNumber,
        sla_due_date: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itTickets'] });
      toast.success(isRTL ? 'تم إنشاء التذكرة' : 'Ticket created');
      onOpenChange(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />{isRTL ? 'تذكرة جديدة' : 'New Ticket'}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إنشاء تذكرة دعم تقني' : 'Create IT Support Ticket'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isRTL ? 'التصنيف' : 'Category'}</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hardware">{isRTL ? 'أجهزة' : 'Hardware'}</SelectItem>
                  <SelectItem value="software">{isRTL ? 'برامج' : 'Software'}</SelectItem>
                  <SelectItem value="network">{isRTL ? 'شبكات' : 'Network'}</SelectItem>
                  <SelectItem value="access">{isRTL ? 'صلاحيات' : 'Access'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{isRTL ? 'البريد الإلكتروني' : 'Requester Email'}</Label>
            <Input value={formData.requester_email} onChange={(e) => setFormData({ ...formData, requester_email: e.target.value })} />
          </div>
          <div>
            <Label>{isRTL ? 'الموضوع' : 'Subject'}</Label>
            <Input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} />
          </div>
          <div>
            <Label>{isRTL ? 'الوصف' : 'Description'}</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={4} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={!formData.branch_id || !formData.category || !formData.subject}>
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ITAssetDialog({ open, onOpenChange, branches, employees, isRTL }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    asset_tag: '',
    asset_name: '',
    asset_type: 'desktop',
    serial_number: '',
    branch_id: '',
    assigned_to: '',
    lifecycle_status: 'active'
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const emp = employees.find(e => e.id === data.assigned_to);
      return tenantQuery('it_assets').insert({
        ...data,
        assigned_to_name: emp ? (emp.name_ar || emp.name_en) : ''
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['itAssets'] });
      toast.success(isRTL ? 'تم إضافة الجهاز' : 'Asset added');
      onOpenChange(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline"><Monitor className="h-4 w-4 mr-2" />{isRTL ? 'جهاز جديد' : 'New Asset'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRTL ? 'إضافة جهاز جديد' : 'Add New IT Asset'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'رمز الأصل' : 'Asset Tag'}</Label>
              <Input value={formData.asset_tag} onChange={(e) => setFormData({ ...formData, asset_tag: e.target.value })} />
            </div>
            <div>
              <Label>{isRTL ? 'النوع' : 'Type'}</Label>
              <Select value={formData.asset_type} onValueChange={(v) => setFormData({ ...formData, asset_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desktop">{isRTL ? 'كمبيوتر مكتبي' : 'Desktop'}</SelectItem>
                  <SelectItem value="laptop">{isRTL ? 'لابتوب' : 'Laptop'}</SelectItem>
                  <SelectItem value="server">{isRTL ? 'سيرفر' : 'Server'}</SelectItem>
                  <SelectItem value="printer">{isRTL ? 'طابعة' : 'Printer'}</SelectItem>
                  <SelectItem value="network_device">{isRTL ? 'جهاز شبكة' : 'Network Device'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{isRTL ? 'اسم الجهاز' : 'Asset Name'}</Label>
            <Input value={formData.asset_name} onChange={(e) => setFormData({ ...formData, asset_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{isRTL ? 'الرقم التسلسلي' : 'Serial Number'}</Label>
              <Input value={formData.serial_number} onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })} />
            </div>
            <div>
              <Label>{isRTL ? 'الفرع' : 'Branch'}</Label>
              <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })}>
                <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{isRTL ? b.name_ar : b.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{isRTL ? 'المستخدم' : 'Assigned To'}</Label>
            <Select value={formData.assigned_to} onValueChange={(v) => setFormData({ ...formData, assigned_to: v })}>
              <SelectTrigger><SelectValue placeholder={isRTL ? 'اختر' : 'Select'} /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name_ar || e.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={() => createMutation.mutate(formData)} disabled={!formData.asset_tag || !formData.asset_name || !formData.branch_id}>
              {isRTL ? 'إضافة' : 'Add'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}