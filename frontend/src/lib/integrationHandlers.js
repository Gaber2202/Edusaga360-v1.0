/**
 * EduSaga 360 — Integration Handlers
 * 
 * All cross-module event subscribers are defined here.
 * Import this file once (in main.jsx or App.jsx) to activate the bus.
 * 
 * Rule: Each handler is a pure async function that receives (payload, meta)
 *       and calls the relevant entity API or sends a notification.
 *       Handlers MUST be idempotent — safe to retry on failure.
 */

import { tenantQuery } from '../api/supabaseClient';
import { createJournalEntry } from '../api/journalEntry';
import { registerHandler, namedHandler } from './integrationBus';

// ─── ADMISSIONS EVENTS ────────────────────────────────────────────────────────

/**
 * enrollment_confirmed → SIS: auto-create full student profile
 */
registerHandler('enrollment_confirmed', namedHandler('SIS', async (payload) => {
  const existing = await tenantQuery('students').select('*').match({ national_id: payload.national_id });
  if (existing.length > 0) return; // idempotent — don't duplicate

  await tenantQuery('students').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    student_id: `STU-${Date.now().toString(36).toUpperCase()}`,
    name_ar: payload.student_name_ar,
    name_en: payload.student_name_en,
    date_of_birth: payload.date_of_birth,
    gender: payload.gender,
    nationality: payload.nationality,
    national_id: payload.national_id,
    grade: payload.grade,
    enrollment_type: 'new',
    status: 'active',
    enrollment_date: new Date().toISOString().split('T')[0],
    academic_year: payload.academic_year,
  });
}));

/**
 * enrollment_confirmed → Fees: auto-assign fee structure & first invoice
 */
registerHandler('enrollment_confirmed', namedHandler('Fees', async (payload) => {
  // Find applicable fee structure
  const feeStructures = await tenantQuery('fee_structures').select('*').match({
    branch_id: payload.branch_id,
    grade: payload.grade,
    is_active: true,
  });
  if (feeStructures.length === 0) return;

  const fs = feeStructures[0];
  // Create registration fee invoice
  await tenantQuery('invoices').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    student_id: payload.student_id,
    student_name: payload.student_name_ar,
    invoice_number: `INV-REG-${Date.now().toString(36).toUpperCase()}`,
    invoice_type: 'registration',
    academic_year: payload.academic_year,
    due_date: new Date().toISOString().split('T')[0],
    items: [{ description: 'Registration Fee', amount: fs.registration_fee || 0 }],
    total_amount: fs.registration_fee || 0,
    tax_amount: (fs.registration_fee || 0) * 0.15,
    status: 'pending',
    source_event: 'enrollment_confirmed',
  });
}));

/**
 * enrollment_confirmed → Communications: send welcome notification
 */
