import React from 'react';
import { Button } from '../ui/button';
import { MessageSquare } from 'lucide-react';
import { sendWhatsAppMessage } from './WhatsAppService';
import { useLanguage } from '../LanguageContext';
import { useRole } from '../RoleContext';
import { toast } from 'sonner';

export default function WhatsAppButton({
  recipientType,
  recipientId,
  recipientName,
  phoneNumber,
  messageType,
  variables = {},
  variant = 'outline',
  size = 'default',
  className = ''
}) {
  const { language, isRTL } = useLanguage();
  const { user } = useRole();
  const [sending, setSending] = React.useState(false);

  const handleSend = async () => {
    if (!phoneNumber) {
      toast.error(isRTL ? 'رقم الهاتف غير متوفر' : 'Phone number not available');
      return;
    }

    setSending(true);
    try {
      const result = await sendWhatsAppMessage({
        recipientType,
        recipientId,
        recipientName,
        phoneNumber,
        messageType,
        variables,
        language,
        user
      });

      if (result.success) {
        toast.success(isRTL ? 'تم فتح واتساب' : 'WhatsApp opened');
      } else {
        toast.error(isRTL ? 'فشل الإرسال' : 'Failed to send');
      }
    } catch (_error) {
      toast.error(isRTL ? 'حدث خطأ' : 'An error occurred');
    } finally {
      setSending(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleSend}
      disabled={sending}
      className={`gap-2 ${className}`}
    >
      <MessageSquare className="w-4 h-4" />
      {isRTL ? 'واتساب' : 'WhatsApp'}
    </Button>
  );
}