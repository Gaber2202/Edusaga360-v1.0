import { supabase, tenantQuery } from '../api/supabaseClient';

/**
 * Report a recoverable error to the SystemError entity so super-admins can see
 * it in the audit/error log. Use this instead of `console.warn('... skipped:', e.message)`
 * for any operator-relevant failure that a user won't see (side-effects that
 * silently no-op — e.g. journal-entry writes that fail but don't block the
 * parent save).
 *
 * Routing rule: this writer owns the in-app SystemError audit trail; it does
 * NOT forward to Sentry. Sentry capture is the responsibility of either
 * `ErrorBoundary` (for unhandled render errors) or a direct
 * `captureAppException` call. Reasoning: errors reported here have already
 * been caught and handled — they are side-effect failures the operator
 * should see, not surprises Sentry needs to alert on. Avoiding a second
 * writer stops the same incident from appearing in Sentry twice when both
 * `reportError` and ErrorBoundary fire on the same error.
 *
 * Never throws: if the SystemError write itself fails, we fall back to
 * `logger.error` so we don't cascade a logging failure into a surface error.
 *
 * @param {Object} options
 * @param {Error|unknown} options.error - The thrown error.
 * @param {string} options.module - High-level module name (e.g. 'fees', 'payroll').
 * @param {string} options.action - What was being attempted (e.g. 'create_journal_entry').
 * @param {'low'|'medium'|'high'} [options.severity='medium']
 * @param {Object} [options.context] - Extra context merged into stack_trace.
 */
export async function reportError({ error, module, action, severity = 'medium', context }) {
  try {
    const user = await supabase.auth.getUser().then(r => r.data?.user).catch(() => null);
    const message = error?.message || String(error);
    const stack = error?.stack || '';
    await tenantQuery('system_errors').insert({
      error_id: `ERR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      user_email: user?.email,
      user_name: user?.full_name,
      page: typeof window !== 'undefined' ? window.location.pathname : null,
      module,
      action,
      error_message: message,
      stack_trace: context ? `${stack}\n\nContext: ${JSON.stringify(context)}` : stack,
      severity,
      browser_info: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch (logError) {
    // Never shadow the original error with a logging error.
    console.error('[errorReporter] failed to write SystemError', logError, 'for:', error);
  }
}

export default reportError;