registerHandler('enrollment_confirmed', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone && !payload.guardian_email) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name_ar,
    recipient_phone: payload.guardian_phone,
    recipient_email: payload.guardian_email,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'تأكيد التسجيل / Enrollment Confirmation',
    body: `مرحباً ${payload.guardian_name_ar}، يسعدنا تأكيد تسجيل ${payload.student_name_ar} في الصف ${payload.grade}.\nDear ${payload.guardian_name_ar}, we are pleased to confirm enrollment of ${payload.student_name_ar} in Grade ${payload.grade}.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Admissions',
    event_type: 'enrollment_confirmed',
  });
}));

/**
 * enrollment_confirmed → Contracts: auto-populate and send for signing
 */
registerHandler('enrollment_confirmed', namedHandler('Contracts', async (payload) => {
  const templates = await tenantQuery('contract_templates').select('*').match({
    template_type: 'enrollment',
    is_active: true,
  });
  if (templates.length === 0) return;

  await tenantQuery('student_contracts').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    student_id: payload.student_id,
    student_name: payload.student_name_ar,
    guardian_name: payload.guardian_name_ar,
    guardian_email: payload.guardian_email,
    template_id: templates[0].id,
    academic_year: payload.academic_year,
    grade: payload.grade,
    status: 'pending_signature',
    created_from_event: 'enrollment_confirmed',
    created_date: new Date().toISOString(),
  });
}));

/**
 * enrollment_confirmed → CRM: update lead pipeline
 */
registerHandler('enrollment_confirmed', namedHandler('CRM', async (payload) => {
  if (!payload.application_id) return;

  await tenantQuery('applications').update({
    status: 'enrolled',
    pipeline_stage: 'decision_made',
  });
}));

// ─── APPLICATION STAGE CHANGE ─────────────────────────────────────────────────

/**
 * application_stage_change → Communications: send appropriate notification
 */
registerHandler('application_stage_change', namedHandler('Communications', async (payload) => {
  const messages = {
    submitted: `تم استلام طلبكم / We received your application for ${payload.student_name_ar}.`,
    under_review: `طلبكم قيد المراجعة / Your application is under review.`,
    accepted: `يسعدنا قبول ${payload.student_name_ar} / We are pleased to accept ${payload.student_name_ar}.`,
    rejected: `نأسف لإخطاركم / We regret to inform you that the application was not successful this time.`,
  };

  const msg = messages[payload.new_status];
  if (!msg) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_email: payload.guardian_email,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: `Application Update — ${payload.student_name_ar}`,
    body: msg,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Admissions',
    event_type: 'application_stage_change',
  });
}));

// ─── FEES & BILLING EVENTS ────────────────────────────────────────────────────

/**
 * invoice_issued → Communications: notify guardian
 */
registerHandler('invoice_issued', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone && !payload.guardian_email) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_email: payload.guardian_email,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: `فاتورة جديدة / New Invoice #${payload.invoice_number}`,
    body: `فاتورتكم جاهزة بمبلغ ${payload.total_amount} ر.س.\nYour invoice #${payload.invoice_number} for SAR ${payload.total_amount} is ready.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Fees',
    event_type: 'invoice_issued',
  });
}));

/**
 * payment_received → Finance/GL: post journal entry
 */
registerHandler('payment_received', namedHandler('Finance', async (payload) => {
  const drAccount = payload.payment_method === 'cash' ? '1010' : '1020';
  await createJournalEntry({
    branch_id: payload.branch_id,
    journal_number: `JE-PAY-${Date.now().toString(36).toUpperCase()}`,
    journal_type: 'receipts',
    date: new Date().toISOString().split('T')[0],
    description: `Payment received — ${payload.student_name} — ${payload.invoice_number}`,
    source_document_type: 'Payment',
    requested_status: 'posted',
    lines: [
      { account_code: drAccount, debit: payload.amount, credit: 0, description: 'Payment received' },
      { account_code: '1030', debit: 0, credit: payload.amount, description: 'AR — Tuition Fees cleared' },
    ],
  });
}));

/**
 * payment_received → Communications: instant receipt confirmation
 */
registerHandler('payment_received', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'تأكيد الدفع / Payment Confirmation',
    body: `تم استلام دفعتكم ${payload.amount} ر.س بنجاح. Payment of SAR ${payload.amount} received successfully. Thank you.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Fees',
    event_type: 'payment_received',
  });
}));

/**
 * invoice_overdue → Communications: escalating reminders
 */
registerHandler('invoice_overdue', namedHandler('Communications', async (payload) => {
  const dayMessages = {
    1: `تذكير: فاتورتكم متأخرة. Friendly reminder: your invoice is overdue.`,
    7: `إشعار: يرجى سداد المبلغ المستحق. Notice: please settle outstanding balance.`,
    14: `إشعار رسمي: قد تطبق قيود في حال عدم السداد. Formal notice: restrictions may apply.`,
  };

  const msg = dayMessages[payload.overdue_days] || dayMessages[1];
  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'فاتورة متأخرة / Overdue Invoice',
    body: msg,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Fees',
    event_type: 'invoice_overdue',
  });
}));

// ─── CLINIC EVENTS ────────────────────────────────────────────────────────────

/**
 * clinic_visit_completed → Communications: WhatsApp to parent within 5 min
 */
