import { supabase } from '../api/supabaseClient';

/**
 * Atomically change canteen item stock and append an admin-visible movement.
 * qtyDelta is signed: receive/opening > 0, sale/waste < 0, adjustment either.
 */
export async function applyCanteenStock({
  tenantId,
  itemId,
  movementType,
  qtyDelta,
  reason,
  performedBy,
  saleTxnId,
}) {
  const { data, error } = await supabase.rpc('canteen_apply_stock', {
    p_tenant_id: tenantId,
    p_item_id: itemId,
    p_movement_type: movementType,
    p_qty_delta: qtyDelta,
    p_reason: reason || null,
    p_performed_by: performedBy || null,
    p_sale_txn_id: saleTxnId || null,
  });
  if (error) {
    const message = error.message || '';
    if (message.includes('insufficient_stock')) {
      throw new Error('INSUFFICIENT_STOCK');
    }
    throw new Error(message || 'STOCK_UPDATE_FAILED');
  }
  return data;
}

export function stockStatus(item) {
  const qty = Number(item?.stock_qty) || 0;
  const threshold = Number(item?.low_stock_threshold) || 10;
  if (qty <= 0) return 'out';
  if (qty <= threshold) return 'low';
  return 'ok';
}
