import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export interface GuaranteeMeasurementInput {
  as_of_date?: string; // defaults to today
  term?: string; // e.g. '2025-2026' or '2025-2026-T1'
  scope?: 'all' | 'tuition';
}

interface CollectionMetrics {
  net_invoiced: number;
  collected: number;
  exclusions: number;
  invoice_count: number;
  paid_invoice_count: number;
}

function hashSnapshot(obj: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

export class GuaranteeEngine {
  constructor(private supabase: SupabaseClient) {}

  async captureBaseline(tenantId: string, input: GuaranteeMeasurementInput = {}): Promise<{ baseline_id: string; rate: number }> {
    const asOf = input.as_of_date ?? new Date().toISOString().split('T')[0];
    const term = input.term ?? '2025-2026';
    const scope = input.scope ?? 'all';

    const metrics = await this.computeCollectionMetrics(tenantId, asOf, term, scope);
    const baselineRate = metrics.net_invoiced > 0 ? metrics.collected / metrics.net_invoiced : 1;

    const inputsSnapshot = { as_of_date: asOf, term, scope, ...metrics };
    const inputsHash = hashSnapshot(inputsSnapshot);

    const { data, error } = await this.supabase
      .from('guarantee_baselines')
      .insert({
        tenant_id: tenantId,
        term,
        formula_version: 'v1',
        net_invoiced: metrics.net_invoiced,
        collected_within_window: metrics.collected,
        collection_rate: Number(baselineRate.toFixed(6)),
        inputs_snapshot: inputsSnapshot,
        inputs_hash: inputsHash,
      })
      .select('id')
      .single();
    if (error) throw error;

    return { baseline_id: (data as { id: string }).id, rate: baselineRate };
  }

  async recordMeasurement(tenantId: string, input: GuaranteeMeasurementInput = {}): Promise<{ measurement_id: string; rate: number; delta?: number }> {
    const asOf = input.as_of_date ?? new Date().toISOString().split('T')[0];
    const term = input.term ?? '2025-2026';
    const scope = input.scope ?? 'all';

    const metrics = await this.computeCollectionMetrics(tenantId, asOf, term, scope);
    const currentRate = metrics.net_invoiced > 0 ? metrics.collected / metrics.net_invoiced : 1;

    const { data: baseline } = await this.supabase
      .from('guarantee_baselines')
      .select('collection_rate')
      .eq('tenant_id', tenantId)
      .eq('term', term)
      .eq('formula_version', 'v1')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const delta = baseline ? Number((currentRate - ((baseline as { collection_rate: number }).collection_rate)).toFixed(6)) : undefined;
    const version = await this.nextVersion(tenantId, term);

    const inputsSnapshot = { as_of_date: asOf, term, scope, ...metrics };
    const snapshotHash = hashSnapshot(inputsSnapshot);

    const { data, error } = await this.supabase
      .from('guarantee_measurements')
      .insert({
        tenant_id: tenantId,
        term,
        version,
        net_invoiced: metrics.net_invoiced,
        collected: metrics.collected,
        exclusions: metrics.exclusions,
        collection_rate: Number(currentRate.toFixed(6)),
        delta_vs_baseline: delta,
        inputs_snapshot: inputsSnapshot,
        snapshot_hash: snapshotHash,
        formula_version: 'v1',
      })
      .select('id')
      .single();
    if (error) throw error;

    return { measurement_id: (data as { id: string }).id, rate: currentRate, delta };
  }

  async dashboard(tenantId: string, term?: string): Promise<Record<string, unknown>> {
    const t = term ?? '2025-2026';
    const { data: baseline } = await this.supabase
      .from('guarantee_baselines')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('term', t)
      .maybeSingle();
    const { data: measurements } = await this.supabase
      .from('guarantee_measurements')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('term', t)
      .order('created_at', { ascending: true });
    return { baseline, measurements: measurements ?? [] };
  }

  private async computeCollectionMetrics(tenantId: string, asOf: string, term: string, scope: string): Promise<CollectionMetrics> {
    const { data: invoices, error } = await this.supabase
      .from('invoices')
      .select('id, total_amount, paid_amount, status, date, due_date, items')
      .eq('tenant_id', tenantId)
      .lte('due_date', asOf)
      .neq('status', 'cancelled');
    if (error) throw error;

    let netInvoiced = 0;
    let collected = 0;
    let exclusions = 0;
    let invoiceCount = 0;
    let paidInvoiceCount = 0;

    for (const inv of (invoices ?? []) as Record<string, unknown>[]) {
      if (scope === 'tuition' && !this.isTuitionInvoice(inv)) continue;
      const total = Number(inv.total_amount ?? 0);
      const paid = Number(inv.paid_amount ?? 0);
      netInvoiced += total;
      collected += paid;
      invoiceCount++;
      if (paid >= total - 0.01) paidInvoiceCount++;

      // v1: exclude invoices explicitly flagged as guarantee_exclusions via lookup.
      const { data: exclusion } = await this.supabase
        .from('guarantee_exclusions')
        .select('amount')
        .eq('tenant_id', tenantId)
        .eq('invoice_id', inv.id as string)
        .maybeSingle();
      if (exclusion) {
        exclusions += Number((exclusion as { amount: number }).amount ?? 0);
      }
    }

    return {
      net_invoiced: Number(netInvoiced.toFixed(2)),
      collected: Number(collected.toFixed(2)),
      exclusions: Number(exclusions.toFixed(2)),
      invoice_count: invoiceCount,
      paid_invoice_count: paidInvoiceCount,
    };
  }

  private async nextVersion(tenantId: string, term: string): Promise<number> {
    const { data } = await this.supabase
      .from('guarantee_measurements')
      .select('version')
      .eq('tenant_id', tenantId)
      .eq('term', term)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    return ((data as { version: number } | null)?.version ?? 0) + 1;
  }

  private isTuitionInvoice(inv: Record<string, unknown>): boolean {
    const items = inv.items as Array<{ description?: string }> | undefined;
    if (!items || !Array.isArray(items)) return true; // default to tuition if no line items
    return items.some((i) => (i.description ?? '').toLowerCase().includes('tuition'));
  }
}
