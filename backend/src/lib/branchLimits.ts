/**
 * Subscription branch limits — enforced server-side (DB trigger + this helper for API routes).
 */

export class BranchLimitExceededError extends Error {
  readonly code = 'BRANCH_LIMIT_EXCEEDED';

  constructor(
    readonly current: number,
    readonly max: number,
  ) {
    super(`Branch limit exceeded (${current}/${max})`);
    this.name = 'BranchLimitExceededError';
  }
}

/** Returns true when another branch may be created for the tenant. */
export function canAddBranch(currentCount: number, maxBranches: number | null | undefined): boolean {
  const max = maxBranches ?? 9999;
  return currentCount < max;
}

/** Throws BranchLimitExceededError when the tenant is at its branch cap. */
export function assertCanAddBranch(currentCount: number, maxBranches: number | null | undefined): void {
  const max = maxBranches ?? 9999;
  if (currentCount >= max) {
    throw new BranchLimitExceededError(currentCount, max);
  }
}
