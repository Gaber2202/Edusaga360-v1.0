import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, RefreshCw, Trash2, Loader2, Users, PlugZap } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { atsApi } from '../../api/integrations';
import { useLanguage } from '../LanguageContext';
import ConnectorDialog from './ConnectorDialog';

const statusBadge = (status) => {
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700';
  if (status === 'error') return 'bg-red-50 text-red-600';
  return 'bg-sand text-ink';
};

/** Connect and sync an external Applicant Tracking System into HR. */
export default function AtsConnectorsTab() {
  const { isRTL } = useLanguage();
  const T = (en, ar) => (isRTL ? ar : en);
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: provRes } = useQuery({ queryKey: ['atsProviders'], queryFn: atsApi.providers });
  const { data: connRes, isLoading } = useQuery({ queryKey: ['atsConnectors'], queryFn: atsApi.listConnectors });
  const { data: candRes } = useQuery({ queryKey: ['atsCandidates'], queryFn: atsApi.candidates });
  const providers = provRes?.data || [];
  const connectors = connRes?.data || [];
  const candidates = candRes?.data || [];

  const createMut = useMutation({
    mutationFn: (payload) => atsApi.createConnector(payload),
    onSuccess: () => { toast.success(T('Connector added', 'تمت الإضافة')); setShowAdd(false); qc.invalidateQueries({ queryKey: ['atsConnectors'] }); },
    onError: (e) => toast.error(e.message),
  });
  const testMut = useMutation({
    mutationFn: (id) => atsApi.testConnector(id),
    onSuccess: (res) => toast.success(T(`Connection OK — ${res.sample_count} candidate(s) reachable`, `الاتصال ناجح — ${res.sample_count} مرشح`)),
    onError: (e) => toast.error(e.body?.error || e.message),
  });
  const syncMut = useMutation({
    mutationFn: (id) => atsApi.syncConnector(id),
    onSuccess: (res) => {
      toast.success(T(`Synced: ${res.created} new, ${res.updated} updated`, `تمت المزامنة: ${res.created} جديد، ${res.updated} محدث`));
      qc.invalidateQueries({ queryKey: ['atsConnectors'] });
      qc.invalidateQueries({ queryKey: ['atsCandidates'] });
    },
    onError: (e) => toast.error(e.body?.error || e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => atsApi.deleteConnector(id),
    onSuccess: () => { toast.success(T('Removed', 'تم الحذف')); qc.invalidateQueries({ queryKey: ['atsConnectors'] }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {T('Connect LinkedIn, Indeed, Greenhouse, Workday, or a custom ATS to sync candidates into hiring.',
             'اربط نظام تتبع المتقدمين لمزامنة المرشحين.')}
        </p>
        <Button onClick={() => setShowAdd(true)} disabled={providers.length === 0}>
          <Plus className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />{T('Add connector', 'إضافة موصل')}
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : connectors.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <PlugZap className="w-6 h-6 mx-auto mb-2 opacity-50" />{T('No ATS connectors yet.', 'لا توجد موصلات بعد.')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T('Name', 'الاسم')}</TableHead>
                <TableHead>{T('Provider', 'المزود')}</TableHead>
                <TableHead>{T('Status', 'الحالة')}</TableHead>
                <TableHead>{T('Last sync', 'آخر مزامنة')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.display_name}</TableCell>
                  <TableCell className="capitalize">{c.provider}</TableCell>
                  <TableCell><Badge className={statusBadge(c.status)}>{c.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.last_sync_at ? format(new Date(c.last_sync_at), 'PPp') : '—'}
                    {c.last_error && <span className="block text-red-500">{c.last_error}</span>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => testMut.mutate(c.id)} disabled={testMut.isPending}>{T('Test', 'اختبار')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => syncMut.mutate(c.id)} disabled={syncMut.isPending}>
                      <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(c.id)} disabled={deleteMut.isPending}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {candidates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />{T('Synced candidates', 'المرشحون المزامنون')} ({candidates.length})
          </h3>
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T('Name', 'الاسم')}</TableHead>
                  <TableHead>{T('Role', 'الوظيفة')}</TableHead>
                  <TableHead>{T('Stage', 'المرحلة')}</TableHead>
                  <TableHead>{T('Source', 'المصدر')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.slice(0, 25).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell>{c.job_title || '—'}</TableCell>
                    <TableCell>{c.stage || '—'}</TableCell>
                    <TableCell className="capitalize text-xs text-muted-foreground">{c.provider}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <ConnectorDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        providers={providers}
        onCreate={(payload) => createMut.mutate(payload)}
        creating={createMut.isPending}
        title={T('Add ATS connector', 'إضافة موصل ATS')}
      />
    </div>
  );
}
