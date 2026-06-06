import { tenantQuery, callApi } from '../../api/supabaseClient';
import { logAuditEvent, AuditActions } from '../AuditService';

/**
 * WhatsApp Communication Service
 * Handles role-based WhatsApp messaging for Parents, Employees, and Management
 */

export const WhatsAppMessageTypes = {
  // Parent Messages
  INVOICE_NOTIFICATION: 'invoice_notification',
  PAYMENT_REMINDER: 'payment_reminder',
  ATTENDANCE_NOTIFICATION: 'attendance_notification',
  GENERAL_ANNOUNCEMENT: 'general_announcement',
  
  // Employee Messages
  PAYSLIP_NOTIFICATION: 'payslip_notification',
  PAYROLL_NOTIFICATION: 'payroll_notification',
  HR_ANNOUNCEMENT: 'hr_announcement',
  DOCUMENT_REMINDER: 'document_reminder',
  
  // Management Messages
  ALERT_NOTIFICATION: 'alert_notification',
  SUMMARY_REPORT: 'summary_report',
  CRITICAL_NOTIFICATION: 'critical_notification'
};

export const getRoleFromMessageType = (messageType) => {
  const parentTypes = [
    WhatsAppMessageTypes.INVOICE_NOTIFICATION,
    WhatsAppMessageTypes.PAYMENT_REMINDER,
    WhatsAppMessageTypes.ATTENDANCE_NOTIFICATION,
    WhatsAppMessageTypes.GENERAL_ANNOUNCEMENT
  ];
  
  const employeeTypes = [
    WhatsAppMessageTypes.PAYSLIP_NOTIFICATION,
    WhatsAppMessageTypes.PAYROLL_NOTIFICATION,
    WhatsAppMessageTypes.HR_ANNOUNCEMENT,
    WhatsAppMessageTypes.DOCUMENT_REMINDER
  ];
  
  const managementTypes = [
    WhatsAppMessageTypes.ALERT_NOTIFICATION,
    WhatsAppMessageTypes.SUMMARY_REPORT,
    WhatsAppMessageTypes.CRITICAL_NOTIFICATION
  ];
  
  if (parentTypes.includes(messageType)) return 'parent';
  if (employeeTypes.includes(messageType)) return 'employee';
  if (managementTypes.includes(messageType)) return 'management';
  return 'all';
};

