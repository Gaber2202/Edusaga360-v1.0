import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { UserPlus, Check, X, Loader2 } from 'lucide-react';

export default function UserRequests() {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-user-requests-pending'],
    queryFn: () => callApi('/api/tenant-users/pending', {}, { method: 'GET' }),
  });
  const requests = data?.requests ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tenant-user-requests-pending'] });

  const approve = async (id) => {
    setBusyId(id);
    try {
      await callApi(`/api/tenant-users/requests/${id}/approve`, { _: 1 });
      refresh();
    } catch (e) {
      alert(e.message || 'Failed to approve');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id) => {
    const reason = window.prompt('Reason for rejection (optional):') ?? '';
    setBusyId(id);
    try {
      await callApi(`/api/tenant-users/requests/${id}/reject`, { reason });
      refresh();
    } catch (e) {
      alert(e.message || 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">User Requests</h1>
        <p className="text-sm text-slate-500">{requests.length} pending request(s) from trial schools</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <UserPlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No pending user requests</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Requested User</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">School</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => {
                const tenant = r.tenants || {};
                const busy = busyId === r.id;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{r.requested_role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600">
                        {tenant.name_en || tenant.name_ar || '—'}
                        {tenant.tenant_code ? ` (${tenant.tenant_code})` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => approve(r.id)} disabled={busy} className="gap-1">
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => reject(r.id)} disabled={busy} className="gap-1">
                          <X className="w-4 h-4" />
                          Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
