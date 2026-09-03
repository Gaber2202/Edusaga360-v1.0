import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery, fetchData } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import StatCard from '../components/ui/StatCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Heart, Plus, Search, Activity,
  AlertTriangle, CheckCircle, Phone, Stethoscope,
  Clipboard, Pill, Shield, Zap
} from 'lucide-react';
import { logAuditEvent, AuditActions } from '../components/AuditService';
import QuickVisitPanel from '../components/clinic/QuickVisitPanel';
import { fireEvent } from '../lib/integrationBus';
import { getVaccinationSchedule } from '../api/jurisdiction';
import { useBranch } from '../components/BranchContext';
import {
  normalizeAllergies,
  normalizeConditions,
  isCriticalHealth,
  criticalNote,
  bloodTypeOf,
  parseListInput,
  allergiesToInput,
  buildClinicVisitEvent,
} from '../lib/clinicHelpers';

const COMPLAINTS = [
  { value: 'fever', ar: 'حمى', en: 'Fever' },
  { value: 'headache', ar: 'صداع', en: 'Headache' },
  { value: 'stomachache', ar: 'ألم بطن', en: 'Stomachache' },
  { value: 'injury', ar: 'إصابة', en: 'Injury' },
  { value: 'allergy', ar: 'حساسية', en: 'Allergy' },
  { value: 'asthma', ar: 'ربو', en: 'Asthma' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

const OUTCOMES = [
  { value: 'returned_to_class', ar: 'عاد للفصل', en: 'Returned to Class', cls: 'bg-green-100 text-green-700' },
  { value: 'sent_home', ar: 'أُرسل للمنزل', en: 'Sent Home', cls: 'bg-amber-100 text-amber-700' },
  { value: 'referred_to_hospital', ar: 'إحالة للمستشفى', en: 'Referred to Hospital', cls: 'bg-orange-100 text-orange-700' },
  { value: 'ambulance_called', ar: 'طلب إسعاف', en: 'Ambulance Called', cls: 'bg-red-100 text-red-700' },
  { value: 'parent_called', ar: 'تم الاتصال بولي الأمر', en: 'Parent Called', cls: 'bg-najdi-50 text-najdi-900' },
];

const BLANK_VISIT = {
  student_id: '', student_name: '', grade: '',
  visit_date: format(new Date(), 'yyyy-MM-dd'),
  visit_time: format(new Date(), 'HH:mm'),
  complaint_category: 'fever', complaint: '',
  temperature: '', blood_pressure: '', pulse: '', spo2: '',
  assessment: '', treatment_given: '', medication_dispensed: '', medication_dose: '',
  rest_start: '', rest_end: '',
  outcome: 'returned_to_class', parent_notified: false, notes: ''
};

const BLANK_HEALTH = {
  id: null,
  student_id: '',
  student_name: '',
  blood_type: '',
  allergies_text: '',
  conditions_text: '',
  vaccinations_text: '',
  has_critical_condition: false,
  critical_condition_note: '',
  insurance_company: '',
  insurance_policy_number: '',
  notes: '',
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function SchoolClinic() {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const { selectedBranchId } = useBranch();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('dashboard');
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitForm, setVisitForm] = useState(BLANK_VISIT);
  const [showHealthForm, setShowHealthForm] = useState(false);
  const [healthForm, setHealthForm] = useState(BLANK_HEALTH);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [healthStudentSearch, setHealthStudentSearch] = useState('');

  const { data: visits = [], isLoading } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['clinicVisits', tenantId],
    queryFn: () => fetchData(tenantQuery('clinic_visits').select('*').match(tenantFilter()).order('created_at', { ascending: false })),
    initialData: [],
  });

  const { data: healthRecords = [] } = useQuery({
    enabled: hasTenantAccess,
    queryKey: ['healthRecords', tenantId],
    queryFn: () => fetchData(tenantQuery('student_health_records').select('*').match(tenantFilter())),
    initialData: [],
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => fetchData(tenantQuery('students').select('*').match(tenantFilter({ status: 'active' }))),
    enabled: hasTenantAccess,
  });

  const { data: vaccinationSchedule } = useQuery({
    enabled: hasTenantAccess && tab === 'vaccinations',
    queryKey: ['vaccinationSchedule', tenantId, selectedBranchId],
    queryFn: () => getVaccinationSchedule(selectedBranchId),
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayVisits = visits.filter(v => v.visit_date === today);
  const inClinic = todayVisits.filter(v => v.outcome === 'returned_to_class' && v.rest_end === '').length;
  const sentHome = todayVisits.filter(v => v.outcome === 'sent_home').length;
  const _referrals = todayVisits.filter(v => ['referred_to_hospital', 'ambulance_called'].includes(v.outcome)).length;

  // Frequent visitors (>3 this month)
  const thisMonth = format(new Date(), 'yyyy-MM');
  const monthVisits = visits.filter(v => v.visit_date?.startsWith(thisMonth));
  const visitCounts = {};
  monthVisits.forEach(v => { visitCounts[v.student_id] = (visitCounts[v.student_id] || 0) + 1; });
  const frequentCount = Object.values(visitCounts).filter(c => c > 3).length;

  const filteredVisits = visits.filter(v => {
    const q = search.toLowerCase();
    return !q || v.student_name?.toLowerCase().includes(q) || v.complaint_category?.includes(q);
  });

  const filteredStudents = students.filter(s => {
    const q = studentSearch.toLowerCase();
    return !q || s.name_ar?.includes(studentSearch) || s.name_en?.toLowerCase().includes(q) || s.student_id?.includes(studentSearch);
  });

  const handleSaveVisit = async () => {
    if (!visitForm.student_id) return toast.error(isRTL ? 'اختر طالباً' : 'Select a student');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const student = students.find((s) => s.id === visitForm.student_id);
      const payload = {
        ...visitForm,
        temperature: visitForm.temperature ? parseFloat(visitForm.temperature) : null,
        pulse: visitForm.pulse ? parseInt(visitForm.pulse, 10) : null,
        spo2: visitForm.spo2 ? parseInt(visitForm.spo2, 10) : null,
        parent_notified_at: visitForm.parent_notified ? new Date().toISOString() : null,
        ...(tid && { tenant_id: tid }),
      };
      delete payload.complaint;
      delete payload.rest_start;
      delete payload.rest_end;

      const { data: created, error } = await tenantQuery('clinic_visits').insert(payload).select('id').single();
      if (error) throw error;

      await logAuditEvent({ action: AuditActions.CREATE, entityType: 'ClinicVisit', entityId: created?.id });
      queryClient.invalidateQueries({ queryKey: ['clinicVisits'] });
      setShowVisitForm(false);
      setVisitForm(BLANK_VISIT);
      toast.success(isRTL ? 'تم تسجيل الزيارة' : 'Visit recorded');

      fireEvent(
        'clinic_visit_completed',
        buildClinicVisitEvent({
          student,
          visit: {
            ...payload,
            complaint: COMPLAINTS.find((c) => c.value === visitForm.complaint_category)?.en || visitForm.complaint_category,
          },
          tenantId: tid,
          parentNotified: visitForm.parent_notified,
        }),
        { sourceModule: 'Clinic', tenantId: tid },
      );
    } catch (err) {
      console.error(err);
      toast.error(err.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const openHealthForm = (record = null, student = null) => {
    if (record) {
      const st = students.find((s) => s.id === record.student_id);
      setHealthForm({
        id: record.id,
        student_id: record.student_id || '',
        student_name: record.student_name || st?.name_ar || '',
        blood_type: bloodTypeOf(record, st),
        allergies_text: allergiesToInput(normalizeAllergies(record, st)),
        conditions_text: normalizeConditions(record, st).join(', '),
        vaccinations_text: Array.isArray(record.vaccinations)
          ? record.vaccinations.map((v) => v.code || v.vaccine_name || v.name).filter(Boolean).join(', ')
          : '',
        has_critical_condition: Boolean(record.has_critical_condition),
        critical_condition_note: record.critical_condition_note || '',
        insurance_company: record.insurance_company || '',
        insurance_policy_number: record.insurance_policy_number || '',
        notes: record.notes || '',
      });
      setHealthStudentSearch(record.student_name || st?.name_ar || '');
    } else {
      setHealthForm({
        ...BLANK_HEALTH,
        student_id: student?.id || '',
        student_name: student?.name_ar || '',
        blood_type: student?.blood_type || '',
        allergies_text: allergiesToInput(normalizeAllergies(null, student)),
        conditions_text: normalizeConditions(null, student).join(', '),
      });
      setHealthStudentSearch(student?.name_ar || '');
    }
    setShowHealthForm(true);
  };

  const handleSaveHealth = async () => {
    if (!healthForm.student_id) {
      toast.error(isRTL ? 'اختر طالباً' : 'Select a student');
      return;
    }
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const student = students.find((s) => s.id === healthForm.student_id);
      const allergies = parseListInput(healthForm.allergies_text).map((name) => ({ name }));
      const chronic_conditions = parseListInput(healthForm.conditions_text);
      const vaccinations = parseListInput(healthForm.vaccinations_text).map((code) => ({
        code,
        vaccine_name: code,
        status: 'complete',
      }));
      const payload = {
        student_id: healthForm.student_id,
        student_name: healthForm.student_name || student?.name_ar || student?.name_en,
        blood_type: healthForm.blood_type || null,
        allergies,
        chronic_conditions,
        vaccinations,
        has_critical_condition: Boolean(healthForm.has_critical_condition),
        critical_condition_note: healthForm.critical_condition_note || null,
        insurance_company: healthForm.insurance_company || null,
        insurance_policy_number: healthForm.insurance_policy_number || null,
        notes: healthForm.notes || null,
        updated_at: new Date().toISOString(),
        ...(tid && { tenant_id: tid }),
      };

      if (healthForm.id) {
        const { error } = await tenantQuery('student_health_records').update(payload).eq('id', healthForm.id);
        if (error) throw error;
      } else {
        const { error } = await tenantQuery('student_health_records').insert(payload);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['healthRecords'] });
      setShowHealthForm(false);
      setHealthForm(BLANK_HEALTH);
      toast.success(isRTL ? 'تم حفظ السجل الصحي' : 'Health record saved');
    } catch (err) {
      console.error(err);
      toast.error(err.message || (isRTL ? 'حدث خطأ' : 'Error occurred'));
    } finally {
      setSaving(false);
    }
  };

  const selectStudent = (s) => {
    setVisitForm((f) => ({ ...f, student_id: s.id, student_name: s.name_ar, grade: s.grade }));
    setStudentSearch(s.name_ar);
  };

  const criticalRecords = healthRecords.filter((r) => {
    const st = students.find((s) => s.id === r.student_id);
    return isCriticalHealth(r, st);
  });

  const OutcomeBadge = ({ outcome }) => {
    const cfg = OUTCOMES.find((o) => o.value === outcome) || OUTCOMES[0];
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>{isRTL ? cfg.ar : cfg.en}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{isRTL ? 'العيادة المدرسية' : 'School Clinic'}</h1>
          <p className="text-sm text-muted-foreground">{isRTL ? 'إدارة الصحة المدرسية والزيارات والسجلات الصحية' : 'Student health management, clinic visits & health records'}</p>
        </div>
        <Button onClick={() => setShowVisitForm(true)} className="bg-red-600 hover:bg-red-700 text-white">
          <Plus className="w-4 h-4 me-1" />{isRTL ? 'تسجيل زيارة' : 'Log Visit'}
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'زيارات اليوم' : "Today's Visits"} value={todayVisits.length} icon={Activity} iconClassName="bg-najdi-50" />
        <StatCard title={isRTL ? 'في العيادة الآن' : 'Currently in Clinic'} value={inClinic} icon={Stethoscope} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'أُرسلوا للمنزل' : 'Sent Home'} value={sentHome} icon={Phone} iconClassName="bg-orange-50" />
        <StatCard title={isRTL ? 'مراجعون متكررون' : 'Frequent Visitors'} value={frequentCount} icon={AlertTriangle} iconClassName="bg-red-50" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="quick"><Zap className="w-4 h-4 me-1 text-red-500" />{isRTL ? 'تسجيل سريع' : 'Quick Log'}</TabsTrigger>
          <TabsTrigger value="dashboard"><Activity className="w-4 h-4 me-1" />{isRTL ? 'لوحة التحكم' : 'Dashboard'}</TabsTrigger>
          <TabsTrigger value="visits"><Clipboard className="w-4 h-4 me-1" />{isRTL ? 'سجل الزيارات' : 'Visit Log'}</TabsTrigger>
          <TabsTrigger value="health"><Shield className="w-4 h-4 me-1" />{isRTL ? 'السجلات الصحية' : 'Health Records'}</TabsTrigger>
          <TabsTrigger value="vaccinations"><Pill className="w-4 h-4 me-1" />{isRTL ? 'التطعيمات' : 'Vaccinations'}</TabsTrigger>
        </TabsList>

        {/* QUICK LOG */}
        <TabsContent value="quick" className="mt-4">
          <div className="max-w-md mx-auto bg-white border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="w-5 h-5 text-red-500" />
              <h2 className="font-semibold text-ink">{isRTL ? 'تسجيل زيارة سريع — أقل من 60 ثانية' : 'Quick Visit Log — Under 60 Seconds'}</h2>
            </div>
            <QuickVisitPanel
              students={students}
              healthRecords={healthRecords}
              getTenantIdForCreate={getTenantIdForCreate}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ['clinicVisits'] })}
            />
          </div>
        </TabsContent>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isRTL ? 'زيارات اليوم' : "Today's Visits"}</CardTitle></CardHeader>
              <CardContent>
                {todayVisits.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">{isRTL ? 'لا زيارات اليوم' : 'No visits today'}</p>
                ) : (
                  <div className="space-y-2">
                    {todayVisits.slice(0, 6).map(v => (
                      <div key={v.id} className="flex items-center justify-between p-2 bg-sand rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{v.student_name}</p>
                          <p className="text-xs text-muted-foreground">{v.visit_time} · {COMPLAINTS.find(c => c.value === v.complaint_category)?.[isRTL ? 'ar' : 'en']}</p>
                        </div>
                        <OutcomeBadge outcome={v.outcome} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isRTL ? 'إحصائيات هذا الشهر' : 'This Month Statistics'}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {COMPLAINTS.map(c => {
                  const count = monthVisits.filter(v => v.complaint_category === c.value).length;
                  const pct = monthVisits.length > 0 ? (count / monthVisits.length * 100) : 0;
                  return (
                    <div key={c.value}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{isRTL ? c.ar : c.en}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                      <div className="h-2 bg-sand-alt rounded-full">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Critical health alerts */}
          {criticalRecords.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  {isRTL ? 'تنبيهات صحية عاجلة' : 'Critical Health Alerts'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {criticalRecords.map((r) => {
                    const st = students.find((s) => s.id === r.student_id);
                    return (
                      <div key={r.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="font-medium text-red-800 text-sm">{r.student_name || st?.name_ar}</p>
                        <p className="text-xs text-red-600">{criticalNote(r, st) || (isRTL ? 'حالة حرجة' : 'Critical condition')}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* VISIT LOG */}
        <TabsContent value="visits" className="mt-4 space-y-4">
          <div className="relative max-w-72">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input placeholder={isRTL ? 'بحث...' : 'Search...'} value={search} onChange={e => setSearch(e.target.value)} className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9`} />
          </div>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{isRTL ? 'التاريخ والوقت' : 'Date & Time'}</TableHead>
                    <TableHead>{isRTL ? 'الشكوى' : 'Complaint'}</TableHead>
                    <TableHead>{isRTL ? 'الحرارة' : 'Temp'}</TableHead>
                    <TableHead>{isRTL ? 'العلاج' : 'Treatment'}</TableHead>
                    <TableHead>{isRTL ? 'النتيجة' : 'Outcome'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10"><div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filteredVisits.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{isRTL ? 'لا توجد زيارات' : 'No visits found'}</TableCell></TableRow>
                  ) : filteredVisits.map(v => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{v.student_name}</p>
                        <p className="text-xs text-muted-foreground">{v.grade}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.visit_date} {v.visit_time}</TableCell>
                      <TableCell><span className="text-sm">{COMPLAINTS.find(c => c.value === v.complaint_category)?.[isRTL ? 'ar' : 'en']}</span></TableCell>
                      <TableCell>{v.temperature ? <span className={`text-sm font-medium ${v.temperature > 38 ? 'text-red-600' : 'text-ink'}`}>{v.temperature}°C</span> : '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{v.treatment_given || '-'}</TableCell>
                      <TableCell><OutcomeBadge outcome={v.outcome} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* HEALTH RECORDS */}
        <TabsContent value="health" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openHealthForm()} className="bg-red-600 hover:bg-red-700 text-white">
              <Plus className="w-4 h-4 me-1" />
              {isRTL ? 'سجل صحي جديد' : 'New Health Record'}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {healthRecords.map((r) => {
              const st = students.find((s) => s.id === r.student_id);
              const allergies = normalizeAllergies(r, st);
              const conditions = normalizeConditions(r, st);
              const critical = isCriticalHealth(r, st);
              return (
                <Card key={r.id} className={critical ? 'border-red-300' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-ink">{r.student_name || st?.name_ar || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          {isRTL ? 'فصيلة الدم:' : 'Blood type:'} {bloodTypeOf(r, st) || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {critical && <AlertTriangle className="w-5 h-5 text-red-500" />}
                        <Button size="sm" variant="ghost" onClick={() => openHealthForm(r, st)}>
                          {isRTL ? 'تعديل' : 'Edit'}
                        </Button>
                      </div>
                    </div>
                    {allergies.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'الحساسية:' : 'Allergies:'}</p>
                        <div className="flex flex-wrap gap-1">
                          {allergies.map((a, i) => (
                            <span key={`${a.name}-${i}`} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{a.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {conditions.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{isRTL ? 'الأمراض المزمنة:' : 'Conditions:'}</p>
                        <div className="flex flex-wrap gap-1">
                          {conditions.map((c, i) => (
                            <span key={`${c}-${i}`} className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {(r.insurance_company || r.insurance_policy_number) && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {r.insurance_company}{r.insurance_policy_number ? ` · ${r.insurance_policy_number}` : ''}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {healthRecords.length === 0 && (
              <div className="col-span-3 text-center py-12 text-muted-foreground space-y-3">
                <p>{isRTL ? 'لا توجد سجلات صحية بعد' : 'No health records yet'}</p>
                <Button variant="outline" onClick={() => openHealthForm()}>
                  {isRTL ? 'إنشاء أول سجل' : 'Create first record'}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* VACCINATIONS — pack schedule vs student records (SCRUM-137) */}
        <TabsContent value="vaccinations" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>{isRTL ? 'جدول التطعيمات الإلزامي' : 'Jurisdiction Vaccination Schedule'}</span>
                {vaccinationSchedule?.source && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {(isRTL ? vaccinationSchedule.source.name_ar : vaccinationSchedule.source.name_en)
                      || vaccinationSchedule.source.authority}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!vaccinationSchedule?.vaccines?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {isRTL ? 'لا يتوفر جدول تطعيم لهذه الولاية القضائية' : 'No vaccination schedule for this jurisdiction'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'اللقاح' : 'Vaccine'}</TableHead>
                      <TableHead>{isRTL ? 'العمر المستهدف' : 'Target age'}</TableHead>
                      <TableHead>{isRTL ? 'الجرعات' : 'Doses'}</TableHead>
                      <TableHead>{isRTL ? 'إلزامي' : 'Required'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vaccinationSchedule.vaccines.map((v) => (
                      <TableRow key={v.code}>
                        <TableCell className="text-sm font-medium">
                          {isRTL ? v.name_ar : v.name_en}
                          <span className="ms-2 text-[10px] text-muted-foreground font-mono">{v.code}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {isRTL ? v.age_label_ar : v.age_label_en}
                        </TableCell>
                        <TableCell className="text-xs">{v.doses ?? '—'}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.required ? 'bg-najdi-50 text-najdi-900' : 'bg-sand-alt text-ink'}`}>
                            {v.required ? (isRTL ? 'إلزامي' : 'Required') : (isRTL ? 'اختياري' : 'Optional')}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isRTL ? 'مقارنة بسجلات الطلاب' : 'Student Records vs Schedule'}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{isRTL ? 'اللقاح (الجدول)' : 'Schedule vaccine'}</TableHead>
                    <TableHead>{isRTL ? 'في السجل' : 'On record'}</TableHead>
                    <TableHead>{isRTL ? 'تاريخ الإعطاء' : 'Date given'}</TableHead>
                    <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const scheduleVaccines = vaccinationSchedule?.vaccines || [];
                    const studentById = Object.fromEntries(students.map((s) => [s.id, s]));
                    const rows = [];

                    const recordsToDiff = healthRecords;
                    if (recordsToDiff.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                            {isRTL
                              ? 'لا توجد سجلات صحية للمقارنة — أضف سجلاً من تبويب السجلات الصحية'
                              : 'No health records to compare — add one from the Health Records tab'}
                          </TableCell>
                        </TableRow>
                      );
                    }

                    for (const r of recordsToDiff) {
                      const student = studentById[r.student_id];
                      const studentName = r.student_name
                        || (isRTL
                          ? (student?.name_ar || student?.full_name_ar || student?.name_en)
                          : (student?.name_en || student?.full_name_en || student?.name_ar))
                        || '—';
                      const recorded = Array.isArray(r.vaccinations) ? r.vaccinations : [];

                      const matchRecord = (vaccine) => recorded.find((vac) => {
                        const code = (vac.code || vac.vaccine_code || '').toLowerCase();
                        const name = (vac.vaccine_name || vac.name || '').toLowerCase();
                        return code === vaccine.code.toLowerCase()
                          || name.includes(vaccine.name_en.toLowerCase())
                          || name.includes((vaccine.name_ar || '').toLowerCase());
                      });

                      if (scheduleVaccines.length === 0) {
                        for (let i = 0; i < recorded.length; i++) {
                          const vac = recorded[i];
                          rows.push(
                            <TableRow key={`${r.id}-rec-${i}`}>
                              <TableCell className="text-sm font-medium">{studentName}</TableCell>
                              <TableCell className="text-sm">{vac.vaccine_name || vac.code || '—'}</TableCell>
                              <TableCell className="text-xs">{isRTL ? 'نعم' : 'Yes'}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{vac.date_given || '-'}</TableCell>
                              <TableCell>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${vac.status === 'complete' ? 'bg-green-100 text-green-700' : vac.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {vac.status || 'pending'}
                                </span>
                              </TableCell>
                            </TableRow>,
                          );
                        }
                        continue;
                      }

                      for (const vaccine of scheduleVaccines) {
                        if (!vaccine.required && !matchRecord(vaccine)) continue;
                        const vac = matchRecord(vaccine);
                        const status = vac
                          ? (vac.status === 'overdue' ? 'overdue' : 'complete')
                          : (vaccine.required ? 'missing' : 'optional');
                        const statusCls = status === 'complete'
                          ? 'bg-green-100 text-green-700'
                          : status === 'overdue' || status === 'missing'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700';
                        const statusLabel = {
                          complete: isRTL ? 'مكتمل' : 'Complete',
                          overdue: isRTL ? 'متأخر' : 'Overdue',
                          missing: isRTL ? 'ناقص' : 'Missing',
                          optional: isRTL ? 'اختياري' : 'Optional',
                        }[status];

                        rows.push(
                          <TableRow key={`${r.id}-${vaccine.code}`}>
                            <TableCell className="text-sm font-medium">{studentName}</TableCell>
                            <TableCell className="text-sm">{isRTL ? vaccine.name_ar : vaccine.name_en}</TableCell>
                            <TableCell className="text-xs">{vac ? (isRTL ? 'نعم' : 'Yes') : (isRTL ? 'لا' : 'No')}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{vac?.date_given || '-'}</TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCls}`}>
                                {statusLabel}
                              </span>
                            </TableCell>
                          </TableRow>,
                        );
                      }
                    }

                    if (rows.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                            {isRTL ? 'لا بيانات تطعيم للمقارنة' : 'No vaccination data to compare'}
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return rows;
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Visit Form Dialog */}
      <Dialog open={showVisitForm} onOpenChange={setShowVisitForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              {isRTL ? 'تسجيل زيارة عيادة' : 'Log Clinic Visit'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Student search */}
            <div className="space-y-2">
              <Label>{isRTL ? 'الطالب *' : 'Student *'}</Label>
              <Input
                placeholder={isRTL ? 'ابحث عن الطالب...' : 'Search student...'}
                value={studentSearch}
                onChange={e => { setStudentSearch(e.target.value); setVisitForm(f => ({ ...f, student_id: '', student_name: '' })); }}
              />
              {studentSearch && !visitForm.student_id && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {filteredStudents.slice(0, 8).map(s => (
                    <button key={s.id} onClick={() => selectStudent(s)} className="w-full text-start px-3 py-2 hover:bg-sand text-sm border-b last:border-0">
                      <span className="font-medium">{s.name_ar}</span>
                      <span className="text-muted-foreground ms-2">{s.grade}</span>
                    </button>
                  ))}
                </div>
              )}
              {visitForm.student_name && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {visitForm.student_name} — {visitForm.grade}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'التاريخ' : 'Date'}</Label>
                <Input type="date" value={visitForm.visit_date} onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الوقت' : 'Time'}</Label>
                <Input type="time" value={visitForm.visit_time} onChange={e => setVisitForm(f => ({ ...f, visit_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'نوع الشكوى' : 'Complaint Type'}</Label>
                <Select value={visitForm.complaint_category} onValueChange={v => setVisitForm(f => ({ ...f, complaint_category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMPLAINTS.map(c => <SelectItem key={c.value} value={c.value}>{isRTL ? c.ar : c.en}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'درجة الحرارة (°C)' : 'Temperature (°C)'}</Label>
                <Input type="number" step="0.1" value={visitForm.temperature} onChange={e => setVisitForm(f => ({ ...f, temperature: e.target.value }))} placeholder="36.5" />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'النبض' : 'Pulse'}</Label>
                <Input type="number" value={visitForm.pulse} onChange={e => setVisitForm(f => ({ ...f, pulse: e.target.value }))} placeholder="72" />
              </div>
              <div className="space-y-2">
                <Label>SpO2 %</Label>
                <Input type="number" value={visitForm.spo2} onChange={e => setVisitForm(f => ({ ...f, spo2: e.target.value }))} placeholder="98" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'التقييم' : 'Assessment'}</Label>
              <Textarea rows={2} value={visitForm.assessment} onChange={e => setVisitForm(f => ({ ...f, assessment: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الدواء المُعطى' : 'Medication Given'}</Label>
                <Input value={visitForm.medication_dispensed} onChange={e => setVisitForm(f => ({ ...f, medication_dispensed: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الجرعة' : 'Dose'}</Label>
                <Input value={visitForm.medication_dose} onChange={e => setVisitForm(f => ({ ...f, medication_dose: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{isRTL ? 'النتيجة *' : 'Outcome *'}</Label>
              <Select value={visitForm.outcome} onValueChange={(v) => setVisitForm((f) => ({
                ...f,
                outcome: v,
                parent_notified: v !== 'returned_to_class' ? true : f.parent_notified,
              }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{isRTL ? o.ar : o.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={visitForm.parent_notified}
                onChange={(e) => setVisitForm((f) => ({ ...f, parent_notified: e.target.checked }))}
              />
              {isRTL ? 'إشعار ولي الأمر (واتساب)' : 'Notify parent (WhatsApp)'}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVisitForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveVisit} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {isRTL ? 'حفظ الزيارة' : 'Save Visit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showHealthForm} onOpenChange={setShowHealthForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {healthForm.id
                ? (isRTL ? 'تعديل السجل الصحي' : 'Edit Health Record')
                : (isRTL ? 'سجل صحي جديد' : 'New Health Record')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الطالب *' : 'Student *'}</Label>
              <Input
                placeholder={isRTL ? 'ابحث عن الطالب...' : 'Search student...'}
                value={healthStudentSearch}
                onChange={(e) => {
                  setHealthStudentSearch(e.target.value);
                  setHealthForm((f) => ({ ...f, student_id: '', student_name: '' }));
                }}
                disabled={Boolean(healthForm.id)}
              />
              {healthStudentSearch && !healthForm.student_id && !healthForm.id && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {students
                    .filter((s) =>
                      s.name_ar?.includes(healthStudentSearch)
                      || s.name_en?.toLowerCase().includes(healthStudentSearch.toLowerCase())
                      || s.student_id?.includes(healthStudentSearch))
                    .slice(0, 8)
                    .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setHealthForm((f) => ({
                            ...f,
                            student_id: s.id,
                            student_name: s.name_ar,
                            blood_type: f.blood_type || s.blood_type || '',
                            allergies_text: f.allergies_text || allergiesToInput(normalizeAllergies(null, s)),
                            conditions_text: f.conditions_text || normalizeConditions(null, s).join(', '),
                          }));
                          setHealthStudentSearch(s.name_ar);
                        }}
                        className="w-full text-start px-3 py-2 hover:bg-sand text-sm border-b last:border-0"
                      >
                        <span className="font-medium">{s.name_ar}</span>
                        <span className="text-muted-foreground ms-2">{s.grade}</span>
                      </button>
                    ))}
                </div>
              )}
              {healthForm.student_name && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {healthForm.student_name}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'فصيلة الدم' : 'Blood type'}</Label>
              <Select value={healthForm.blood_type || 'none'} onValueChange={(v) => setHealthForm((f) => ({ ...f, blood_type: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {BLOOD_TYPES.map((bt) => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الحساسية (مفصولة بفاصلة)' : 'Allergies (comma-separated)'}</Label>
              <Textarea rows={2} value={healthForm.allergies_text} onChange={(e) => setHealthForm((f) => ({ ...f, allergies_text: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الأمراض المزمنة' : 'Chronic conditions'}</Label>
              <Textarea rows={2} value={healthForm.conditions_text} onChange={(e) => setHealthForm((f) => ({ ...f, conditions_text: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'التطعيمات (رموز/أسماء)' : 'Vaccinations (codes/names)'}</Label>
              <Textarea rows={2} value={healthForm.vaccinations_text} onChange={(e) => setHealthForm((f) => ({ ...f, vaccinations_text: e.target.value }))} placeholder="BCG, MMR, HepB" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={healthForm.has_critical_condition}
                onChange={(e) => setHealthForm((f) => ({ ...f, has_critical_condition: e.target.checked }))}
              />
              {isRTL ? 'حالة حرجة / تنبيه عاجل' : 'Critical condition alert'}
            </label>
            {healthForm.has_critical_condition && (
              <div className="space-y-2">
                <Label>{isRTL ? 'ملاحظة الحالة الحرجة' : 'Critical note'}</Label>
                <Textarea rows={2} value={healthForm.critical_condition_note} onChange={(e) => setHealthForm((f) => ({ ...f, critical_condition_note: e.target.value }))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{isRTL ? 'شركة التأمين' : 'Insurance company'}</Label>
                <Input value={healthForm.insurance_company} onChange={(e) => setHealthForm((f) => ({ ...f, insurance_company: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'رقم البوليصة' : 'Policy number'}</Label>
                <Input value={healthForm.insurance_policy_number} onChange={(e) => setHealthForm((f) => ({ ...f, insurance_policy_number: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea rows={2} value={healthForm.notes} onChange={(e) => setHealthForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHealthForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveHealth} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}