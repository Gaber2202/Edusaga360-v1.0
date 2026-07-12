import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, RefreshCw, Trash2, Loader2, Mail, Send, PlugZap } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { emailApi } from '../../api/integrations';
import { useLanguage } from '../LanguageContext';
import ConnectorDialog from './ConnectorDialog';

const statusBadge = (status) => {
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700';
  if (status === 'error') return 'bg-red-50 text-red-600';
  return 'bg-sand text-ink';
};

/** Connect a school mailbox for outbound send + inbound sync. */
export default function EmailConnectorsTab() {
  const { isRTL } = useLanguage();
  const T = (en, ar) => (isRTL ? ar : en);
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [sendFor, setSendFor] = useState(null); // connector being sent from
  const [msg, setMsg] = useState({ to: '', subject: '', html: '' });

  const { data: provRes } = useQuery({ queryKey: ['emailProviders'], queryFn: emailApi.providers });
  const { data: connRes, isLoading } = useQuery({ queryKey: ['emailConnectors'], queryFn: emailApi.listConnectors });
  const { data: msgRes } = useQuery({ queryKey: ['emailMessages'], queryFn: emailApi.messages });
  const providers = provRes?.data || [];
  const connectors = connRes?.data || [];
  const messages = msgRes?.data || [];
  const capsById = Object.fromEntries(providers.map((p) => [p.id, p.capabilities]));

  const createMut = useMutation({
    mutationFn: (payload) => emailApi.createConnector(payload),
    onSuccess: () => { toast.success(T('Connector added', 'تمت الإضافة')); setShowAdd(false); qc.invalidateQueries({ queryKey: ['emailConnectors'] }); },
    onError: (e) => toast.error(e.message),
  });
  const sendMut = useMutation({
    mutationFn: () => emailApi.send(sendFor.id, msg),
    onSuccess: () => { toast.success(T('Email sent', 'تم إرسال البريد')); setSendFor(null); setMsg({ to: '', subject: '', html: '' }); },
    onError: (e) => toast.error(e.body?.error || e.message),
  });
  const syncMut = useMutation({
    mutationFn: (id) => emailApi.syncConnector(id),
    onSuccess: (res) => {
      toast.success(T(`Synced: ${res.created} new, ${res.updated} updated`, `تمت المزامنة: ${res.created} جديد`));
      qc.invalidateQueries({ queryKey: ['emailConnectors'] });
      qc.invalidateQueries({ queryKey: ['emailMessages'] });
    },
    onError: (e) => toast.error(e.body?.error || e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => emailApi.deleteConnector(id),
    onSuccess: () => { toast.success(T('Removed', 'تم الحذف')); qc.invalidateQueries({ queryKey: ['emailConnectors'] }); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {T('Connect your school mailbox (SMTP, Gmail, Microsoft 365, or a custom gateway) to send and receive mail.',
             'اربط بريد مدرستك للإرسال والاستقبال.')}
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
            <PlugZap className="w-6 h-6 mx-auto mb-2 opacity-50" />{T('No email connectors yet.', 'لا توجد موصلات بعد.')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T('Name', 'الاسم')}</TableHead>
                <TableHead>{T('Provider', 'المزود')}</TableHead>
                <TableHead>{T('Status', 'الحالة')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.map((c) => {
                const caps = capsById[c.provider] || {};
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.display_name}</TableCell>
                    <TableCell className="capitalize">{c.provider}</TableCell>
                    <TableCell><Badge className={statusBadge(c.status)}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {caps.send && (
                        <Button variant="ghost" size="sm" onClick={() => setSendFor(c)}><Send className="w-4 h-4" /></Button>
                      )}
                      {caps.receive && (
                        <Button variant="ghost" size="sm" onClick={() => syncMut.mutate(c.id)} disabled={syncMut.isPending}>
                          <RefreshCw className={`w-4 h-4 ${syncMut.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(c.id)} disabled={deleteMut.isPending}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {messages.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Mail className="w-4 h-4" />{T('Inbound messages', 'الرسائل الواردة')} ({messages.length})
          </h3>
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T('From', 'من')}</TableHead>
                  <TableHead>{T('Subject', 'الموضوع')}</TableHead>
                  <TableHead>{T('Received', 'استُلمت')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.slice(0, 25).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{m.from_address || '—'}</TableCell>
                    <TableCell className="font-medium">{m.subject || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.received_at ? format(new Date(m.received_at), 'PPp') : '—'}
                    </TableCell>
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
        title={T('Add email connector', 'إضافة موصل بريد')}
        showCapabilities
      />

      {/* Send dialog */}
      <Dialog open={!!sendFor} onOpenChange={(v) => !v && setSendFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T('Send email', 'إرسال بريد')} — {sendFor?.display_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">{T('To', 'إلى')}</Label>
              <Input type="email" value={msg.to} onChange={(e) => setMsg((s) => ({ ...s, to: e.target.value }))} placeholder="parent@example.com" /></div>
            <div><Label className="text-xs">{T('Subject', 'الموضوع')}</Label>
              <Input value={msg.subject} onChange={(e) => setMsg((s) => ({ ...s, subject: e.target.value }))} /></div>
            <div><Label className="text-xs">{T('Message (HTML)', 'الرسالة')}</Label>
              <Textarea rows={5} value={msg.html} onChange={(e) => setMsg((s) => ({ ...s, html: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendFor(null)}>{T('Cancel', 'إلغاء')}</Button>
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || !msg.to || !msg.subject || !msg.html}>
              {sendMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{T('Send', 'إرسال')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