registerHandler('clinic_visit_completed', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'زيارة العيادة / Clinic Visit',
    body: `زار ${payload.student_name} العيادة الساعة ${payload.visit_time} بسبب ${payload.complaint}. العلاج: ${payload.treatment}. النتيجة: ${payload.outcome}.\n\nYour child ${payload.student_name} visited the clinic at ${payload.visit_time} for ${payload.complaint}. Treatment: ${payload.treatment}. Outcome: ${payload.outcome}. Please contact us if needed.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Clinic',
    event_type: 'clinic_visit_completed',
  });
}));

/**
 * clinic_visit_completed → Attendance: auto-absent remaining periods if sent home
 */
registerHandler('clinic_visit_completed', namedHandler('Attendance', async (payload) => {
  if (payload.outcome !== 'sent_home') return;

  const today = new Date().toISOString().split('T')[0];
  const existing = await tenantQuery('student_attendances').select('*').match({
    student_id: payload.student_id,
    date: today,
  });

  if (existing.length > 0) {
    await tenantQuery('student_attendances').update({
      status: 'absent',
      notes: `Sent home from clinic at ${payload.visit_time}`,
    });
  }
}));

// ─── ATTENDANCE EVENTS ────────────────────────────────────────────────────────

/**
 * student_absent → Communications: WhatsApp to parent within 15 min
 */
registerHandler('student_absent', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'غياب الطالب / Student Absent',
    body: `${payload.student_name} غائب/ة اليوم ${payload.date}.\n${payload.student_name} is absent today ${payload.date}. Please call the school if this is unexpected.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Attendance',
    event_type: 'student_absent',
  });
}));

/**
 * monthly_timesheet_locked → HR/Payroll: unblock payroll run
 */
registerHandler('monthly_timesheet_locked', namedHandler('Payroll', async (payload) => {
  // Create a PayrollInput seed record for the period if not exists
  const existing = await tenantQuery('pay_runs').select('*').match({
    period: payload.period,
    branch_id: payload.branch_id,
    status: 'draft',
  });

  if (existing.length === 0) {
    await tenantQuery('pay_runs').insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      period: payload.period,
      status: 'attendance_confirmed',
      attendance_locked: true,
      attendance_locked_date: new Date().toISOString(),
      notes: `Attendance locked by ${payload.locked_by}`,
    });
  } else {
    await tenantQuery('pay_runs').update({
      attendance_locked: true,
      status: 'attendance_confirmed',
    });
  }
}));

// ─── LIBRARY EVENTS ───────────────────────────────────────────────────────────

/**
 * library_fine_incurred → Fees: post charge to student account
 */
registerHandler('library_fine_incurred', namedHandler('Fees', async (payload) => {
  await tenantQuery('invoices').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    student_id: payload.student_id,
    student_name: payload.student_name,
    invoice_number: `INV-LIB-${Date.now().toString(36).toUpperCase()}`,
    invoice_type: 'library_fine',
    items: [{ description: `Library Fine — ${payload.book_title}`, amount: payload.amount }],
    total_amount: payload.amount,
    tax_amount: 0,
    due_date: new Date().toISOString().split('T')[0],
    status: 'pending',
    source_event: 'library_fine_incurred',
  });
}));

/**
 * library_fine_incurred → Finance/GL: fine revenue journal
 */
registerHandler('library_fine_incurred', namedHandler('Finance', async (payload) => {
  if (payload.collected_cash) {
    // Library is not a SYSTEM_SOURCE_TYPE in createJournalEntry, so this lands
    // as 'draft' and must be approved by an accountant before posting to GL.
    await createJournalEntry({
      branch_id: payload.branch_id,
      journal_number: `JE-LIB-${Date.now().toString(36).toUpperCase()}`,
      journal_type: 'general',
      date: new Date().toISOString().split('T')[0],
      description: `Library fine — ${payload.student_name}`,
      lines: [
        { account_code: '1010', debit: payload.amount, credit: 0, description: 'Cash received' },
        { account_code: '4070', debit: 0, credit: payload.amount, description: 'Library Fine Revenue' },
      ],
    });
  }
}));

/**
 * book_due_reminder → Communications
 */
registerHandler('book_due_reminder', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'تذكير: إعادة كتاب / Book Due Reminder',
    body: `كتاب "${payload.book_title}" مستعار بواسطة ${payload.student_name} يستحق الإعادة في ${payload.due_date}.\nBook "${payload.book_title}" borrowed by ${payload.student_name} is due on ${payload.due_date}.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Library',
    event_type: 'book_due_reminder',
  });
}));

// ─── CANTEEN EVENTS ───────────────────────────────────────────────────────────

/**
 * canteen_transaction_completed → Finance/GL: (batched at day close via scheduled job)
 * canteen_low_balance → Communications
 */
registerHandler('canteen_low_balance', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'رصيد منخفض — الكانتين / Low Canteen Balance',
    body: `رصيد ${payload.student_name} في الكانتين ${payload.balance} ر.س. يرجى الشحن.\n${payload.student_name}'s canteen balance is SAR ${payload.balance}. Please top up.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Canteen',
    event_type: 'canteen_low_balance',
  });
}));

