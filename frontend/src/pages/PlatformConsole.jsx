import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Plus, Search, RefreshCw, Shield } from 'lucide-react';
import PlatformStats from '../components/platform/PlatformStats';
import TenantCard from '../components/platform/TenantCard';
import TenantFormDialog from '../components/platform/TenantFormDialog';
import SubscriptionPlansTab from '../components/platform/SubscriptionPlansTab';
import TenantUsageDashboard from '../components/platform/TenantUsageDashboard';
import { logAuditEvent, AuditActions } from '../components/AuditService';

export default function PlatformConsole() {
  const { isRTL } = useLanguage();
  const { userRole } = useRole();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPlan, setFilterPlan] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);

  const label = (ar, en) => isRTL ? ar : en;

  const isAuthorized = userRole === 'creator' || userRole === 'admin';

  const { data: tenants = [], isLoading, refetch } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => fetchData(tenantQuery('tenants').select('*').order('-created_date')),
    enabled: isAuthorized,
  });

  // Only creator/platform owner can access — early return AFTER all hooks
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="w-16 h-16 text-slate-300" />
        <h2 className="text-xl font-semibold text-slate-500">{label('غير مصرح', 'Unauthorized')}</h2>
        <p className="text-slate-400 text-sm">{label('هذه الصفحة للمسؤول الأعلى فقط', 'This page is restricted to platform owners only.')}</p>
      </div>
    );
  }

  const filtered = tenants.filter(t => {
    const matchSearch = !search ||
      t.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
      t.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      t.tenant_code?.toLowerCase().includes(search.toLowerCase()) ||
      t.admin_email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchPlan   = filterPlan   === 'all' || t.plan_code === filterPlan;
    return matchSearch && matchStatus && matchPlan;
  });

  const handleEdit = (tenant) => { setEditingTenant(tenant); setDialogOpen(true); };
  const handleNew  = () => { setEditingTenant(null); setDialogOpen(true); };
  const handleClose = () => { setDialogOpen(false); setEditingTenant(null); };

  const handleSuspend = async (t) => {
    const patch = { status: 'suspended', suspended_date: new Date().toISOString().split('T')[0], is_active: false };
    await tenantQuery('tenants').update(patch);
    await logAuditEvent({
      action: AuditActions.CONFIGURE,
      entityType: 'Tenant',
      entityId: t.id,
      oldValues: { status: t.status, is_active: t.is_active },
      newValues: patch,
      notes: `Platform admin suspended tenant ${t.tenant_code || t.id}`,
    });
    qc.invalidateQueries({ queryKey: ['tenants'] });
  };

  const handleActivate = async (t) => {
    const patch = { status: 'active', suspended_reason: '', is_active: true };
    await tenantQuery('tenants').update(patch);
    await logAuditEvent({
      action: AuditActions.CONFIGURE,
      entityType: 'Tenant',
      entityId: t.id,
      oldValues: { status: t.status, is_active: t.is_active },
      newValues: patch,
      notes: `Platform admin reactivated tenant ${t.tenant_code || t.id}`,
    });
    qc.invalidateQueries({ queryKey: ['tenants'] });
  };

  const handleUpgrade = (tenant) => { setEditingTenant(tenant); setDialogOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{label('لوحة تحكم المنصة', 'Platform Console')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{label('إدارة المستأجرين والخطط والاشتراكات', 'Manage tenants, plans & subscriptions')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={handleNew} size="sm">
            <Plus className="w-4 h-4 me-1" />
            {label('مستأجر جديد', 'New Tenant')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      {!isLoading && <PlatformStats tenants={tenants} isRTL={isRTL} />}

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants">{label('المستأجرون', 'Tenants')}</TabsTrigger>
          <TabsTrigger value="usage">{label('الاستخدام', 'Usage')}</TabsTrigger>
          <TabsTrigger value="plans">{label('خطط الاشتراك', 'Subscription Plans')}</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-4 pt-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={label('بحث في المستأجرين...', 'Search tenants...')}
                className="ps-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder={label('الحالة', 'Status')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{label('الكل', 'All Status')}</SelectItem>
                <SelectItem value="trial">{label('تجريبي', 'Trial')}</SelectItem>
                <SelectItem value="active">{label('نشط', 'Active')}</SelectItem>
                <SelectItem value="past_due">{label('متأخر', 'Past Due')}</SelectItem>
                <SelectItem value="suspended">{label('موقوف', 'Suspended')}</SelectItem>
                <SelectItem value="cancelled">{label('ملغى', 'Cancelled')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPlan} onValueChange={setFilterPlan}>
              <SelectTrigger className="w-36"><SelectValue placeholder={label('الخطة', 'Plan')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{label('كل الخطط', 'All Plans')}</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs text-slate-500">
              {filtered.length} {label('مستأجر', 'tenant(s)')}
            </Badge>
          </div>

          {/* Tenant Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{label('لا يوجد مستأجرون', 'No tenants found')}</p>
              <Button onClick={handleNew} variant="outline" className="mt-4" size="sm">
                {label('إضافة أول مستأجر', 'Add First Tenant')}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(tenant => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  isRTL={isRTL}
                  onEdit={handleEdit}
                  onSuspend={handleSuspend}
                  onActivate={handleActivate}
                  onUpgrade={handleUpgrade}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="usage" className="pt-4">
          <TenantUsageDashboard isRTL={isRTL} />
        </TabsContent>

        <TabsContent value="plans" className="pt-4">
          <SubscriptionPlansTab isRTL={isRTL} />
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <TenantFormDialog
        open={dialogOpen}
        onClose={handleClose}
        tenant={editingTenant}
        isRTL={isRTL}
      />
    </div>
  );
}