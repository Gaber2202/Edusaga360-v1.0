import { supabase, tenantQuery } from '../api/supabaseClient';

export async function logError({ page, module, action, error, severity = 'medium' }) {
  try {
    const user = await supabase.auth.getUser().then(r => r.data?.user).catch(() => null);
    
    await tenantQuery('system_errors').insert({
      error_id: `ERR-${Date.now().toString(36).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      user_email: user?.email,
      user_name: user?.full_name,
      page,
      module,
      action,
      error_message: error?.message || error?.toString() || 'Unknown error',
      stack_trace: error?.stack || '',
      severity,
      browser_info: navigator.userAgent
    });
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
}

export function withErrorLogging(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      await logError({
        page: context.page,
        module: context.module,
        action: context.action,
        error,
        severity: context.severity || 'medium'
      });
      throw error;
    }
  };
}