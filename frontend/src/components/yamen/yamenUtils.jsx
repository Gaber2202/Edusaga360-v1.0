// Advanced analytics engine for YAMEN
import { isExpired, isExpiringWithin, daysUntilExpiry } from '../../lib/dateCompare';

/**
 * Strip Markdown formatting markers so AI output renders as clean plain text.
 * Every Yamen surface shows the model's text in a `whitespace-pre-wrap` block
 * (and exports it verbatim to .txt) — none of them render Markdown — so leftover
 * `**bold**`, `# headings`, and `` `code` `` markers show up as literal noise.
 * This removes the markers while preserving the words, line breaks, and lists.
 * Deliberately conservative: only doubled `**`/`__` emphasis is unwrapped, so a
 * lone asterisk (e.g. "3 * 4") is left untouched.
 */
export function stripMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/```[a-zA-Z]*\n?/g, '')   // opening code fences
    .replace(/`([^`]+)`/g, '$1')        // inline code
    .replace(/\*\*(.+?)\*\*/gs, '$1')   // **bold**
    .replace(/__(.+?)__/gs, '$1')       // __bold__
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // # headings
    .replace(/^\s*[*+]\s+/gm, '- ')     // normalise bullet markers to "- "
    .replace(/\*\*/g, '')               // any stray leftover "**"
    .replace(/^>\s?/gm, '');            // blockquote markers
}

/**
 * Safely extract the assistant's text from an /api/ai/invoke-llm result.
 * The endpoint returns `{ response, provider }` on success; rendering that
 * object directly throws React error #31. Always pass AI results through this
 * before putting them in state / JSX. Output is Markdown-scrubbed so the plain
 * text surfaces (and .txt downloads) stay clean.
 */
export function extractAiText(res) {
  if (res == null) return '';
  if (typeof res === 'string') return stripMarkdown(res);
  if (typeof res.response === 'string') return stripMarkdown(res.response);
  if (res.response != null) {
    return typeof res.response === 'object' ? JSON.stringify(res.response, null, 2) : stripMarkdown(String(res.response));
  }
  if (typeof res.text === 'string') return stripMarkdown(res.text);
  return '';
}

/**
 * Turn an AI call failure into a clean, bilingual message. The backend throws
 * for quota/credit/token exhaustion — surface that as "No AI tokens available"
 * rather than a raw provider error.
 */
export function aiErrorMessage(err, isRTL) {
  const m = String(err?.message || '').toLowerCase();
  if (/token|quota|credit|billing|insufficient|429|rate.?limit|exhaust/.test(m)) {
    return isRTL ? 'لا يوجد رصيد كافٍ من رموز الذكاء الاصطناعي' : 'No AI tokens available';
  }
  return isRTL ? 'خدمة الذكاء الاصطناعي غير متاحة حالياً' : 'AI service is currently unavailable';
}

export function calculateAdvancedAnalytics(employees, attendance, leaveRequests, _payRuns) {
  try {
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Risk scoring
    const employeeRisks = employees.map(emp => {
      let riskScore = 0;
      
      // Attendance risk
      const empAttendance = attendance.filter(a => a.employee_id === emp.id);
      const recentAbsences = empAttendance.filter(a => new Date(a.date) > last30Days && a.status === 'absent').length;
      if (recentAbsences > 5) riskScore += 30;
      else if (recentAbsences > 2) riskScore += 15;

      // Leave risk
      const empLeaves = leaveRequests.filter(l => l.employee_id === emp.id);
      const pendingLeaves = empLeaves.filter(l => l.status === 'pending' || l.status === 'pending_manager').length;
      if (pendingLeaves > 2) riskScore += 20;

      // Compliance risk (Iqama, visa expiry status) — compare at Riyadh day
      // granularity so an Iqama is not flagged expired on its last valid day.
      const iqamaExpired = isExpired(emp.iqama_expiry, today);
      if (iqamaExpired) riskScore += 40;
      else if (isExpiringWithin(emp.iqama_expiry, 30, today)) riskScore += 20;

      return {
        employeeId: emp.id,
        name: emp.name_en || emp.name_ar,
        riskScore: Math.min(riskScore, 100),
        riskLevel: riskScore > 60 ? 'HIGH' : riskScore > 30 ? 'MEDIUM' : 'LOW',
        riskFactors: [
          recentAbsences > 2 ? `${recentAbsences} absences in 30 days` : null,
          pendingLeaves > 0 ? `${pendingLeaves} pending leave requests` : null,
          iqamaExpired ? 'Iqama expired' : null,
        ].filter(Boolean),
      };
    });

    // Trend analysis
    const last30Attendance = attendance.filter(a => new Date(a.date) > last30Days);
    const absenceRate = last30Attendance.length > 0 
      ? Math.round((last30Attendance.filter(a => a.status === 'absent').length / last30Attendance.length) * 100)
      : 0;

    // Predictions
    const highRiskEmployees = employeeRisks.filter(e => e.riskLevel === 'HIGH');
    const turnoverRisk = highRiskEmployees.length > 0 
      ? `${highRiskEmployees.length} employees at high risk`
      : 'Low turnover risk';

    return {
      employeeRisks: employeeRisks.slice(0, 10),
      overallAbsenceRate: absenceRate,
      turnoverRisk,
      trendsSummary: {
        month: 'Last 30 days',
        absenceTrend: absenceRate > 10 ? 'Increasing' : 'Stable',
        complianceStatus: employeeRisks.filter(e => e.riskFactors.some(f => f.includes('Iqama'))).length > 0 ? 'Needs attention' : 'Compliant',
      },
    };
  } catch (err) {
    return { _error: err.message };
  }
}

