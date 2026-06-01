import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { CreditCard, Check, X, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const PLAN_COLORS = {
  free_trial: 'bg-amber-100 text-amber-700',
  trial: 'bg-amber-100 text-amber-700',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-emerald-100 text-emerald-700',
  government: 'bg-slate-100 text-slate-700',
};

const PLAN_TIERS = { free_trial: 0, starter: 1, professional: 2, enterprise: 3, government: 4 };

export default function Subscriptions() {
  const queryClient = useQueryClient();
  const [reviewDialog, setReviewDialog] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => fetchData(supabase.from('tenants').select('*').order('created_date', { ascending: false })),
  });

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['admin-subscription-requests'],
    queryFn: () => fetchData(
      supabase.from('tenant_requests')
        .select('*, tenants(name_en, name_ar, plan_code)')
        .eq('status', 'pending')
        .in('request_type', ['plan_upgrade', 'plan_downgrade', 'additional_users'])
        .order('created_date', { ascending: false })
    ),
  });

  const { data: allRequests = [] } = useQuery({
    queryKey: ['admin-all-requests'],
    queryFn: () => fetchData(
      supabase.from('tenant_requests')
        .select('*, tenants(name_en, name_ar)')
        .in('request_type', ['plan_upgrade', 'plan_downgrade', 'additional_users'])
        .order('created_date', { ascending: false })
        .limit(50)
    ),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ requestId, tenantId, requestedPlan, requestType, additionalUsers }) => {
      if (requestType === 'additional_users') {
        const tenant = tenants.find(t => t.id === tenantId);
        const newMax = (tenant?.max_users || 0) + (additionalUsers || 0);
        await supabase.from('tenants').update({ max_users: newMax }).eq('id', tenantId);
      } else {
        const planDef = requestedPlan ? { plan_code: requestedPlan } : {};
        await supabase.from('tenants').update(planDef).eq('id', tenantId);
      }
      await supabase.from('tenant_requests').update({
        status: 'approved',
        admin_notes: adminNotes || 'Approved by super admin',
        resolved_date: new Date().toISOString(),
      }).eq('id', requestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-subscription-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      setReviewDialog(null);
      setAdminNotes('');
    },
  });

  const denyMutation = useMutation({
    mutationFn: async ({ requestId }) => {
      await supabase.from('tenant_requests').update({
        status: 'denied',
        admin_notes: adminNotes || 'Denied by super admin',
        resolved_date: new Date().toISOString(),
      }).eq('id', requestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-subscription-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin-all-requests'] });
      setReviewDialog(null);
      setAdminNotes('');
    },
  });

  const plans = tenants.reduce((acc, t) => {
    const plan = t.plan_code || t.plan || 'free_trial';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Subscription Management</h1>
        <p className="text-sm text-slate-500">Manage tenant plans, approve upgrades & downgrades</p>
      </div>

      {/* Plan distribution */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(plans).map(([plan, count]) => (
          <Card key={plan}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-800">{count}</p>
              <Badge className={PLAN_COLORS[plan] || 'bg-slate-100 text-slate-700'}>{plan}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              Pending Requests ({pendingRequests.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map(req => {
              const tenantName = req.tenants?.name_en || req.tenants?.name_ar || req.tenant_id;
              const currentPlan = req.tenants?.plan_code || 'free_trial';
              const isUpgrade = (PLAN_TIERS[req.requested_plan] || 0) > (PLAN_TIERS[currentPlan] || 0);
              return (
                <div key={req.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{tenantName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {req.request_type === 'additional_users' ? (
                        <Badge variant="outline">+{req.additional_users || '?'} Users</Badge>
                      ) : (
                        <>
                          <Badge className={PLAN_COLORS[currentPlan]}>{currentPlan}</Badge>
                          <span className="text-xs text-slate-400">→</span>
                          <Badge className={PLAN_COLORS[req.requested_plan] || 'bg-slate-100'}>
                            {isUpgrade ? <ArrowUpRight className="w-3 h-3 me-1 inline" /> : <ArrowDownRight className="w-3 h-3 me-1 inline" />}
                            {req.requested_plan}
                          </Badge>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {req.created_date ? new Date(req.created_date).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setReviewDialog(req)}>Review</Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Tenants table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Tenant</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Users</th>
                <th className="text-left px-4 py-3">Students</th>
                <th className="text-left px-4 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">{t.name_en || t.name_ar}</p>
                    <p className="text-xs text-slate-500">{t.tenant_code}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={PLAN_COLORS[t.plan_code || t.plan] || PLAN_COLORS.trial}>
                      {t.plan_code || t.plan || 'trial'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      t.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.current_users || 0} / {t.max_users || '∞'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.current_students || 0} / {t.max_students || '∞'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{t.monthly_revenue ? `${t.monthly_revenue} SAR` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent request history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Request History</CardTitle>
        </CardHeader>
        <CardContent>
          {allRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No subscription requests yet</p>
          ) : (
            <div className="space-y-2">
              {allRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm text-slate-700">
                      {req.tenants?.name_en || req.tenant_id} — {req.request_type === 'additional_users'
                        ? `+${req.additional_users || '?'} users`
                        : `${req.request_type}: ${req.requested_plan || '?'}`}
                    </p>
                    <p className="text-xs text-slate-400">
                      {req.created_date ? new Date(req.created_date).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <Badge variant={req.status === 'approved' ? 'default' : req.status === 'denied' ? 'destructive' : 'outline'}>
                    {req.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => setReviewDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review Request</DialogTitle>
          </DialogHeader>
          {reviewDialog && (
            <div className="space-y-4 py-4">
              <div>
                <p className="text-sm text-slate-500">Tenant</p>
                <p className="font-medium">{reviewDialog.tenants?.name_en || reviewDialog.tenant_id}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Request Type</p>
                <p className="font-medium capitalize">{reviewDialog.request_type?.replace(/_/g, ' ')}</p>
              </div>
              {reviewDialog.requested_plan && (
                <div>
                  <p className="text-sm text-slate-500">Requested Plan</p>
                  <Badge className={PLAN_COLORS[reviewDialog.requested_plan]}>{reviewDialog.requested_plan}</Badge>
                </div>
              )}
              {reviewDialog.additional_users && (
                <div>
                  <p className="text-sm text-slate-500">Additional Users Requested</p>
                  <p className="font-medium">{reviewDialog.additional_users}</p>
                </div>
              )}
              {reviewDialog.reason && (
                <div>
                  <p className="text-sm text-slate-500">Reason</p>
                  <p className="text-sm text-slate-700">{reviewDialog.reason}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-slate-500 mb-1">Admin Notes</p>
                <Textarea
                  placeholder="Optional notes..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => denyMutation.mutate({ requestId: reviewDialog.id })}
              disabled={denyMutation.isPending}
            >
              <X className="w-4 h-4 me-1" />
              Deny
            </Button>
            <Button
              onClick={() => approveMutation.mutate({
                requestId: reviewDialog.id,
                tenantId: reviewDialog.tenant_id,
                requestedPlan: reviewDialog.requested_plan,
                requestType: reviewDialog.request_type,
                additionalUsers: reviewDialog.additional_users,
              })}
              disabled={approveMutation.isPending}
            >
              <Check className="w-4 h-4 me-1" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
