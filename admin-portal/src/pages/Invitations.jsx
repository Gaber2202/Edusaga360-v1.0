import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Mail, Plus, Copy, Trash2, X, RefreshCw, Send } from 'lucide-react';

const STATUS_STYLES = {
  pending: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-slate-100 text-slate-500',
  revoked: 'bg-red-100 text-red-600',
};

const EMPTY_FORM = {
  recipient_name: '',
  recipient_email: '',
  school_name: '',
  message: '',
  plan_code: 'free_trial',
  expires_days: '7',
};

export default function Invitations() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [lastLink, setLastLink] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-invitations'],
    queryFn: () => callApi('/api/admin/invitations', {}, { method: 'GET' }),
  });
  const invitations = data?.invitations ?? [];

  const sendInvite = async () => {
    if (!form.recipient_email || !form.recipient_name) {
      toast.error('Name and email are required');
      return;
    }
    setSending(true);
    try {
      const res = await callApi('/api/admin/invitations', {
        ...form,
        expires_days: parseInt(form.expires_days),
      });
      setLastLink(res.invite_link);
      toast.success('Invitation created');
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ['admin-invitations'] });
    } catch (e) {
      toast.error(e.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const copyLink = (link) => {
    navigator.clipboard.writeText(link).then(() => toast.success('Link copied!')).catch(() => toast.error('Copy failed'));
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this invitation?')) return;
    try {
      await callApi(`/api/admin/invitations/${id}`, { status: 'revoked' });
      qc.invalidateQueries({ queryKey: ['admin-invitations'] });
      toast.success('Invitation revoked');
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  const deleteInvite = async (id) => {
    try {
      await callApi(`/api/admin/invitations/${id}`, {}, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: ['admin-invitations'] });
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message || 'Failed');
    }
  };

  const pending = invitations.filter(i => i.status === 'pending');
  const rest = invitations.filter(i => i.status !== 'pending');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Platform Invitations</h1>
          <p className="text-sm text-slate-500">Invite schools and prospects to try EduSaga 360</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-1.5">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Invitation'}
        </Button>
      </div>

      {/* New invitation form */}
      {showForm && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-slate-800">Send Invitation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'recipient_name', label: 'Contact Name *', placeholder: 'Dr. Ahmed Al-Rashid' },
                { key: 'recipient_email', label: 'Email Address *', placeholder: 'principal@school.edu.sa', type: 'email' },
                { key: 'school_name', label: 'School Name', placeholder: 'Al Noor International School' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <Input
                    type={type || 'text'}
                    placeholder={placeholder}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="h-9"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Plan</label>
                <select
                  className="w-full h-9 rounded-md border border-slate-200 px-3 text-sm bg-white"
                  value={form.plan_code}
                  onChange={e => setForm(f => ({ ...f, plan_code: e.target.value }))}
                >
                  <option value="free_trial">Free Trial</option>
                  <option value="starter">Starter</option>
                  <option value="professional">Professional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Expires In (days)</label>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={form.expires_days}
                  onChange={e => setForm(f => ({ ...f, expires_days: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Personal Message (optional)</label>
              <textarea
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm resize-none h-20"
                placeholder="We'd love for you to try EduSaga 360…"
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={sendInvite} disabled={sending} className="gap-1.5">
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Creating…' : 'Create Invitation'}
              </Button>
            </div>

            {/* Show invite link after creation */}
            {lastLink && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-1">Invitation link created — copy and send manually:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white rounded border border-emerald-200 px-2 py-1.5 truncate text-emerald-800">{lastLink}</code>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => copyLink(lastLink)}>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </Button>
                </div>
                <p className="text-xs text-emerald-600 mt-1.5">📧 Production: email is auto-sent via Infobip when INFOBIP_API_KEY is configured in Railway.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats strip */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Total Sent', value: invitations.length, color: 'text-slate-800' },
          { label: 'Pending', value: pending.length, color: 'text-blue-600' },
          { label: 'Accepted', value: invitations.filter(i => i.status === 'accepted').length, color: 'text-emerald-600' },
          { label: 'Expired/Revoked', value: invitations.filter(i => ['expired', 'revoked'].includes(i.status)).length, color: 'text-slate-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-lg border border-slate-200 px-4 py-2 text-center shadow-sm">
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" /></div>
      ) : invitations.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><Mail className="w-12 h-12 text-slate-200 mx-auto mb-3" /><p className="text-slate-400">No invitations yet — send your first one above</p></CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Recipient', 'School', 'Plan', 'Status', 'Expires', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...pending, ...rest].map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 text-sm">{inv.recipient_name}</p>
                    <p className="text-xs text-slate-400">{inv.recipient_email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{inv.school_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 capitalize">{inv.plan_code}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${STATUS_STYLES[inv.status] || 'bg-slate-100 text-slate-600'}`}>
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {inv.expires_at ? format(new Date(inv.expires_at), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {inv.token && inv.status === 'pending' && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Copy invite link" onClick={() => {
                          const base = 'https://edusaga-360-production.vercel.app';
                          copyLink(`${base}/register?invite=${inv.token}`);
                        }}>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                        </Button>
                      )}
                      {inv.status === 'pending' && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Revoke" onClick={() => revoke(inv.id)}>
                          <X className="w-3.5 h-3.5 text-amber-500" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Delete" onClick={() => deleteInvite(inv.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
