import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { UserPlus, Check, X, Loader2 } from 'lucide-react';

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
};

export default function UserRequests() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-user-requests', statusFilter],
    queryFn: () => callApi(`/api/admin/user-requests${statusFilter ? `?status=${statusFilter}` : ''}`, {}, { method: 'GET' }),
  });
  const requests = data?.requests ?? [];

  const approve = async (req) => {
    setBusyId(req.id);
    try {
      await callApi(`/api/tenant-users/requests/${req.id}/approve`, { _: 1 });
      toast.success(`User approved — ${req.email}`);
      qc.invalidateQueries({ queryKey: ['admin-user-requests'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (e) {
      toast.error(e.message || 'Failed to approve');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (req) => {
    const reason = window.prompt('Reason for rejection (optional):') ?? '';
    setBusyId(req.id);
    try {
      await callApi(`/api/tenant-users/requests/${req.id}/reject`, { reason });
      toast.success('Request rejected');
      qc.invalidateQueries({ queryKey: ['admin-user-requests'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    } catch (e) {
      toast.error(e.message || 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  };

  const pending = requests.filter(r => r.status === 'pending');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">User Requests</h1>
        <p className="text-sm text-muted-foreground">
          Trial schools requesting additional users beyond their limit
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {[
          { key: 'pending', label: `Pending (${pending.length})` },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
          { key: '', label: 'All' },
        ].map(({ key, label }) => (
          <Button
            key={key}
            size="sm"
            variant={statusFilter === key ? 'default' : 'outline'}
            className="h-9 text-xs"
            onClick={() => setStatusFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-border border-t-najdi-700 rounded-full" /></div>
      ) : requests.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <UserPlus className="w-12 h-12 text-najdi-100 mx-auto mb-3" />
          <p className="text-muted-foreground">No {statusFilter} requests</p>
        </CardContent></Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sand border-b border-border">
              <tr>
                {['Requested User', 'Role', 'School', 'Status', 'Requested', 'Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map(r => {
                const tenant = r.tenants || {};
                const busy = busyId === r.id;
                return (
                  <tr key={r.id} className="hover:bg-sand">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{r.requested_role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {tenant.name_en || tenant.name_ar || '—'}
                      {tenant.tenant_code ? ` (${tenant.tenant_code})` : ''}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${STATUS_STYLES[r.status] || ''}`}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approve(r)} disabled={busy} className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => reject(r)} disabled={busy} className="h-7 gap-1 text-xs">
                            <X className="w-3.5 h-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                      {r.status === 'rejected' && r.rejection_reason && (
                        <p className="text-xs text-muted-foreground italic">"{r.rejection_reason}"</p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