// Policy recommendations engine
export function generatePolicyRecommendations(employees, violations, leaveRequests) {
  const recommendations = [];

  // Absence management
  const frequentAbsentees = employees.filter(e => e.absence_count > 5).length;
  if (frequentAbsentees > 0) {
    recommendations.push({
      category: 'Attendance',
      priority: 'HIGH',
      recommendation: 'Review absence management policy. Consider disciplinary action for chronic absenteeism.',
      affectedEmployees: frequentAbsentees,
    });
  }

  // Leave management
  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending' || l.status === 'pending_manager').length;
  if (pendingLeaves > 10) {
    recommendations.push({
      category: 'Leave Management',
      priority: 'MEDIUM',
      recommendation: 'High number of pending leave requests. Accelerate approval process.',
      affectedEmployees: pendingLeaves,
    });
  }

  // Compliance
  if (violations && violations.length > 0) {
    recommendations.push({
      category: 'Compliance',
      priority: 'HIGH',
      recommendation: 'Outstanding government violations detected. Prioritize resolution.',
      affectedEmployees: violations.length,
    });
  }

  // Performance
  recommendations.push({
    category: 'General Best Practice',
    priority: 'MEDIUM',
    recommendation: 'Implement monthly performance reviews to align with Saudi labor market standards.',
    affectedEmployees: employees.length,
  });

  return recommendations.slice(0, 5);
}

