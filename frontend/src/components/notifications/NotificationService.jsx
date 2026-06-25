import { supabase, tenantQuery } from '../../api/supabaseClient';

/**
 * Notification Service - Create and deliver notifications
 */

// Role targeting mapping
const ROLE_TARGETING = {
  contract_renewal: ['creator', 'ceo', 'cfo', 'admin'],
  invoice_due_soon: ['creator', 'ceo', 'cfo', 'finance', 'accountant'],
  invoice_overdue: ['creator', 'ceo', 'cfo', 'finance', 'collections'],
  student_enrollment: ['creator', 'ceo', 'admin', 'admissions'],
  employee_onboarding: ['creator', 'hr_admin', 'hr_officer'],
  system_error_critical: ['creator', 'it_admin', 'it_support']
};

export const NotificationService = {
  /**
   * Create and deliver notification to targeted roles
   */
  async createNotification({ type, severity = 'info', title_ar, title_en, message_ar, message_en, entity_type, entity_id, link_url, module, metadata = {} }) {
    try {
      const { data: notificationData, error: notifError } = await tenantQuery('notifications').insert({
        type,
        severity,
        title_ar,
        title_en,
        message_ar,
        message_en,
        entity_type,
        entity_id,
        link_url,
        module,
        metadata,
        created_by: 'system'
      }).select().single();
      if (notifError) throw notifError;

      const targetRoles = ROLE_TARGETING[type] || [];

      const { data: allUsers = [] } = await tenantQuery('users').select('*').order('created_at', { ascending: false });

      const recipients = [];
      for (const user of allUsers) {
        if (targetRoles.includes(user.role)) {
          const prefs = await this.getUserPreferences(user.email);
          if (this.shouldReceiveNotification(prefs, module, severity)) {
            recipients.push({
              notification_id: notificationData.id,
              user_email: user.email,
              user_role: user.role,
              delivered_at: new Date().toISOString()
            });
          }
        }
      }

      if (recipients.length > 0) {
        await tenantQuery('notification_recipients').insert(recipients);
      }

      return { success: true, notification: notificationData, recipients_count: recipients.length };
    } catch (error) {
      console.error('Error creating notification:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userEmail) {
    try {
      const { data } = await tenantQuery('notification_preferences').select('*').match({ user_email: userEmail });
      if (data && data.length > 0) return data[0];
      return {
        contracts_enabled: true,
        finance_enabled: true,
        admissions_enabled: true,
        hr_enabled: true,
        system_enabled: true,
        min_severity: 'info',
        frequency: 'realtime'
      };
    } catch (_error) {
      return null;
    }
  },

  /**
   * Check if user should receive notification based on preferences
   */
  shouldReceiveNotification(prefs, module, severity) {
    if (!prefs) return true;

    // Check module preferences
    const moduleEnabled = {
      contracts: prefs.contracts_enabled,
      finance: prefs.finance_enabled,
      admissions: prefs.admissions_enabled,
      hr: prefs.hr_enabled,
      system: prefs.system_enabled
    }[module];

    if (!moduleEnabled) return false;

    // Check severity filter
    const severityLevels = { info: 1, warning: 2, critical: 3 };
    const minLevel = severityLevels[prefs.min_severity] || 1;
    const currentLevel = severityLevels[severity] || 1;

    return currentLevel >= minLevel;
  },

  /**
   * Get notifications for current user
   */
  async getUserNotifications(userEmail, unreadOnly = false) {
    try {
      const res = await tenantQuery('notification_recipients').select('*').match({
        user_email: userEmail,
        ...(unreadOnly && { is_read: false })
      });
      const recipients = Array.isArray(res?.data) ? res.data : [];

      const notifications = [];
      for (const recipient of recipients) {
        const { data: notification } = await supabase
          .from('notifications')
          .select('*')
          .eq('id', recipient.notification_id)
          .single();
        if (notification) {
          notifications.push({
            ...notification,
            recipient_id: recipient.id,
            is_read: recipient.is_read,
            read_at: recipient.read_at
          });
        }
      }

      return notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch {
      return [];
    }
  },

  /**
   * Mark notification as read
   */
  async markAsRead(recipientId) {
    try {
      const { error } = await supabase
        .from('notification_recipients')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', recipientId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userEmail) {
    try {
      const { error } = await supabase
        .from('notification_recipients')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_email', userEmail)
        .eq('is_read', false);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error marking all as read:', error);
      return { success: false, error: error.message };
    }
  }
};