import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { AuthenticatedRequest, requireRole } from '../middleware/auth.js';
import { recordInvoicePayment, PAYMENT_METHODS } from '../services/invoicePayment.js';
import { fulfillPaidCommerceInvoice } from '../services/parentCommerce.js';

export const storeOrdersRouter = Router();

const STORE_STAFF_ROLES = ['admin', 'finance', 'branch_manager', 'accountant', 'collections', 'creator'];

const IN_SCHOOL_METHODS = ['cash', 'card', 'mada', 'bank_transfer'] as const;

const CollectPaymentSchema = z.object({
  payment_method: z.enum(IN_SCHOOL_METHODS),
  amount: z.number().positive().optional(),
  reference: z.string().max(120).optional(),
});

/** POST /api/store/orders/:id/collect-payment — in-school payment for a pending store order */
storeOrdersRouter.post(
  '/orders/:id/collect-payment',
  requireRole(STORE_STAFF_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tenant_id;
      if (!tenantId) return res.status(403).json({ error: 'No tenant assigned' });

      const orderId = String(req.params.id || '');
      if (!z.string().uuid().safeParse(orderId).success) {
        return res.status(400).json({ error: 'Invalid order id' });
      }

      const parsed = CollectPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const { data: order, error: orderErr } = await supabase
        .from('store_orders')
        .select('id, order_number, status, invoice_id, total_amount, student_id, currency_code')
        .eq('tenant_id', tenantId)
        .eq('id', orderId)
        .maybeSingle();
      if (orderErr) throw orderErr;
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.status !== 'pending_payment') {
        return res.status(400).json({ error: `Order is ${order.status}, not awaiting payment` });
      }
      if (!order.invoice_id) {
        return res.status(400).json({ error: 'Order has no linked invoice' });
      }

      const amount = parsed.data.amount ?? (Number(order.total_amount) || 0);
      if (amount <= 0) return res.status(400).json({ error: 'Invalid payment amount' });

      const result = await recordInvoicePayment({
        tenantId,
        userId: req.user!.id,
        invoiceId: order.invoice_id as string,
        amount,
        paymentMethod: parsed.data.payment_method,
        reference: parsed.data.reference,
      });

      if (result.invoiceFullyPaid) {
        const { data: invoiceRow } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', order.invoice_id)
          .eq('tenant_id', tenantId)
          .single();
        if (invoiceRow) {
          await fulfillPaidCommerceInvoice(supabase, invoiceRow as Record<string, unknown>);
        }
      }

      const { data: updatedOrder } = await supabase
        .from('store_orders')
        .select('*, store_order_lines(*)')
        .eq('tenant_id', tenantId)
        .eq('id', orderId)
        .maybeSingle();

      return res.status(201).json({
        payment: result.payment,
        invoice: result.invoice,
        receipt: result.receipt,
        order: updatedOrder,
      });
    } catch (err) {
      console.error('[store/orders/collect-payment]', err);
      const message = err instanceof Error ? err.message : 'Failed to collect payment';
      const status = message.includes('not found') ? 404
        : message.includes('already') || message.includes('exceeds') || message.includes('awaiting') ? 400
          : 500;
      return res.status(status).json({ error: message });
    }
  },
);

export { PAYMENT_METHODS, IN_SCHOOL_METHODS };
