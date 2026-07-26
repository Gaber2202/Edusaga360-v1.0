import type { SupabaseClient } from '@supabase/supabase-js';

export function sar(n: number): number {
  return Math.round(n * 100) / 100;
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function daysBetween(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export interface AgingReport {
  as_of: string;
  total_outstanding: number;
  buckets: Record<string, number>;
  items: any[];
}

export async function getAgingReport(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { academic_year?: string; includeStudents?: boolean },
): Promise<AgingReport> {
  const today = todayStr();
  let q = supabase
    .from('invoices')
    .select('id, invoice_number, student_id, total_amount, paid_amount, due_date, status, students(name_en, name_ar, grade, guardian_id), academic_year')
    .eq('tenant_id', tenantId)
    .in('status', ['issued', 'partial', 'overdue', 'viewed']);
  if (options?.academic_year) q = q.eq('academic_year', options.academic_year);
  const { data, error } = await q;
  if (error) throw error;

  const buckets: Record<string, number> = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  const items: any[] = [];
  let total = 0;

  for (const inv of data ?? []) {
    const balance = sar((Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0));
    if (balance <= 0) continue;
    const days = daysBetween(String(inv.due_date), today);
    let bucket = 'current';
    if (days > 0) bucket = days <= 30 ? '1_30' : days <= 60 ? '31_60' : days <= 90 ? '61_90' : '90_plus';

    buckets[bucket] = sar((buckets[bucket] || 0) + balance);
    total = sar(total + balance);

    const student = (inv as Record<string, unknown>).students as Record<string, unknown> | undefined;
    const item: any = {
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      due_date: inv.due_date,
      balance,
      days_until_due: days,
      bucket,
    };
    if (options?.includeStudents !== false) {
      item.student = student;
    }
    items.push(item);
  }

  return { as_of: today, total_outstanding: total, buckets, items };
}

export interface ExpectedCollections {
  from_date: string;
  to_date: string;
  total_expected: number;
  by_date: Record<string, number>;
  sources: { source: string; amount: number }[];
}

export async function getExpectedCollections(
  supabase: SupabaseClient,
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<ExpectedCollections> {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, due_date, total_amount, paid_amount, status')
    .eq('tenant_id', tenantId)
    .gte('due_date', fromDate)
    .lte('due_date', toDate)
    .in('status', ['issued', 'partial', 'overdue', 'viewed']);

  const { data: installments } = await supabase
    .from('payment_plan_installments')
    .select('id, due_date, amount, paid_amount, status')
    .eq('tenant_id', tenantId)
    .gte('due_date', fromDate)
    .lte('due_date', toDate)
    .in('status', ['pending', 'overdue']);

  const byDate: Record<string, number> = {};
  let totalExpected = 0;

  for (const inv of invoices ?? []) {
    const balance = sar((Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0));
    if (balance <= 0) continue;
    const d = String(inv.due_date);
    byDate[d] = sar((byDate[d] || 0) + balance);
    totalExpected = sar(totalExpected + balance);
  }

  for (const inst of installments ?? []) {
    const balance = sar((Number(inst.amount) || 0) - (Number(inst.paid_amount) || 0));
    if (balance <= 0) continue;
    const d = String(inst.due_date);
    byDate[d] = sar((byDate[d] || 0) + balance);
    totalExpected = sar(totalExpected + balance);
  }

  return {
    from_date: fromDate,
    to_date: toDate,
    total_expected: totalExpected,
    by_date: byDate,
    sources: [
      { source: 'invoices', amount: sar(invoices?.reduce((s, inv) => s + sar((Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0)), 0) ?? 0) },
      { source: 'installments', amount: sar(installments?.reduce((s, inst) => s + sar((Number(inst.amount) || 0) - (Number(inst.paid_amount) || 0)), 0) ?? 0) },
    ],
  };
}

export interface GuardianStatement {
  guardian_id: string;
  from_date?: string;
  to_date?: string;
  opening_balance: number;
  closing_balance: number;
  lines: any[];
}

export async function getGuardianStatement(
  supabase: SupabaseClient,
  tenantId: string,
  guardianId: string,
  options?: { from_date?: string; to_date?: string; includeStudents?: boolean },
): Promise<GuardianStatement> {
  const { data: students } = await supabase
    .from('students')
    .select('id, name_en, name_ar')
    .eq('tenant_id', tenantId)
    .eq('guardian_id', guardianId);

  const studentIds = (students ?? []).map((s) => s.id);
  if (studentIds.length === 0) return { guardian_id: guardianId, opening_balance: 0, closing_balance: 0, lines: [] };

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, due_date, total_amount, paid_amount, status, items, academic_year, student_id, document_type')
    .eq('tenant_id', tenantId)
    .in('student_id', studentIds)
    .neq('status', 'cancelled')
    .order('date', { ascending: true });

  const { data: payments } = await supabase
    .from('payments')
    .select('id, date, amount, invoice_id, payment_method, reference')
    .eq('tenant_id', tenantId)
    .in('invoice_id', invoices?.map((i) => i.id) ?? []);

  const lines: any[] = [];
  for (const inv of invoices ?? []) {
    if (options?.from_date && String(inv.date) < options.from_date) continue;
    if (options?.to_date && String(inv.date) > options.to_date) continue;
    lines.push({
      date: inv.date,
      type: 'invoice',
      document_type: inv.document_type,
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      debit: Number(inv.total_amount) || 0,
      credit: 0,
      balance: 0,
      student_id: options?.includeStudents !== false ? inv.student_id : undefined,
    });
  }
  for (const p of payments ?? []) {
    if (options?.from_date && String(p.date) < options.from_date) continue;
    if (options?.to_date && String(p.date) > options.to_date) continue;
    lines.push({
      date: p.date,
      type: 'payment',
      payment_id: p.id,
      invoice_id: p.invoice_id,
      method: p.payment_method,
      reference: p.reference,
      debit: 0,
      credit: Number(p.amount) || 0,
      balance: 0,
    });
  }

  lines.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let running = 0;
  for (const line of lines) {
    running = sar(running + line.debit - line.credit);
    line.balance = running;
  }

  const opening = 0;
  const closing = lines.length ? running : 0;

  return { guardian_id: guardianId, from_date: options?.from_date, to_date: options?.to_date, opening_balance: opening, closing_balance: closing, lines };
}

export interface TrialBalance {
  as_of: string;
  from_date?: string;
  to_date?: string;
  accounts: { id: string; code: string; name_en: string; name_ar: string; debit: number; credit: number; balance: number }[];
  total_debit: number;
  total_credit: number;
}

export async function getTrialBalance(
  supabase: SupabaseClient,
  tenantId: string,
  options?: { from_date?: string; to_date?: string },
): Promise<TrialBalance> {
  const { data: accounts } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name_en, name_ar, account_type')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('code', { ascending: true });

  let q = supabase
    .from('journal_entry_lines')
    .select('account_id, debit, credit, journal_entries!inner(date)')
    .eq('tenant_id', tenantId);
  if (options?.from_date) q = q.gte('journal_entries.date', options.from_date);
  if (options?.to_date) q = q.lte('journal_entries.date', options.to_date);
  const { data: lines, error } = await q;
  if (error) throw error;

  const totals: Record<string, { debit: number; credit: number }> = {};
  for (const l of lines ?? []) {
    const aid = String((l as Record<string, unknown>).account_id);
    totals[aid] = {
      debit: sar((totals[aid]?.debit || 0) + (Number(l.debit) || 0)),
      credit: sar((totals[aid]?.credit || 0) + (Number(l.credit) || 0)),
    };
  }

  const resultAccounts: TrialBalance['accounts'] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const acct of accounts ?? []) {
    const t = totals[acct.id] || { debit: 0, credit: 0 };
    const balance = sar(t.debit - t.credit);
    resultAccounts.push({
      id: acct.id,
      code: acct.code,
      name_en: acct.name_en,
      name_ar: acct.name_ar,
      debit: t.debit,
      credit: t.credit,
      balance,
    });
    totalDebit = sar(totalDebit + t.debit);
    totalCredit = sar(totalCredit + t.credit);
  }

  return {
    as_of: todayStr(),
    from_date: options?.from_date,
    to_date: options?.to_date,
    accounts: resultAccounts,
    total_debit: totalDebit,
    total_credit: totalCredit,
  };
}

export interface IncomeStatement {
  from_date: string;
  to_date: string;
  revenue: number;
  expenses: number;
  net_income: number;
  revenue_accounts: any[];
  expense_accounts: any[];
}

export async function getIncomeStatement(
  supabase: SupabaseClient,
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<IncomeStatement> {
  const tb = await getTrialBalance(supabase, tenantId, { from_date: fromDate, to_date: toDate });

  const revenueAccounts = tb.accounts.filter((a) => a.code.startsWith('4'));
  const expenseAccounts = tb.accounts.filter((a) => a.code.startsWith('5') || a.code.startsWith('6'));

  const revenue = sar(revenueAccounts.reduce((s, a) => sar(s + (a.credit - a.debit)), 0));
  const expenses = sar(expenseAccounts.reduce((s, a) => sar(s + (a.debit - a.credit)), 0));

  return {
    from_date: fromDate,
    to_date: toDate,
    revenue,
    expenses,
    net_income: sar(revenue - expenses),
    revenue_accounts: revenueAccounts,
    expense_accounts: expenseAccounts,
  };
}

export interface BalanceSheet {
  as_of: string;
  assets: { total: number; accounts: any[] };
  liabilities: { total: number; accounts: any[] };
  equity: { total: number; accounts: any[]; net_income: number };
  total_assets: number;
  total_liabilities_and_equity: number;
}

export async function getBalanceSheet(
  supabase: SupabaseClient,
  tenantId: string,
  asOfDate?: string,
): Promise<BalanceSheet> {
  const date = asOfDate || todayStr();
  const tb = await getTrialBalance(supabase, tenantId, { to_date: date });

  const assets = tb.accounts.filter((a) => a.code.startsWith('1'));
  const liabilities = tb.accounts.filter((a) => a.code.startsWith('2'));
  const equityAccounts = tb.accounts.filter((a) => a.code.startsWith('3'));

  const assetsTotal = sar(assets.reduce((s, a) => sar(s + a.balance), 0));
  const liabilitiesTotal = sar(liabilities.reduce((s, a) => sar(s - a.balance), 0)); // credit normal
  const equityTotalBeforeNI = sar(equityAccounts.reduce((s, a) => sar(s - a.balance), 0)); // credit normal

  const netIncome = sar(await getIncomeStatement(supabase, tenantId, '1900-01-01', date).then((r) => r.net_income));
  const equityTotal = sar(equityTotalBeforeNI + netIncome);

  return {
    as_of: date,
    assets: { total: assetsTotal, accounts: assets },
    liabilities: { total: liabilitiesTotal, accounts: liabilities },
    equity: { total: equityTotal, accounts: equityAccounts, net_income: netIncome },
    total_assets: assetsTotal,
    total_liabilities_and_equity: sar(liabilitiesTotal + equityTotal),
  };
}

export interface RevenueByFeeType {
  from_date: string;
  to_date: string;
  total_revenue: number;
  total_vat: number;
  by_category: Record<string, { revenue: number; vat: number; count: number }>;
  by_grade: Record<string, number>;
  by_campus: Record<string, number>;
}

export async function getRevenueByFeeType(
  supabase: SupabaseClient,
  tenantId: string,
  fromDate: string,
  toDate: string,
): Promise<RevenueByFeeType> {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('subtotal, vat_amount, total_amount, items, grade, branch_id')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .gte('date', fromDate)
    .lte('date', toDate);

  const byCategory: Record<string, { revenue: number; vat: number; count: number }> = {};
  const byGrade: Record<string, number> = {};
  const byCampus: Record<string, number> = {};
  let totalRevenue = 0;
  let totalVat = 0;

  for (const inv of invoices ?? []) {
    totalRevenue = sar(totalRevenue + (Number(inv.subtotal) || 0));
    totalVat = sar(totalVat + (Number(inv.vat_amount) || 0));
    byGrade[inv.grade || 'Unknown'] = sar((byGrade[inv.grade || 'Unknown'] || 0) + (Number(inv.total_amount) || 0));
    byCampus[inv.branch_id || 'Unknown'] = sar((byCampus[inv.branch_id || 'Unknown'] || 0) + (Number(inv.total_amount) || 0));

    const items = (inv as Record<string, unknown>).items as any[] | undefined;
    for (const item of items ?? []) {
      const code = item.category_code || item.description_en || 'Other';
      byCategory[code] = byCategory[code] || { revenue: 0, vat: 0, count: 0 };
      byCategory[code].revenue = sar((byCategory[code].revenue || 0) + (Number(item.subtotal) || 0));
      byCategory[code].vat = sar((byCategory[code].vat || 0) + (Number(item.vat_amount) || 0));
      byCategory[code].count += Number(item.quantity) || 1;
    }
  }

  return {
    from_date: fromDate,
    to_date: toDate,
    total_revenue: totalRevenue,
    total_vat: totalVat,
    by_category: byCategory,
    by_grade: byGrade,
    by_campus: byCampus,
  };
}
