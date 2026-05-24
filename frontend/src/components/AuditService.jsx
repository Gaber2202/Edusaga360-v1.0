
import { supabase, tenantQuery } from '../api/supabaseClient';

export async function logAuditEvent({
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null,
  notes = ''
}) {
  try {
    const user = await supabase.auth.getUser().then(r => r.data?.user);
    
    await tenantQuery('audit_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      user_email: user?.email || 'system',
      user_name: user?.full_name || 'System',
      user_role: user?.user_role || user?.role || 'unknown',
      branch_id: user?.branch_id,
      old_values: oldValues,
      new_values: newValues,
      notes,
      timestamp: new Date().toISOString(),
      ip_address: 'client',
      user_agent: navigator.userAgent
    });
  } catch (error) {
    console.error('Error logging audit event:', error);
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
  MFA_VERIFY: 'mfa_verify',
  EXPORT: 'export',
  IMPORT: 'import',
  SEND: 'send',
  GENERATE: 'generate',
  CONFIGURE: 'configure'
};

export default { logAuditEvent, AuditActions };
