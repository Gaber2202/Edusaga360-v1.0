import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole, EXEC_ROLES } from '../middleware/auth.js';

export const benchmarksRouter = Router();


// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 10000) / 100 : 0;
}
function avg(arr: number[]): number {
  return arr.length > 0 ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 100) / 100 : 0;
}
function percentileRank(value: number, pool: number[]): number {
  if (pool.length === 0) return 50;
  const below = pool.filter(v => v < value).length;
  return Math.round((below / pool.length) * 100);
}

// ─── Compute current tenant's snapshot ───────────────────────────────────────

async function computeSnapshot(tenantId: string): Promise<Record<string, unknown>> {
  const today      = new Date().toISOString().slice(0, 10);
  const thirtyAgo  = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [empRes, attRes, invRes, studRes, tenantRes] = await Promise.all([
    supabase.from('employees').select('id, nationality, basic_salary, status').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('employee_attendance').select('status').eq('tenant_id', tenantId).gte('date', thirtyAgo).lte('date', today),
    supabase.from('invoices').select('total_amount, paid_amount, status').eq('tenant_id', tenantId),
    supabase.from('students').select('id').eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('tenants').select('school_type, city').eq('id', tenantId).single(),
  ]);

  const employees = (empRes.data ?? []) as any[];
  const records   = (attRes.data ?? []) as any[];
  const invoices  = (invRes.data ?? []) as any[];
  const students  = (studRes.data ?? []) as any[];
  const tenant    = tenantRes.data as any;

  const saudiCount = employees.filter((e: any) => /^(saudi|saudi arabia|sa|سعودي)$/i.test((e.nationality ?? '').trim())).length;
  const salaries   = employees.map((e: any) => Number(e.basic_salary ?? 0)).filter(s => s > 0);
  const presentRecs = records.filter((r: any) => r.status === 'present').length;
  const lateRecs    = records.filter((r: any) => r.status === 'late').length;

  const totalInvoiced = invoices.reduce((s: number, i: any) => s + Number(i.total_amount ?? 0), 0);
  const totalPaid     = invoices.reduce((s: number, i: any) => s + Number(i.paid_amount ?? 0), 0);
  const paidCount     = invoices.filter((i: any) => i.status === 'paid').length;

  return {
    tenant_id:             tenantId,
    snapshot_date:         today,
    school_type:           tenant?.school_type ?? null,
    city:                  tenant?.city ?? null,
    employee_count:        employees.length,
    saudi_pct:             pct(saudiCount, employees.length),
    avg_basic_salary:      avg(salaries),
    avg_attendance_rate:   pct(presentRecs, records.length),
    avg_late_rate:         pct(lateRecs, records.length),
    avg_pending_leave_days: 0,
    fee_collection_rate:   totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 10000) / 100 : pct(paidCount, invoices.length),
    avg_invoice_amount:    invoices.length > 0 ? Math.round(totalInvoiced / invoices.length * 100) / 100 : 0,
    student_count:         students.length,
  };
}

// ─── POST /api/benchmarks/snapshot — recompute this tenant's snapshot ────────

benchmarksRouter.post('/snapshot', requireRole(EXEC_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id  = req.user!.tenant_id!;
    const snapshot   = await computeSnapshot(tenant_id);

    const { data, error } = await supabase
      .from('benchmark_snapshots')
      .upsert(snapshot, { onConflict: 'tenant_id,snapshot_date' })
      .select()
      .single();

    if (error) throw error;
    return res.json({ snapshot: data });
  } catch (err: unknown) {
    console.error('Benchmark snapshot error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Snapshot failed' });
  }
});

// ─── GET /api/benchmarks — compare current tenant vs. network ────────────────

