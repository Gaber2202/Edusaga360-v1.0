import { supabase } from './supabase';

// Same convention as the main app: VITE_API_BASE_URL is the backend host
// (empty in dev, where Vite proxies /api). The endpoint path carries /api.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Download the server-rendered, ZATCA-compliant invoice PDF for the signed-in
 * parent. The backend authorises that the invoice belongs to one of the
 * parent's linked children before returning it.
 */
export async function downloadInvoicePdf(invoiceId, filename) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}/download-pdf`, {
    method: 'GET',
    headers: {
      ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
    },
  });
  if (!res.ok) {
    throw new Error(res.status === 403 ? 'Not authorized to view this invoice' : `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `invoice-${invoiceId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