export const getWhatsAppTemplate = (messageType, language = 'ar') => {
  const templates = {
    // Parent Templates
    invoice_notification: {
      ar: {
        subject: '🧾 فاتورة جديدة',
        body: 'عزيزي ولي الأمر،\n\nتم إصدار فاتورة جديدة للطالب {{student_name}}\n\nرقم الفاتورة: {{invoice_number}}\nالمبلغ: {{amount}} ريال\nتاريخ الاستحقاق: {{due_date}}\n\nيمكنك الدفع عبر الرابط:\n{{payment_link}}\n\nشكراً لكم،\nEduSaga 360'
      },
      en: {
        subject: '🧾 New Invoice',
        body: 'Dear Parent,\n\nA new invoice has been issued for {{student_name}}\n\nInvoice #: {{invoice_number}}\nAmount: {{amount}} SAR\nDue Date: {{due_date}}\n\nPay online:\n{{payment_link}}\n\nThank you,\nEduSaga 360'
      }
    },
    payment_reminder: {
      ar: {
        subject: '⏰ تذكير بالدفع',
        body: 'عزيزي ولي الأمر،\n\nنذكركم بوجود فاتورة مستحقة للطالب {{student_name}}\n\nرقم الفاتورة: {{invoice_number}}\nالمبلغ المتبقي: {{balance}} ريال\nتاريخ الاستحقاق: {{due_date}}\n\nالرجاء السداد في أقرب وقت ممكن.\n\nشكراً لكم،\nEduSaga 360'
      },
      en: {
        subject: '⏰ Payment Reminder',
        body: 'Dear Parent,\n\nThis is a reminder about an overdue invoice for {{student_name}}\n\nInvoice #: {{invoice_number}}\nBalance: {{balance}} SAR\nDue Date: {{due_date}}\n\nPlease settle at your earliest convenience.\n\nThank you,\nEduSaga 360'
      }
    },
    attendance_notification: {
      ar: {
        subject: '📋 إشعار حضور',
        body: 'عزيزي ولي الأمر،\n\n{{student_name}} - {{status}}\nالتاريخ: {{date}}\nالحصة: {{period}}\n\nللاستفسار يرجى التواصل مع المدرسة.\n\nEduSaga 360'
      },
      en: {
        subject: '📋 Attendance Notification',
        body: 'Dear Parent,\n\n{{student_name}} - {{status}}\nDate: {{date}}\nPeriod: {{period}}\n\nPlease contact the school for inquiries.\n\nEduSaga 360'
      }
    },
    general_announcement: {
      ar: {
        subject: '📢 إعلان عام',
        body: 'عزيزي ولي الأمر،\n\n{{message}}\n\nشكراً لكم،\nEduSaga 360'
      },
      en: {
        subject: '📢 General Announcement',
        body: 'Dear Parent,\n\n{{message}}\n\nThank you,\nEduSaga 360'
      }
    },
    
    // Employee Templates
    payslip_notification: {
      ar: {
        subject: '💰 كشف راتب',
        body: 'عزيزي/عزيزتي {{employee_name}},\n\nكشف الراتب لشهر {{month}} جاهز للعرض.\n\nالراتب الإجمالي: {{gross_salary}} ريال\nالراتب الصافي: {{net_salary}} ريال\n\nيمكنك الاطلاع على التفاصيل من خلال بوابة الموظفين.\n\nالموارد البشرية\nEduSaga 360'
      },
      en: {
        subject: '💰 Payslip Available',
        body: 'Dear {{employee_name}},\n\nYour payslip for {{month}} is now available.\n\nGross Salary: {{gross_salary}} SAR\nNet Salary: {{net_salary}} SAR\n\nView details in the employee portal.\n\nHR Department\nEduSaga 360'
      }
    },
    payroll_notification: {
      ar: {
        subject: '📊 إشعار الرواتب',
        body: 'عزيزي/عزيزتي {{employee_name}},\n\n{{message}}\n\nللاستفسار يرجى التواصل مع قسم الموارد البشرية.\n\nEduSaga 360'
      },
      en: {
        subject: '📊 Payroll Notification',
        body: 'Dear {{employee_name}},\n\n{{message}}\n\nFor inquiries, please contact HR.\n\nEduSaga 360'
      }
    },
    hr_announcement: {
      ar: {
        subject: '📢 إعلان الموارد البشرية',
        body: 'عزيزي/عزيزتي {{employee_name}},\n\n{{message}}\n\nقسم الموارد البشرية\nEduSaga 360'
      },
      en: {
        subject: '📢 HR Announcement',
        body: 'Dear {{employee_name}},\n\n{{message}}\n\nHR Department\nEduSaga 360'
      }
    },
    document_reminder: {
      ar: {
        subject: '📄 تذكير بالمستندات',
        body: 'عزيزي/عزيزتي {{employee_name}},\n\nنذكركم بضرورة تقديم المستندات التالية:\n\n{{documents}}\n\nآخر موعد: {{deadline}}\n\nالرجاء التواصل مع قسم الموارد البشرية.\n\nEduSaga 360'
      },
      en: {
        subject: '📄 Document Reminder',
        body: 'Dear {{employee_name}},\n\nPlease submit the following documents:\n\n{{documents}}\n\nDeadline: {{deadline}}\n\nContact HR for assistance.\n\nEduSaga 360'
      }
    },
    
    // Management Templates
    alert_notification: {
      ar: {
        subject: '🚨 تنبيه',
        body: 'عزيزي/عزيزتي {{recipient_name}},\n\n{{alert_message}}\n\nالأولوية: {{priority}}\nالتاريخ: {{date}}\n\nيرجى اتخاذ الإجراء المناسب.\n\nEduSaga 360'
      },
      en: {
        subject: '🚨 Alert',
        body: 'Dear {{recipient_name}},\n\n{{alert_message}}\n\nPriority: {{priority}}\nDate: {{date}}\n\nPlease take appropriate action.\n\nEduSaga 360'
      }
    },
    summary_report: {
      ar: {
        subject: '📈 تقرير ملخص',
        body: 'عزيزي/عزيزتي {{recipient_name}},\n\n{{summary}}\n\nللمزيد من التفاصيل، يرجى الدخول إلى النظام.\n\nEduSaga 360'
      },
      en: {
        subject: '📈 Summary Report',
        body: 'Dear {{recipient_name}},\n\n{{summary}}\n\nFor more details, please login to the system.\n\nEduSaga 360'
      }
    },
    critical_notification: {
      ar: {
        subject: '⚠️ إشعار عاجل',
        body: 'عزيزي/عزيزتي {{recipient_name}},\n\n{{message}}\n\nيتطلب اهتمام فوري!\n\nEduSaga 360'
      },
      en: {
        subject: '⚠️ Critical Notification',
        body: 'Dear {{recipient_name}},\n\n{{message}}\n\nRequires immediate attention!\n\nEduSaga 360'
      }
    }
  };
  
  return templates[messageType]?.[language] || templates[messageType]?.['ar'];
};

export const replaceTemplateVariables = (template, variables) => {
  let result = template;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, variables[key] || '');
  });
  return result;
};

export const sendWhatsAppMessage = async ({
  recipientType,
  recipientId,
  recipientName,
  phoneNumber,
  messageType,
  variables = {},
  language = 'ar',
  user
}) => {
  try {
    // Map legacy messageType keys to backend template keys
    const templateKeyMap = {
      invoice_notification: 'fee_due',
      payment_reminder: 'fee_overdue',
      attendance_notification: 'student_absent',
      payslip_notification: 'payslip_ready',
      leave_approved: 'leave_approved',
      leave_rejected: 'leave_rejected',
      general_announcement: 'announcement',
      contract_signed: 'contract_signed',
    };
    const template_key = templateKeyMap[messageType] ?? messageType;

    // Call the real Infobip backend
    const result = await callApi('/api/notifications/whatsapp', {
      to: phoneNumber,
      template_key,
      variables,
      language,
      reference_id: recipientId,
    });

    return { success: true, message_id: result.message_id };
  } catch (error) {
    console.error('WhatsApp send error:', error);
    return { success: false, error: error.message };
  }
};

export const sendBulkWhatsApp = async ({
  recipients,
  messageType,
  variables,
  language = 'ar',
  user
}) => {
  const results = {
    total: recipients.length,
    sent: 0,
    failed: 0,
    errors: []
  };
  
  for (const recipient of recipients) {
    const result = await sendWhatsAppMessage({
      recipientType: recipient.type,
      recipientId: recipient.id,
      recipientName: recipient.name,
      phoneNumber: recipient.phone,
      messageType,
      variables: { ...variables, ...recipient.variables },
      language,
      user
    });
    
    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      results.errors.push({
        recipient: recipient.name,
        error: result.error
      });
    }
    
    // Small delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
};