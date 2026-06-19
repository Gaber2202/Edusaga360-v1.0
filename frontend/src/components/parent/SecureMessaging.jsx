import React, { useState, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { useTenant } from '../TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Loader2, Mail, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function SecureMessaging({ student }) {
  const { isRTL } = useLanguage();
  const { tenant } = useTenant();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!student?.id) return;

    const fetchMessages = async () => {
      try {
        setLoading(true);
        const { data: msgs = [] } = await tenantQuery('messages').select('*').match({
          student_id: student.id,
          tenant_id: tenant?.id
        }).order('created_at', { ascending: false }).limit(50);
        setMessages(msgs || []);
      } catch (error) {
        console.error('Error fetching messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [student?.id, tenant?.id]);

  if (!student) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-slate-500">
          {isRTL ? 'الرجاء اختيار طالب' : 'Please select a student'}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-900" />
        </CardContent>
      </Card>
    );
  }

  const messageTypeColors = {
    general: 'bg-blue-100 text-blue-800',
    academic: 'bg-purple-100 text-purple-800',
    invoice: 'bg-green-100 text-green-800',
    attendance: 'bg-yellow-100 text-yellow-800',
    health: 'bg-red-100 text-red-800',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isRTL ? 'الرسائل الآمنة' : 'Secure Messaging'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{isRTL ? 'لا توجد رسائل' : 'No messages'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{msg.subject}</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {isRTL ? 'من: ' : 'From: '}
                      <span className="font-medium">{msg.from_user_name}</span>
                    </p>
                  </div>
                  <Badge className={messageTypeColors[msg.message_type] || messageTypeColors.general}>
                    {msg.message_type}
                  </Badge>
                </div>

                <p className="text-slate-700 text-sm mb-3">{msg.content}</p>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  {format(new Date(msg.created_at), isRTL ? 'dd/MM/yyyy HH:mm' : 'MMM dd, yyyy HH:mm')}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}