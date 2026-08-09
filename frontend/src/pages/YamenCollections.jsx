import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../components/LanguageContext';
import { getCurrencySymbol } from '../lib/localization';
import { useTenant } from '../components/TenantContext';
import { callApi } from '../api/supabaseClient';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import StatCard from '../components/ui/StatCard';
import StatusBadge from '../components/ui/StatusBadge';
import { toast } from 'sonner';
import { Loader2, RefreshCw, ShieldAlert, Settings, Users, MessageSquare, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

const TAB_KEYS = ['dashboard', 'profiles', 'approvals', 'settings'];

export default function YamenCollections() {
  const { t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profileFilter, setProfileFilter] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: dashboard, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery({
    queryKey: ['yamen-dashboard'],
    queryFn: () => callApi('/api/collections/dashboard', null, { method: 'GET' }),
  });

  const { data: profilesData, isLoading: profilesLoading } = useQuery({
    queryKey: ['yamen-profiles', profileFilter],
    queryFn: () => callApi(`/api/collections/profiles?limit=50${profileFilter ? `&segment=${profileFilter}` : ''}`, null, { method: 'GET' }),
  });

  const { data: approvalsData, isLoading: approvalsLoading } = useQuery({
    queryKey: ['yamen-approvals'],
    queryFn: () => callApi('/api/collections/approval-queue', null, { method: 'GET' }),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['yamen-settings'],
    queryFn: () => callApi('/api/collections/settings', null, { method: 'GET' }),
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ['yamen-timeline', selectedProfile?.id],
    queryFn: () => callApi(`/api/collections/profiles/${selectedProfile.id}/timeline`, null, { method: 'GET' }),
    enabled: !!selectedProfile,
  });

  const runSegmentation = useMutation({
    mutationFn: () => callApi('/api/collections/run-segmentation', {}, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('segmentationUpdated'));
      queryClient.invalidateQueries({ queryKey: ['yamen-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['yamen-dashboard'] });
    },
    onError: (e) => toast.error(e.message ?? t('error')),
  });

  const enqueueReminders = useMutation({
    mutationFn: () => callApi('/api/collections/enqueue-reminders', {}, { method: 'POST' }),
    onSuccess: (res) => toast.success(`${res.result?.enqueued ?? 0} ${t('remindersEnqueued')}`),
    onError: (e) => toast.error(e.message ?? t('error')),
  });

  const killSwitch = useMutation({
    mutationFn: (active) => callApi('/api/collections/kill-switch', { active }, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('killSwitchUpdated'));
      queryClient.invalidateQueries({ queryKey: ['yamen-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['yamen-settings'] });
    },
    onError: (e) => toast.error(e.message ?? t('error')),
  });

  const resolveApproval = useMutation({
    mutationFn: ({ id, action }) => callApi(`/api/collections/approval-queue/${id}/resolve`, { action }, { method: 'POST' }),
    onSuccess: () => {
      toast.success(t('approvalResolved'));
      queryClient.invalidateQueries({ queryKey: ['yamen-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['yamen-dashboard'] });
    },
    onError: (e) => toast.error(e.message ?? t('error')),
  });

  const dashboardResult = dashboard?.result ?? {};
  const segmentCounts = dashboardResult.segment_counts ?? {};

  const profileColumns = [
    { header: t('guardian'), cell: (row) => <div><p className="font-medium">{row.guardians?.name_en ?? row.guardian_id?.slice(0, 8)}</p><p className="text-xs text-muted-foreground">{row.guardians?.phone ?? '-'}</p></div> },
    { header: t('segment'), cell: (row) => <StatusBadge status={row.current_segment} /> },
    { header: t('outstanding'), cell: (row) => <span className="font-semibold">{row.outstanding_balance?.toLocaleString()} {getCurrencySymbol(tenant?.localization, isRTL)}</span> },
    { header: t('avgDaysToPay'), cell: (row) => row.avg_days_to_pay ?? '-' },
    { header: t('lastPayment'), cell: (row) => row.last_payment_at ? format(new Date(row.last_payment_at), 'dd/MM/yyyy') : '-' },
    { header: t('actions'), cell: (row) => (
      <Button size="sm" variant="outline" onClick={() => { setSelectedProfile(row); setTimelineOpen(true); }}>
        {t('timeline')}
      </Button>
    )},
  ];

  const approvalColumns = [
    { header: t('type'), cell: (row) => <StatusBadge status={row.item_type} /> },
    { header: t('requestedBy'), cell: (row) => row.requested_by },
    { header: t('status'), cell: (row) => <StatusBadge status={row.status} /> },
    { header: t('date'), cell: (row) => format(new Date(row.created_at), 'dd/MM/yyyy HH:mm') },
    { header: t('actions'), cell: (row) => (
      <div className="flex gap-2">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => resolveApproval.mutate({ id: row.id, action: 'approve' })}>{t('approve')}</Button>
        <Button size="sm" variant="outline" onClick={() => resolveApproval.mutate({ id: row.id, action: 'reject' })}>{t('reject')}</Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t('collectionsConsole')}
        subtitle={t('collectionsSubtitle')}
        actions={(
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(true)}><Settings className="w-4 h-4 me-1" />{t('settings')}</Button>
            <Button variant="outline" onClick={() => enqueueReminders.mutate()} disabled={enqueueReminders.isPending || dashboardResult.kill_switch_active}>
              {enqueueReminders.isPending && <Loader2 className="w-4 h-4 animate-spin me-1" />}
              {t('enqueueReminders')}
            </Button>
            <Button onClick={() => runSegmentation.mutate()} disabled={runSegmentation.isPending}>
              {runSegmentation.isPending && <Loader2 className="w-4 h-4 animate-spin me-1" />}
              <RefreshCw className="w-4 h-4 me-1" />{t('runSegmentation')}
            </Button>
          </div>
        )}
      />

      {dashboardResult.kill_switch_active && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          {t('killSwitchActive')}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border">
          {TAB_KEYS.map((k) => <TabsTrigger key={k} value={k}>{t(k)}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard title={t('totalOutstanding')} value={`${dashboardResult.total_outstanding?.toLocaleString() ?? 0} ${getCurrencySymbol(tenant?.localization, isRTL)}`} icon={CheckCircle} iconClassName="bg-emerald-50" />
            <StatCard title={t('profiles')} value={dashboardResult.total_profiles ?? 0} icon={Users} iconClassName="bg-najdi-50" />
            <StatCard title={t('collectionRate')} value={`${dashboardResult.collection_rate ?? 0}%`} icon={CheckCircle} iconClassName="bg-purple-50" />
            <StatCard title={t('pendingMessages')} value={dashboardResult.pending_messages ?? 0} icon={MessageSquare} iconClassName="bg-amber-50" />
            <StatCard title={t('pendingApprovals')} value={dashboardResult.pending_approvals ?? 0} icon={ShieldAlert} iconClassName="bg-red-50" />
            <StatCard title={t('brokenPlans')} value={dashboardResult.broken_plans ?? 0} icon={RefreshCw} iconClassName="bg-blue-50" />
          </div>
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">{t('segmentDistribution')}</h3>
              <div className="grid grid-cols-5 gap-2">
                {['A','B','C','D','E'].map((seg) => (
                  <div key={seg} className="border rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold">{segmentCounts[seg] ?? 0}</div>
                    <div className="text-xs text-muted-foreground">{t('segment')} {seg}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder={t('filterBySegment')} value={profileFilter} onChange={(e) => setProfileFilter(e.target.value.toUpperCase())} className="w-64" />
          </div>
          <DataTable columns={profileColumns} data={(profilesData?.data ?? []).filter((p) => !profileFilter || p.current_segment === profileFilter)} loading={profilesLoading} emptyMessage={t('noData')} />
        </TabsContent>

        <TabsContent value="approvals" className="space-y-4">
          <DataTable columns={approvalColumns} data={approvalsData?.data ?? []} loading={approvalsLoading} emptyMessage={t('noData')} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{t('killSwitch')}</h3>
                  <p className="text-sm text-muted-foreground">{t('killSwitchDescription')}</p>
                </div>
                <Button variant={dashboardResult.kill_switch_active ? 'destructive' : 'outline'} onClick={() => killSwitch.mutate(!dashboardResult.kill_switch_active)}>
                  {dashboardResult.kill_switch_active ? t('deactivate') : t('activate')}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                {t('sendWindow')}: {settingsData?.data?.send_window_start ?? '10:00'} - {settingsData?.data?.send_window_end ?? '20:00'} (Asia/Riyadh)
              </div>
              <div className="text-sm text-muted-foreground">
                {t('status')}: {settingsData?.data?.is_enabled ? t('enabled') : t('disabled')}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t('profileTimeline')}</DialogTitle></DialogHeader>
          {timelineLoading ? <Loader2 className="animate-spin" /> : (
            <div className="space-y-2 max-h-96 overflow-auto">
              {(timelineData?.data?.messages?.length ?? 0) === 0 && (timelineData?.data?.ledger?.length ?? 0) === 0 && <p>{t('noData')}</p>}
              {[...(timelineData?.data?.messages ?? []), ...(timelineData?.data?.ledger ?? []), ...(timelineData?.data?.approvals ?? []), ...(timelineData?.data?.offers ?? [])]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .map((item, i) => (
                  <div key={i} className="border rounded p-2 text-sm">
                    <div className="flex justify-between"><span className="font-medium">{item.action_type ?? item.channel ?? item.item_type ?? t('event')}</span><span className="text-xs text-muted-foreground">{format(new Date(item.created_at), 'dd/MM/yyyy HH:mm')}</span></div>
                    <div className="text-muted-foreground truncate">{JSON.stringify(item.outcome ?? item.decision ?? item.payload ?? item.personalized_body_en ?? '')}</div>
                  </div>
                ))}
            </div>
          )}
          <DialogFooter><Button onClick={() => setTimelineOpen(false)}>{t('close')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
