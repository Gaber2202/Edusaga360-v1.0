import { supabase, tenantQuery } from '../api/supabaseClient';

/**
 * Write an audit log entry matching the audit_logs schema:
 *   user_id UUID, action TEXT, entity_type TEXT, entity_id UUID,
 *   old_values JSONB, new_values JSONB, ip_address TEXT, created_at TIMESTAMPTZ
 *
 * IP capture must be done server-side for accuracy; client sets a sentinel so
 * the backend enrichment job can fill in the real IP from the request context.
 */
export async function logAuditEvent({
  action,
  entityType,
  entityId = null,
  oldValues = null,
  newValues = null,
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await tenantQuery('audit_logs').insert({
      user_id: user?.id ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: 'client',  // enriched by backend audit job from request headers
    });
  } catch (error) {
    console.error('Audit log write failed:', error);
  }
}

export const AuditActions = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  REJECT: 'reject',
  POST: 'post',
  REFUND: 'refund',
  LOGIN: 'login',
  LOGOUT: 'logout',
  EXPORT: 'export',
  IMPORT: 'import',
  SEND: 'send',
  GENERATE: 'generate',
  CONFIGURE: 'configure',
  PAYROLL_RUN: 'payroll_run',
  ROLE_CHANGE: 'role_change',
};

export default { logAuditEvent, AuditActions };
