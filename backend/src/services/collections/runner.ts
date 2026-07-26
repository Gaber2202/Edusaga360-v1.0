import type { SupabaseClient } from '@supabase/supabase-js';
import { SegmentFeatures, SegmentResult } from './types.js';
import { RuleSegmentScorer } from './segmenter.js';
import { writeLedger } from './ledgerWriter.js';

interface InvoiceRow {
  id: string;
  student_id: string;
  guardian_id: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string;
  date: string;
  items?: unknown;
}

interface PaymentRow {
  id: string;
  invoice_id: string;
  amount: number;
  date: string;
  created_at: string;
}

interface InstallmentRow {
  id: string;
  student_id: string;
  guardian_id: string;
  status: string;
  due_date: string;
  paid_date?: string;
  amount: number;
  paid_amount: number;
}

interface ReplyRow {
  guardian_id: string;
  count: number;
}

interface ProfileRow {
  id: string;
  guardian_id: string;
  current_segment: string;
}

interface GuardianWithStudent {
  guardian_id: string;
  student_id: string;
}

export interface SegmentationRunResult {
  tenant_id: string;
  processed: number;
  changed: number;
  errors: number;
}

function daysBetween(a: string | Date, b: string | Date): number {
  const ms = new Date(a).getTime() - new Date(b).getTime();
  return Math.round(ms / 86400000);
}

export class SegmentationRunner {
  private scorer = new RuleSegmentScorer();

  constructor(private supabase: SupabaseClient) {}

  async runForTenant(tenantId: string): Promise<SegmentationRunResult> {
    const result: SegmentationRunResult = { tenant_id: tenantId, processed: 0, changed: 0, errors: 0 };

    const settings = await this.loadSettings(tenantId);
    if (!settings || !settings.is_enabled) {
      return { ...result, processed: 0 };
    }

    const guardians = await this.fetchGuardianStudents(tenantId);
    if (!guardians.length) return result;

    const guardianIds = [...new Set(guardians.map((g) => g.guardian_id))];

    const [invoices, payments, installments, profiles] = await Promise.all([
      this.fetchInvoices(tenantId, guardianIds),
      this.fetchPayments(tenantId, guardianIds),
      this.fetchInstallments(tenantId, guardianIds),
      this.fetchProfiles(tenantId, guardianIds),
    ]);

    const invoicesByGuardian = groupBy(invoices, (i) => i.guardian_id);
    const paymentsByInvoice = groupBy(payments, (p) => p.invoice_id);
    const installmentsByGuardian = groupBy(installments, (i) => i.guardian_id);
    const profileByGuardian = Object.fromEntries(profiles.map((p) => [p.guardian_id, p]));

    for (const guardianId of guardianIds) {
      try {
        const invs = invoicesByGuardian[guardianId] ?? [];
        const pmtMap = Object.fromEntries(
          (invs.map((i) => [i.id, paymentsByInvoice[i.id] ?? []]) as [string, PaymentRow[]][]),
        );
        const insts = installmentsByGuardian[guardianId] ?? [];
        const replyCount = 0; // v1: reply attribution fetched separately to avoid PostgREST nested-type issues
        const currentProfile = profileByGuardian[guardianId];

        const features = this.computeFeatures(invs, pmtMap, insts, replyCount);
        const segmentResult = this.scorer.score(features, settings.segment_rules ?? {});

        const profileId = await this.upsertProfile(tenantId, guardianId, features, segmentResult);

        if (!currentProfile || currentProfile.current_segment !== segmentResult.segment) {
          await this.insertSegmentChange(tenantId, profileId, guardianId, segmentResult);
          result.changed++;
        }

        await writeLedger(this.supabase, {
          tenant_id: tenantId,
          action_type: 'segment',
          actor: 'yamen',
          reference_table: 'collection_profiles',
          reference_id: profileId,
          input_snapshot: { guardian_id: guardianId, features },
          model_version: segmentResult.modelVersion,
          rule_version: segmentResult.ruleVersion,
          confidence: segmentResult.confidence,
          decision: segmentResult.segment,
          outcome: { reason: segmentResult.reason, previous_segment: currentProfile?.current_segment },
        });

        result.processed++;
      } catch (err) {
        console.error(`[collections/segmentation] error for guardian ${guardianId}:`, err);
        result.errors++;
      }
    }

    return result;
  }

