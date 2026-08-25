/**
 * SCRUM-124 leave enhancement unit tests — default chain + pack annual leave.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseStub, QueryContext } from './support/supabaseMock.js';

const db = createSupabaseStub();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => db.client }));

const { DEFAULT_LEAVE_APPROVAL_CHAIN, resolveApprovalChain } = await import('../routes/leave.js');
const { saPayroll } = await import('../packs/sa/payroll.js');
const { aePayroll } = await import('../packs/ae/payroll.js');
const { qaPayroll } = await import('../packs/qa/payroll.js');

beforeEach(() => {
  db.reset();
  vi.clearAllMocks();
});

describe('SCRUM-124 leave approval default chain', () => {
  it('defaults to manager → HR when no chain configured', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'leave_approval_chains') return { data: [] };
      return { data: null };
    });
    const chain = await resolveApprovalChain('tenant-A', 'lt-1', 3);
    expect(chain).toEqual(DEFAULT_LEAVE_APPROVAL_CHAIN);
    expect(chain.map((c) => c.approver_role)).toEqual(['direct_manager', 'hr_manager']);
  });

  it('uses configured chain when present', async () => {
    db.setResolver((ctx: QueryContext) => {
      if (ctx.table === 'leave_approval_chains') {
        return {
          data: [
            { level: 1, approver_role: 'hr_manager', approver_user_id: null, min_days: null, max_days: null },
          ],
        };
      }
      return { data: null };
    });
    const chain = await resolveApprovalChain('tenant-A', 'lt-1', 2);
    expect(chain).toHaveLength(1);
    expect(chain[0].approver_role).toBe('hr_manager');
  });
});

describe('SCRUM-124 pack annual leave entitlements', () => {
  it('SA: 21 days under 5 years, 30 days at/after 5', () => {
    expect(saPayroll.calculateAnnualLeave?.(0)).toBe(0);
    expect(saPayroll.calculateAnnualLeave?.(2)).toBe(21);
    expect(saPayroll.calculateAnnualLeave?.(5)).toBe(30);
  });

  it('AE: 30 days after 1 year', () => {
    expect(aePayroll.calculateAnnualLeave?.(0)).toBe(0);
    expect(aePayroll.calculateAnnualLeave?.(1)).toBe(30);
  });

  it('QA: 21 then 28 by tenure', () => {
    expect(qaPayroll.calculateAnnualLeave?.(2)).toBe(21);
    expect(qaPayroll.calculateAnnualLeave?.(5)).toBe(28);
  });
});
