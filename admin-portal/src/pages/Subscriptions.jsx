import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callApi } from '../lib/supabase';
import { PLAN_COLORS, STATUS_COLORS, planLabel, formatMoney, PLANS } from '../lib/plans';
import ConvertToPaidDialog from '../components/ConvertToPaidDialog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { format } from 'date-fns';
import { DollarSign, TrendingUp, Users, CreditCard, Sparkles, CheckCircle, XCircle, FileText, ExternalLink } from 'lucide-react';

function KPI({ label, value, sub, icon: Icon, color }) {
  const colors = { emerald: 'bg-emerald-50 text-emerald-600', blue: 'bg-najdi-50 text-najdi-700', purple: 'bg-purple-50 text-purple-600', amber: 'bg-amber-50 text-amber-600' };
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`p-3 rounded-xl ${colors[color]}`}><Icon className="w-5 h-5" /></div>
        <div><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold text-ink mt-0.5">{value}</p>{sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}</div>
      </CardContent>
    </Card>
  );
}

export default function Subscriptions() {
  const [convertTenant, setConvertTenant] = useState(null);
  const [rejectDialogOrder, setRejectDialogOrder] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const queryClient = useQueryClient();

  const { data: tenantsData, isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => callApi('/api/admin/tenants', {}, { method: 'GET' }),
  });
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => callApi('/api/admin/stats', {}, { method: 'GET' }),
  });

  // Subscription orders pending verification
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ['pending-subscription-orders'],
    queryFn: async () => {
      // The admin fetches all subscription orders across tenants
      const result = await callApi('/api/subscription/orders', {}, { method: 'GET' });
      return (Array.isArray(result) ? result : []).filter(o =>
        ['pending_payment', 'awaiting_verification'].includes(o.status)
      );
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (orderId) => callApi(`/api/subscription/orders/${orderId}/verify`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-subscription-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }) => callApi(`/api/subscription/orders/${orderId}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-subscription-orders'] });
      setRejectDialogOrder(null);
      setRejectReason('');
    },
  });

  const tenants = tenantsData?.tenants ?? [];
  const paying = tenants.filter((t) => t.status === 'active' && (Number(t.monthly_revenue) > 0 || t.converted_from_trial));
  const mrr = stats?.mrr ?? paying.reduce((s, t) => s + (Number(t.monthly_revenue) || 0), 0);
  const arpu = paying.length ? mrr / paying.length : 0;

  // Plan distribution across all tenants.
  const dist = tenants.reduce((acc, t) => { const p = t.plan_code || t.plan || 'free_trial'; acc[p] = (acc[p] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Subscriptions & Revenue</h1>
        <p className="text-sm text-muted-foreground">Plans, recurring revenue, and trial conversions</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI label="MRR" value={formatMoney(mrr)} sub={`${formatMoney((stats?.arr ?? mrr * 12))} ARR`} icon={DollarSign} color="emerald" />
        <KPI label="Paying customers" value={paying.length} icon={CreditCard} color="blue" />
        <KPI label="ARPU" value={formatMoney(Math.round(arpu))} sub="per customer / mo" icon={Users} color="purple" />
        <KPI label="Converted this month" value={stats?.conversionsThisMonth ?? 0} icon={TrendingUp} color="amber" />
      </div>

      {/* Plan distribution */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([plan, count]) => (
          <Card key={plan} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-ink">{count}</p>
              <Badge className={`text-xs ${PLAN_COLORS[plan] || 'bg-sand-alt text-ink'}`}>{planLabel(plan)}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Plan reference */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">List pricing (SAR / month)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PLANS.map((p) => (
            <div key={p.code} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between"><span className="font-semibold text-ink">{p.name}</span><Badge className={`text-xs ${PLAN_COLORS[p.code]}`}>{p.max_users} seats</Badge></div>
              <p className="text-lg font-bold text-ink mt-1">{p.monthly ? formatMoney(p.monthly) : 'Custom'}</p>
              <p className="text-[11px] text-muted-foreground">{p.blurb}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pending Payment Orders */}
      {pendingOrders.length > 0 && (
        <Card className="border-amber-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600" />
              Payment Orders Awaiting Action ({pendingOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-xs text-muted-foreground uppercase tracking-wide border-y border-amber-200">
                <tr>
                  {['Tenant', 'Type', 'Amount (SAR)', 'Method', 'Status', 'Date', 'Proof', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {pendingOrders.map(order => {
                  const tenant = tenants.find(t => t.id === order.tenant_id);
                  return (
                    <tr key={order.id} className="hover:bg-amber-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{tenant?.name_en || order.tenant_id?.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {order.order_type === 'plan_upgrade'
                          ? <Badge className="bg-purple-100 text-purple-800">Upgrade → {order.plan_code}</Badge>
                          : <Badge className="bg-blue-100 text-blue-800">+{order.additional_seats} seats</Badge>}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink">{formatMoney(order.total_amount || 0)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{(order.payment_method || '').replace('_', ' ')}</td>
                      <td className="px-4 py-3">
                        <Badge className={order.status === 'awaiting_verification' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}>
                          {order.status?.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {order.created_at ? format(new Date(order.created_at), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {order.proof_url ? (
                          <a href={order.proof_url} target="_blank" rel="noopener noreferrer" className="text-najdi-700 hover:underline text-xs flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View
                          </a>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {order.status === 'awaiting_verification' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              disabled={verifyMutation.isPending}
                              onClick={() => verifyMutation.mutate(order.id)}
                            >
                              <CheckCircle className="w-3 h-3" /> Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1 border-red-300 text-red-700 hover:bg-red-50"
                              onClick={() => setRejectDialogOrder(order)}
                            >
                              <XCircle className="w-3 h-3" /> Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectDialogOrder} onOpenChange={(v) => { if (!v) { setRejectDialogOrder(null); setRejectReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for rejecting this payment proof:</p>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Amount does not match, unclear receipt..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialogOrder(null); setRejectReason(''); }}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={rejectMutation.isPending}
              onClick={() => rejectMutation.mutate({ orderId: rejectDialogOrder?.id, reason: rejectReason })}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-2"><CardTitle className="text-base">Customer Billing</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-border border-t-najdi-700 rounded-full" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-sand text-xs text-muted-foreground uppercase tracking-wide border-y border-border">
                <tr>{['School', 'Plan', 'Status', 'Cycle', 'MRR', 'Seats', 'Renews', ''].map((h) => <th key={h} className="text-left px-4 py-2.5">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => {
                  const isPaid = t.status === 'active' && (Number(t.monthly_revenue) > 0 || t.converted_from_trial);
                  return (
                    <tr key={t.id} className="hover:bg-sand">
                      <td className="px-4 py-3"><p className="font-medium text-ink">{t.name_en || t.name_ar}</p><p className="text-xs text-muted-foreground">{t.tenant_code}</p></td>
                      <td className="px-4 py-3"><Badge className={`text-xs ${PLAN_COLORS[t.plan_code || t.plan] || 'bg-sand-alt'}`}>{planLabel(t.plan_code || t.plan)}</Badge></td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[t.status] || 'bg-sand-alt text-muted-foreground'}`}>{t.status?.replace('_', ' ')}</span></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{isPaid ? (t.billing_cycle || 'monthly') : '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-ink">{isPaid && t.monthly_revenue ? formatMoney(t.monthly_revenue) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.user_count ?? 0}/{t.max_users ?? 5}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.plan_renews_at ? format(new Date(t.plan_renews_at), 'MMM d, yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {!isPaid && t.status !== 'suspended' && (
                          <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setConvertTenant(t)}><Sparkles className="w-3.5 h-3.5" /> Convert</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConvertToPaidDialog tenant={convertTenant} open={!!convertTenant} onOpenChange={(v) => !v && setConvertTenant(null)} onConverted={() => setConvertTenant(null)} />
    </div>
  );
}
