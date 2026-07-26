import { supabase } from '../../lib/supabase.js';

export interface MoyasarPaymentLink {
  url?: string;
  payment_id?: string;
  error?: string;
}

export async function createMoyasarPaymentLink(
  tenantId: string,
  invoiceId: string,
  collectionMessageId: string | undefined,
  callbackUrl: string,
  paymentMethod: 'creditcard' | 'mada' | 'applepay' | 'stcpay' = 'mada',
): Promise<MoyasarPaymentLink> {
  const moyasarKey = process.env.MOYASAR_API_KEY;
  if (!moyasarKey) {
    return { error: 'Payment gateway not configured' };
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('invoice_number, total_amount, paid_amount, student_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (!invoice) {
    return { error: 'Invoice not found' };
  }

  const balance = Math.round(((invoice.total_amount as number) - (invoice.paid_amount as number)) * 100) / 100;
  const amountHalala = Math.round(balance * 100);

  try {
    const response = await fetch('https://api.moyasar.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${moyasarKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: amountHalala,
        currency: 'SAR',
        description: `EduSaga Invoice ${invoice.invoice_number}`,
        callback_url: callbackUrl,
        source: { type: paymentMethod },
        metadata: {
          invoice_id: invoiceId,
          tenant_id: tenantId,
          collection_message_id: collectionMessageId,
        },
      }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      return { error: 'Payment gateway error', payment_id: data.id as string | undefined };
    }
    return { url: (data.url as string) ?? '', payment_id: data.id as string | undefined };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
