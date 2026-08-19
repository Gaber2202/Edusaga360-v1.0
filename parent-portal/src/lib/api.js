import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
  };
}

async function downloadAuthorizedPdf(path, filename, unauthorizedMessage, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: await authHeaders(),
    signal: options.signal,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.message || body.error || '';
    } catch {
      /* ignore non-JSON bodies */
    }
    throw new Error(res.status === 403 ? unauthorizedMessage : (detail || `Download failed (${res.status})`));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download the server-rendered, ZATCA-compliant invoice PDF for the signed-in
 * parent. The backend authorises that the invoice belongs to one of the
 * parent's linked children before returning it.
 */
export async function downloadInvoicePdf(invoiceId, filename) {
  await downloadAuthorizedPdf(
    `/api/invoices/${invoiceId}/download-pdf`,
    filename || `invoice-${invoiceId}.pdf`,
    'Not authorized to view this invoice',
  );
}

export async function downloadReceiptPdf(invoiceId, filename) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await downloadAuthorizedPdf(
      `/api/invoices/${invoiceId}/receipt-pdf`,
      filename || `receipt-${invoiceId}.pdf`,
      'Not authorized to view this receipt',
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPaymentLink(invoiceId) {
  const res = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}/payment-link`, {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    throw new Error(res.status === 403 ? 'Not authorized to pay this invoice' : `Payment link failed (${res.status})`);
  }
  const data = await res.json();
  const url = data.paymentUrl || data.payment_url;
  if (!url) throw new Error('Payment link not created');
  return url;
}
