import React, { useState, useEffect } from 'react';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenant } from '../components/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Mail, Send, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminMessaging() {
  const { t: _t, isRTL } = useLanguage();
  const { tenant } = useTenant();
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageForm, setMessageForm] = useState({
    subject: '',
    content: '',
    messageType: 'general',
  });
  const [sending, setSending] = useState(false);

  // Fetch all students with parent info
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        setLoading(true);
        const studentList = await tenantQuery('students').select('*').match({
          tenant_id: tenant?.id,
          status: 'active'
        }).order('created_date', { ascending: false }).limit(100);

        const enrichedStudents = await Promise.all(
          studentList.map(async (student) => {
            const guardians = await tenantQuery('guardians').select('*').match({
              student_id: student.id,
              tenant_id: tenant?.id
            });
            const primaryGuardian = guardians.find(g => g.is_primary) || guardians[0];
            return { ...student, guardian: primaryGuardian };
          })
        );

        setStudents(enrichedStudents);
        setFilteredStudents(enrichedStudents);
      } catch (error) {
        console.error('Error fetching students:', error);
        toast.error(isRTL ? 'خطأ في تحميل الطلاب' : 'Error loading students');
      } finally {
        setLoading(false);
      }
    };

    if (tenant?.id) fetchStudents();
  }, [tenant?.id, isRTL]);

  // Filter students by search term
  useEffect(() => {
    const filtered = students.filter(s =>
      (isRTL ? s.name_ar : s.name_en)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.student_id?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredStudents(filtered);
  }, [searchTerm, students, isRTL]);

  const handleSendMessage = async () => {
    if (!selectedStudent?.guardian?.email) {
      toast.error(isRTL ? 'البريد الإلكتروني للولي غير متوفر' : 'Parent email not available');
      return;
    }

    if (!messageForm.subject.trim() || !messageForm.content.trim()) {
      toast.error(isRTL ? 'الرجاء ملء جميع الحقول' : 'Please fill all fields');
      return;
    }

    try {
      setSending(true);
      const currentUser = await supabase.auth.getUser().then(r => r.data?.user);

      await tenantQuery('messages').insert({
        tenant_id: tenant?.id,
        from_user_email: currentUser.email,
        from_user_name: currentUser.full_name,
        from_user_role: 'staff',
        to_user_email: selectedStudent.guardian.email,
        to_user_name: selectedStudent.guardian.name_en || selectedStudent.guardian.name_ar,
        student_id: selectedStudent.id,
        subject: messageForm.subject,
        content: messageForm.content,
        message_type: messageForm.messageType,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      toast.success(isRTL ? 'تم إرسال الرسالة بنجاح' : 'Message sent successfully');
      setMessageForm({ subject: '', content: '', messageType: 'general' });
      setMessageDialogOpen(false);
      setSelectedStudent(null);
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(isRTL ? 'خطأ في إرسال الرسالة' : 'Error sending message');
    } finally {
      setSending(false);
    }
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{isRTL ? 'إرسال الرسائل' : 'Parent Messaging'}</h1>
          <p className="text-slate-600 text-sm mt-1">
            {isRTL ? 'إرسال رسائل آمنة لأولياء الأمور' : 'Send secure messages to parents'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isRTL ? 'قائمة الطلاب' : 'Students List'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <Input
              placeholder={isRTL ? 'ابحث عن طالب...' : 'Search student...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {filteredStudents.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              {isRTL ? 'لا توجد طلاب' : 'No students found'}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'اسم الطالب' : 'Student Name'}</TableHead>
                    <TableHead>{isRTL ? 'رقم الطالب' : 'Student ID'}</TableHead>
                    <TableHead>{isRTL ? 'الصف' : 'Grade'}</TableHead>
                    <TableHead>{isRTL ? 'ولي الأمر' : 'Parent Name'}</TableHead>
                    <TableHead>{isRTL ? 'البريد الإلكتروني' : 'Parent Email'}</TableHead>
                    <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>{isRTL ? student.name_ar : student.name_en}</TableCell>
                      <TableCell>{student.student_id}</TableCell>
                      <TableCell>{student.grade}</TableCell>
                      <TableCell>{student.guardian?.name_en || student.guardian?.name_ar || '-'}</TableCell>
                      <TableCell className="text-sm text-slate-600">{student.guardian?.email || '-'}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedStudent(student);
                            setMessageDialogOpen(true);
                          }}
                          disabled={!student.guardian?.email}
                        >
                          <Mail className="w-4 h-4 mr-1" />
                          {isRTL ? 'رسالة' : 'Message'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Dialog */}
      <Dialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <DialogContent className="max-w-2xl" dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>
              {isRTL ? 'إرسال رسالة إلى' : 'Send Message to'}{' '}
              {isRTL ? selectedStudent?.name_ar : selectedStudent?.name_en}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <p className="text-sm text-slate-600">
                {isRTL ? 'إلى: ' : 'To: '}
                <span className="font-medium text-slate-900">
                  {selectedStudent?.guardian?.name_en || selectedStudent?.guardian?.name_ar}
                </span>
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {selectedStudent?.guardian?.email}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                {isRTL ? 'نوع الرسالة' : 'Message Type'}
              </label>
              <Select
                value={messageForm.messageType}
                onValueChange={(value) =>
                  setMessageForm({ ...messageForm, messageType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">{isRTL ? 'عام' : 'General'}</SelectItem>
                  <SelectItem value="academic">{isRTL ? 'أكاديمي' : 'Academic'}</SelectItem>
                  <SelectItem value="invoice">{isRTL ? 'فاتورة' : 'Invoice'}</SelectItem>
                  <SelectItem value="attendance">{isRTL ? 'حضور' : 'Attendance'}</SelectItem>
                  <SelectItem value="health">{isRTL ? 'صحة' : 'Health'}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                {isRTL ? 'الموضوع' : 'Subject'}
              </label>
              <Input
                value={messageForm.subject}
                onChange={(e) =>
                  setMessageForm({ ...messageForm, subject: e.target.value })
                }
                placeholder={isRTL ? 'موضوع الرسالة' : 'Message subject'}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">
                {isRTL ? 'الرسالة' : 'Message'}
              </label>
              <Textarea
                value={messageForm.content}
                onChange={(e) =>
                  setMessageForm({ ...messageForm, content: e.target.value })
                }
                placeholder={isRTL ? 'اكتب رسالتك هنا...' : 'Type your message here...'}
                rows={6}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMessageDialogOpen(false)}
            >
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={sending}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? (isRTL ? 'جاري الإرسال...' : 'Sending...') : (isRTL ? 'إرسال' : 'Send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}