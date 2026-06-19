/**
 * Cheque lifecycle state machine (P1.6).
 *
 * Pure, side-effect-free rules so they can be unit-tested and shared by the
 * route handler. The handler is responsible for the DB writes and the invoice
 * payment sync; this module only answers "is this transition legal?" and
 * "what should happen to the linked invoice?".
 *
 *   received → pending_deposit → deposited → cleared → reconciled
 *   (bounced and cancelled are reachable from the relevant states)
 */

export const CHEQUE_STATUSES = [
  'received',
  'pending_deposit',
  'deposited',
  'cleared',
  'bounced',
  'reconciled',
  'cancelled',
] as const;

export type ChequeStatus = (typeof CHEQUE_STATUSES)[number];

/** Legal next states for each status. Empty array = terminal. */
export const ALLOWED_TRANSITIONS: Record<ChequeStatus, ChequeStatus[]> = {
  received: ['pending_deposit', 'deposited', 'cancelled'],
  pending_deposit: ['deposited', 'cancelled'],
  deposited: ['cleared', 'bounced'],
  // A cleared cheque can still be recalled/returned by the bank, or be reconciled and closed.
  cleared: ['reconciled', 'bounced'],
  // A bounced cheque may be re-presented (deposit again) or written off.
  bounced: ['pending_deposit', 'cancelled'],
  reconciled: [],
  cancelled: [],
};

export type InvoiceEffect = 'apply' | 'reverse' | 'none';

export function isChequeStatus(value: unknown): value is ChequeStatus {
  return typeof value === 'string' && (CHEQUE_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: ChequeStatus, to: ChequeStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: ChequeStatus): boolean {
  return (ALLOWED_TRANSITIONS[status]?.length ?? 0) === 0;
}

/**
 * The financial effect a transition has on the linked invoice:
 *   - 'apply'   : the funds are now confirmed → record a cheque payment.
 *   - 'reverse' : a previously cleared cheque bounced → undo the payment.
 *   - 'none'    : no financial change (e.g. deposit, reconcile, cancel).
 */
export function invoiceEffectOf(from: ChequeStatus, to: ChequeStatus): InvoiceEffect {
  if (to === 'cleared' && from !== 'cleared') return 'apply';
  if (from === 'cleared' && to === 'bounced') return 'reverse';
  return 'none';
}

/** A bounced cheque should raise a follow-up flag for collections. */
export function requiresFollowUp(to: ChequeStatus): boolean {
  return to === 'bounced';
}
