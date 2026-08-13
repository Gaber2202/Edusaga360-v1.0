import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenantQuery } from '../hooks/useTenantQuery';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import {
  Building2, Users, DollarSign, Activity, Plus, Search,
  Eye, Pause, Play, Trash2, Calendar, Shield, FileText, Clock
} from 'lucide-react';
import TenantFormDialog from '../components/superadmin/TenantFormDialog';
import TenantDetailDialog from '../components/superadmin/TenantDetailDialog';
import TenantRequestsTab from '../components/superadmin/TenantRequestsTab';
import PlatformUsersTab from '../components/superadmin/PlatformUsersTab';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import { formatCurrency } from '../lib/localization';

export default function SuperAdminDashboard() {
  const { t: _t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeMainTab, setActiveMainTab] = useState('tenants');

  const { data: tenants = [], isLoading } = useTenantQuery(
    ['all-tenants'],
    () => fetchData(tenantQuery('tenants').select('*').order('created_at', { ascending: false }))
  );

  const { data: allUsers = [] } = useTenantQuery(
    ['all-users-sa'],
    () => fetchData(tenantQuery('users').select('*').order('created_at'))
  );

  const { data: requestsSummary = {} } = useQuery({
    queryKey: ['subscription-requests-summary'],
    queryFn: async () => {
      const response = await callApi('/api/functions/listSubscriptionRequests', {});
      return response.data;
    },
  });

  const pendingRequestsCount = requestsSummary.pending_count || 0;
  const pendingRegCount = requestsSummary.registration_pending_count || 0;

  const filteredTenants = tenants.filter(t => {
    const matchesSearch = !search || 
      t.name_ar?.includes(search) || 
      t.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      t.tenant_code?.toLowerCase().includes(search.toLowerCase()) ||
      t.admin_email?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalTenants = tenants.length;
  const activeTenants = tenants.filter(t => t.status === 'active').length;
  const trialTenants = tenants.filter(t => t.status === 'trial').length;
  const totalRevenue = tenants.reduce((sum, t) => sum + (t.monthly_revenue || 0), 0);

  const handleToggleSuspend = async (tenant) => {
    const newStatus = tenant.status === 'suspended' ? 'active' : 'suspended';
    const patch = {
      status: newStatus,
      suspended_date: newStatus === 'suspended' ? format(new Date(), 'yyyy-MM-dd') : null,
      suspended_reason: newStatus === 'suspended' ? 'Suspended by admin' : null,
    };
    await tenantQuery('tenants').update(patch);
    await logAuditEvent({
      action: AuditActions.CONFIGURE,
      entityType: 'Tenant',
      entityId: tenant.id,
      oldValues: { status: tenant.status },
      newValues: patch,
      notes: `Platform admin ${newStatus === 'suspended' ? 'suspended' : 'reactivated'} tenant ${tenant.tenant_code || tenant.id}`,
    });
    queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
    toast.success(isRTL ? 'تم التحديث' : 'Updated');
  };

  const handleExtendTrial = async (tenant) => {
    const currentEnd = tenant.trial_end_date ? new Date(tenant.trial_end_date) : new Date();
    const newEnd = addDays(currentEnd, 14);
    const patch = {
      trial_end_date: format(newEnd, 'yyyy-MM-dd'),
      status: 'trial',
    };
    await tenantQuery('tenants').update(patch);
    await logAuditEvent({
      action: AuditActions.CONFIGURE,
      entityType: 'Tenant',
      entityId: tenant.id,
      oldValues: { trial_end_date: tenant.trial_end_date, status: tenant.status },
      newValues: patch,
      notes: `Platform admin extended trial by 14 days for tenant ${tenant.tenant_code || tenant.id}`,
    });
    queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
    toast.success(isRTL ? 'تم تمديد الفترة التجريبية' : 'Trial extended');
  };

  const handleDeleteTenant = async (tenant) => {
    if (!confirm(isRTL ? `هل أنت متأكد من حذف ${tenant.name_ar}؟` : `Delete ${tenant.name_en}?`)) return;
    // Snapshot first so the tenant-side fields survive the cascading delete,
    // but only *write* the audit row after the delete succeeds — otherwise a
    // failed delete leaves a false "deleted" audit entry (logAuditEvent
    // swallows its own errors, so the log always resolves).
    const auditSnapshot = {
      action: AuditActions.DELETE,
      entityType: 'Tenant',
      entityId: tenant.id,
      oldValues: {
        tenant_code: tenant.tenant_code,
        name_ar: tenant.name_ar,
        name_en: tenant.name_en,
        admin_email: tenant.admin_email,
        plan_code: tenant.plan_code,
        status: tenant.status,
      },
      notes: `Platform admin deleted tenant ${tenant.tenant_code || tenant.id}`,
    };
    await tenantQuery('tenants').delete().eq('id', tenant.id);
    await logAuditEvent(auditSnapshot);
    queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
    toast.success(isRTL ? 'تم الحذف' : 'Deleted');
  };

  const statusColors = {
    trial: 'bg-amber-100 text-amber-700',
    active: 'bg-emerald-100 text-emerald-700',
    expired: 'bg-orange-100 text-orange-700',
    past_due: 'bg-red-100 text-red-700',
    suspended: 'bg-sand-alt text-muted-foreground',
    cancelled: 'bg-red-200 text-red-800',
  };

  const planColors = {
    free_trial: 'bg-sand-alt text-muted-foreground',
    startup: 'bg-najdi-50 text-najdi-900',
    enterprise: 'bg-purple-100 text-purple-700',
    government: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <Shield className="w-6 h-6 text-najdi-700" />
            {isRTL ? 'لوحة تحكم المنصة' : 'Super Admin Dashboard'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRTL ? 'إدارة المؤسسات والاشتراكات' : 'Manage tenants and subscriptions'}
          </p>
        </div>
        <Button onClick={() => setShowCreateTenant(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {isRTL ? 'إنشاء مؤسسة' : 'Create Tenant'}
        </Button>
      </div>

      {/* Platform KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: isRTL ? 'المؤسسات' : 'Tenants', value: totalTenants, icon: Building2, color: 'text-najdi-700' },
          { label: isRTL ? 'نشط' : 'Active', value: activeTenants, icon: Activity, color: 'text-emerald-600' },
          { label: isRTL ? 'تجريبي' : 'Trial', value: trialTenants, icon: Calendar, color: 'text-amber-600' },
          { label: isRTL ? 'طلبات الاشتراك' : 'Subscription Requests', value: pendingRequestsCount, icon: Clock, color: 'text-red-600' },
          { label: isRTL ? 'طلبات تسجيل جديدة' : 'New Registrations', value: pendingRegCount, icon: FileText, color: 'text-purple-600' },
          { label: isRTL ? 'الإيرادات الشهرية' : 'Monthly Revenue', value: `${formatCurrency(totalRevenue, tenant?.localization, isRTL)}`, icon: DollarSign, color: 'text-emerald-600' },
        ].map((stat, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold text-ink">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>


      {/* Main Tabs: Tenants vs Requests */}
      <Tabs value={activeMainTab} onValueChange={setActiveMainTab}>
        <TabsList>
          <TabsTrigger value="tenants" className="gap-2">
            <Building2 className="w-4 h-4" />
            {isRTL ? 'المؤسسات' : 'Tenants'}
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <FileText className="w-4 h-4" />
            {isRTL ? 'طلبات الاشتراك' : 'Subscription Requests'}
            {pendingRequestsCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 ms-1">{pendingRequestsCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            {isRTL ? 'المستخدمون' : 'Users'}
            <Badge className="bg-sand-alt text-ink text-xs px-1.5 py-0 ms-1">{allUsers.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <TenantRequestsTab />
        </TabsContent>
        <TabsContent value="users">
          <PlatformUsersTab tenants={tenants} />
        </TabsContent>
        <TabsContent value="tenants">

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
          <Input
            placeholder={isRTL ? 'بحث بالاسم أو الكود أو البريد...' : 'Search by name, code, or email...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${isRTL ? 'pr-10' : 'pl-10'} bg-white`}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'trial', 'active', 'expired', 'suspended', 'cancelled'].map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
              className="text-xs"
            >
              {s === 'all' ? (isRTL ? 'الكل' : 'All') :
               s === 'trial' ? (isRTL ? 'تجريبي' : 'Trial') :
               s === 'active' ? (isRTL ? 'نشط' : 'Active') :
               s === 'expired' ? (isRTL ? 'منتهي' : 'Expired') :
               s === 'suspended' ? (isRTL ? 'موقوف' : 'Suspended') :
               isRTL ? 'ملغي' : 'Cancelled'}
            </Button>
          ))}
        </div>
      </div>

      {/* Tenants Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-sand border-b">
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'المؤسسة' : 'Tenant'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'الخطة' : 'Plan'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'الحالة' : 'Status'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'المستخدمين' : 'Users'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'المشرف' : 'Admin'}</th>
                  <th className="text-start p-3 font-medium text-muted-foreground">{isRTL ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{isRTL ? 'جاري التحميل...' : 'Loading...'}</td></tr>
                ) : filteredTenants.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{isRTL ? 'لا توجد مؤسسات' : 'No tenants'}</td></tr>
                ) : filteredTenants.map(tenant => {
                  const tenantUsers = allUsers.filter(u => u.tenant_id === tenant.id);
                  return (
                    <tr key={tenant.id} className="border-b hover:bg-sand transition-colors">
                      <td className="p-3">
                        <div>
                          <p className="font-medium text-ink">{isRTL ? tenant.name_ar : tenant.name_en}</p>
                          <p className="text-xs text-muted-foreground font-mono">{tenant.tenant_code}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge className={planColors[tenant.plan_code] || 'bg-sand-alt'}>
                          {tenant.plan_code === 'free_trial' ? (isRTL ? 'تجربة مجانية' : 'Free Trial') :
                           tenant.plan_code === 'startup' ? (isRTL ? 'انطلاق' : 'Startup') :
                           isRTL ? 'مؤسسات' : 'Enterprise'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge className={statusColors[tenant.status] || 'bg-sand-alt'}>
                          {tenant.status === 'trial' ? (isRTL ? 'تجريبي' : 'Trial') :
                           tenant.status === 'active' ? (isRTL ? 'نشط' : 'Active') :
                           tenant.status === 'suspended' ? (isRTL ? 'موقوف' : 'Suspended') :
                           tenant.status}
                        </Badge>
                        {tenant.status === 'trial' && tenant.trial_end_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {isRTL ? 'ينتهي: ' : 'Ends: '}{format(new Date(tenant.trial_end_date), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </td>
                      <td className="p-3 font-medium">{tenantUsers.length}</td>
                      <td className="p-3">
                        <p className="text-xs">{tenant.admin_email || '-'}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedTenant(tenant)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {tenant.status === 'trial' && (
                            <Button size="sm" variant="ghost" onClick={() => handleExtendTrial(tenant)} title={isRTL ? 'تمديد' : 'Extend'}>
                              <Calendar className="w-3.5 h-3.5 text-amber-600" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleToggleSuspend(tenant)}>
                            {tenant.status === 'suspended' 
                              ? <Play className="w-3.5 h-3.5 text-emerald-600" />
                              : <Pause className="w-3.5 h-3.5 text-amber-600" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteTenant(tenant)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showCreateTenant && (
        <TenantFormDialog
          open={showCreateTenant}
          onClose={() => setShowCreateTenant(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['all-tenants'] });
            setShowCreateTenant(false);
          }}
        />
      )}

      {selectedTenant && (
        <TenantDetailDialog
          tenant={selectedTenant}
          users={allUsers.filter(u => u.tenant_id === selectedTenant.id)}
          open={!!selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onUpdated={() => queryClient.invalidateQueries({ queryKey: ['all-tenants'] })}
        />
      )}

        </TabsContent>
      </Tabs>
    </div>
  );
}