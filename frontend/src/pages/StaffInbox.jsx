import React, { useState, useEffect } from 'react';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import PageHeader from '../components/ui/PageHeader';
import { Send, Mail, Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTenantFilter } from '../hooks/useTenantFilter';

export default function StaffInbox() {
  const { t, isRTL } = useLanguage();
  const { user, userRole } = useRole();
  const { tenantFilter, tenantId: _tenantId } = useTenantFilter();
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const isStaff = userRole !== 'parent';

  useEffect(() => {
    if (!isStaff) return;
    fetchMessages();
     
  }, [userRole, isStaff]);

  // Only staff can access
  if (!isStaff) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center">
        <Card className="max-w-md w-full p-6">
          <CardContent className="text-center py-6">
            <p className="text-muted-foreground">{isRTL ? 'غير مصرح' : 'Unauthorized'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fetchMessages = async () => {
    setLoading(true);
    try {
      // Fetch messages addressed to this user's role
      const { data = [] } = await tenantQuery('messages').select('*').match(tenantFilter({
        recipient_role: userRole
      }));
      setMessages(data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) {
      toast.error(isRTL ? 'يرجى كتابة رد' : 'Please write a reply');
      return;
    }

    try {
      await tenantQuery('messages').insert({
        conversation_id: selectedMessage.conversation_id,
        student_id: selectedMessage.student_id,
        student_name: selectedMessage.student_name,
        sender_email: user.email,
        sender_name: user.full_name,
        sender_role: userRole,
        recipient_email: selectedMessage.sender_email,
        recipient_name: selectedMessage.sender_name,
        recipient_role: selectedMessage.sender_role,
        subject: `Re: ${selectedMessage.subject}`,
        message_body: replyText,
        category: selectedMessage.category,
        parent_message_id: selectedMessage.id
      });

      toast.success(isRTL ? 'تم إرسال الرد' : 'Reply sent');
      setShowReply(false);
      setReplyText('');
      fetchMessages();
    } catch (error) {
      console.error('Error sending reply:', error);
      toast.error(isRTL ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const markAsRead = async (messageId) => {
    try {
      await tenantQuery('messages').update({
        is_read: true,
        read_at: new Date().toISOString()
      });
      fetchMessages();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const filteredMessages = messages.filter(msg =>
    msg.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    msg.sender_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const unreadCount = messages.filter(m => !m.is_read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'صندوق الرسائل' : 'Message Inbox'}
        subtitle={`${unreadCount} ${isRTL ? 'رسالة غير مقروءة' : 'unread messages'}`}
      />

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} w-4 h-4 text-muted-foreground`} />
            <Input
              placeholder={isRTL ? 'بحث في الرسائل...' : 'Search messages...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={isRTL ? 'pr-10' : 'pl-10'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <div className="space-y-3">
        {loading ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filteredMessages.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{isRTL ? 'لا توجد رسائل' : 'No messages'}</p>
            </CardContent>
          </Card>
        ) : (
          filteredMessages.map((msg) => (
            <Card 
              key={msg.id} 
              className={`cursor-pointer hover:shadow-md transition ${!msg.is_read ? 'border-najdi-100 bg-najdi-50' : ''}`}
              onClick={() => {
                setSelectedMessage(msg);
                setShowReply(true);
                if (!msg.is_read) markAsRead(msg.id);
              }}
            >
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-ink">{msg.subject}</span>
                      {!msg.is_read && (
                        <span className="w-2 h-2 rounded-full bg-najdi-700" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{msg.message_body}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{isRTL ? 'من:' : 'From:'} {msg.sender_name}</span>
                      <span>•</span>
                      <span>{msg.student_name}</span>
                      <span>•</span>
                      <span>{format(new Date(msg.created_at), 'dd/MM/yyyy')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Reply Dialog */}
      <Dialog open={showReply} onOpenChange={setShowReply}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedMessage?.subject}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Original Message */}
            <div className="bg-sand border border-border rounded-lg p-4">
              <div className="text-sm text-muted-foreground mb-2">
                {isRTL ? 'من:' : 'From:'} <strong>{selectedMessage?.sender_name}</strong>
              </div>
              <p className="text-sm text-ink">{selectedMessage?.message_body}</p>
              <div className="text-xs text-muted-foreground mt-2">
                {selectedMessage?.created_at && format(new Date(selectedMessage.created_at), 'dd/MM/yyyy h:mm a')}
              </div>
            </div>

            {/* Reply */}
            <div className="space-y-2">
              <Label>{isRTL ? 'الرد' : 'Reply'}</Label>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={6}
                placeholder={isRTL ? 'اكتب ردك هنا...' : 'Write your reply here...'}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowReply(false)}>{t('cancel')}</Button>
              <Button onClick={handleReply}>
                <Send className="w-4 h-4 me-2" />
                {isRTL ? 'إرسال الرد' : 'Send Reply'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}