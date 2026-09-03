/** Pure helpers for HR policy library / editor. */

export const POLICY_STATUSES = ['draft', 'under_review', 'approved', 'published', 'archived'];

/**
 * Bump a semver-like policy version string (v1.0 → v1.1).
 * Falls back to v1.0 when input is empty/invalid.
 */
export function bumpPolicyVersion(current) {
  if (current == null || String(current).trim() === '') return 'v1.0';
  const raw = String(current).trim();
  const match = raw.match(/^v?(\d+)(?:\.(\d+))?$/i);
  if (!match) return 'v1.0';
  const major = Number(match[1]);
  const minor = Number(match[2] ?? 0);
  return `v${major}.${minor + 1}`;
}

/**
 * Build a DB-safe payload from editor form state (strip UI-only fields).
 */
export function buildPolicyPayload(formData, { selectedBranchId, owner, isEditing, previousVersion } = {}) {
  const tags = Array.isArray(formData.tags)
    ? formData.tags
    : String(formData.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

  const status = POLICY_STATUSES.includes(formData.status) ? formData.status : 'draft';
  const shouldBump =
    isEditing &&
    (status === 'published' || status === 'approved') &&
    previousVersion;

  return {
    title_ar: formData.title_ar || '',
    title_en: formData.title_en || '',
    category: formData.category || '',
    description_ar: formData.description_ar || '',
    description_en: formData.description_en || '',
    body_ar: formData.body_ar || '',
    body_en: formData.body_en || '',
    scope_applies_to: formData.scope_applies_to || [],
    effective_date: formData.effective_date || null,
    tags,
    status,
    compliance_tags: formData.compliance_tags || [],
    is_mandatory: !!formData.is_mandatory,
    jurisdiction_code: formData.jurisdiction_code || null,
    branch_id: selectedBranchId || formData.branch_id || null,
    owner_id: owner?.id || formData.owner_id || null,
    owner_name: owner?.name || formData.owner_name || null,
    current_version: shouldBump
      ? bumpPolicyVersion(previousVersion)
      : formData.current_version || previousVersion || 'v1.0',
    last_updated: new Date().toISOString(),
  };
}

/**
 * Snapshot fields for policy_versions insert.
 */
export function buildVersionSnapshot(policy, { versionNumber, createdBy } = {}) {
  return {
    policy_id: policy.id,
    version_number: versionNumber || policy.current_version || 'v1.0',
    title_ar: policy.title_ar,
    title_en: policy.title_en,
    body_ar: policy.body_ar,
    body_en: policy.body_en,
    status: policy.status,
    created_by: createdBy || policy.owner_name || null,
  };
}

/**
 * Policies assigned to new-hire onboarding: published + mandatory when flag exists.
 * If no mandatory policies exist among published, fall back to all published
 * (legacy tenants that never set is_mandatory).
 */
export function selectPoliciesForOnboarding(policies) {
  const published = (policies || []).filter((p) => p.status === 'published');
  const mandatory = published.filter((p) => p.is_mandatory === true);
  return mandatory.length > 0 ? mandatory : published;
}

export function statusBadgeLabel(status, isRTL) {
  const map = {
    draft: { ar: 'مسودة', en: 'Draft' },
    under_review: { ar: 'مراجعة', en: 'Review' },
    approved: { ar: 'معتمدة', en: 'Approved' },
    published: { ar: 'منشورة', en: 'Published' },
    archived: { ar: 'مؤرشفة', en: 'Archived' },
  };
  const entry = map[status] || map.draft;
  return isRTL ? entry.ar : entry.en;
}

/** Stable identity for pack templates vs existing rows (dedupe initialize). */
export function policyTemplateKey(policyOrTemplate, jurisdictionCode) {
  const jurisdiction = String(
    policyOrTemplate?.jurisdiction_code || jurisdictionCode || 'SA',
  )
    .trim()
    .toUpperCase();
  const category = String(policyOrTemplate?.category || '')
    .trim()
    .toLowerCase();
  const title = String(policyOrTemplate?.title_en || '')
    .trim()
    .toLowerCase();
  return `${jurisdiction}::${category}::${title}`;
}

/**
 * Return pack templates not already present (by jurisdiction+category+title_en).
 * Also collapses duplicate entries inside the pack itself.
 */
export function selectMissingPolicyTemplates(packTemplates, existingPolicies, jurisdictionCode) {
  const existing = new Set(
    (existingPolicies || []).map((p) =>
      policyTemplateKey(p, p.jurisdiction_code || jurisdictionCode),
    ),
  );
  const missing = [];
  const seenPack = new Set();
  for (const template of packTemplates || []) {
    const key = policyTemplateKey(template, jurisdictionCode);
    if (!key.endsWith('::') && !seenPack.has(key) && !existing.has(key)) {
      seenPack.add(key);
      missing.push(template);
    }
  }
  return missing;
}

/**
 * Build DB insert rows for staged pack templates (draft-first, is_template).
 */
export function buildTemplateInsertRows(templates, {
  jurisdictionCode,
  tenantId,
  ownerId,
  ownerName,
  stamp = Date.now().toString(36).toUpperCase(),
  effectiveDate = new Date().toISOString().split('T')[0],
} = {}) {
  return (templates || []).map((template, idx) => ({
    ...template,
    policy_code: `POL-${jurisdictionCode}-${stamp}-${idx}`,
    tenant_id: tenantId,
    branch_id: null,
    jurisdiction_code: jurisdictionCode,
    is_template: true,
    status: 'draft',
    is_mandatory: false,
    current_version: 'v1.0',
    owner_id: ownerId || 'system',
    owner_name: ownerName || 'System',
    effective_date: effectiveDate,
  }));
}

/** Group policies by category key; unknown categories go under "other". */
export function groupPoliciesByCategory(policies, categoryOrder = []) {
  const groups = new Map();
  for (const key of categoryOrder) groups.set(key, []);
  for (const policy of policies || []) {
    const key = policy.category && groups.has(policy.category)
      ? policy.category
      : policy.category || 'uncategorized';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(policy);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 0)
    .map(([category, rows]) => ({ category, policies: rows }));
}
