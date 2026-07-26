import type { SupabaseClient } from '@supabase/supabase-js';

export interface CollectionDashboardResult {
  kill_switch_active: boolean;
  total_outstanding: number;
  total_profiles: number;
  segment_counts: Record<string, number>;
  pending_approvals: number;
  pending_messages: number;
  messages_sent_today: number;
  broken_plans: number;
  collection_rate: number;
}

export class CollectionDashboardService {
  constructor(private supabase: SupabaseClient) {}

  async getDashboard(tenantId: string): Promise<CollectionDashboardResult> {
    const today = new Date().toISOString().split('T')[0];
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    const [{ data: settings }, { data: profiles }, { data: approvals }, { data: pendingMessages }, { data: sentToday }, { data: brokenPlans }, { data: invoices }] = await Promise.all([
      this.supabase.from('collection_settings').select('kill_switch_activated_at').eq('tenant_id', tenantId).maybeSingle(),
      this.supabase.from('collection_profiles').select('current_segment, outstanding_balance').eq('tenant_id', tenantId).gt('outstanding_balance', 0),
      this.supabase.from('agent_approval_queue').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending'),
      this.supabase.from('collection_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('delivery_status', ['pending', 'scheduled']),
      this.supabase.from('collection_messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('delivery_status', 'sent').gte('sent_at', startOfDay).lte('sent_at', endOfDay),
      this.supabase.from('payment_plans').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).not('broken_at', 'is', null),
      this.supabase.from('invoices').select('total_amount, paid_amount').eq('tenant_id', tenantId).neq('status', 'cancelled'),
    ]);

    const segmentCounts: Record<string, number> = {};
    let totalOutstanding = 0;
    for (const p of (profiles ?? []) as { current_segment: string; outstanding_balance: number }[]) {
      segmentCounts[p.current_segment] = (segmentCounts[p.current_segment] ?? 0) + 1;
      totalOutstanding += Number(p.outstanding_balance ?? 0);
    }

    let totalInvoiced = 0;
    let totalCollected = 0;
    for (const inv of (invoices ?? []) as { total_amount: number; paid_amount: number }[]) {
      totalInvoiced += Number(inv.total_amount ?? 0);
      totalCollected += Number(inv.paid_amount ?? 0);
    }
    const collectionRate = totalInvoiced > 0 ? Number(((totalCollected / totalInvoiced) * 100).toFixed(2)) : 0;

    return {
      kill_switch_active: !!(settings as { kill_switch_activated_at?: string | null } | null)?.kill_switch_activated_at,
      total_outstanding: Number(totalOutstanding.toFixed(2)),
      total_profiles: (profiles ?? []).length,
      segment_counts: segmentCounts,
      pending_approvals: (approvals as { count: number } | null)?.count ?? 0,
      pending_messages: (pendingMessages as { count: number } | null)?.count ?? 0,
      messages_sent_today: (sentToday as { count: number } | null)?.count ?? 0,
      broken_plans: (brokenPlans as { count: number } | null)?.count ?? 0,
      collection_rate: collectionRate,
    };
  }
}
