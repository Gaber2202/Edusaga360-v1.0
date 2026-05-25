import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import StatCard from '../components/ui/StatCard';
import { 
  Ticket, CheckCircle, Clock,
  TrendingUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function OperationsDashboard() {
  const { isRTL } = useLanguage();
  const { selectedBranch: _selectedBranch, selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [dateRange, setDateRange] = useState('30');

  const { data: crmTickets = [] } = useQuery({
    queryKey: ['crmTickets', tenantId, selectedBranchId],
    queryFn: async () => {
      const all = await tenantQuery('service_tickets').select('*').match(tenantFilter(branchFilter({ ticket_type: 'crm' })));
      return filterByBranch(all);
    },
    enabled: hasTenantAccess,
  });

  const { data: itTickets = [] } = useQuery({
    queryKey: ['itTickets', tenantId, selectedBranchId],
    queryFn: async () => {
      const all = await tenantQuery('service_tickets').select('*').match(tenantFilter(branchFilter({ ticket_type: 'it_helpdesk' })));
      return filterByBranch(all);
    },
    enabled: hasTenantAccess,
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ['workOrders', tenantId, selectedBranchId],
    queryFn: async () => {
      const all = await tenantQuery('work_orders').select('*').match(tenantFilter(branchFilter()));
      return filterByBranch(all);
    },
    enabled: hasTenantAccess,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers', tenantId, selectedBranchId],
    queryFn: async () => {
      const all = await tenantQuery('customers').select('*').match(tenantFilter(branchFilter()));
      return filterByBranch(all);
    },
    enabled: hasTenantAccess,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', tenantId],
    queryFn: () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ is_active: true }))),
    enabled: hasTenantAccess,
  });

  // Calculate metrics
  const allTickets = [...crmTickets, ...itTickets];
  const openTickets = allTickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const resolvedTickets = allTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  const slaBreached = allTickets.filter(t => t.sla_status === 'breached').length;
  const avgSatisfaction = allTickets.filter(t => t.satisfaction_rating).reduce((sum, t) => sum + t.satisfaction_rating, 0) / 
    (allTickets.filter(t => t.satisfaction_rating).length || 1);

  const openWorkOrders = workOrders.filter(w => w.status === 'pending' || w.status === 'in_progress').length;
  const completedWorkOrders = workOrders.filter(w => w.status === 'completed').length;
  const totalMaintenanceCost = workOrders.filter(w => w.status === 'completed').reduce((sum, w) => sum + (w.total_cost || 0), 0);

  // Chart data
  const ticketsByCategory = [
    { name: isRTL ? 'أكاديمي' : 'Academic', value: crmTickets.filter(t => t.category === 'academic').length, color: '#3B82F6' },
    { name: isRTL ? 'مالي' : 'Financial', value: crmTickets.filter(t => t.category === 'financial').length, color: '#10B981' },
    { name: isRTL ? 'نقل' : 'Transport', value: crmTickets.filter(t => t.category === 'transport').length, color: '#F59E0B' },
    { name: isRTL ? 'مرافق' : 'Facilities', value: crmTickets.filter(t => t.category === 'facilities').length, color: '#EF4444' },
    { name: isRTL ? 'تقنية' : 'IT', value: itTickets.length, color: '#8B5CF6' },
  ].filter(d => d.value > 0);

  const itTicketsByType = [
    { name: isRTL ? 'أجهزة' : 'Hardware', value: itTickets.filter(t => t.category === 'hardware').length },
    { name: isRTL ? 'برامج' : 'Software', value: itTickets.filter(t => t.category === 'software').length },
    { name: isRTL ? 'شبكات' : 'Network', value: itTickets.filter(t => t.category === 'network').length },
    { name: isRTL ? 'صلاحيات' : 'Access', value: itTickets.filter(t => t.category === 'access').length },
  ];

  const workOrdersByType = [
    { name: isRTL ? 'وقائية' : 'Preventive', value: workOrders.filter(w => w.work_order_type === 'preventive').length },
    { name: isRTL ? 'تصحيحية' : 'Corrective', value: workOrders.filter(w => w.work_order_type === 'corrective').length },
    { name: isRTL ? 'طارئة' : 'Emergency', value: workOrders.filter(w => w.work_order_type === 'emergency').length },
  ];

  const resolutionRate = allTickets.length > 0 ? Math.round((resolvedTickets / allTickets.length) * 100) : 0;
  const slaComplianceRate = allTickets.length > 0 ? Math.round(((allTickets.length - slaBreached) / allTickets.length) * 100) : 100;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isRTL ? 'لوحة العمليات' : 'Operations Dashboard'}</h1>
          <p className="text-gray-500">{isRTL ? 'نظرة شاملة على أداء الخدمات' : 'Service performance overview'}</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{isRTL ? 'آخر 7 أيام' : 'Last 7 days'}</SelectItem>
            <SelectItem value="30">{isRTL ? 'آخر 30 يوم' : 'Last 30 days'}</SelectItem>
            <SelectItem value="90">{isRTL ? 'آخر 90 يوم' : 'Last 90 days'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isRTL ? 'التذاكر المفتوحة' : 'Open Tickets'}
          value={openTickets}
          icon={Ticket}
          iconClassName="bg-blue-50"
        />
        <StatCard
          title={isRTL ? 'نسبة الحل' : 'Resolution Rate'}
          value={`${resolutionRate}%`}
          icon={CheckCircle}
          iconClassName="bg-green-50"
        />
        <StatCard
          title={isRTL ? 'الالتزام بـ SLA' : 'SLA Compliance'}
          value={`${slaComplianceRate}%`}
          icon={Clock}
          iconClassName="bg-purple-50"
        />
        <StatCard
          title={isRTL ? 'رضا العملاء' : 'Customer Satisfaction'}
          value={avgSatisfaction > 0 ? `${avgSatisfaction.toFixed(1)}/5` : 'N/A'}
          icon={TrendingUp}
          iconClassName="bg-yellow-50"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tickets by Category */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'التذاكر حسب الفئة' : 'Tickets by Category'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ticketsByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {ticketsByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* IT Tickets by Type */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'تذاكر IT حسب النوع' : 'IT Tickets by Type'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={itTicketsByType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Work Orders by Type */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'أوامر العمل حسب النوع' : 'Work Orders by Type'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workOrdersByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#10B981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Maintenance Stats */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'إحصائيات الصيانة' : 'Maintenance Stats'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">{isRTL ? 'أوامر مفتوحة' : 'Open Orders'}</span>
                <span className="font-medium">{openWorkOrders}</span>
              </div>
              <Progress value={workOrders.length > 0 ? (openWorkOrders / workOrders.length) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-500">{isRTL ? 'مكتملة' : 'Completed'}</span>
                <span className="font-medium">{completedWorkOrders}</span>
              </div>
              <Progress value={workOrders.length > 0 ? (completedWorkOrders / workOrders.length) * 100 : 0} className="h-2 bg-green-100" />
            </div>
            <div className="pt-4 border-t">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{isRTL ? 'إجمالي التكلفة' : 'Total Cost'}</span>
                <span className="font-bold text-lg">{totalMaintenanceCost.toLocaleString()} SAR</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Segments */}
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'شرائح العملاء' : 'Customer Segments'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { segment: 'active', label: isRTL ? 'نشط' : 'Active', color: 'bg-green-500' },
              { segment: 'prospect', label: isRTL ? 'محتمل' : 'Prospect', color: 'bg-blue-500' },
              { segment: 'vip', label: 'VIP', color: 'bg-purple-500' },
              { segment: 'withdrawn', label: isRTL ? 'منسحب' : 'Withdrawn', color: 'bg-red-500' },
            ].map(({ segment, label, color }) => {
              const count = customers.filter(c => c.segment === segment).length;
              const pct = customers.length > 0 ? (count / customers.length) * 100 : 0;
              return (
                <div key={segment}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm">{label}</span>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Branch Performance */}
      {branches.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{isRTL ? 'أداء الفروع' : 'Branch Performance'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-3 px-4">{isRTL ? 'الفرع' : 'Branch'}</th>
                    <th className="text-center py-3 px-4">{isRTL ? 'تذاكر CRM' : 'CRM Tickets'}</th>
                    <th className="text-center py-3 px-4">{isRTL ? 'تذاكر IT' : 'IT Tickets'}</th>
                    <th className="text-center py-3 px-4">{isRTL ? 'أوامر صيانة' : 'Work Orders'}</th>
                    <th className="text-center py-3 px-4">{isRTL ? 'نسبة الحل' : 'Resolution'}</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map(branch => {
                    const branchCrmTickets = crmTickets.filter(t => t.branch_id === branch.id);
                    const branchItTickets = itTickets.filter(t => t.branch_id === branch.id);
                    const branchWOs = workOrders.filter(w => w.branch_id === branch.id);
                    const branchAllTickets = [...branchCrmTickets, ...branchItTickets];
                    const branchResolved = branchAllTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
                    const branchResRate = branchAllTickets.length > 0 ? Math.round((branchResolved / branchAllTickets.length) * 100) : 0;
                    
                    return (
                      <tr key={branch.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 font-medium">{isRTL ? branch.name_ar : branch.name_en}</td>
                        <td className="text-center py-3 px-4">{branchCrmTickets.length}</td>
                        <td className="text-center py-3 px-4">{branchItTickets.length}</td>
                        <td className="text-center py-3 px-4">{branchWOs.length}</td>
                        <td className="text-center py-3 px-4">
                          <Badge className={branchResRate >= 80 ? 'bg-green-100' : branchResRate >= 50 ? 'bg-yellow-100' : 'bg-red-100'}>
                            {branchResRate}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}