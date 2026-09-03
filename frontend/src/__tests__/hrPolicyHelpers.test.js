import { describe, it, expect } from 'vitest';
import {
  bumpPolicyVersion,
  buildPolicyPayload,
  buildVersionSnapshot,
  selectPoliciesForOnboarding,
  statusBadgeLabel,
  selectMissingPolicyTemplates,
  groupPoliciesByCategory,
  buildTemplateInsertRows,
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

describe('selectMissingPolicyTemplates', () => {
  it('skips templates already present by jurisdiction+category+title', () => {
    const pack = [
      { category: 'leave_policies', title_en: 'Annual Leave Policy' },
      { category: 'leave_policies', title_en: 'Annual Leave Policy' }, // pack dup
      { category: 'code_of_conduct', title_en: 'Code of Conduct' },
    ];
    const existing = [
      { category: 'leave_policies', title_en: 'Annual Leave Policy', jurisdiction_code: 'SA' },
    ];
    const missing = selectMissingPolicyTemplates(pack, existing, 'SA');
    expect(missing).toHaveLength(1);
    expect(missing[0].title_en).toBe('Code of Conduct');
  });

  it('returns empty when pack fully seeded', () => {
    const pack = [{ category: 'nda', title_en: 'NDA' }];
    const existing = [{ category: 'nda', title_en: 'NDA', jurisdiction_code: 'AE' }];
    expect(selectMissingPolicyTemplates(pack, existing, 'AE')).toEqual([]);
  });
});

describe('buildTemplateInsertRows', () => {
  it('builds draft template rows with codes', () => {
    const rows = buildTemplateInsertRows(
      [{ category: 'nda', title_en: 'NDA', title_ar: 'سرية' }],
      {
        jurisdictionCode: 'SA',
        tenantId: 't1',
        ownerId: 'u1',
        ownerName: 'Admin',
        stamp: 'ABC',
        effectiveDate: '2026-09-04',
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: 't1',
      jurisdiction_code: 'SA',
      is_template: true,
      status: 'draft',
      policy_code: 'POL-SA-ABC-0',
      owner_name: 'Admin',
      effective_date: '2026-09-04',
    });
  });
});

describe('groupPoliciesByCategory', () => {
  it('groups in category order and keeps extras', () => {
    const groups = groupPoliciesByCategory(
      [
        { id: 1, category: 'leave_policies' },
        { id: 2, category: 'code_of_conduct' },
        { id: 3, category: 'leave_policies' },
        { id: 4, category: null },
      ],
      ['code_of_conduct', 'leave_policies'],
    );
    expect(groups.map((g) => g.category)).toEqual([
      'code_of_conduct',
      'leave_policies',
      'uncategorized',
    ]);
    expect(groups[1].policies).toHaveLength(2);
  });
});