benchmarksRouter.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const today     = new Date().toISOString().slice(0, 10);

    // Get this tenant's latest snapshot (auto-compute if missing or stale)
    let { data: mySnap } = await supabase
      .from('benchmark_snapshots')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('snapshot_date', today)
      .single();

    if (!mySnap) {
      const snapshot = await computeSnapshot(tenant_id);
      const { data: upserted } = await supabase
        .from('benchmark_snapshots')
        .upsert(snapshot, { onConflict: 'tenant_id,snapshot_date' })
        .select()
        .single();
      mySnap = upserted;
    }

    if (!mySnap) return res.status(500).json({ error: 'Could not compute snapshot' });

    // Fetch network pool (last 7 days, same school type if available, anonymised)
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data: pool } = await supabase
      .from('benchmark_snapshots')
      .select('employee_count, saudi_pct, avg_basic_salary, avg_attendance_rate, avg_late_rate, fee_collection_rate, student_count')
      .neq('tenant_id', tenant_id)   // exclude self
      .gte('snapshot_date', sevenAgo);

    const poolRows = (pool ?? []) as any[];
    const N = poolRows.length;

    const metrics = [
      'employee_count', 'saudi_pct', 'avg_basic_salary',
      'avg_attendance_rate', 'avg_late_rate', 'fee_collection_rate', 'student_count',
    ] as const;

    const comparison: Record<string, {
      your_value:      number;
      network_avg:     number;
      network_min:     number;
      network_max:     number;
      percentile:      number;
      pool_size:       number;
    }> = {};

    for (const metric of metrics) {
      const myVal      = Number((mySnap as any)[metric] ?? 0);
      const poolVals   = poolRows.map((r: any) => Number(r[metric] ?? 0)).filter((v: number) => !isNaN(v));
      const networkAvg = avg(poolVals);
      const networkMin = poolVals.length > 0 ? Math.min(...poolVals) : 0;
      const networkMax = poolVals.length > 0 ? Math.max(...poolVals) : 0;
      const pctRank    = percentileRank(myVal, poolVals);

      comparison[metric] = {
        your_value:  myVal,
        network_avg: networkAvg,
        network_min: networkMin,
        network_max: networkMax,
        percentile:  pctRank,
        pool_size:   N,
      };
    }

    return res.json({
      snapshot_date:  today,
      pool_size:       N,
      your_school:    { school_type: (mySnap as any).school_type, city: (mySnap as any).city },
      comparison,
      note:           N < 3 ? 'Network pool is small — benchmarks will improve as more schools join' : null,
    });
  } catch (err: unknown) {
    console.error('Benchmark error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Benchmark failed' });
  }
});

// ─── GET /api/benchmarks/gosi-export — GOSI-format CSV ───────────────────────
//
// Saudi GOSI portal accepts CSV with the official column layout.
// This generates a ready-to-upload file.

benchmarksRouter.get('/gosi-export', async (req: AuthenticatedRequest, res) => {
  try {
    const tenant_id = req.user!.tenant_id!;
    const month  = req.query.month as string | undefined;
    const year   = req.query.year  as string | undefined;
    const now    = new Date();
    const m      = month ? String(month).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    const y      = year  ? String(year)  : String(now.getFullYear());

    const { data: employees, error } = await supabase
      .from('employees')
      .select('employee_number, name_en, name_ar, nationality, national_id, iqama_number, basic_salary, hire_date, status, bank_iban')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active');

    if (error) throw error;

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name_en, name_ar')
      .eq('id', tenant_id)
      .single();

    const rows = (employees ?? []) as any[];

    const GOSI_CAP = 45_000;
    const lines: string[] = [];

    // Header row — official GOSI CSV columns
    lines.push([
      'Employer_Name', 'Employee_Number', 'Employee_Name_EN', 'Employee_Name_AR',
      'Nationality', 'ID_Number', 'IBAN', 'Basic_Salary', 'GOSI_Wage',
      'Employee_Contribution', 'Employer_Contribution', 'Total_GOSI',
      'Hire_Date', 'Month', 'Year',
    ].join(','));

    for (const emp of rows) {
      const basic     = Number(emp.basic_salary ?? 0);
      const isSaudi   = /^(saudi|saudi arabia|sa|سعودي)$/i.test((emp.nationality ?? '').trim());
      const gosiWage  = Math.min(basic, GOSI_CAP);
      const empRate   = isSaudi ? 0.09   : 0.015;
      const erRate    = isSaudi ? 0.1175 : 0.02;
      const empCont   = Math.round(gosiWage * empRate  * 100) / 100;
      const erCont    = Math.round(gosiWage * erRate   * 100) / 100;
      const total     = Math.round((empCont + erCont)  * 100) / 100;
      const idNum     = emp.national_id ?? emp.iqama_number ?? '';

      const row = [
        (tenant as any)?.name_en ?? '',
        emp.employee_number ?? '',
        (emp.name_en ?? '').replace(/,/g, ' '),
        (emp.name_ar ?? '').replace(/,/g, ' '),
        emp.nationality ?? '',
        idNum,
        emp.bank_iban ?? '',
        basic.toFixed(2),
        gosiWage.toFixed(2),
        empCont.toFixed(2),
        erCont.toFixed(2),
        total.toFixed(2),
        emp.hire_date ?? '',
        m, y,
      ].join(',');

      lines.push(row);
    }

    const csv  = lines.join('\n');
    const tenantSlug = (tenant as any)?.name_en?.replace(/[^a-zA-Z0-9]/g, '_') ?? tenant_id.slice(0, 8);
    const filename   = `GOSI_${tenantSlug}_${y}_${m}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('﻿' + csv); // BOM for Excel compatibility
  } catch (err: unknown) {
    console.error('GOSI export error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Export failed' });
  }
});
