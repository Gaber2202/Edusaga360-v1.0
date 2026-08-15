import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Separator } from '../components/ui/separator';
import { 
  ArrowLeft, Clock, User, MessageSquare, CheckCircle, AlertTriangle,
  Send, Mail
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function TicketDetails() {
  const { isRTL } = useLanguage();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get('id');
  
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const { data: tickets = [] } = await tenantQuery('service_tickets').select('*').match({ id: ticketId });
      return tickets[0];
    },
    enabled: !!ticketId
  });

  const { data: activities = [] } = useQuery({ enabled: false /* ticket_activitys table not built */, queryKey: ['ticketActivities', ticketId], queryFn: () => fetchData(tenantQuery('ticket_activitys').select('*').match({ ticket_id: ticketId }).order('created_at', { ascending: false })), initialData: [] });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => supabase.auth.getUser().then(r => r.data?.user)
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status) => {
      await tenantQuery('service_tickets').update({ 
        status,
        ...(status === 'resolved' && { resolution_date: new Date().toISOString() }),
        ...(status === 'closed' && { closed_date: new Date().toISOString() })
      });
      await tenantQuery('ticket_activitys').insert({
        ticket_id: ticketId,
        activity_type: 'status_change',
        from_status: ticket.status,
        to_status: status,
        performed_by: user?.email,
        performed_by_name: user?.full_name
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['ticketActivities', ticketId] });
      toast.success(isRTL ? 'تم تحديث الحالة' : 'Status updated');
    }
  });

  const addCommentMutation = useMutation({
    mutationFn: async () => {
      await tenantQuery('ticket_activitys').insert({
        ticket_id: ticketId,
        activity_type: 'comment',
        comment: newComment,
        is_internal: isInternal,
        performed_by: user?.email,
        performed_by_name: user?.full_name
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticketActivities', ticketId] });
      setNewComment('');
      toast.success(isRTL ? 'تم إضافة التعليق' : 'Comment added');
    }
  });

  if (isLoading || !ticket) {
    return <div className="p-6">{isRTL ? 'جاري التحميل...' : 'Loading...'}</div>;
  }

  const statusColors = {
    open: 'bg-najdi-50 text-najdi-900',
    in_progress: 'bg-yellow-100 text-yellow-800',
    waiting: 'bg-purple-100 text-purple-800',
    resolved: 'bg-green-100 text-green-800',
    closed: 'bg-gray-100 text-gray-800'
  };

  const priorityColors = {
    low: 'bg-gray-100',
    medium: 'bg-najdi-50',
    high: 'bg-orange-100',
    critical: 'bg-red-100'
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to={createPageUrl(ticket.ticket_type === 'crm' ? 'CRM' : ticket.ticket_type === 'it_helpdesk' ? 'ITHelpdesk' : 'Facilities')}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{ticket.ticket_number}</h1>
          <p className="text-gray-500">{ticket.subject}</p>
        </div>
        <Badge className={statusColors[ticket.status]}>{ticket.status}</Badge>
        <Badge className={priorityColors[ticket.priority]}>{ticket.priority}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'تفاصيل المشكلة' : 'Issue Details'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{ticket.description}</p>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'سجل النشاط' : 'Activity Log'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map((activity, idx) => (
                  <div key={idx} className={`flex gap-4 p-3 rounded-lg ${activity.is_internal ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                    <div className="flex-shrink-0">
                      {activity.activity_type === 'comment' && <MessageSquare className="h-5 w-5 text-najdi-500" />}
                      {activity.activity_type === 'status_change' && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {activity.activity_type === 'created' && <Clock className="h-5 w-5 text-gray-500" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{activity.performed_by_name || activity.performed_by}</span>
                        <span className="text-sm text-gray-500">
                          {activity.created_at && format(new Date(activity.created_at), 'yyyy-MM-dd HH:mm')}
                        </span>
                      </div>
                      {activity.activity_type === 'status_change' && (
                        <p className="text-sm text-gray-600">
                          {isRTL ? 'تغيير الحالة من' : 'Changed status from'} <Badge variant="outline">{activity.from_status}</Badge> {isRTL ? 'إلى' : 'to'} <Badge variant="outline">{activity.to_status}</Badge>
                        </p>
                      )}
                      {activity.comment && (
                        <p className="mt-1 text-gray-700">{activity.comment}</p>
                      )}
                      {activity.is_internal && (
                        <Badge variant="outline" className="mt-1 bg-yellow-100">{isRTL ? 'ملاحظة داخلية' : 'Internal Note'}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              {/* Add Comment */}
              <div className="space-y-4">
                <Label>{isRTL ? 'إضافة تعليق' : 'Add Comment'}</Label>
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={isRTL ? 'اكتب تعليقك هنا...' : 'Write your comment here...'}
                  rows={3}
                />
                <div className="flex justify-between items-center">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">{isRTL ? 'ملاحظة داخلية' : 'Internal Note'}</span>
                  </label>
                  <Button onClick={() => addCommentMutation.mutate()} disabled={!newComment.trim()}>
                    <Send className="h-4 w-4 mr-2" />
                    {isRTL ? 'إرسال' : 'Send'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Ticket Info */}
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'معلومات التذكرة' : 'Ticket Info'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-500">{isRTL ? 'التصنيف' : 'Category'}</Label>
                <p>{ticket.category}</p>
              </div>
              <div>
                <Label className="text-gray-500">{isRTL ? 'المصدر' : 'Source'}</Label>
                <p>{ticket.source}</p>
              </div>
              <div>
                <Label className="text-gray-500">{isRTL ? 'تاريخ الإنشاء' : 'Created'}</Label>
                <p>{ticket.created_at && format(new Date(ticket.created_at), 'yyyy-MM-dd HH:mm')}</p>
              </div>
              {ticket.sla_due_date && (
                <div>
                  <Label className="text-gray-500">SLA</Label>
                  <div className="flex items-center gap-2">
                    <p>{format(new Date(ticket.sla_due_date), 'yyyy-MM-dd HH:mm')}</p>
                    {ticket.sla_status === 'breached' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-gray-500">{isRTL ? 'المسؤول' : 'Assigned To'}</Label>
                <p>{ticket.assigned_to || (isRTL ? 'غير محدد' : 'Unassigned')}</p>
              </div>
            </CardContent>
          </Card>

          {/* Customer Info */}
          {ticket.customer_name && (
            <Card>
              <CardHeader>
                <CardTitle>{isRTL ? 'معلومات العميل' : 'Customer Info'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-400" />
                  <span>{ticket.customer_name}</span>
                </div>
                {ticket.requester_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{ticket.requester_email}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>{isRTL ? 'الإجراءات' : 'Actions'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{isRTL ? 'تغيير الحالة' : 'Update Status'}</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder={isRTL ? 'اختر الحالة' : 'Select Status'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">{isRTL ? 'مفتوح' : 'Open'}</SelectItem>
                    <SelectItem value="in_progress">{isRTL ? 'قيد المعالجة' : 'In Progress'}</SelectItem>
                    <SelectItem value="waiting">{isRTL ? 'بانتظار الرد' : 'Waiting'}</SelectItem>
                    <SelectItem value="resolved">{isRTL ? 'تم الحل' : 'Resolved'}</SelectItem>
                    <SelectItem value="closed">{isRTL ? 'مغلق' : 'Closed'}</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  className="w-full mt-2" 
                  onClick={() => updateStatusMutation.mutate(newStatus)}
                  disabled={!newStatus || newStatus === ticket.status}
                >
                  {isRTL ? 'تحديث الحالة' : 'Update Status'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}