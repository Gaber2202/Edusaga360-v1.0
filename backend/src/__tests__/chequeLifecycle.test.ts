/**
 * Cheque lifecycle state machine (P1.6) — pure transition + invoice-effect rules.
 */
import { describe, it, expect } from 'vitest';
import {
  CHEQUE_STATUSES,
  canTransition,
  invoiceEffectOf,
  isTerminal,
  isChequeStatus,
  requiresFollowUp,
  ChequeStatus,
} from '../services/chequeLifecycle.js';

describe('canTransition — only legal moves are allowed', () => {
  it('allows the happy-path deposit → clearance → reconciliation chain', () => {
    expect(canTransition('received', 'pending_deposit')).toBe(true);
    expect(canTransition('received', 'deposited')).toBe(true);
    expect(canTransition('pending_deposit', 'deposited')).toBe(true);
    expect(canTransition('deposited', 'cleared')).toBe(true);
    expect(canTransition('cleared', 'reconciled')).toBe(true);
  });

  it('allows bounce from deposited and from cleared (bank recall)', () => {
    expect(canTransition('deposited', 'bounced')).toBe(true);
    expect(canTransition('cleared', 'bounced')).toBe(true);
  });

  it('allows a bounced cheque to be re-presented or cancelled', () => {
    expect(canTransition('bounced', 'pending_deposit')).toBe(true);
    expect(canTransition('bounced', 'cancelled')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('received', 'cleared')).toBe(false); // must be deposited first
    expect(canTransition('received', 'reconciled')).toBe(false);
    expect(canTransition('reconciled', 'cleared')).toBe(false); // terminal
    expect(canTransition('cancelled', 'received')).toBe(false); // terminal
    expect(canTransition('cleared', 'deposited')).toBe(false); // no going back
  });
});

describe('invoiceEffectOf — financial impact of a transition', () => {
  it("applies a payment when a cheque becomes 'cleared'", () => {
    expect(invoiceEffectOf('deposited', 'cleared')).toBe('apply');
  });

  it("reverses the payment when a cleared cheque bounces", () => {
    expect(invoiceEffectOf('cleared', 'bounced')).toBe('reverse');
  });

  it('has no financial effect for deposit / reconcile / cancel / direct bounce', () => {
    expect(invoiceEffectOf('received', 'deposited')).toBe('none');
    expect(invoiceEffectOf('cleared', 'reconciled')).toBe('none');
    expect(invoiceEffectOf('received', 'cancelled')).toBe('none');
    expect(invoiceEffectOf('deposited', 'bounced')).toBe('none'); // never cleared, nothing to reverse
  });
});

describe('helpers', () => {
  it('flags terminal states', () => {
    expect(isTerminal('reconciled')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('received')).toBe(false);
    expect(isTerminal('cleared')).toBe(false);
  });

  it('requires follow-up only on bounce', () => {
    expect(requiresFollowUp('bounced')).toBe(true);
    expect(requiresFollowUp('cleared')).toBe(false);
  });

  it('validates cheque status strings', () => {
    expect(isChequeStatus('cleared')).toBe(true);
    expect(isChequeStatus('nonsense')).toBe(false);
    expect(isChequeStatus(42)).toBe(false);
  });

  it('every non-terminal status has at least one legal transition and every target is valid', () => {
    for (const s of CHEQUE_STATUSES) {
      if (!isTerminal(s)) {
        // Reaching here means there is at least one allowed move; verify each is a real status.
        const targets = CHEQUE_STATUSES.filter((t) => canTransition(s as ChequeStatus, t));
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.every((t) => isChequeStatus(t))).toBe(true);
      }
    }
  });
});
