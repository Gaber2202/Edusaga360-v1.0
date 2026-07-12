import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { KeyRound, Plus, Copy, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { apiKeysApi } from '../../api/integrations';
import { useLanguage } from '../LanguageContext';

/** Manage API keys for the external /api/v1 data plane. */
export default function ApiKeysTab() {
  const { isRTL } = useLanguage();
  const T = (en, ar) => (isRTL ? ar : en);
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState([]);
  const [revealedKey, setRevealedKey] = useState(null);

  const { data: keysRes, isLoading } = useQuery({ queryKey: ['apiKeys'], queryFn: apiKeysApi.list });
  const { data: scopesRes } = useQuery({ queryKey: ['apiKeyScopes'], queryFn: apiKeysApi.listScopes });
  const keys = keysRes?.data || [];
  const allScopes = scopesRes?.data || [];

  const createMut = useMutation({
    mutationFn: () => apiKeysApi.create({ name: name.trim(), scopes }),
    onSuccess: (res) => {
      setRevealedKey(res.api_key);
      setShowCreate(false);
      setName('');
      setScopes([]);
      qc.invalidateQueries({ queryKey: ['apiKeys'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id) => apiKeysApi.revoke(id),
    onSuccess: () => {
      toast.success(T('Key revoked', 'تم إلغاء المفتاح'));
      qc.invalidateQueries({ queryKey: ['apiKeys'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleScope = (s) => setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const copy = (v) => { navigator.clipboard?.writeText(v); toast.success(T('Copied', 'تم النسخ')); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {T('Keys authenticate external systems (legacy import, integrations) against the /api/v1 API.',
             'تصادق المفاتيح الأنظمة الخارجية على واجهة /api/v1.')}
        </p>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />{T('Create key', 'إنشاء مفتاح')}
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <KeyRound className="w-6 h-6 mx-auto mb-2 opacity-50" />
            {T('No API keys yet.', 'لا توجد مفاتيح بعد.')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T('Name', 'الاسم')}</TableHead>
                <TableHead>{T('Prefix', 'البادئة')}</TableHead>
                <TableHead>{T('Scopes', 'الصلاحيات')}</TableHead>
                <TableHead>{T('Last used', 'آخر استخدام')}</TableHead>
                <TableHead>{T('Status', 'الحالة')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs">{k.key_prefix}…</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(k.scopes || []).map((s) => <Badge key={s} className="bg-sand text-ink text-[10px]">{s}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.last_used_at ? format(new Date(k.last_used_at), 'PP') : '—'}
                  </TableCell>
                  <TableCell>
                    {k.revoked_at
                      ? <Badge className="bg-red-50 text-red-600">{T('Revoked', 'ملغى')}</Badge>
                      : <Badge className="bg-emerald-50 text-emerald-700">{T('Active', 'نشط')}</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!k.revoked_at && (
                      <Button variant="ghost" size="sm" onClick={() => revokeMut.mutate(k.id)} disabled={revokeMut.isPending}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(v) => !v && setShowCreate(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T('Create API key', 'إنشاء مفتاح API')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">{T('Name', 'الاسم')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={T('e.g. Legacy SIS import', 'مثال: استيراد النظام القديم')} />
            </div>
            <div>
              <Label className="text-xs">{T('Scopes', 'الصلاحيات')}</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {allScopes.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={scopes.includes(s)} onCheckedChange={() => toggleScope(s)} />
                    <span className="font-mono">{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>{T('Cancel', 'إلغاء')}</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !name.trim() || scopes.length === 0}>
              {createMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{T('Create', 'إنشاء')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal-once dialog */}
      <Dialog open={!!revealedKey} onOpenChange={(v) => !v && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{T('Copy your API key now', 'انسخ مفتاحك الآن')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {T('This secret is shown only once. Store it securely — you will not be able to see it again.',
                 'يظهر هذا المفتاح مرة واحدة فقط. احفظه بأمان — لن تتمكن من رؤيته مجددًا.')}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-sand p-2 rounded text-xs break-all">{revealedKey}</code>
              <Button variant="outline" size="sm" onClick={() => copy(revealedKey)}><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>{T('Done', 'تم')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
