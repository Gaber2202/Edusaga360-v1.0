import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, fetchData } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useLanguage } from '../lib/LanguageContext';
import { parentDisplayName } from '../lib/displayName';
import { useLinkedStudents, useParentScope } from '../lib/useParentData';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import {
  Message as MessageRow,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from '../components/ui/message';
import ChildPills from '../components/ChildPills';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import LoadingCard from '../components/LoadingCard';
import StatusPill from '../components/StatusPill';
import { MessageSquare, Loader2, Clock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const TYPE_TONE = {
  general: 'muted',
  academic: 'success',
  invoice: 'gold',
  attendance: 'warn',
};

function initialsFrom(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function Messages() {
  const { user } = useAuth();
  const { t, isRTL, lang } = useLanguage();
  const queryClient = useQueryClient();
  const { tenantId, linkedIds, enabled } = useParentScope();
  const { data: students = [] } = useLinkedStudents();
  const [childId, setChildId] = useState(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const studentIds = childId ? [childId] : linkedIds;

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['parent-messages', tenantId, studentIds, user?.email],
    queryFn: async () => {
      const byStudent = await fetchData(
        supabase.from('messages').select('*').eq('tenant_id', tenantId).in('student_id', studentIds).order('created_at', { ascending: false }).limit(50)
      );
      if (byStudent.length > 0 || !user?.email) return byStudent;
      return fetchData(
        supabase.from('messages').select('*').eq('tenant_id', tenantId).eq('to_user_email', user.email).order('created_at', { ascending: false }).limit(50)
      );
    },
    enabled: !!tenantId && (enabled || !!user?.email),
  });

  const nameFor = (id) => {
    const s = students.find((st) => st.id === id);
    return isRTL ? (s?.name_ar || s?.name_en) : (s?.name_en || s?.name_ar);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !content.trim()) return;
    const targetStudent = childId || linkedIds[0];
    if (!targetStudent) {
      toast.error(t('noStudentsLinkedAccount'));
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        tenant_id: tenantId,
        student_id: targetStudent,
        from_user_email: user.email,
        from_user_name: parentDisplayName(user),
        from_user_role: 'parent',
        to_user_email: 'office@edusaga.local',
        to_user_name: 'School Office',
        subject: subject.trim(),
        content: content.trim(),
        message_type: 'general',
        is_read: false,
      });
      if (error) throw error;
      setSubject('');
      setContent('');
      toast.success(t('messageSent'));
      queryClient.invalidateQueries({ queryKey: ['parent-messages'] });
    } catch (err) {
      toast.error(err?.message || t('messageSendFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t('parentPortalEyebrow')} title={t('messagesTitle')} />
      <ChildPills students={students} selectedId={childId} onChange={setChildId} />

      {!enabled ? (
        <EmptyState
          icon={MessageSquare}
          title={t('noStudentsLinkedAccount')}
          description={t('contactSchoolLink')}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold text-ink">{t('sendMessage')}</h2>
              <form onSubmit={handleSend} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="msg-subject">{t('subject')}</Label>
                  <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="msg-body">{t('messageBody')}</Label>
                  <Textarea
                    id="msg-body"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                    rows={5}
                  />
                </div>
                <Button type="submit" disabled={sending} className="w-full">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('send')}
                  {!sending ? <ArrowRight className="h-4 w-4 rtl:rotate-180" /> : null}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="min-w-0">
            <h2 className="mb-3 text-lg font-semibold text-ink">{t('inbox')}</h2>
            {isLoading ? (
              <LoadingCard />
            ) : messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={t('noMessagesYet')}
                description={t('writeFirstMessage')}
              />
            ) : (
              <MessageGroup className="gap-4">
                {messages.map((msg) => {
                  const fromParent = msg.from_user_role === 'parent';
                  const sender = msg.from_user_name || msg.from_user_email || '—';
                  return (
                    <Card key={msg.id}>
                      <CardContent className="p-5">
                        <MessageRow align={fromParent ? 'end' : 'start'}>
                          <MessageAvatar>
                            <Avatar className="size-10">
                              <AvatarFallback>{initialsFrom(sender)}</AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                          <MessageContent className={fromParent ? 'items-end' : ''}>
                            <MessageHeader className="justify-between gap-3">
                              <p className="text-sm font-semibold text-ink">{msg.subject}</p>
                              <StatusPill tone={TYPE_TONE[msg.message_type] || 'muted'}>
                                {t(msg.message_type) || msg.message_type}
                              </StatusPill>
                            </MessageHeader>
                            <p className="text-[13px] text-muted-foreground">
                              {t('from')}: {sender}
                              {nameFor(msg.student_id) ? ` · ${nameFor(msg.student_id)}` : ''}
                            </p>
                            {msg.content ? (
                              <div className="mt-2 w-full rounded-[12px] bg-sand px-4 py-3 text-[15px] leading-relaxed text-ink">
                                {msg.content}
                              </div>
                            ) : null}
                            <MessageFooter>
                              <Clock className="me-1 h-3.5 w-3.5" />
                              {msg.created_at ? new Date(msg.created_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB') : ''}
                            </MessageFooter>
                          </MessageContent>
                        </MessageRow>
                      </CardContent>
                    </Card>
                  );
                })}
              </MessageGroup>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
