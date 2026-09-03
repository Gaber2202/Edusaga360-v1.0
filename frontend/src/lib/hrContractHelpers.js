/** Pure helpers for HR contracts / employee documents archive. */

export const DOCUMENT_TYPES = [
  'employment_contract',
  'offer_letter',
  'appointment_letter',
  'termination_letter',
  'salary_certificate',
  'experience_certificate',
  'policy_acknowledgment',
  'nda',
  'other',
];

export const DOCUMENT_STATUSES = ['draft', 'sent', 'signed', 'expired', 'archived'];

export function documentTypeLabel(type, isRTL) {
  const map = {
    employment_contract: { ar: 'عقد توظيف', en: 'Employment Contract' },
    offer_letter: { ar: 'خطاب عرض', en: 'Offer Letter' },
    appointment_letter: { ar: 'خطاب تعيين', en: 'Appointment Letter' },
    termination_letter: { ar: 'خطاب إنهاء', en: 'Termination Letter' },
    salary_certificate: { ar: 'شهادة راتب', en: 'Salary Certificate' },
    experience_certificate: { ar: 'شهادة خبرة', en: 'Experience Certificate' },
    policy_acknowledgment: { ar: 'إقرار سياسة', en: 'Policy Acknowledgment' },
    nda: { ar: 'اتفاقية سرية', en: 'NDA' },
    other: { ar: 'أخرى', en: 'Other' },
  };
  const entry = map[type] || map.other;
  return isRTL ? entry.ar : entry.en;
}

export function documentStatusLabel(status, isRTL) {
  const map = {
    draft: { ar: 'مسودة', en: 'Draft' },
    sent: { ar: 'مرسل', en: 'Sent' },
    signed: { ar: 'موقع', en: 'Signed' },
    expired: { ar: 'منتهي', en: 'Expired' },
    archived: { ar: 'مؤرشف', en: 'Archived' },
  };
  const entry = map[status] || map.draft;
  return isRTL ? entry.ar : entry.en;
}

/**
 * Derive effective status: past expiry_date → expired (unless already archived).
 */
export function resolveDocumentStatus(doc, now = new Date()) {
  if (!doc) return 'draft';
  if (doc.status === 'archived') return 'archived';
  if (doc.expiry_date) {
    const exp = new Date(doc.expiry_date);
    if (!Number.isNaN(exp.getTime()) && exp < now) {
      return 'expired';
    }
  }
  return DOCUMENT_STATUSES.includes(doc.status) ? doc.status : 'draft';
}

export function isExpiringSoon(doc, withinDays = 30, now = new Date()) {
  if (!doc?.expiry_date) return false;
  const exp = new Date(doc.expiry_date);
  if (Number.isNaN(exp.getTime())) return false;
  const ms = exp.getTime() - now.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return days >= 0 && days <= withinDays;
}

/**
 * Persist storage path, not ephemeral signed URLs.
 */
export function normalizeUploadResult(uploadResult) {
  const path = uploadResult?.path || null;
  const signedUrl = uploadResult?.signedUrl || null;
  return {
    file_path: path,
    // Keep signed URL only as temporary convenience; canonical is file_path
    document_url: path || signedUrl || '',
  };
}

export function buildDocumentPayload(formData, { employee, selectedBranchId } = {}) {
  const type = DOCUMENT_TYPES.includes(formData.document_type)
    ? formData.document_type
    : 'other';
  const status = DOCUMENT_STATUSES.includes(formData.status) ? formData.status : 'draft';

  return {
    document_type: type,
    employee_id: formData.employee_id || null,
    employee_name: employee?.name_ar || employee?.name_en || formData.employee_name || null,
    document_name: formData.document_name || '',
    document_url: formData.document_url || '',
    file_path: formData.file_path || formData.document_url || null,
    version: formData.version || '1.0',
    issue_date: formData.issue_date || null,
    expiry_date: formData.expiry_date || null,
    requires_signature: !!formData.requires_signature,
    notes: formData.notes || '',
    status,
    branch_id: employee?.branch_id || selectedBranchId || null,
    contract_data: formData.contract_data || {},
  };
}

/**
 * Mirror employment_contract archive rows into employee_contracts for ESS.
 */
export function buildEmployeeContractFromDocument(doc, { documentId } = {}) {
  const data = doc.contract_data || {};
  return {
    employee_id: doc.employee_id,
    branch_id: doc.branch_id || null,
    document_id: documentId || doc.id || null,
    contract_type: data.contract_type || doc.document_type || 'employment_contract',
    start_date: data.start_date || doc.issue_date,
    end_date: data.end_date || doc.expiry_date || null,
    probation_end: data.probation_end_date || data.probation_end || null,
    salary: data.total_salary ?? data.basic_salary ?? null,
    job_title: data.job_title || null,
    terms: data,
    status: doc.status === 'signed' || doc.status === 'sent' ? 'active' : 'draft',
    notes: doc.notes || null,
  };
}

export function filterDocuments(docs, { search = '', status = 'all', type = 'all' } = {}) {
  const q = String(search || '').toLowerCase().trim();
  return (docs || []).filter((d) => {
    const effective = resolveDocumentStatus(d);
    const matchesSearch =
      !q ||
      d.document_name?.toLowerCase().includes(q) ||
      d.employee_name?.toLowerCase().includes(q) ||
      d.document_type?.toLowerCase().includes(q);
    const matchesStatus = status === 'all' || effective === status;
    const matchesType = type === 'all' || d.document_type === type;
    return matchesSearch && matchesStatus && matchesType;
  });
}
