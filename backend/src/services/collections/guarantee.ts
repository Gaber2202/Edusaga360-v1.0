import type { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getBrowser } from '../pdfBrowser.js';
import { runPdfJob } from '../../lib/pdfConcurrency.js';

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

  async generateReportPDF(tenantId: string, term?: string): Promise<Buffer> {
    const t = term ?? '2025-2026';
    const { baseline, measurements } = await this.dashboard(tenantId, t) as { baseline?: Record<string, unknown>; measurements: Record<string, unknown>[] };
    const { data: tenant } = await this.supabase.from('tenants').select('name_en, name_ar, vat_number, address, address_ar').eq('id', tenantId).single();

    const baselineRate = Number((baseline as { collection_rate?: number } | undefined)?.collection_rate ?? 0) * 100;
    const latest = measurements[measurements.length - 1] as { collection_rate?: number; delta_vs_baseline?: number; snapshot_hash?: string; created_at?: string } | undefined;
    const currentRate = Number(latest?.collection_rate ?? 0) * 100;
    const delta = Number(latest?.delta_vs_baseline ?? 0) * 100;

    const html = `
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8" />
<title>Guarantee Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic&display=swap');
  body { font-family: 'Noto Naskh Arabic', Arial, sans-serif; margin: 0; color: #1a1a1a; }
  .page { width: 210mm; min-height: 297mm; padding: 15mm; box-sizing: border-box; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 10mm; margin-bottom: 10mm; }
  .header .ar { text-align: right; direction: rtl; }
  .header .en { text-align: left; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 16px; color: #334155; margin: 0; }
  .meta { font-size: 12px; color: #64748b; margin-top: 4px; }
  .grid { display: flex; gap: 10mm; margin: 10mm 0; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8mm; text-align: center; }
  .card .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
  .card .value { font-size: 24px; font-weight: bold; margin-top: 2mm; }
  .card .ar-label { font-size: 11px; color: #64748b; direction: rtl; }
  .table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10mm; }
  .table th, .table td { border: 1px solid #e2e8f0; padding: 3mm; text-align: left; }
  .table th { background: #f8fafc; }
  .rtl { direction: rtl; text-align: right; }
  .signature { margin-top: 20mm; display: flex; justify-content: space-between; }
  .signature div { width: 45%; border-top: 1px solid #94a3b8; padding-top: 2mm; font-size: 12px; }
  .hash { font-family: monospace; font-size: 10px; color: #475569; word-break: break-all; margin-top: 6mm; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="en">
        <h1>Collection-Rate Guarantee Report</h1>
        <h2>${(tenant as { name_en?: string } | undefined)?.name_en ?? 'School'}</h2>
        <div class="meta">Term: ${t} | VAT: ${(tenant as { vat_number?: string } | undefined)?.vat_number ?? '-'}</div>
      </div>
      <div class="ar">
        <h1>تقرير ضمان نسبة التحصيل</h1>
        <h2>${(tenant as { name_ar?: string } | undefined)?.name_ar ?? 'المدرسة'}</h2>
        <div class="meta">الفصل: ${t}</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="label">Baseline Collection Rate</div>
        <div class="value">${baselineRate.toFixed(2)}%</div>
        <div class="ar-label rtl">معدل التحصيل الأساسي</div>
      </div>
      <div class="card">
        <div class="label">Current Collection Rate</div>
        <div class="value">${currentRate.toFixed(2)}%</div>
        <div class="ar-label rtl">معدل التحصيل الحالي</div>
      </div>
      <div class="card">
        <div class="label">Delta vs Baseline</div>
        <div class="value">${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%</div>
        <div class="ar-label rtl">الفرق مقابل الأساس</div>
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>Version</th>
          <th>Date</th>
          <th>Net Invoiced (SAR)</th>
          <th>Collected (SAR)</th>
          <th>Collection Rate</th>
          <th>Delta</th>
          <th>Snapshot Hash</th>
        </tr>
      </thead>
      <tbody>
        ${measurements.map((m, i) => {
          const mm = m as { version?: number; created_at?: string; net_invoiced?: number; collected?: number; collection_rate?: number; delta_vs_baseline?: number; snapshot_hash?: string };
          return `
            <tr>
              <td>${mm.version ?? i + 1}</td>
              <td>${mm.created_at ? new Date(mm.created_at).toISOString().split('T')[0] : '-'}</td>
              <td>${Number(mm.net_invoiced ?? 0).toLocaleString()}</td>
              <td>${Number(mm.collected ?? 0).toLocaleString()}</td>
              <td>${(Number(mm.collection_rate ?? 0) * 100).toFixed(2)}%</td>
              <td>${mm.delta_vs_baseline !== undefined ? `${Number(mm.delta_vs_baseline) >= 0 ? '+' : ''}${(Number(mm.delta_vs_baseline) * 100).toFixed(2)}%` : '-'}</td>
              <td class="hash">${(mm.snapshot_hash ?? '').slice(0, 24)}…</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div class="signature">
      <div>Finance Officer Signature / توقيع المسؤول المالي</div>
      <div>Date / التاريخ: ${new Date().toISOString().split('T')[0]}</div>
    </div>

    <div class="hash">Latest snapshot hash: ${(latest?.snapshot_hash ?? '').slice(0, 64)}</div>
  </div>
</body>
</html>`;

    return runPdfJob(async () => {
      const browser = await getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
        const pdfUint8 = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' } });
        return Buffer.from(pdfUint8);
      } finally {
        await page.close();
      }
    });
  }
}
