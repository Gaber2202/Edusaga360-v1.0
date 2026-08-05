/**
 * src/packs/sa/feeGovernance.ts
 *
 * Saudi fee-governance pack. Per ADR-007, discount eligibility is a school-level
 * policy and lives in a generic service. This pack is reserved for true
 * regulator-driven fee-increase governance (e.g. MOE caps, required submissions).
 */

import type { FeeGovernanceService } from '../contract/CountryPack.js';

export const saFeeGovernance: FeeGovernanceService = {};