  private async loadSettings(tenantId: string) {
    const { data } = await this.supabase
      .from('collection_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return data as { is_enabled: boolean; segment_rules?: Record<string, unknown> } | null;
  }

  private async fetchGuardianStudents(tenantId: string): Promise<GuardianWithStudent[]> {
    const { data, error } = await this.supabase
      .from('students')
      .select('guardian_id, id')
      .eq('tenant_id', tenantId)
      .not('guardian_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map((s: { guardian_id: string; id: string }) => ({ guardian_id: s.guardian_id, student_id: s.id }));
  }

  private async fetchInvoices(tenantId: string, guardianIds: string[]): Promise<InvoiceRow[]> {
    const { data, error } = await this.supabase
      .from('invoices')
      .select('id, student_id, total_amount, paid_amount, status, due_date, date, items, students!inner(guardian_id)')
      .eq('tenant_id', tenantId)
      .in('students.guardian_id', guardianIds)
      .neq('status', 'cancelled');
    if (error) throw error;
    return (data ?? []).map((inv: Record<string, unknown>) => ({
      id: inv.id as string,
      student_id: inv.student_id as string,
      guardian_id: (inv.students as { guardian_id: string }).guardian_id,
      total_amount: Number(inv.total_amount ?? 0),
      paid_amount: Number(inv.paid_amount ?? 0),
      status: String(inv.status ?? 'draft'),
      due_date: String(inv.due_date ?? inv.date ?? new Date().toISOString().split('T')[0]),
      date: String(inv.date ?? new Date().toISOString().split('T')[0]),
    }));
  }

  private async fetchPayments(tenantId: string, guardianIds: string[]): Promise<PaymentRow[]> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('id, invoice_id, amount, date, created_at, invoices!inner(student_id, students!inner(guardian_id))')
      .eq('tenant_id', tenantId)
      .in('invoices.students.guardian_id', guardianIds)
      .eq('status', 'completed');
    if (error) throw error;
    return (data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      invoice_id: p.invoice_id as string,
      amount: Number(p.amount ?? 0),
      date: String(p.date ?? (p.created_at as string)?.split('T')[0] ?? new Date().toISOString().split('T')[0]),
      created_at: String(p.created_at ?? new Date().toISOString()),
    }));
  }

  private async fetchInstallments(tenantId: string, guardianIds: string[]): Promise<InstallmentRow[]> {
    const { data, error } = await this.supabase
      .from('payment_plan_installments')
      .select('id, plan_id, amount, paid_amount, status, due_date, paid_date, payment_plans!inner(student_id, students!inner(guardian_id))')
      .eq('tenant_id', tenantId)
      .in('payment_plans.students.guardian_id', guardianIds);
    if (error) throw error;
    return (data ?? []).map((i: Record<string, unknown>) => ({
      id: i.id as string,
      student_id: (i.payment_plans as { student_id: string }).student_id,
      guardian_id: ((i.payment_plans as { students: { guardian_id: string } }).students).guardian_id,
      amount: Number(i.amount ?? 0),
      paid_amount: Number(i.paid_amount ?? 0),
      status: String(i.status ?? 'pending'),
      due_date: String(i.due_date ?? new Date().toISOString().split('T')[0]),
      paid_date: i.paid_date ? String(i.paid_date) : undefined,
    }));
  }

  private async fetchProfiles(tenantId: string, guardianIds: string[]): Promise<ProfileRow[]> {
    const { data, error } = await this.supabase
      .from('collection_profiles')
      .select('id, guardian_id, current_segment')
      .eq('tenant_id', tenantId)
      .in('guardian_id', guardianIds);
    if (error) throw error;
    return (data ?? []) as ProfileRow[];
  }

  private computeFeatures(
    invoices: InvoiceRow[],
    paymentsByInvoice: Record<string, PaymentRow[]>,
    installments: InstallmentRow[],
    replyCount: number,
  ): SegmentFeatures {
    const today = new Date().toISOString().split('T')[0];
    const totalInvoiced = invoices.reduce((s, i) => s + i.total_amount, 0);
    const totalCollected = invoices.reduce((s, i) => s + i.paid_amount, 0);
    const outstandingBalance = totalInvoiced - totalCollected;

    let sumDaysToPay = 0;
    let paidInvoiceCount = 0;
    let partialInvoiceCount = 0;
    let lastPaymentAt: string | undefined;

    for (const inv of invoices) {
      if (inv.paid_amount > 0 && inv.paid_amount < inv.total_amount) {
        partialInvoiceCount++;
      }
      const payments = paymentsByInvoice[inv.id] ?? [];
      if (payments.length) {
        const latestPayment = payments.reduce((latest, p) =>
          new Date(p.date) > new Date(latest.date) ? p : latest,
        payments[0]);
        const daysToPay = daysBetween(latestPayment.date, inv.due_date);
        sumDaysToPay += daysToPay;
        paidInvoiceCount++;
        if (!lastPaymentAt || latestPayment.date > lastPaymentAt) {
          lastPaymentAt = latestPayment.date;
        }
      }
    }

    const avgDaysToPay = paidInvoiceCount ? sumDaysToPay / paidInvoiceCount : 0;
    const partialPaymentRatio = invoices.length ? partialInvoiceCount / invoices.length : 0;

    let currentOverdue30Plus = 0;
    let currentOverdue60Plus = 0;
    let currentOverdue90Plus = 0;
    let crossTermDefault = false;

    for (const inv of invoices) {
      if (inv.status === 'paid') continue;
      const daysOverdue = daysBetween(today, inv.due_date);
      if (daysOverdue > 30) currentOverdue30Plus++;
      if (daysOverdue > 60) currentOverdue60Plus++;
      if (daysOverdue > 90) currentOverdue90Plus++;
      if (daysOverdue > 90 && inv.paid_amount > 0 && inv.paid_amount < inv.total_amount) {
        crossTermDefault = true;
      }
    }

    // Cross-term default: also flag if any overdue installment is from >90 days ago.
    for (const inst of installments) {
      if (inst.status !== 'paid' && inst.status !== 'waived') {
        const daysOverdue = daysBetween(today, inst.due_date);
        if (daysOverdue > 90) crossTermDefault = true;
      }
    }

    const missedInstallmentsCount = installments.filter(
      (i) => i.status === 'overdue' || i.status === 'defaulted',
    ).length;

    const activePlanStatuses = ['active', 'offered', 'accepted'];
    const hasActivePlan = installments.some((i) => activePlanStatuses.includes(i.status));
    const hadPlanEver = installments.length > 0;

    return {
      avgDaysToPay: Number(avgDaysToPay.toFixed(2)),
      missedInstallmentsCount,
      partialPaymentRatio: Number(partialPaymentRatio.toFixed(4)),
      outstandingBalance: Number(outstandingBalance.toFixed(2)),
      totalInvoiced: Number(totalInvoiced.toFixed(2)),
      totalCollected: Number(totalCollected.toFixed(2)),
      currentOverdue30Plus,
      currentOverdue60Plus,
      currentOverdue90Plus,
      hasActivePlan,
      hadPlanEver,
      lastPaymentAt,
      crossTermDefault,
      messageReplyCount: replyCount,
    };
  }

  private async upsertProfile(
    tenantId: string,
    guardianId: string,
    features: SegmentFeatures,
    segment: SegmentResult,
  ): Promise<string> {
    const { data, error } = await this.supabase
      .from('collection_profiles')
      .upsert(
        {
          tenant_id: tenantId,
          guardian_id: guardianId,
          current_segment: segment.segment,
          avg_days_to_pay: features.avgDaysToPay,
          missed_installments_count: features.missedInstallmentsCount,
          partial_payment_ratio: features.partialPaymentRatio,
          outstanding_balance: features.outstandingBalance,
          total_invoiced: features.totalInvoiced,
          total_collected: features.totalCollected,
          has_active_plan: features.hasActivePlan,
          last_payment_at: features.lastPaymentAt,
          features_jsonb: features,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id, guardian_id' },
      )
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  }

  private async insertSegmentChange(
    tenantId: string,
    profileId: string | undefined,
    guardianId: string,
    result: SegmentResult,
  ): Promise<void> {
    if (!profileId) return;
    const { error } = await this.supabase.from('collection_segments').insert({
      tenant_id: tenantId,
      profile_id: profileId,
      segment: result.segment,
      features_snapshot: result.features,
      scoring_model: result.modelVersion,
      rule_version: result.ruleVersion,
      confidence: result.confidence,
      reason: result.reason,
    });
    if (error) throw error;
  }
}

function groupBy<T, K extends string | number | symbol>(arr: T[], keyFn: (item: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] ?? [];
    acc[key].push(item);
    return acc;
  }, {} as Record<K, T[]>);
}
