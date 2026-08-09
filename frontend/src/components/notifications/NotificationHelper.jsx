import { callApi } from '../../api/supabaseClient';
import { getCurrencyCode } from '../../lib/localization';

/**
 * Helper functions to create notifications from various app events
 * Call these after actions to trigger notifications
 */

export const NotificationHelper = {
  /**
   * Notify on student enrollment
   */
  async notifyStudentEnrollment(student) {
    try {
      await callApi('/api/functions/createNotificationEvent', {
        type: 'student_enrollment',
        severity: 'info',
        title_ar: 'تسجيل طالب جديد',
        title_en: 'New Student Enrollment',
        message_ar: `تم تسجيل الطالب ${student.name_ar} في ${student.grade}`,
        message_en: `Student ${student.name_ar} enrolled in ${student.grade}`,
        entity_type: 'Student',
        entity_id: student.id,
        link_url: `?page=Students`,
        module: 'admissions',
        metadata: { grade: student.grade, student_name: student.name_ar }
      });
    } catch (e) {
      console.error('Error creating enrollment notification:', e);
    }
  },

  /**
   * Notify on critical payment
   */
  async notifyPaymentReceived(payment, invoice) {
    try {
      await callApi('/api/functions/createNotificationEvent', {
        type: 'payment_received',
        severity: 'info',
        title_ar: `دفعة جديدة - ${payment.payment_number}`,
        title_en: `Payment Received - ${payment.payment_number}`,
        message_ar: `تم استلام دفعة بمبلغ ${Number(payment.amount || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${getCurrencyCode({ currency_code: invoice?.currency_code })} للفاتورة ${invoice.invoice_number}`,
        message_en: `Payment of ${Number(payment.amount || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${getCurrencyCode({ currency_code: invoice?.currency_code })} received for invoice ${invoice.invoice_number}`,
        entity_type: 'Payment',
        entity_id: payment.id,
        link_url: `?page=Fees`,
        module: 'finance',
        metadata: { amount: payment.amount, invoice_number: invoice.invoice_number }
      });
    } catch (e) {
      console.error('Error creating payment notification:', e);
    }
  },

  /**
   * Notify on contract sent
   */
  async notifyContractSent(contract) {
    try {
      await callApi('/api/functions/createNotificationEvent', {
        type: 'contract_renewal',
        severity: 'info',
        title_ar: `تم إرسال عقد - ${contract.contract_number}`,
        title_en: `Contract Sent - ${contract.contract_number}`,
        message_ar: `تم إرسال عقد ${contract.student_name} بنجاح`,
        message_en: `Contract for ${contract.student_name} sent successfully`,
        entity_type: 'StudentContract',
        entity_id: contract.id,
        link_url: `?page=Contracts`,
        module: 'contracts',
        metadata: { contract_number: contract.contract_number }
      });
    } catch (e) {
      console.error('Error creating contract notification:', e);
    }
  }
};