// PREDICTIVE ANALYTICS
export function predictChurnRisk(employees, attendance, leaveRequests, evaluations) {
  return employees.map(emp => {
    let churnScore = 0;
    
    const empLeaves = leaveRequests.filter(l => l.employee_id === emp.id);
    const recentLeaveRequests = empLeaves.filter(l => new Date(l.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length;
    if (recentLeaveRequests > 3) churnScore += 25;
    
    const empEval = evaluations.find(e => e.employee_id === emp.id);
    if (empEval && empEval.overall_score < 3) churnScore += 30;
    
    if (emp.years_of_service && emp.years_of_service > 5) churnScore -= 10;
    
    return {
      employeeId: emp.id,
      name: emp.name_en || emp.name_ar,
      churnRisk: Math.min(Math.max(churnScore, 0), 100),
      riskLevel: churnScore > 60 ? 'HIGH' : churnScore > 30 ? 'MEDIUM' : 'LOW',
    };
  });
}

export function detectPayrollAnomalies(payRuns, _employees) {
  const anomalies = [];
  payRuns.forEach(run => {
    if (run.total_net_salary && run.previous_month_salary) {
      const variance = Math.abs(run.total_net_salary - run.previous_month_salary) / run.previous_month_salary;
      if (variance > 0.2) {
        anomalies.push({
          period: `${run.period_month}/${run.period_year}`,
          variance: Math.round(variance * 100),
          status: 'REVIEW_REQUIRED',
        });
      }
    }
  });
  return anomalies;
}

export function forecastAbsencePatterns(attendance) {
  const months = {};
  attendance.forEach(a => {
    const month = new Date(a.date).toISOString().slice(0, 7);
    months[month] = (months[month] || 0) + (a.status === 'absent' ? 1 : 0);
  });
  const values = Object.values(months);
  const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const trend = values.length > 1 && values[values.length - 1] > avg ? 'INCREASING' : 'STABLE';
  return { avgAbsencesPerMonth: avg, trend, recommendation: trend === 'INCREASING' ? 'Monitor closely' : 'No action needed' };
}

// RECRUITMENT INTELLIGENCE
export const jobDescriptionTemplates = {
  manager: {
    title: 'Senior Manager',
    keyResponsibilities: [
      'Lead and manage team performance',
      'Budget management and resource allocation',
      'Strategic planning and execution',
    ],
    requirements: ['5+ years experience', 'Leadership skills', 'Saudi Labor Law knowledge'],
  },
  teacher: {
    title: 'Secondary Teacher',
    keyResponsibilities: [
      'Deliver curriculum-aligned lessons',
      'Assessment and student progress tracking',
      'Parent communication',
    ],
    requirements: ['Teaching qualification', 'Subject expertise', 'MOE license (Saudi)'],
  },
  finance: {
    title: 'Finance Officer',
    keyResponsibilities: [
      'Financial reporting',
      'Budget forecasting',
      'Compliance management',
    ],
    requirements: ['Accounting degree', '2+ years experience', 'ZATCA compliance knowledge'],
  },
};

// COMPLIANCE ENGINE
export function checkSaudiLaborCompliance(employee) {
  const issues = [];
  const today = new Date();
  
  if (!employee.is_saudi && !employee.is_sponsored) {
    issues.push({ severity: 'HIGH', issue: 'Non-Saudi employee not marked as sponsored' });
  }
  
  if (employee.is_sponsored && employee.iqama_expiry) {
    const daysToExpiry = daysUntilExpiry(employee.iqama_expiry, today);
    if (daysToExpiry !== null && daysToExpiry < 0) issues.push({ severity: 'CRITICAL', issue: 'Iqama expired' });
    if (daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry < 30) issues.push({ severity: 'HIGH', issue: 'Iqama expiring soon (< 30 days)' });
  }
  
  if (!employee.gosi_registered && !employee.is_saudi) {
    issues.push({ severity: 'HIGH', issue: 'GOSI not registered' });
  }
  
  return issues;
}

export function checkComplianceRegulatoryUpdates() {
  return {
    note: 'Use Gemini web search for latest Saudi labor law updates',
    commonAreas: [
      'Working hours and overtime regulations',
      'Leave entitlement changes',
      'GOSI contribution rates',
      'End of service benefit calculations',
      'Saudization requirements',
    ],
  };
}

// EMPLOYEE INSIGHTS
export function calculateDepartmentHealth(employees, attendance, _leaveRequests) {
  const departments = {};
  
  employees.forEach(emp => {
    const dept = emp.department_id || 'unassigned';
    if (!departments[dept]) {
      departments[dept] = { count: 0, absenceRate: 0, pendingLeaves: 0, names: [] };
    }
    departments[dept].count++;
    departments[dept].names.push(emp.name_en || emp.name_ar);
  });
  
  attendance.forEach(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    if (emp) {
      const dept = emp.department_id || 'unassigned';
      if (a.status === 'absent') departments[dept].absenceRate++;
    }
  });
  
  Object.keys(departments).forEach(dept => {
    departments[dept].absenceRate = Math.round((departments[dept].absenceRate / Math.max(departments[dept].count, 1)) * 100);
    departments[dept].health = departments[dept].absenceRate > 15 ? 'POOR' : departments[dept].absenceRate > 8 ? 'FAIR' : 'GOOD';
  });
  
  return departments;
}

export function assessTrainingNeeds(employees, evaluations) {
  const needs = [];
  
  evaluations.forEach(evalRecord => {
    const emp = employees.find(e => e.id === evalRecord.employee_id);
    if (emp && evalRecord.competency_gaps) {
      evalRecord.competency_gaps.forEach(gap => {
        needs.push({
          employee: emp.name_en || emp.name_ar,
          area: gap,
          priority: evalRecord.overall_score < 3 ? 'HIGH' : 'MEDIUM',
        });
      });
    }
  });
  
  return needs.slice(0, 10);
}

// DOCUMENT TEMPLATES
export const documentTemplates = {
  warning_letter: {
    name: 'Warning Letter',
    variables: ['employeeName', 'violation', 'date', 'manager'],
    template: `Dear {employeeName},

RE: FORMAL WARNING

This letter serves as a formal warning regarding your {violation} on {date}.

This conduct is in violation of our company policies and Saudi Labor Law. You are required to correct this behavior immediately.

A further violation may result in disciplinary action up to and including termination.

Yours sincerely,
{manager}
Manager`,
  },
  offer_letter: {
    name: 'Offer Letter',
    variables: ['candidateName', 'position', 'salary', 'startDate', 'benefits'],
    template: `Dear {candidateName},

We are pleased to offer you the position of {position} with our organization.

Position: {position}
Salary: {salary} SAR
Benefits: {benefits}
Start Date: {startDate}

This offer is subject to background verification and is governed by Saudi Labor Law.

Please confirm your acceptance within 5 working days.

Best regards`,
  },
  termination_letter: {
    name: 'Termination Letter',
    variables: ['employeeName', 'lastDay', 'reason', 'benefits'],
    template: `Dear {employeeName},

RE: TERMINATION OF EMPLOYMENT

This letter confirms termination of your employment effective {lastDay}.

Reason: {reason}
Final Settlement: {benefits}

Please return all company property before your last day.

Regards`,
  },
  promotion_letter: {
    name: 'Promotion Letter',
    variables: ['employeeName', 'newPosition', 'newSalary', 'effectiveDate'],
    template: `Dear {employeeName},

Congratulations! We are pleased to promote you to {newPosition}.

New Position: {newPosition}
New Salary: {newSalary} SAR
Effective Date: {effectiveDate}

Your dedication and performance have been recognized. We look forward to your continued success.

Best regards`,
  },
};