// ─── TRANSPORT EVENTS ─────────────────────────────────────────────────────────

/**
 * student_boarded → Communications: WhatsApp to parent
 */
registerHandler('student_boarded', namedHandler('Communications', async (payload) => {
  if (!payload.guardian_phone) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    branch_id: payload.branch_id,
    recipient_name: payload.guardian_name,
    recipient_phone: payload.guardian_phone,
    recipient_type: 'guardian',
    channel: 'whatsapp',
    subject: 'ركب الطالب الحافلة / Student Boarded',
    body: `${payload.student_name} ركب الحافلة رقم ${payload.bus_number}.\n${payload.student_name} has boarded bus ${payload.bus_number}.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Transport',
    event_type: 'student_boarded',
  });
}));

/**
 * bus_delayed → Attendance: mark late arrivals as bus-excused
 */
registerHandler('bus_delayed', namedHandler('Attendance', async (payload) => {
  if (!payload.affected_student_ids?.length) return;

  const today = new Date().toISOString().split('T')[0];
  for (const studentId of payload.affected_student_ids) {
    const records = await tenantQuery('student_attendances').select('*').match({
      student_id: studentId,
      date: today,
      status: 'late',
    });
    for (const rec of records) {
      await tenantQuery('student_attendances').update({
        notes: `Bus delay — route ${payload.route_name} — excused`,
        is_bus_excused: true,
      });
    }
  }
}));

/**
 * transport_subscription_change → Fees: add/remove transport fee
 */
registerHandler('transport_subscription_change', namedHandler('Fees', async (payload) => {
  if (payload.action === 'activate') {
    await tenantQuery('invoices').insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      student_id: payload.student_id,
      student_name: payload.student_name,
      invoice_number: `INV-TRS-${Date.now().toString(36).toUpperCase()}`,
      invoice_type: 'transport',
      items: [{ description: `Transport Fee — ${payload.route_name}`, amount: payload.monthly_fee }],
      total_amount: payload.monthly_fee,
      tax_amount: payload.monthly_fee * 0.15,
      due_date: new Date().toISOString().split('T')[0],
      status: 'pending',
      source_event: 'transport_subscription_change',
    });
  }
}));

// ─── HR & PAYROLL EVENTS ──────────────────────────────────────────────────────

/**
 * payroll_approved → Finance/GL: auto-post payroll journals
 */
registerHandler('payroll_approved', namedHandler('Finance', async (payload) => {
  await createJournalEntry({
    branch_id: payload.branch_id,
    journal_number: `JE-PAY-${payload.period}-${Date.now().toString(36).toUpperCase()}`,
    journal_type: 'payments',
    date: new Date().toISOString().split('T')[0],
    description: `Payroll journal — ${payload.period}`,
    source_document_type: 'PayRun',
    requested_status: 'posted',
    lines: [
      { account_code: '5010', debit: payload.gross_salaries, credit: 0, description: 'Salary Expense' },
      { account_code: '5020', debit: payload.gosi_employer, credit: 0, description: 'GOSI Employer Expense' },
      { account_code: '5030', debit: payload.eosb_accrual, credit: 0, description: 'EOSB Expense' },
      { account_code: '2010', debit: 0, credit: payload.net_payable, description: 'Payroll Payable' },
      { account_code: '2020', debit: 0, credit: payload.gosi_total, description: 'GOSI Payable' },
      { account_code: '2030', debit: 0, credit: payload.eosb_accrual, description: 'EOSB Provision' },
    ],
  });
}));

/**
 * payroll_approved → Communications: notify employees payslip ready
 */
registerHandler('payroll_approved', namedHandler('Communications', async (payload) => {
  if (!payload.employee_emails?.length) return;

  for (const emp of payload.employee_emails) {
    await tenantQuery('communications').insert({
      tenant_id: payload.tenant_id,
      branch_id: payload.branch_id,
      recipient_name: emp.name,
      recipient_email: emp.email,
      recipient_phone: emp.phone,
      recipient_type: 'employee',
      channel: 'email',
      subject: `كشف راتب ${payload.period} / Payslip ${payload.period}`,
      body: `كشف راتبك لشهر ${payload.period} متاح الآن.\nYour payslip for ${payload.period} is now available in the ESS portal.`,
      status: 'sent',
      sent_date: new Date().toISOString(),
      source_module: 'Payroll',
      event_type: 'payroll_approved',
    });
  }
}));

/**
 * leave_approved → Communications: notify employee
 */
registerHandler('leave_approved', namedHandler('Communications', async (payload) => {
  if (!payload.employee_phone && !payload.employee_email) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    recipient_name: payload.employee_name,
    recipient_phone: payload.employee_phone,
    recipient_email: payload.employee_email,
    recipient_type: 'employee',
    channel: 'whatsapp',
    subject: 'تمت الموافقة على إجازتك / Leave Approved',
    body: `تمت الموافقة على إجازتك من ${payload.start_date} إلى ${payload.end_date}.\nYour leave from ${payload.start_date} to ${payload.end_date} has been approved.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'HR',
    event_type: 'leave_approved',
  });
}));

