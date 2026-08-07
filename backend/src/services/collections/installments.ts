import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRequestContext } from '../../lib/jurisdiction.js';
import { resolvePack } from '../../packs/registry.js';
import { writeLedger } from './ledgerWriter.js';

export interface CreateOfferInput {
  profile_id: string;
  invoice_id: string;
  total_amount: number;
  installment_count: number;
  first_installment_days: number;
  down_payment_pct: number;
  interval_days?: number; // default 30
  proposed_by: 'yamen' | 'staff';
}

export interface InstallmentPlanInstallmentInput {
  amount: number;
  due_date: string;
  installment_no: number;
}

interface CollectionSettings {
  min_down_payment_pct: number;
  max_installments: number;
  max_plan_discount_pct: number;
}

export class InstallmentPlanEngine {
  constructor(private supabase: SupabaseClient) {}

  async createOffer(tenantId: string, input: CreateOfferInput) {
    const ctx = await buildRequestContext(this.supabase, tenantId);
    const pack = resolvePack(ctx);
    const settings = await this.loadSettings(tenantId);

    // Validate invoice belongs to tenant and is outstanding.
    const { data: invoice, error: invErr } = await this.supabase
      .from('invoices')
      .select('total_amount, paid_amount, status, student_id, due_date, items')
      .eq('id', input.invoice_id)
      .eq('tenant_id', tenantId)
      .single();
    if (invErr || !invoice) throw new Error('Invoice not found');

    const balance = Number(invoice.total_amount ?? 0) - Number(invoice.paid_amount ?? 0);
    if (balance <= 0) throw new Error('Invoice is already paid');

    if (input.total_amount > balance + 0.01) {
      throw new Error('Plan total cannot exceed invoice balance');
    }

    const minDown = settings?.min_down_payment_pct ?? 0;
    const maxInstallments = settings?.max_installments ?? 12;
    const maxDiscount = settings?.max_plan_discount_pct ?? 0;

    if (input.installment_count > maxInstallments) {
      return this.requestApproval(tenantId, 'installment_plan', input, `Installment count ${input.installment_count} exceeds tenant max ${maxInstallments}`);
    }
    if (input.down_payment_pct < minDown) {
      return this.requestApproval(tenantId, 'installment_plan', input, `Down payment ${input.down_payment_pct}% below tenant minimum ${minDown}%`);
    }
    const discountPct = balance > 0 ? ((balance - input.total_amount) / balance) * 100 : 0;
    if (discountPct > maxDiscount + 0.01) {
      return this.requestApproval(tenantId, 'installment_plan', input, `Plan discount ${discountPct.toFixed(2)}% exceeds tenant max ${maxDiscount}%`);
    }

    const installments = this.computeInstallments(input, balance);

    const { data: offer, error } = await this.supabase
      .from('installment_plan_offers')
      .insert({
        tenant_id: tenantId,
        currency_code: pack.currencyCode,
        profile_id: input.profile_id,
        invoice_id: input.invoice_id,
        proposed_down_payment_pct: input.down_payment_pct,
        installment_count: input.installment_count,
        first_installment_days: input.first_installment_days,
        recurring_days: input.interval_days ?? 30,
        interval_days: input.interval_days ?? 30,
        total_amount: input.total_amount,
        installment_amounts: installments,
        proposed_by: input.proposed_by,
        status: 'proposed',
      })
      .select('id')
      .single();
    if (error) throw error;

    await writeLedger(this.supabase, {
      tenant_id: tenantId,
      action_type: 'plan_offer',
      actor: input.proposed_by,
      reference_table: 'installment_plan_offers',
      reference_id: (offer as { id: string }).id,
      input_snapshot: input as unknown as Record<string, unknown>,
      decision: 'offered',
      outcome: { installments },
    });

    return { offer_id: (offer as { id: string }).id, status: 'proposed', requires_approval: false };
  }

