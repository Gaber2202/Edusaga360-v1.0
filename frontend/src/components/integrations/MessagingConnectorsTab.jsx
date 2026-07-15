import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Send, PlugZap } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { messagingApi } from '../../api/integrations';
import { useLanguage } from '../LanguageContext';
import ConnectorDialog from './ConnectorDialog';

const statusBadge = (status) => {
  if (status === 'ok') return 'bg-emerald-50 text-emerald-700';
  if (status === 'error') return 'bg-red-50 text-red-600';
  return 'bg-sand text-ink';
};

/** Connect an SMS / WhatsApp gateway and send notifications through it. */
export default function MessagingConnectorsTab() {
  const { isRTL } = useLanguage();
  const T = (en, ar) => (isRTL ? ar : en);
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [sendFor, setSendFor] = useState(null);
  const [msg, setMsg] = useState({ to: '', text: '', channel: 'sms' });

  const { data: provRes } = useQuery({ queryKey: ['messagingProviders'], queryFn: messagingApi.providers });
  const { data: connRes, isLoading } = useQuery({ queryKey: ['messagingConnectors'], queryFn: messagingApi.listConnectors });
  const providers = provRes?.data || [];
  const connectors = connRes?.data || [];
  const channelsById = Object.fromEntries(providers.map((p) => [p.id, p.channels || []]));

  const createMut = useMutation({
    mutationFn: (payload) => messagingApi.createConnector(payload),
    onSuccess: () => { toast.success(T('Connector added', 'تمت الإضافة')); setShowAdd(false); qc.invalidateQueries({ queryKey: ['messagingConnectors'] }); },
    onError: (e) => toast.error(e.message),
  });
  const sendMut = useMutation({
    mutationFn: () => messagingApi.send(sendFor.id, msg),
    onSuccess: (res) => { toast.success(T(`Sent via ${res.channel}`, `تم الإرسال عبر ${res.channel}`)); setSendFor(null); setMsg({ to: '', text: '', channel: 'sms' }); },
    onError: (e) => toast.error(e.body?.error || e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => messagingApi.deleteConnector(id),
    onSuccess: () => { toast.success(T('Removed', 'تم الحذف')); qc.invalidateQueries({ queryKey: ['messagingConnectors'] }); },
    onError: (e) => toast.error(e.message),
  });

  const openSend = (connector) => {
    const channels = channelsById[connector.provider] || ['sms'];
    setMsg({ to: '', text: '', channel: channels[0] || 'sms' });
    setSendFor(connector);
  };

  const sendChannels = sendFor ? (channelsById[sendFor.provider] || ['sms']) : ['sms'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {T('Connect an SMS / WhatsApp gateway (Infobip, Twilio, Unifonic, MSEGAT, Taqnyat, Meta WhatsApp, or a custom gateway).',
             'اربط بوابة الرسائل النصية أو واتساب.')}
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
            <PlugZap className="w-6 h-6 mx-auto mb-2 opacity-50" />{T('No messaging connectors yet.', 'لا توجد موصلات بعد.')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T('Name', 'الاسم')}</TableHead>
                <TableHead>{T('Provider', 'المزود')}</TableHead>
                <TableHead>{T('Channels', 'القنوات')}</TableHead>
                <TableHead>{T('Status', 'الحالة')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {connectors.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.display_name}</TableCell>
                  <TableCell className="capitalize">{c.provider.replace('_', ' ')}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(channelsById[c.provider] || []).map((ch) => (
                        <Badge key={ch} className="bg-najdi-50 text-najdi-700 text-[10px] uppercase">{ch}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell><Badge className={statusBadge(c.status)}>{c.status}</Badge></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => openSend(c)}><Send className="w-4 h-4" /></Button>
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

      <ConnectorDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        providers={providers}
        onCreate={(payload) => createMut.mutate(payload)}
        creating={createMut.isPending}
        title={T('Add messaging connector', 'إضافة موصل رسائل')}
      />

      {/* Send dialog */}
      <Dialog open={!!sendFor} onOpenChange={(v) => !v && setSendFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T('Send message', 'إرسال رسالة')} — {sendFor?.display_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {sendChannels.length > 1 && (
              <div>
                <Label className="text-xs">{T('Channel', 'القناة')}</Label>
                <Select value={msg.channel} onValueChange={(v) => setMsg((s) => ({ ...s, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sendChannels.map((ch) => <SelectItem key={ch} value={ch}>{ch === 'whatsapp' ? 'WhatsApp' : 'SMS'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label className="text-xs">{T('To (phone)', 'إلى (هاتف)')}</Label>
              <Input value={msg.to} onChange={(e) => setMsg((s) => ({ ...s, to: e.target.value }))} placeholder="9665xxxxxxxx" /></div>
            <div><Label className="text-xs">{T('Message', 'الرسالة')}</Label>
              <Textarea rows={4} value={msg.text} onChange={(e) => setMsg((s) => ({ ...s, text: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendFor(null)}>{T('Cancel', 'إلغاء')}</Button>
            <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending || !msg.to || !msg.text}>
              {sendMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{T('Send', 'إرسال')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