/**
 * leave_rejected → Communications: notify employee
 */
registerHandler('leave_rejected', namedHandler('Communications', async (payload) => {
  if (!payload.employee_phone) return;

  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    recipient_name: payload.employee_name,
    recipient_phone: payload.employee_phone,
    recipient_type: 'employee',
    channel: 'whatsapp',
    subject: 'رفض طلب الإجازة / Leave Rejected',
    body: `نأسف، تم رفض طلب إجازتك. السبب: ${payload.reason || 'لم يُذكر'}.\nWe regret that your leave request was rejected. Reason: ${payload.reason || 'not specified'}.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'HR',
    event_type: 'leave_rejected',
  });
}));

/**
 * document_expiring → Communications: 90/60/30 day alerts
 */
registerHandler('document_expiring', namedHandler('Communications', async (payload) => {
  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    recipient_name: payload.employee_name,
    recipient_phone: payload.employee_phone,
    recipient_email: payload.employee_email,
    recipient_type: 'employee',
    channel: 'email',
    subject: `تنبيه: وثيقة تنتهي خلال ${payload.days_remaining} يوم / Document Expiring`,
    body: `وثيقة ${payload.document_type} للموظف ${payload.employee_name} تنتهي بتاريخ ${payload.expiry_date}.\nDocument ${payload.document_type} for ${payload.employee_name} expires on ${payload.expiry_date}. Please renew.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'HR',
    event_type: 'document_expiring',
  });
}));

// ─── EXPENSE EVENTS ───────────────────────────────────────────────────────────

/**
 * expense_approved → Finance/GL
 */
registerHandler('expense_approved', namedHandler('Finance', async (payload) => {
  // Expense is not a SYSTEM_SOURCE_TYPE in createJournalEntry, so this lands
  // as 'draft' and must be approved by an accountant before posting to GL.
  await createJournalEntry({
    branch_id: payload.branch_id,
    journal_number: `JE-EXP-${Date.now().toString(36).toUpperCase()}`,
    journal_type: 'general',
    date: new Date().toISOString().split('T')[0],
    description: `Expense — ${payload.employee_name} — ${payload.category}`,
    lines: [
      { account_code: payload.expense_account || '6010', debit: payload.amount, credit: 0, description: payload.description },
      { account_code: '2050', debit: 0, credit: payload.amount, description: 'Employee Payables' },
    ],
  });
}));

/**
 * expense_approved/rejected → Communications
 */
registerHandler('expense_approved', namedHandler('Communications', async (payload) => {
  if (!payload.employee_email) return;
  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    recipient_name: payload.employee_name,
    recipient_email: payload.employee_email,
    recipient_type: 'employee',
    channel: 'email',
    subject: 'تمت الموافقة على المصروف / Expense Approved',
    body: `تمت الموافقة على مطالبتك بمبلغ ${payload.amount} ر.س.\nYour expense claim of SAR ${payload.amount} has been approved and is being processed.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Expenses',
    event_type: 'expense_approved',
  });
}));

registerHandler('expense_rejected', namedHandler('Communications', async (payload) => {
  if (!payload.employee_email) return;
  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    recipient_name: payload.employee_name,
    recipient_email: payload.employee_email,
    recipient_type: 'employee',
    channel: 'email',
    subject: 'رفض المصروف / Expense Rejected',
    body: `تم رفض مطالبتك. السبب: ${payload.reason}.\nYour expense claim was rejected. Reason: ${payload.reason}.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'Expenses',
    event_type: 'expense_rejected',
  });
}));