  async acceptOffer(tenantId: string, offerId: string, acceptedBy: 'guardian' | 'staff'): Promise<{ plan_id: string; invoice_ids: string[] }> {
    const { data: offer, error } = await this.supabase
      .from('installment_plan_offers')
      .select('*')
      .eq('id', offerId)
      .eq('tenant_id', tenantId)
      .eq('status', 'proposed')
      .single();
    if (error || !offer) throw new Error('Offer not found or not available');

    const { data: invoice } = await this.supabase
      .from('invoices')
      .select('student_id, academic_year, branch_id, total_amount, paid_amount, items')
      .eq('id', offer.invoice_id as string)
      .eq('tenant_id', tenantId)
      .single();
    if (!invoice) throw new Error('Invoice not found');

    const ctx = await buildRequestContext(this.supabase, tenantId, (invoice.branch_id as string) ?? undefined);
    const pack = resolvePack(ctx);

    const studentId = invoice.student_id as string;
    const academicYear = (invoice.academic_year as string) ?? '2025-2026';

    // Create the parent payment plan.
    const downPayment = Math.round((Number(offer.total_amount) * Number(offer.proposed_down_payment_pct)) / 100);
    const { data: plan, error: planErr } = await this.supabase
      .from('payment_plans')
      .insert({
        tenant_id: tenantId,
        currency_code: pack.currencyCode,
        student_id: studentId,
        academic_year: academicYear,
        plan_type: 'custom',
        total_amount: Number(offer.total_amount),
        paid_amount: downPayment,
        status: 'active',
        offer_status: 'active',
        offered_by_agent: offer.proposed_by === 'yamen',
        profile_id: offer.profile_id as string,
        source_invoice_id: offer.invoice_id as string,
        down_payment_pct: Number(offer.proposed_down_payment_pct),
      })
      .select('id')
      .single();
    if (planErr) throw planErr;

    const planId = (plan as { id: string }).id;

    // Mark original invoice as settled via the plan.
    await this.supabase
      .from('invoices')
      .update({ status: 'paid', paid_amount: invoice.total_amount, updated_at: new Date().toISOString() })
      .eq('id', offer.invoice_id as string)
      .eq('tenant_id', tenantId);

    // Create installment invoices and payment_plan_installments.
    const installments = (offer.installment_amounts as InstallmentPlanInstallmentInput[]) ?? [];
    const invoiceIds: string[] = [];
    for (const inst of installments) {
      const { data: inv } = await this.supabase
        .from('invoices')
        .insert({
          tenant_id: tenantId,
          currency_code: pack.currencyCode,
          branch_id: invoice.branch_id,
          student_id: studentId,
          invoice_number: `INST-${planId.slice(0, 8)}-${inst.installment_no}`,
          date: new Date().toISOString().split('T')[0],
          due_date: inst.due_date,
          total_amount: inst.amount,
          paid_amount: 0,
          status: 'issued',
          items: [{ description: `Installment ${inst.installment_no} of payment plan ${planId}`, amount: inst.amount }],
          notes: `Generated from installment plan offer ${offerId}`,
        })
        .select('id')
        .single();
      if (inv) invoiceIds.push((inv as { id: string }).id);

      await this.supabase.from('payment_plan_installments').insert({
        tenant_id: tenantId,
        currency_code: pack.currencyCode,
        plan_id: planId,
        installment_no: inst.installment_no,
        due_date: inst.due_date,
        amount: inst.amount,
        status: 'pending',
        invoice_id: inv ? (inv as { id: string }).id : null,
      });
    }

    await this.supabase
      .from('installment_plan_offers')
      .update({ status: 'accepted', accepted_plan_id: planId, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', offerId)
      .eq('tenant_id', tenantId);

    await writeLedger(this.supabase, {
      tenant_id: tenantId,
      action_type: 'plan_accept',
      actor: acceptedBy,
      reference_table: 'payment_plans',
      reference_id: planId,
      input_snapshot: { offer_id: offerId, plan_id: planId, invoice_ids: invoiceIds },
      decision: 'accepted',
      outcome: { installment_count: installments.length, invoice_ids: invoiceIds },
    });

    return { plan_id: planId, invoice_ids: invoiceIds };
  }

  /**
   * Nightly broken-plan detection: any non-paid installment past its due date
   * marks the plan broken and raises an escalation approval queue item.
   */
  async detectBrokenPlans(tenantId: string): Promise<{ broken: number }> {
    const today = new Date().toISOString().split('T')[0];
    const { data: overdue, error } = await this.supabase
      .from('payment_plan_installments')
      .select('id, plan_id, due_date, amount, payment_plans!inner(tenant_id, status, profile_id, broken_at)')
      .lt('due_date', today)
      .in('status', ['pending', 'overdue'])
      .eq('payment_plans.tenant_id', tenantId)
      .is('payment_plans.broken_at', null);
    if (error) throw error;

    const planIds = new Set<string>();
    for (const row of (overdue ?? []) as unknown as Record<string, unknown>[]) {
      const planId = (row as { plan_id: string }).plan_id;
      planIds.add(planId);
    }

    for (const planId of planIds) {
      await this.supabase
        .from('payment_plans')
        .update({ broken_at: new Date().toISOString(), broken_reason: 'installment_overdue' })
        .eq('id', planId)
        .eq('tenant_id', tenantId);

      const { data: plan } = await this.supabase
        .from('payment_plans')
        .select('profile_id')
        .eq('id', planId)
        .eq('tenant_id', tenantId)
        .single();

      await this.supabase.from('agent_approval_queue').insert({
        tenant_id: tenantId,
        item_type: 'escalation',
        reference_table: 'payment_plans',
        reference_id: planId,
        requested_by: 'yamen',
        status: 'pending',
        payload: { reason: 'broken_plan', profile_id: (plan as { profile_id: string })?.profile_id },
      });
    }

    return { broken: planIds.size };
  }

  private computeInstallments(input: CreateOfferInput, balance: number): InstallmentPlanInstallmentInput[] {
    const downPayment = Math.round((input.total_amount * input.down_payment_pct) / 100);
    const remaining = input.total_amount - downPayment;
    const count = input.installment_count;
    const interval = input.interval_days ?? 30;

    const baseAmount = Math.floor((remaining / count) * 100) / 100;
    const first = remaining - baseAmount * (count - 1);

    const today = new Date();
    const result: InstallmentPlanInstallmentInput[] = [];

    // Down payment is due immediately (installment 0 not stored; it is paid to accept the plan).
    for (let i = 0; i < count; i++) {
      const amount = i === 0 ? first : baseAmount;
      const due = new Date(today);
      due.setDate(today.getDate() + input.first_installment_days + i * interval);
      result.push({
        amount: Number(amount.toFixed(2)),
        due_date: due.toISOString().split('T')[0],
        installment_no: i + 1,
      });
    }

    return result;
  }

  private async loadSettings(tenantId: string): Promise<CollectionSettings | null> {
    const { data } = await this.supabase.from('collection_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
    return data as CollectionSettings | null;
  }

  private async requestApproval(tenantId: string, itemType: string, input: CreateOfferInput, reason: string) {
    const { data, error } = await this.supabase
      .from('agent_approval_queue')
      .insert({
        tenant_id: tenantId,
        item_type: itemType,
        reference_table: 'installment_plan_offers',
        reference_id: null,
        requested_by: input.proposed_by,
        status: 'pending',
        payload: { input, reason },
      })
      .select('id')
      .single();
    if (error) throw error;

    await writeLedger(this.supabase, {
      tenant_id: tenantId,
      action_type: 'approval_request',
      actor: input.proposed_by,
      reference_table: 'agent_approval_queue',
      reference_id: (data as { id: string }).id,
      input_snapshot: input as unknown as Record<string, unknown>,
      decision: 'requires_approval',
      outcome: { reason },
    });

    return { status: 'pending_approval', approval_queue_id: (data as { id: string }).id, reason };
  }
}
