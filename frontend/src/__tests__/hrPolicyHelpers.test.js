import { describe, it, expect } from 'vitest';
import {
  bumpPolicyVersion,
  buildPolicyPayload,
  buildVersionSnapshot,
  selectPoliciesForOnboarding,
  statusBadgeLabel,
} from '../lib/hrPolicyHelpers';

describe('bumpPolicyVersion', () => {
  it('bumps minor version', () => {
    expect(bumpPolicyVersion('v1.0')).toBe('v1.1');
    expect(bumpPolicyVersion('v2.3')).toBe('v2.4');
  });

  it('handles bare numbers and empty', () => {
    expect(bumpPolicyVersion('3')).toBe('v3.1');
    expect(bumpPolicyVersion('')).toBe('v1.0');
    expect(bumpPolicyVersion(null)).toBe('v1.0');
  });
});

describe('buildPolicyPayload', () => {
  it('parses tags and scopes owner', () => {
    const payload = buildPolicyPayload(
      {
        title_ar: 'أ',
        title_en: 'A',
        category: 'leave_policies',
        body_ar: 'ب',
        body_en: 'b',
        tags: 'a, b , c',
        status: 'draft',
        scope_applies_to: ['all'],
        compliance_tags: ['leave_entitlements'],
        is_mandatory: true,
      },
      {
        selectedBranchId: 'branch-1',
        owner: { id: 'u1', name: 'HR' },
        isEditing: false,
      },
    );
    expect(payload.tags).toEqual(['a', 'b', 'c']);
    expect(payload.owner_id).toBe('u1');
    expect(payload.branch_id).toBe('branch-1');
    expect(payload.is_mandatory).toBe(true);
    expect(payload.current_version).toBe('v1.0');
  });

  it('bumps version when publishing an edit', () => {
    const payload = buildPolicyPayload(
      {
        title_ar: 'أ',
        title_en: 'A',
        category: 'code_of_conduct',
        body_ar: 'ب',
        body_en: 'b',
        tags: [],
        status: 'published',
        scope_applies_to: [],
        compliance_tags: [],
      },
      { isEditing: true, previousVersion: 'v1.0', owner: { id: 'u', name: 'N' } },
    );
    expect(payload.current_version).toBe('v1.1');
  });
});

describe('buildVersionSnapshot', () => {
  it('copies body and version', () => {
    const snap = buildVersionSnapshot(
      {
        id: 'p1',
        title_ar: 'ت',
        title_en: 'T',
        body_ar: '<p>ع</p>',
        body_en: '<p>e</p>',
        status: 'published',
        current_version: 'v1.2',
      },
      { createdBy: 'Admin' },
    );
    expect(snap.policy_id).toBe('p1');
    expect(snap.version_number).toBe('v1.2');
    expect(snap.created_by).toBe('Admin');
  });
});

describe('selectPoliciesForOnboarding', () => {
  it('prefers mandatory published policies', () => {
    const result = selectPoliciesForOnboarding([
      { id: 1, status: 'published', is_mandatory: false },
      { id: 2, status: 'published', is_mandatory: true },
      { id: 3, status: 'draft', is_mandatory: true },
    ]);
    expect(result.map((p) => p.id)).toEqual([2]);
  });

  it('falls back to all published when none mandatory', () => {
    const result = selectPoliciesForOnboarding([
      { id: 1, status: 'published' },
      { id: 2, status: 'draft' },
    ]);
    expect(result.map((p) => p.id)).toEqual([1]);
  });
});

describe('statusBadgeLabel', () => {
  it('returns localized labels', () => {
    expect(statusBadgeLabel('published', false)).toBe('Published');
    expect(statusBadgeLabel('published', true)).toBe('منشورة');
  });
});