// ─── ASSET EVENTS ─────────────────────────────────────────────────────────────

/**
 * asset_acquired → Finance/GL: capitalization journal
 */
registerHandler('asset_acquired', namedHandler('Finance', async (payload) => {
  // Asset is not a SYSTEM_SOURCE_TYPE in createJournalEntry, so this lands
  // as 'draft' and must be approved by an accountant before posting to GL.
  await createJournalEntry({
    branch_id: payload.branch_id,
    journal_number: `JE-AST-${Date.now().toString(36).toUpperCase()}`,
    journal_type: 'general',
    date: new Date().toISOString().split('T')[0],
    description: `Asset capitalization — ${payload.asset_name}`,
    lines: [
      { account_code: payload.asset_account || '1510', debit: payload.cost, credit: 0, description: `Asset: ${payload.asset_name}` },
      { account_code: '2060', debit: 0, credit: payload.cost, description: 'AP / Supplier' },
    ],
  });
}));

/**
 * depreciation_run → Finance/GL: monthly depreciation batch
 */
registerHandler('depreciation_run', namedHandler('Finance', async (payload) => {
  await createJournalEntry({
    branch_id: payload.branch_id,
    journal_number: `JE-DEP-${payload.period}-${Date.now().toString(36).toUpperCase()}`,
    journal_type: 'depreciation',
    date: new Date().toISOString().split('T')[0],
    description: `Monthly depreciation — ${payload.period}`,
    source_document_type: 'DepreciationEntry',
    requested_status: 'posted',
    lines: [
      { account_code: '5090', debit: payload.total_depreciation, credit: 0, description: 'Depreciation Expense' },
      { account_code: '1590', debit: 0, credit: payload.total_depreciation, description: 'Accumulated Depreciation' },
    ],
  });
}));

// ─── CPD EVENTS ───────────────────────────────────────────────────────────────

/**
 * training_completed → Communications: certificate link
 */
registerHandler('training_completed', namedHandler('Communications', async (payload) => {
  if (!payload.employee_email) return;
  await tenantQuery('communications').insert({
    tenant_id: payload.tenant_id,
    recipient_name: payload.employee_name,
    recipient_email: payload.employee_email,
    recipient_type: 'employee',
    channel: 'email',
    subject: `شهادة إتمام التدريب / Training Certificate — ${payload.course_name}`,
    body: `أتممت بنجاح دورة ${payload.course_name}. شهادتك متاحة للتحميل.\nYou have successfully completed ${payload.course_name}. Your certificate is available for download.`,
    status: 'sent',
    sent_date: new Date().toISOString(),
    source_module: 'CPD',
    event_type: 'training_completed',
  });
}));

// ─── PROCUREMENT EVENTS ───────────────────────────────────────────────────────

/**
 * books_received → Library: auto-add to catalog trigger (logged only — actual add is in Library module)
 */
registerHandler('books_received', namedHandler('Library', async (payload) => {
  // Signal that books need to be cataloged — Library module polls for this
  for (const book of (payload.books || [])) {
    const existing = await tenantQuery('library_books').select('*').match({ isbn: book.isbn });
    if (existing.length > 0) {
      await tenantQuery('library_books').update({
        total_copies: (existing[0].total_copies || 1) + (book.quantity || 1),
        available_copies: (existing[0].available_copies || 1) + (book.quantity || 1),
      });
    } else {
      await tenantQuery('library_books').insert({
        tenant_id: payload.tenant_id,
        branch_id: payload.branch_id,
        isbn: book.isbn,
        title_ar: book.title_ar || book.title,
        title_en: book.title_en || book.title,
        author: book.author,
        total_copies: book.quantity || 1,
        available_copies: book.quantity || 1,
        language: book.language || 'arabic',
        loan_type: 'regular',
        is_active: true,
      });
    }
  }
}));

console.info('[IntegrationBus] All handlers registered ✓');