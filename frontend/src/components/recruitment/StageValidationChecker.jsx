import React from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

// Validation rules per target stage
const STAGE_REQUIREMENTS = {
  screening: {
    ar: 'الفرز',
    en: 'Screening',
    checks: [
      { key: 'cv_url', ar: 'السيرة الذاتية مرفوعة', en: 'CV uploaded', test: (a) => !!a.cv_url },
      { key: 'expected_salary', ar: 'الراتب المتوقع محدد', en: 'Expected salary set', test: (a) => !!a.expected_salary && a.expected_salary > 0 },
    ],
  },
  interview_scheduled: {
    ar: 'المقابلة',
    en: 'Interview',
    checks: [
      { key: 'education_level', ar: 'المستوى التعليمي محدد', en: 'Education level set', test: (a) => !!a.education_level },
      { key: 'years_of_experience', ar: 'سنوات الخبرة محددة', en: 'Years of experience set', test: (a) => a.years_of_experience !== undefined },
    ],
  },
  offered: {
    ar: 'العرض الوظيفي',
    en: 'Offered',
    checks: [
      { key: 'interview_score', ar: 'نتيجة المقابلة مسجلة', en: 'Interview score recorded', test: (a) => (a.interview_score > 0) || (a.interview_technical_score > 0) },
      { key: 'expected_salary', ar: 'الراتب المتوقع محدد', en: 'Expected salary set', test: (a) => !!a.expected_salary && a.expected_salary > 0 },
    ],
  },
  rejected: {
    ar: 'الرفض',
    en: 'Rejected',
    checks: [
      { key: 'recruiter_notes', ar: 'سبب الرفض مدخل في الملاحظات', en: 'Rejection reason in notes', test: (a) => !!a.recruiter_notes && a.recruiter_notes.length > 3 },
    ],
  },
};

export function getStageValidation(applicant, targetStage) {
  const rules = STAGE_REQUIREMENTS[targetStage];
  if (!rules) return { valid: true, failed: [] };
  const failed = rules.checks.filter(c => !c.test(applicant));
  return { valid: failed.length === 0, failed };
}

export default function StageValidationChecker({ applicant, targetStage, isRTL, onProceed: _onProceed, onCancel: _onCancel }) {
  const { valid, failed: _failed } = getStageValidation(applicant, targetStage);
  const rules = STAGE_REQUIREMENTS[targetStage];

  if (valid) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 text-sm">
            {isRTL
              ? `لا يمكن الانتقال إلى مرحلة "${rules?.ar}" — يجب استيفاء المتطلبات التالية:`
              : `Cannot move to "${rules?.en}" — complete the following first:`}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {(rules?.checks || []).map(check => {
          const passed = check.test(applicant);
          return (
            <div key={check.key} className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${passed ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              {passed
                ? <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              <span className={passed ? 'text-emerald-700' : 'text-red-700'}>
                {isRTL ? check.ar : check.en}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}