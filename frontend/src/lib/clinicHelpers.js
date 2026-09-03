/**
 * Helpers shared by SchoolClinic and QuickVisitPanel.
 */

/** Normalize allergy values from health-record JSONB and/or student free-text. */
export function normalizeAllergies(healthRecord, student) {
  const out = [];
  const seen = new Set();

  const push = (name) => {
    const n = String(name || '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n });
  };

  const fromRecord = healthRecord?.allergies;
  if (Array.isArray(fromRecord)) {
    for (const a of fromRecord) {
      if (typeof a === 'string') push(a);
      else if (a && typeof a === 'object') push(a.name || a.label || a.allergen);
    }
  } else if (typeof fromRecord === 'string') {
    fromRecord.split(/[,;\n]+/).forEach(push);
  }

  if (typeof student?.allergies === 'string') {
    student.allergies.split(/[,;\n]+/).forEach(push);
  } else if (Array.isArray(student?.allergies)) {
    student.allergies.forEach((a) => push(typeof a === 'string' ? a : a?.name));
  }

  if (Array.isArray(student?.canteen_allergens)) {
    student.canteen_allergens.forEach(push);
  }

  return out;
}

export function normalizeConditions(healthRecord, student) {
  const out = [];
  const seen = new Set();
  const push = (name) => {
    const n = String(name || '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };

  const fromRecord = healthRecord?.chronic_conditions;
  if (Array.isArray(fromRecord)) {
    fromRecord.forEach((c) => push(typeof c === 'string' ? c : c?.name));
  } else if (typeof fromRecord === 'string') {
    fromRecord.split(/[,;\n]+/).forEach(push);
  }

  if (typeof student?.chronic_conditions === 'string') {
    student.chronic_conditions.split(/[,;\n]+/).forEach(push);
  }

  return out;
}

export function isCriticalHealth(healthRecord, student) {
  if (healthRecord?.has_critical_condition) return true;
  const note = (student?.medical_notes || '').toLowerCase();
  return /\b(critical|severe|حرج|خطير)\b/.test(note);
}

export function criticalNote(healthRecord, student) {
  return (
    healthRecord?.critical_condition_note
    || (isCriticalHealth(healthRecord, student) ? (student?.medical_notes || '') : '')
    || ''
  );
}

export function bloodTypeOf(healthRecord, student) {
  return healthRecord?.blood_type || student?.blood_type || '';
}

export function parseListInput(text) {
  if (!text) return [];
  return String(text)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function allergiesToInput(allergies) {
  if (!Array.isArray(allergies)) return '';
  return allergies
    .map((a) => (typeof a === 'string' ? a : a?.name))
    .filter(Boolean)
    .join(', ');
}

export function buildClinicVisitEvent({ student, visit, tenantId, parentNotified }) {
  const complaint = visit.complaint_category || visit.complaint || '';
  return {
    tenant_id: tenantId,
    student_id: visit.student_id || student?.id,
    student_name: visit.student_name || student?.name_ar || student?.name_en,
    visit_time: visit.visit_time,
    complaint,
    treatment: visit.treatment_given || visit.medication_dispensed || 'treatment given',
    outcome: visit.outcome,
    parent_notified: Boolean(parentNotified ?? visit.parent_notified),
    guardian_phone: student?.emergency_phone || student?.guardian_phone || '',
    guardian_name: student?.emergency_contact || student?.guardian_name || '',
    branch_id: student?.branch_id || visit.branch_id || '',
  };
}
