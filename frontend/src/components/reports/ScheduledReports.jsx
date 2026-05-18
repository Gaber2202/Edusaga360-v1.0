import React, { useState } from 'react';
import { callApi } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import StatusBadge from '../ui/StatusBadge';
import { Plus, Clock, Mail, Trash2, Edit2, Loader2, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const REPORT_TYPES = [
  { id: 'daily_collections', name_ar: 'تقرير التحصيل اليومي', name_en: 'Daily Collections Report' },
  { id: 'weekly_admissions', name_ar: 'تقرير القبول الأسبوعي', name_en: 'Weekly Admissions Report' },
  { id: 'monthly_finance', name_ar: 'التقرير المالي الشهري', name_en: 'Monthly Finance Report' },
  { id: 'ar_aging', name_ar: 'تقرير أعمار الذمم', name_en: 'AR Aging Report' },
  { id: 'attendance_summary', name_ar: 'ملخص الحضور', name_en: 'Attendance Summary' },
  { id: 'overdue_invoices', name_ar: 'الفواتير المتأخرة', name_en: 'Overdue Invoices' },
  { id: 'executive_kpis', name_ar: 'مؤشرات الأداء التنفيذية', name_en: 'Executive KPIs' },
];

const FREQUENCIES = [
  { id: 'daily', name_ar: 'يومي', name_en: 'Daily' },
  { id: 'weekly', name_ar: 'أسبوعي', name_en: 'Weekly' },
  { id: 'monthly', name_ar: 'شهري', name_en: 'Monthly' },
  { id: 'quarterly', name_ar: 'ربع سنوي', name_en: 'Quarterly' },
];

export default function ScheduledReports() {
  const { t, isRTL } = useLanguage();
  
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(null);

  const [formData, setFormData] = useState({
    report_type: 'daily_collections',
    name: '',
    frequency: 'daily',
    recipients: '',
    send_time: '08:00',
    day_of_week: 1,
    day_of_month: 1,
    is_active: true,
    include_excel: true,
    include_pdf: false,
  });

  // Using local state to simulate scheduled reports (would normally be stored in DB)
  const [schedules, setSchedules] = useState([
    { id: '1', report_type: 'daily_collections', name: 'Daily Collections', frequency: 'daily', recipients: 'finance@school.edu.sa', send_time: '08:00', is_active: true, last_sent: '2026-01-11T08:00:00', next_run: '2026-01-12T08:00:00' },
    { id: '2', report_type: 'weekly_admissions', name: 'Weekly Admissions', frequency: 'weekly', recipients: 'admissions@school.edu.sa', send_time: '09:00', day_of_week: 0, is_active: true, last_sent: '2026-01-05T09:00:00', next_run: '2026-01-12T09:00:00' },
    { id: '3', report_type: 'ar_aging', name: 'AR Aging Report', frequency: 'monthly', recipients: 'cfo@school.edu.sa, finance@school.edu.sa', send_time: '07:00', day_of_month: 1, is_active: false, last_sent: '2026-01-01T07:00:00', next_run: '2026-02-01T07:00:00' },
  ]);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      const reportTypeInfo = REPORT_TYPES.find(r => r.id === formData.report_type);
      const newSchedule = {
        ...formData,
        id: editingSchedule?.id || Date.now().toString(),
        name: formData.name || (isRTL ? reportTypeInfo?.name_ar : reportTypeInfo?.name_en),
        next_run: calculateNextRun(formData),
      };

      if (editingSchedule) {
        setSchedules(prev => prev.map(s => s.id === editingSchedule.id ? newSchedule : s));
      } else {
        setSchedules(prev => [...prev, newSchedule]);
      }

      setShowForm(false);
      resetForm();
      setSaving(false);
      toast.success(isRTL ? 'تم الحفظ بنجاح' : 'Saved successfully');
    }, 500);
  };

  const calculateNextRun = (schedule) => {
    const now = new Date();
    const [hours, minutes] = schedule.send_time.split(':').map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);

    if (schedule.frequency === 'daily') {
      if (next <= now) next.setDate(next.getDate() + 1);
    } else if (schedule.frequency === 'weekly') {
      next.setDate(next.getDate() + ((7 + schedule.day_of_week - next.getDay()) % 7 || 7));
    } else if (schedule.frequency === 'monthly') {
      next.setDate(schedule.day_of_month);
      if (next <= now) next.setMonth(next.getMonth() + 1);
    }

    return next.toISOString();
  };

  const handleDelete = (id) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
    toast.success(isRTL ? 'تم الحذف' : 'Deleted');
  };

  const handleToggleActive = (id) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, is_active: !s.is_active } : s));
  };

  const handleSendNow = async (schedule) => {
    setSendingNow(schedule.id);
    try {
      // Simulate sending report
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update last_sent
      setSchedules(prev => prev.map(s => 
        s.id === schedule.id ? { ...s, last_sent: new Date().toISOString() } : s
      ));

      // Send notification email (using the integration)
      const recipients = schedule.recipients.split(',').map(e => e.trim());
      for (const email of recipients) {
        await callApi('/api/email/send', {
          to: email,
          subject: `${schedule.name} - ${format(new Date(), 'dd/MM/yyyy')}`,
          body: `مرحباً،\n\nمرفق تقرير ${schedule.name} الصادر في ${format(new Date(), 'dd/MM/yyyy HH:mm')}.\n\nهذا البريد آلي، يرجى عدم الرد عليه.\n\nشكراً،\nنظام EduSaga ERP`
        });
      }

      toast.success(isRTL ? 'تم إرسال التقرير بنجاح' : 'Report sent successfully');
    } catch (error) {
      console.error('Error:', error);
      toast.error(isRTL ? 'حدث خطأ أثناء الإرسال' : 'Error sending report');
    } finally {
      setSendingNow(null);
    }
  };

  const resetForm = () => {
    setEditingSchedule(null);
    setFormData({
      report_type: 'daily_collections',
      name: '',
      frequency: 'daily',
      recipients: '',
      send_time: '08:00',
      day_of_week: 1,
      day_of_month: 1,
      is_active: true,
      include_excel: true,
      include_pdf: false,
    });
  };

  const openEditForm = (schedule) => {
    setEditingSchedule(schedule);
    setFormData(schedule);
    setShowForm(true);
  };

  const getReportTypeName = (typeId) => {
    const type = REPORT_TYPES.find(r => r.id === typeId);
    return type ? (isRTL ? type.name_ar : type.name_en) : typeId;
  };

  const getFrequencyName = (freqId) => {
    const freq = FREQUENCIES.find(f => f.id === freqId);
    return freq ? (isRTL ? freq.name_ar : freq.name_en) : freqId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{isRTL ? 'التقارير المجدولة' : 'Scheduled Reports'}</h3>
          <p className="text-sm text-slate-500">{isRTL ? 'إدارة التقارير الآلية المرسلة بالبريد الإلكتروني' : 'Manage automated email reports'}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 me-2" />
          {isRTL ? 'جدولة تقرير' : 'Schedule Report'}
        </Button>
      </div>

      {/* Schedules Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>{isRTL ? 'التقرير' : 'Report'}</TableHead>
              <TableHead>{isRTL ? 'التكرار' : 'Frequency'}</TableHead>
              <TableHead>{isRTL ? 'المستلمون' : 'Recipients'}</TableHead>
              <TableHead>{isRTL ? 'آخر إرسال' : 'Last Sent'}</TableHead>
              <TableHead>{isRTL ? 'التشغيل التالي' : 'Next Run'}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  {isRTL ? 'لا توجد تقارير مجدولة' : 'No scheduled reports'}
                </TableCell>
              </TableRow>
            ) : (
              schedules.map(schedule => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{schedule.name}</p>
                      <p className="text-sm text-slate-500">{getReportTypeName(schedule.report_type)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span>{getFrequencyName(schedule.frequency)}</span>
                      <span className="text-slate-500">{schedule.send_time}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span className="text-sm truncate max-w-[200px]">{schedule.recipients}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {schedule.last_sent ? format(new Date(schedule.last_sent), 'dd/MM/yyyy HH:mm') : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {schedule.next_run ? format(new Date(schedule.next_run), 'dd/MM/yyyy HH:mm') : '-'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={schedule.is_active ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => handleSendNow(schedule)}
                        disabled={sendingNow === schedule.id}
                      >
                        {sendingNow === schedule.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEditForm(schedule)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDelete(schedule.id)} className="text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Switch 
                        checked={schedule.is_active} 
                        onCheckedChange={() => handleToggleActive(schedule.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Schedule Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSchedule ? (isRTL ? 'تعديل الجدولة' : 'Edit Schedule') : (isRTL ? 'جدولة تقرير جديد' : 'Schedule New Report')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'نوع التقرير' : 'Report Type'}</Label>
              <Select value={formData.report_type} onValueChange={(v) => setFormData(p => ({...p, report_type: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map(r => (
                    <SelectItem key={r.id} value={r.id}>{isRTL ? r.name_ar : r.name_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'اسم التقرير (اختياري)' : 'Report Name (optional)'}</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData(p => ({...p, name: e.target.value}))}
                placeholder={isRTL ? 'سيتم استخدام اسم النوع افتراضياً' : 'Will use type name by default'}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'التكرار' : 'Frequency'}</Label>
                <Select value={formData.frequency} onValueChange={(v) => setFormData(p => ({...p, frequency: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map(f => (
                      <SelectItem key={f.id} value={f.id}>{isRTL ? f.name_ar : f.name_en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'وقت الإرسال' : 'Send Time'}</Label>
                <Input 
                  type="time" 
                  value={formData.send_time} 
                  onChange={(e) => setFormData(p => ({...p, send_time: e.target.value}))}
                />
              </div>
            </div>

            {formData.frequency === 'weekly' && (
              <div className="space-y-2">
                <Label>{isRTL ? 'يوم الأسبوع' : 'Day of Week'}</Label>
                <Select value={String(formData.day_of_week)} onValueChange={(v) => setFormData(p => ({...p, day_of_week: Number(v)}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{isRTL ? 'الأحد' : 'Sunday'}</SelectItem>
                    <SelectItem value="1">{isRTL ? 'الإثنين' : 'Monday'}</SelectItem>
                    <SelectItem value="2">{isRTL ? 'الثلاثاء' : 'Tuesday'}</SelectItem>
                    <SelectItem value="3">{isRTL ? 'الأربعاء' : 'Wednesday'}</SelectItem>
                    <SelectItem value="4">{isRTL ? 'الخميس' : 'Thursday'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {formData.frequency === 'monthly' && (
              <div className="space-y-2">
                <Label>{isRTL ? 'يوم الشهر' : 'Day of Month'}</Label>
                <Select value={String(formData.day_of_month)} onValueChange={(v) => setFormData(p => ({...p, day_of_month: Number(v)}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>{isRTL ? 'المستلمون (البريد الإلكتروني)' : 'Recipients (Email)'}</Label>
              <Input 
                value={formData.recipients} 
                onChange={(e) => setFormData(p => ({...p, recipients: e.target.value}))}
                placeholder={isRTL ? 'أدخل عناوين البريد مفصولة بفاصلة' : 'Enter emails separated by comma'}
              />
              <p className="text-xs text-slate-500">{isRTL ? 'مثال: email1@school.sa, email2@school.sa' : 'Example: email1@school.sa, email2@school.sa'}</p>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Switch 
                  checked={formData.include_excel} 
                  onCheckedChange={(v) => setFormData(p => ({...p, include_excel: v}))}
                />
                <Label>{isRTL ? 'تضمين Excel' : 'Include Excel'}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={formData.include_pdf} 
                  onCheckedChange={(v) => setFormData(p => ({...p, include_pdf: v}))}
                />
                <Label>{isRTL ? 'تضمين PDF' : 'Include PDF'}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch 
                  checked={formData.is_active} 
                  onCheckedChange={(v) => setFormData(p => ({...p, is_active: v}))}
                />
                <Label>{t('active')}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving || !formData.recipients}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}