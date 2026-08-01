import { supabase } from '../../lib/supabase.js';
import { getMinorUnits, toMinorUnits, roundToMinorUnits } from '../../lib/money.js';

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
  const moyasarKey = process.env.MOYASAR_SECRET_KEY_TEST || process.env.MOYASAR_API_KEY;
  if (!moyasarKey) {
    return { error: 'Payment gateway not configured' };
  }

  // Test keys typically cannot create mada/applepay/stcpay payments; fall back
  // to a configurable test method (default credit card) for test-mode keys.
  const isTestKey = moyasarKey.startsWith('sk_test');
  const effectiveMethod: typeof paymentMethod = isTestKey
    ? (process.env.MOYASAR_TEST_PAYMENT_METHOD as typeof paymentMethod | undefined) || 'creditcard'
    : paymentMethod;

  const { data: invoice } = await supabase
    .from('invoices')
    .select('invoice_number, total_amount, paid_amount, student_id, currency_code')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();
  if (!invoice) {
    return { error: 'Invoice not found' };
  }

  const currencyCode = (invoice.currency_code as string) || 'SAR';
  const minorUnits = await getMinorUnits(supabase, currencyCode);
  const balance = roundToMinorUnits((Number(invoice.total_amount) - Number(invoice.paid_amount)), minorUnits);
  const amountMinor = toMinorUnits(balance, minorUnits);

  try {
    const response = await fetch('https://api.moyasar.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${moyasarKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: amountMinor,
        currency: currencyCode,
        description: `EduSaga Invoice ${invoice.invoice_number}`,
        callback_url: callbackUrl,
        source: { type: effectiveMethod },
        metadata: {
          invoice_id: invoiceId,
          tenant_id: tenantId,
          collection_message_id: collectionMessageId,
        },
      }),
    });
    const data = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      console.error('[moyasar] create payment error:', JSON.stringify(data));
      return { error: `Payment gateway error: ${data.message || data.error || 'unknown'}`, payment_id: data.id as string | undefined };
    }
    return { url: (data.url as string) ?? '', payment_id: data.id as string | undefined };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
