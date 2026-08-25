import React, { useState } from 'react';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import Currency from '../components/Currency';
import { useBranch } from '../components/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import StatCard from '../components/ui/StatCard';
import PageHeader from '../components/ui/PageHeader';
import { 
  Ticket, CheckCircle, Clock,
  TrendingUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { filterByDateRange } from '../lib/dateRange';

export default function OperationsDashboard() {
  const { isRTL } = useLanguage();
  const { selectedBranch: _selectedBranch, selectedBranchId, filterByBranch, branchFilter } = useBranch();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const [dateRange, setDateRange] = useState('30');

  const { data: crmTickets = [] } = useTenantQuery(
    ['crmTickets', tenantId, selectedBranchId],
    async () => {
      const { data = [], error } = await tenantQuery('service_tickets').select('*').match(tenantFilter(branchFilter({ category: 'crm' })));
      if (error) throw error;
      return filterByBranch(data);
    },
    { enabled: hasTenantAccess }
  );

  const { data: itTickets = [] } = useTenantQuery(
    ['itTickets', tenantId, selectedBranchId],
    async () => {
      const { data = [], error } = await tenantQuery('service_tickets').select('*').match(tenantFilter(branchFilter({ category: 'it_helpdesk' })));
      if (error) throw error;
      return filterByBranch(data);
    },
    { enabled: hasTenantAccess }
  );

  const { data: workOrders = [] } = useTenantQuery(
    ['workOrders', tenantId, selectedBranchId],
    async () => {
      const { data = [], error } = await tenantQuery('work_orders').select('*').match(tenantFilter(branchFilter()));
      if (error) throw error;
      return filterByBranch(data);
    },
    { enabled: false /* work_orders table not built */, initialData: [] }
  );

  const { data: customers = [] } = useTenantQuery(
    ['customers', tenantId, selectedBranchId],
    async () => {
      const { data = [], error } = await tenantQuery('customers').select('*').match(tenantFilter(branchFilter()));
      if (error) throw error;
      return filterByBranch(data);
    },
    { enabled: hasTenantAccess }
  );

  const { data: helpdeskTickets = [] } = useTenantQuery(
    ['schoolHelpdesk', tenantId, selectedBranchId],
    async () => {
      const { data = [], error } = await tenantQuery('service_tickets').select('*').match(
        tenantFilter(branchFilter({ ticket_type: 'school_helpdesk' })),
      );
      if (error) throw error;
      return filterByBranch(data);
    },
    { enabled: hasTenantAccess }
  );

  const { data: branches = [] } = useTenantQuery(
    ['branches', tenantId],
    () => fetchData(tenantQuery('branches').select('*').match(tenantFilter({ status: 'active' }))),
    { enabled: hasTenantAccess }
  );

  // Apply the selected reporting window — the date range now actually scopes
  // every metric and chart below (previously the selector did nothing).
  const rangeDays = parseInt(dateRange, 10) || 30;
  const crm = filterByDateRange(crmTickets, rangeDays);
  const it = filterByDateRange(itTickets, rangeDays);
  const help = filterByDateRange(helpdeskTickets, rangeDays);
  const wos = filterByDateRange(workOrders, rangeDays);

  // Calculate metrics
  const allTickets = [...crm, ...it, ...help];
  const openTickets = allTickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const resolvedTickets = allTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
  const slaBreached = allTickets.filter(t => t.sla_status === 'breached').length;
  const avgSatisfaction = allTickets.filter(t => t.satisfaction_rating).reduce((sum, t) => sum + t.satisfaction_rating, 0) /
    (allTickets.filter(t => t.satisfaction_rating).length || 1);

  const openWorkOrders = wos.filter(w => w.status === 'pending' || w.status === 'in_progress').length;
  const completedWorkOrders = wos.filter(w => w.status === 'completed').length;
  const totalMaintenanceCost = wos.filter(w => w.status === 'completed').reduce((sum, w) => sum + (w.total_cost || 0), 0);

  // Chart data
  const ticketsByCategory = [
    { name: isRTL ? 'أكاديمي' : 'Academic', value: crm.filter(t => t.category === 'academic').length, color: '#0F766E' },
    { name: isRTL ? 'مالي' : 'Financial', value: crm.filter(t => t.category === 'financial').length, color: '#059669' },
    { name: isRTL ? 'نقل' : 'Transport', value: crm.filter(t => t.category === 'transport').length, color: '#D97706' },
    { name: isRTL ? 'مرافق' : 'Facilities', value: crm.filter(t => t.category === 'facilities').length, color: '#B45309' },
    { name: isRTL ? 'تقنية' : 'IT', value: it.length, color: '#1D4ED8' },
    { name: isRTL ? 'مكتب المساعدة' : 'Help Desk', value: help.length, color: '#7C3AED' },
  ].filter(d => d.value > 0);

  const itTicketsByType = [
    { name: isRTL ? 'أجهزة' : 'Hardware', value: it.filter(t => t.category === 'hardware').length },
    { name: isRTL ? 'برامج' : 'Software', value: it.filter(t => t.category === 'software').length },
    { name: isRTL ? 'شبكات' : 'Network', value: it.filter(t => t.category === 'network').length },
    { name: isRTL ? 'صلاحيات' : 'Access', value: it.filter(t => t.category === 'access').length },
  ];

  const workOrdersByType = [
    { name: isRTL ? 'وقائية' : 'Preventive', value: wos.filter(w => w.work_order_type === 'preventive').length },
    { name: isRTL ? 'تصحيحية' : 'Corrective', value: wos.filter(w => w.work_order_type === 'corrective').length },
    { name: isRTL ? 'طارئة' : 'Emergency', value: wos.filter(w => w.work_order_type === 'emergency').length },
  ];

  const resolutionRate = allTickets.length > 0 ? Math.round((resolvedTickets / allTickets.length) * 100) : 0;
  const slaComplianceRate = allTickets.length > 0 ? Math.round(((allTickets.length - slaBreached) / allTickets.length) * 100) : 100;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isRTL ? 'لوحة العمليات' : 'Operations Dashboard'}
        subtitle={isRTL ? 'نظرة شاملة على أداء الخدمات' : 'Service performance overview'}
      >
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
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isRTL ? 'التذاكر المفتوحة' : 'Open Tickets'}
          value={openTickets}
          icon={Ticket}
          iconClassName="bg-najdi-50"
        />
        <StatCard
          title={isRTL ? 'نسبة الحل' : 'Resolution Rate'}
          value={`${resolutionRate}%`}
          icon={CheckCircle}
          iconClassName="bg-emerald-50"
        />
        <StatCard
          title={isRTL ? 'الالتزام بـ SLA' : 'SLA Compliance'}
          value={`${slaComplianceRate}%`}
          icon={Clock}
          iconClassName="bg-amber-50"
        />
        <StatCard
          title={isRTL ? 'رضا العملاء' : 'Customer Satisfaction'}
          value={avgSatisfaction > 0 ? `${avgSatisfaction.toFixed(1)}/5` : 'N/A'}
          icon={TrendingUp}
          iconClassName="bg-gold-50"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-ink">{isRTL ? 'التذاكر حسب الفئة' : 'Tickets by Category'}</CardTitle>
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

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-ink">{isRTL ? 'تذاكر IT حسب النوع' : 'IT Tickets by Type'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={itTicketsByType}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="name" tick={{ fill: 'currentColor' }} className="text-muted-foreground" />
                  <YAxis tick={{ fill: 'currentColor' }} className="text-muted-foreground" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#0F766E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-ink">{isRTL ? 'أوامر العمل حسب النوع' : 'Work Orders by Type'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workOrdersByType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#059669" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-ink">{isRTL ? 'إحصائيات الصيانة' : 'Maintenance Stats'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">{isRTL ? 'أوامر مفتوحة' : 'Open Orders'}</span>
                <span className="font-medium text-ink">{openWorkOrders}</span>
              </div>
              <Progress value={workOrders.length > 0 ? (openWorkOrders / workOrders.length) * 100 : 0} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">{isRTL ? 'مكتملة' : 'Completed'}</span>
                <span className="font-medium text-ink">{completedWorkOrders}</span>
              </div>
              <Progress value={workOrders.length > 0 ? (completedWorkOrders / workOrders.length) * 100 : 0} className="h-2" />
            </div>
            <div className="pt-4 border-t border-border/60">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">{isRTL ? 'إجمالي التكلفة' : 'Total Cost'}</span>
                <span className="font-bold text-lg text-ink"><Currency amount={totalMaintenanceCost} /></span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-ink">{isRTL ? 'شرائح العملاء' : 'Customer Segments'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { segment: 'active', label: isRTL ? 'نشط' : 'Active', color: 'bg-emerald-500' },
              { segment: 'prospect', label: isRTL ? 'محتمل' : 'Prospect', color: 'bg-najdi-500' },
              { segment: 'vip', label: 'VIP', color: 'bg-amber-500' },
              { segment: 'withdrawn', label: isRTL ? 'منسحب' : 'Withdrawn', color: 'bg-red-500' },
            ].map(({ segment, label, color }) => {
              const count = customers.filter(c => c.segment === segment).length;
              const pct = customers.length > 0 ? (count / customers.length) * 100 : 0;
              return (
                <div key={segment}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-ink">{label}</span>
                    <span className="text-sm font-medium text-muted-foreground">{count}</span>
                  </div>
                  <div className="w-full bg-sand-alt rounded-full h-2">
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
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-ink">{isRTL ? 'أداء الفروع' : 'Branch Performance'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-start py-3 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isRTL ? 'الفرع' : 'Branch'}</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isRTL ? 'تذاكر CRM' : 'CRM Tickets'}</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isRTL ? 'تذاكر IT' : 'IT Tickets'}</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isRTL ? 'أوامر صيانة' : 'Work Orders'}</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isRTL ? 'نسبة الحل' : 'Resolution'}</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map(branch => {
                    const branchCrmTickets = crm.filter(t => t.branch_id === branch.id);
                    const branchItTickets = it.filter(t => t.branch_id === branch.id);
                    const branchWOs = wos.filter(w => w.branch_id === branch.id);
                    const branchAllTickets = [...branchCrmTickets, ...branchItTickets];
                    const branchResolved = branchAllTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
                    const branchResRate = branchAllTickets.length > 0 ? Math.round((branchResolved / branchAllTickets.length) * 100) : 0;
                    
                    return (
                      <tr key={branch.id} className="border-b border-border/40 hover:bg-sand-alt/60">
                        <td className="py-3 px-4 font-medium text-ink">{isRTL ? branch.name_ar : branch.name_en}</td>
                        <td className="text-center py-3 px-4 text-ink">{branchCrmTickets.length}</td>
                        <td className="text-center py-3 px-4 text-ink">{branchItTickets.length}</td>
                        <td className="text-center py-3 px-4 text-ink">{branchWOs.length}</td>
                        <td className="text-center py-3 px-4">
                          <Badge className={branchResRate >= 80 ? 'bg-emerald-100 text-emerald-800' : branchResRate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>
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
