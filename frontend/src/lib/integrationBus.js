/**
 * EduSaga 360 — Integration Event Bus
 * Fires cross-module events and logs them to IntegrationLog.
 */
import { tenantQuery } from '../api/supabaseClient';

const EVENT_HANDLERS = {};

export function registerHandler(eventType, handlerFn) {
  if (!EVENT_HANDLERS[eventType]) EVENT_HANDLERS[eventType] = [];
  EVENT_HANDLERS[eventType].push(handlerFn);
}

export async function fireEvent(eventType, payload = {}, meta = {}) {
  const logEntry = {
    event_type: eventType,
    source_module: meta.sourceModule || 'unknown',
    target_modules: [],
    payload: JSON.stringify(payload),
    status: 'processing',
    timestamp: new Date().toISOString(),
    tenant_id: meta.tenantId || payload.tenant_id || '',
    branch_id: meta.branchId || payload.branch_id || '',
    triggered_by: meta.userId || '',
    retry_count: 0,
  };

  let logId = null;
  try {
    const { data } = await tenantQuery('integration_logs').insert(logEntry).select('id').single();
    logId = data?.id ?? null;
  } catch (e) {
    console.warn('[IntegrationBus] Failed to write log entry', e);
  }

  const handlers = EVENT_HANDLERS[eventType] || [];
  const results = [];
  const successModules = [];
  const failedModules = [];

  for (const handler of handlers) {
    const moduleName = handler._moduleName || 'unknown';
    let attempt = 0;
    let success = false;
    let lastError = null;

    while (attempt < 3 && !success) {
      try {
        await handler(payload, meta);
        success = true;
        successModules.push(moduleName);
        results.push({ module: moduleName, status: 'ok' });
      } catch (err) {
        attempt += 1;
        lastError = err;
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500));
      }
    }

    if (!success) {
      failedModules.push(moduleName);
      results.push({ module: moduleName, status: 'failed', error: lastError?.message || String(lastError) });
      console.error(`[IntegrationBus] Handler failed for ${eventType} → ${moduleName}`, lastError);
    }
  }

  if (logId) {
    try {
      await tenantQuery('integration_logs').update({
        status: failedModules.length === 0 ? 'success' : successModules.length > 0 ? 'partial' : 'failed',
        target_modules: [...successModules, ...failedModules],
        result_summary: JSON.stringify(results),
        completed_at: new Date().toISOString(),
        retry_count: results.filter(r => r.status === 'failed').length,
      }).eq('id', logId);
    } catch { /* non-blocking */ }
  }

  return { eventType, results, successModules, failedModules };
}
