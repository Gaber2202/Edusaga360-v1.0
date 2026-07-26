import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { ApiKeyRequest, requireScope } from '../../middleware/apiKeyAuth.js';
import { csvToRows, processBulkImport } from '../../services/bulkImport.js';

export const importRouter = Router();

const BulkImportSchema = z.object({
  resource: z.enum(['students', 'guardians', 'fee_categories', 'invoices', 'payments']),
  format: z.enum(['csv', 'rows']).default('rows'),
  csv: z.string().optional(),
  rows: z.array(z.record(z.union([z.string(), z.number()]).optional())).optional(),
  mapping: z.record(z.string()),
  dry_run: z.boolean().default(false),
  delimiter: z.string().default(','),
});

importRouter.post('/', requireScope('bulk_import:write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const tenantId = req.apiClient!.tenantId;
    const parsed = BulkImportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });

    const { resource, format, csv, rows, mapping, dry_run, delimiter } = parsed.data;
    const sourceRows = format === 'csv' ? csvToRows(csv || '', delimiter) : (rows || []);
    const result = await processBulkImport(supabase, tenantId, resource, sourceRows, mapping, dry_run);
    return res.json(result);
  } catch (err) {
    console.error('[external/v1/import] failed:', err);
    return res.status(500).json({ error: 'server_error', message: (err as Error).message });
  }
});
