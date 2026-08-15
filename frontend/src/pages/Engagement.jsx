import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData, callApi } from '../api/supabaseClient';
import { extractAiText } from '../components/yamen/yamenUtils';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { useBranch } from '../components/BranchContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import PageHeader from '../components/ui/PageHeader';
import { toast } from 'sonner';
import { format } from 'date-fns';

import { useTenantFilter } from '../hooks/useTenantFilter';
import {
  Megaphone, BarChart3, Bot, MessageSquare, Plus, Loader2,
  ThumbsUp, Send,
  SmilePlus, ClipboardList
} from 'lucide-react';

export default function Engagement() {
  const { isRTL } = useLanguage();
  const { user } = useRole();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();

  const [activeTab, setActiveTab] = useState('announcements');
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiChat, setAiChat] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  const [announcementForm, setAnnouncementForm] = useState({
    title_ar: '', title_en: '', body_ar: '', body_en: '',
    audience: 'all', priority: 'normal', scheduled_date: '',
    allow_comments: true, allow_reactions: true
  });

  const [surveyForm, setSurveyForm] = useState({
    title_ar: '', title_en: '', description: '', survey_type: 'general',
    is_anonymous: true, deadline: '',
    questions: [{ question_ar: '', question_en: '', type: 'rating' }]
  });

  const { data: announcements = [], isLoading: loadingAnnouncements } = useQuery({ enabled: false /* announcements table not built */, queryKey: ['announcements', tenantId, selectedBranchId], queryFn: () => fetchData(tenantQuery('announcements').select('*').match(tenantFilter()).order('created_at', { ascending: false })), initialData: [] });

  const { data: surveys = [] } = useQuery({ enabled: false /* employee_surveys table not built */, queryKey: ['employee_surveys', tenantId], queryFn: () => fetchData(tenantQuery('employee_surveys').select('*').match(tenantFilter()).order('created_at', { ascending: false })), initialData: [] });

  const { data: surveyResponses = [] } = useQuery({ enabled: false /* survey_responses table not built */, queryKey: ['survey_responses', tenantId], queryFn: () => fetchData(tenantQuery('survey_responses').select('*').match(tenantFilter())), initialData: [] });

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title_ar) {
      toast.error(isRTL ? 'العنوان مطلوب' : 'Title is required');
      return;
    }
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = {
        ...announcementForm,
        ...(tid && { tenant_id: tid }),
        announcement_number: `ANN-${Date.now().toString(36).toUpperCase()}`,
        created_by: user?.email,
        status: announcementForm.scheduled_date ? 'scheduled' : 'published',
        reactions: { likes: 0, hearts: 0 },
        comments_count: 0
      };
      await tenantQuery('announcements').insert(data);
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setShowAnnouncementForm(false);
      setAnnouncementForm({ title_ar: '', title_en: '', body_ar: '', body_en: '', audience: 'all', priority: 'normal', scheduled_date: '', allow_comments: true, allow_reactions: true });
      toast.success(isRTL ? 'تم نشر الإعلان' : 'Announcement published');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSurvey = async () => {
    if (!surveyForm.title_ar) {
      toast.error(isRTL ? 'العنوان مطلوب' : 'Title is required');
      return;
    }
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const data = {
        ...surveyForm,
        ...(tid && { tenant_id: tid }),
        survey_code: `SRV-${Date.now().toString(36).toUpperCase()}`,
        created_by: user?.email,
        status: 'active',
        responses_count: 0
      };
      await tenantQuery('employee_surveys').insert(data);
      queryClient.invalidateQueries({ queryKey: ['employee_surveys'] });
      setShowSurveyForm(false);
      setSurveyForm({ title_ar: '', title_en: '', description: '', survey_type: 'general', is_anonymous: true, deadline: '', questions: [{ question_ar: '', question_en: '', type: 'rating' }] });
      toast.success(isRTL ? 'تم إنشاء الاستبيان' : 'Survey created');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAIChat = async () => {
    if (!aiChat.trim()) return;
    setLoadingAI(true);
    try {
      const prompt = `You are Yamen AI, an HR helpdesk assistant for a Saudi school (EduSaga 360 platform). Answer this employee query helpfully in both Arabic and English:\n\n"${aiChat}"\n\nConsider Saudi labor law, school policies, and HR best practices.`;
      const res = await callApi('/api/ai/invoke-llm', { prompt, source: 'hr' });
      setAiResponse(extractAiText(res));
    } catch (_) {
      setAiResponse(isRTL ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.' : 'Sorry, an error occurred. Please try again.');
    } finally {
      setLoadingAI(false);
    }
  };

  const addSurveyQuestion = () => setSurveyForm(p => ({
    ...p,
    questions: [...p.questions, { question_ar: '', question_en: '', type: 'rating' }]
  }));

  const eNPSScore = (() => {
    const enpsSurveys = surveyResponses.filter(r => r.survey_type === 'enps');
    if (enpsSurveys.length === 0) return null;
    const promoters = enpsSurveys.filter(r => (r.score || 0) >= 9).length;
    const detractors = enpsSurveys.filter(r => (r.score || 0) <= 6).length;
    return Math.round(((promoters - detractors) / enpsSurveys.length) * 100);
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'التفاعل والمشاركة' : 'Employee Engagement'}
        subtitle={isRTL ? 'إعلانات، استبيانات، مساعد ذكي، وتحليلات المشاركة' : 'Announcements, surveys, AI helpdesk, and engagement analytics'}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4"><p className="text-sm text-muted-foreground">{isRTL ? 'إعلانات نشطة' : 'Active Announcements'}</p><p className="text-2xl font-bold text-najdi-700">{announcements.filter(a => a.status === 'published').length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">{isRTL ? 'استبيانات مفتوحة' : 'Open Surveys'}</p><p className="text-2xl font-bold text-emerald-600">{surveys.filter(s => s.status === 'active').length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">{isRTL ? 'ردود الاستبيانات' : 'Survey Responses'}</p><p className="text-2xl font-bold text-purple-600">{surveyResponses.length}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted-foreground">eNPS</p><p className={`text-2xl font-bold ${eNPSScore !== null ? (eNPSScore > 0 ? 'text-emerald-600' : 'text-red-600') : 'text-muted-foreground'}`}>{eNPSScore !== null ? eNPSScore : '-'}</p></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="announcements" className="gap-1"><Megaphone className="w-4 h-4" />{isRTL ? 'الإعلانات' : 'Announcements'}</TabsTrigger>
          <TabsTrigger value="surveys" className="gap-1"><ClipboardList className="w-4 h-4" />{isRTL ? 'الاستبيانات' : 'Surveys'}</TabsTrigger>
          <TabsTrigger value="helpdesk" className="gap-1"><Bot className="w-4 h-4" />{isRTL ? 'المساعد الذكي' : 'AI Helpdesk'}</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1"><BarChart3 className="w-4 h-4" />{isRTL ? 'التحليلات' : 'Analytics'}</TabsTrigger>
        </TabsList>

        {/* Announcements */}
        <TabsContent value="announcements" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowAnnouncementForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />{isRTL ? 'إعلان جديد' : 'New Announcement'}
            </Button>
          </div>
          <div className="space-y-3">
            {loadingAnnouncements && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}
            {announcements.map(ann => (
              <Card key={ann.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {ann.priority === 'urgent' && <Badge className="bg-red-100 text-red-700">{isRTL ? 'عاجل' : 'Urgent'}</Badge>}
                      <Badge variant="outline">{ann.audience === 'all' ? (isRTL ? 'الجميع' : 'Everyone') : ann.audience}</Badge>
                      <Badge className={ann.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>{ann.status === 'published' ? (isRTL ? 'منشور' : 'Published') : (isRTL ? 'مجدول' : 'Scheduled')}</Badge>
                    </div>
                    <h3 className="font-semibold text-lg">{isRTL ? ann.title_ar : ann.title_en || ann.title_ar}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{isRTL ? ann.body_ar : ann.body_en || ann.body_ar}</p>
                    <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                      <span>{ann.created_at ? format(new Date(ann.created_at), 'dd/MM/yyyy') : ''}</span>
                      {ann.allow_reactions && <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{ann.reactions?.likes || 0}</span>}
                      {ann.allow_comments && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{ann.comments_count || 0}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {announcements.length === 0 && !loadingAnnouncements && (
              <Card className="p-8 text-center text-muted-foreground">{isRTL ? 'لا توجد إعلانات' : 'No announcements yet'}</Card>
            )}
          </div>
        </TabsContent>

        {/* Surveys & eNPS */}
        <TabsContent value="surveys" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setSurveyForm(p => ({ ...p, survey_type: 'enps' })); setShowSurveyForm(true); }} variant="outline" className="gap-2">
              <SmilePlus className="w-4 h-4" />eNPS
            </Button>
            <Button onClick={() => setShowSurveyForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />{isRTL ? 'استبيان جديد' : 'New Survey'}
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'العنوان' : 'Title'}</TableHead>
                <TableHead>{isRTL ? 'النوع' : 'Type'}</TableHead>
                <TableHead>{isRTL ? 'مجهول' : 'Anonymous'}</TableHead>
                <TableHead>{isRTL ? 'الردود' : 'Responses'}</TableHead>
                <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {surveys.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{isRTL ? s.title_ar : s.title_en || s.title_ar}</TableCell>
                  <TableCell><Badge variant="outline">{s.survey_type === 'enps' ? 'eNPS' : s.survey_type === 'pulse' ? (isRTL ? 'نبض' : 'Pulse') : (isRTL ? 'عام' : 'General')}</Badge></TableCell>
                  <TableCell>{s.is_anonymous ? (isRTL ? 'نعم' : 'Yes') : (isRTL ? 'لا' : 'No')}</TableCell>
                  <TableCell>{s.responses_count || 0}</TableCell>
                  <TableCell><Badge className={s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-sand-alt text-ink'}>{s.status === 'active' ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'مغلق' : 'Closed')}</Badge></TableCell>
                </TableRow>
              ))}
              {surveys.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">{isRTL ? 'لا توجد استبيانات' : 'No surveys'}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* AI Helpdesk */}
        <TabsContent value="helpdesk" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center"><Bot className="w-5 h-5 text-purple-600" /></div>
              <div>
                <h3 className="font-semibold">{isRTL ? 'مساعد يامن الذكي — مكتب المساعدة' : 'Yamen AI — HR Helpdesk'}</h3>
                <p className="text-sm text-muted-foreground">{isRTL ? 'اسأل أي سؤال عن الموارد البشرية والسياسات والإجازات' : 'Ask any HR, policy, leave, or benefits question'}</p>
              </div>
            </div>
            <div className="flex gap-2 mb-4">
              <Input
                value={aiChat}
                onChange={(e) => setAiChat(e.target.value)}
                placeholder={isRTL ? 'اكتب سؤالك هنا...' : 'Type your question here...'}
                onKeyDown={(e) => e.key === 'Enter' && handleAIChat()}
                className="flex-1"
              />
              <Button onClick={handleAIChat} disabled={loadingAI} className="gap-2 bg-purple-600 hover:bg-purple-700">
                {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isRTL ? 'إرسال' : 'Send'}
              </Button>
            </div>
            {aiResponse && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 whitespace-pre-wrap text-sm">{aiResponse}</div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                isRTL ? 'كم رصيد إجازاتي؟' : 'What is my leave balance?',
                isRTL ? 'ما هي سياسة العمل الإضافي؟' : 'What is the overtime policy?',
                isRTL ? 'كيف أقدم شكوى؟' : 'How do I file a grievance?',
                isRTL ? 'ما هي مكافأة نهاية الخدمة؟' : 'What is EOSB?',
              ].map((q, i) => (
                <Button key={i} variant="outline" size="sm" onClick={() => { setAiChat(q); }} className="text-xs">{q}</Button>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Engagement Analytics */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'مشاركة الإعلانات' : 'Announcement Engagement'}</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span>{isRTL ? 'إجمالي الإعلانات' : 'Total Announcements'}</span><span className="font-bold">{announcements.length}</span></div>
                <div className="flex justify-between text-sm"><span>{isRTL ? 'إجمالي التفاعلات' : 'Total Reactions'}</span><span className="font-bold">{announcements.reduce((s, a) => s + (a.reactions?.likes || 0), 0)}</span></div>
                <div className="flex justify-between text-sm"><span>{isRTL ? 'إجمالي التعليقات' : 'Total Comments'}</span><span className="font-bold">{announcements.reduce((s, a) => s + (a.comments_count || 0), 0)}</span></div>
              </div>
            </Card>
            <Card className="p-6">
              <h4 className="font-semibold mb-4">{isRTL ? 'مشاركة الاستبيانات' : 'Survey Participation'}</h4>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span>{isRTL ? 'إجمالي الاستبيانات' : 'Total Surveys'}</span><span className="font-bold">{surveys.length}</span></div>
                <div className="flex justify-between text-sm"><span>{isRTL ? 'إجمالي الردود' : 'Total Responses'}</span><span className="font-bold">{surveyResponses.length}</span></div>
                <div className="flex justify-between text-sm"><span>eNPS</span><span className={`font-bold ${eNPSScore !== null ? (eNPSScore > 0 ? 'text-emerald-600' : 'text-red-600') : ''}`}>{eNPSScore !== null ? eNPSScore : '-'}</span></div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Announcement Form Dialog */}
      <Dialog open={showAnnouncementForm} onOpenChange={setShowAnnouncementForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{isRTL ? 'إعلان جديد' : 'New Announcement'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'العنوان (عربي)' : 'Title (Arabic)'} *</Label>
                <Input value={announcementForm.title_ar} onChange={(e) => setAnnouncementForm(p => ({...p, title_ar: e.target.value}))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'العنوان (إنجليزي)' : 'Title (English)'}</Label>
                <Input value={announcementForm.title_en} onChange={(e) => setAnnouncementForm(p => ({...p, title_en: e.target.value}))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'المحتوى (عربي)' : 'Body (Arabic)'}</Label>
              <Textarea value={announcementForm.body_ar} onChange={(e) => setAnnouncementForm(p => ({...p, body_ar: e.target.value}))} rows={4} dir="rtl" />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'المحتوى (إنجليزي)' : 'Body (English)'}</Label>
              <Textarea value={announcementForm.body_en} onChange={(e) => setAnnouncementForm(p => ({...p, body_en: e.target.value}))} rows={4} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الجمهور' : 'Audience'}</Label>
                <Select value={announcementForm.audience} onValueChange={(v) => setAnnouncementForm(p => ({...p, audience: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isRTL ? 'الجميع' : 'Everyone'}</SelectItem>
                    <SelectItem value="teachers">{isRTL ? 'المعلمون' : 'Teachers'}</SelectItem>
                    <SelectItem value="admin_staff">{isRTL ? 'الإداريون' : 'Admin Staff'}</SelectItem>
                    <SelectItem value="hr">{isRTL ? 'الموارد البشرية' : 'HR'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الأولوية' : 'Priority'}</Label>
                <Select value={announcementForm.priority} onValueChange={(v) => setAnnouncementForm(p => ({...p, priority: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{isRTL ? 'عادي' : 'Normal'}</SelectItem>
                    <SelectItem value="important">{isRTL ? 'مهم' : 'Important'}</SelectItem>
                    <SelectItem value="urgent">{isRTL ? 'عاجل' : 'Urgent'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'جدولة النشر' : 'Schedule'}</Label>
                <Input type="datetime-local" value={announcementForm.scheduled_date} onChange={(e) => setAnnouncementForm(p => ({...p, scheduled_date: e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2"><input type="checkbox" checked={announcementForm.allow_comments} onChange={(e) => setAnnouncementForm(p => ({...p, allow_comments: e.target.checked}))} /><span className="text-sm">{isRTL ? 'السماح بالتعليقات' : 'Allow comments'}</span></label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={announcementForm.allow_reactions} onChange={(e) => setAnnouncementForm(p => ({...p, allow_reactions: e.target.checked}))} /><span className="text-sm">{isRTL ? 'السماح بالتفاعلات' : 'Allow reactions'}</span></label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAnnouncementForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveAnnouncement} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'نشر' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Survey Form Dialog */}
      <Dialog open={showSurveyForm} onOpenChange={setShowSurveyForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{surveyForm.survey_type === 'enps' ? 'eNPS Survey' : (isRTL ? 'استبيان جديد' : 'New Survey')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'العنوان (عربي)' : 'Title (Arabic)'} *</Label>
                <Input value={surveyForm.title_ar} onChange={(e) => setSurveyForm(p => ({...p, title_ar: e.target.value}))} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'العنوان (إنجليزي)' : 'Title (English)'}</Label>
                <Input value={surveyForm.title_en} onChange={(e) => setSurveyForm(p => ({...p, title_en: e.target.value}))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'النوع' : 'Type'}</Label>
                <Select value={surveyForm.survey_type} onValueChange={(v) => setSurveyForm(p => ({...p, survey_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{isRTL ? 'عام' : 'General'}</SelectItem>
                    <SelectItem value="enps">eNPS</SelectItem>
                    <SelectItem value="pulse">{isRTL ? 'نبض' : 'Pulse'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الموعد النهائي' : 'Deadline'}</Label>
                <Input type="date" value={surveyForm.deadline} onChange={(e) => setSurveyForm(p => ({...p, deadline: e.target.value}))} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2"><input type="checkbox" checked={surveyForm.is_anonymous} onChange={(e) => setSurveyForm(p => ({...p, is_anonymous: e.target.checked}))} /><span className="text-sm">{isRTL ? 'مجهول' : 'Anonymous'}</span></label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الأسئلة' : 'Questions'}</Label>
              {surveyForm.questions.map((q, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_120px] gap-2 items-center">
                  <Input value={q.question_ar} onChange={(e) => { const qs = [...surveyForm.questions]; qs[i] = {...qs[i], question_ar: e.target.value}; setSurveyForm(p => ({...p, questions: qs})); }} placeholder={isRTL ? 'السؤال بالعربي' : 'Question (AR)'} dir="rtl" />
                  <Input value={q.question_en} onChange={(e) => { const qs = [...surveyForm.questions]; qs[i] = {...qs[i], question_en: e.target.value}; setSurveyForm(p => ({...p, questions: qs})); }} placeholder="Question (EN)" />
                  <Select value={q.type} onValueChange={(v) => { const qs = [...surveyForm.questions]; qs[i] = {...qs[i], type: v}; setSurveyForm(p => ({...p, questions: qs})); }}>
                    <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rating">{isRTL ? 'تقييم' : 'Rating'}</SelectItem>
                      <SelectItem value="text">{isRTL ? 'نص' : 'Text'}</SelectItem>
                      <SelectItem value="yes_no">{isRTL ? 'نعم/لا' : 'Yes/No'}</SelectItem>
                      <SelectItem value="scale">{isRTL ? 'مقياس' : 'Scale 1-10'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addSurveyQuestion} className="w-full"><Plus className="w-3 h-3 me-1" />{isRTL ? 'إضافة سؤال' : 'Add Question'}</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSurveyForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveSurvey} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin me-2" />}
              {isRTL ? 'إنشاء' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
