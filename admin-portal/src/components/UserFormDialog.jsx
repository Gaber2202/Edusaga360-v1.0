import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { ROLES, USER_STATUSES } from '../lib/plans';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { Loader2, UserPlus, UserCog, Copy } from 'lucide-react';

const inputCls = 'w-full h-9 rounded-md border border-border px-3 text-sm bg-white';
const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

/**
 * Create a new user in a tenant, or edit an existing one.
 * Create → POST /api/admin/users ; Edit → PATCH /api/admin/users/:id.
 */
export default function UserFormDialog({ open, onOpenChange, user, tenants = [], defaultTenantId, onSaved }) {
  const qc = useQueryClient();
  const isEdit = !!user;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [createdLink, setCreatedLink] = useState(null);

  useEffect(() => {
    if (!open) return;
    setCreatedLink(null);
    setForm(isEdit
      ? { name: user.name || '', user_role: user.user_role || 'staff', phone: user.phone || '', status: user.status || 'active' }
      : { tenant_id: defaultTenantId || '', email: '', name: '', user_role: 'staff', phone: '', send_invite: true });
  }, [open, user, isEdit, defaultTenantId]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!isEdit && (!form.tenant_id || !form.email || !form.name)) {
      toast.error('School, name and email are required');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await callApi(`/api/admin/users/${user.id}`, {
          name: form.name, user_role: form.user_role, phone: form.phone, status: form.status,
        });
        toast.success('User updated');
        finish();
      } else {
        const res = await callApi('/api/admin/users', {
          tenant_id: form.tenant_id, email: form.email, name: form.name,
          user_role: form.user_role, phone: form.phone || undefined, send_invite: form.send_invite,
        });
        toast.success(res.invite_sent ? 'User created — invite email sent' : 'User created');
        if (res.action_link) { setCreatedLink(res.action_link); qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }); onSaved?.(); return; }
        finish();
      }
    } catch (e) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-stats'] });
    qc.invalidateQueries({ queryKey: ['admin-tenants'] });
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <UserCog className="w-5 h-5 text-muted-foreground" /> : <UserPlus className="w-5 h-5 text-emerald-600" />}
            {isEdit ? 'Edit User' : 'Add User'}
          </DialogTitle>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">User created. Share this one-time setup link if the email doesn't arrive:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-sand border rounded px-2 py-1.5 truncate">{createdLink}</code>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { navigator.clipboard.writeText(createdLink); toast.success('Copied'); }}>
                <Copy className="w-3.5 h-3.5" /> Copy
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              {!isEdit && (
                <div>
                  <label className={labelCls}>School *</label>
                  <select className={inputCls} value={form.tenant_id || ''} onChange={(e) => set('tenant_id', e.target.value)}>
                    <option value="">Select a school…</option>
                    {tenants.map((t) => <option key={t.id} value={t.id}>{t.name_en || t.name_ar}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Full name *</label>
                  <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} className="h-9" placeholder="Sara Al-Otaibi" />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select className={inputCls} value={form.user_role || 'staff'} onChange={(e) => set('user_role', e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              {!isEdit && (
                <div>
                  <label className={labelCls}>Email *</label>
                  <Input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} className="h-9" placeholder="sara@school.edu.sa" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Phone</label>
                  <Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} className="h-9" placeholder="+9665…" />
                </div>
                {isEdit && (
                  <div>
                    <label className={labelCls}>Status</label>
                    <select className={inputCls} value={form.status || 'active'} onChange={(e) => set('status', e.target.value)}>
                      {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {!isEdit && (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={!!form.send_invite} onChange={(e) => set('send_invite', e.target.checked)} className="rounded border-border" />
                  Send invite / password-setup email
                </label>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEdit ? <UserCog className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />)}
                {isEdit ? 'Save Changes' : 'Create User'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
