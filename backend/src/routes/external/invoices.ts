/**
 * /api/v1/invoices — external read-only access to fee invoices.
 *
 * Read-only by design: invoices are created through the finance module's own
 * ledger-posting flow, not imported blind. Supports ?student_id= and ?status=
 * filters. Add a write path only once the accounting side is settled.
 */
import { Router, Response } from 'express';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';
import { parsePagination } from './shared.js';

export const invoicesRouter = Router();

invoicesRouter.get('/', requireScope('invoices:read'), async (req: ApiKeyRequest, res: Response) => {
  const tenantId = req.apiClient!.tenantId;
  const { limit, offset } = parsePagination(req);
  const { student_id, status } = req.query as Record<string, string | undefined>;

  let query = supabase
    .from('invoices')
    .select('id, invoice_number, student_id, date, due_date, total_amount, paid_amount, status, created_at', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (student_id) query = query.eq('student_id', student_id);
  if (status) query = query.eq('status', status);

  const { data, error, count } = await query
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: 'server_error', message: 'Failed to fetch invoices' });
  }
  res.json({ data: data ?? [], pagination: { limit, offset, total: count ?? 0 } });
});
