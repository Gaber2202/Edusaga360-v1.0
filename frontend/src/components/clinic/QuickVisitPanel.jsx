/**
 * QuickVisitPanel — AC#1: Nurse logs visit + dispenses medication + notifies parent in <60s
 * Streamlined single-screen workflow, no tabs, keyboard-friendly.
 */
import React, { useState, useRef, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CheckCircle, Phone, Zap, AlertTriangle } from 'lucide-react';

const COMPLAINTS = [
  { value: 'fever', ar: 'حمى', en: 'Fever', emoji: '🌡' },
  { value: 'headache', ar: 'صداع', en: 'Headache', emoji: '🤕' },
  { value: 'stomachache', ar: 'ألم بطن', en: 'Stomachache', emoji: '🤢' },
  { value: 'injury', ar: 'إصابة', en: 'Injury', emoji: '🩹' },
  { value: 'allergy', ar: 'حساسية', en: 'Allergy', emoji: '🤧' },
  { value: 'asthma', ar: 'ربو', en: 'Asthma', emoji: '💨' },
  { value: 'other', ar: 'أخرى', en: 'Other', emoji: '⚕' },
];

const OUTCOMES = [
  { value: 'returned_to_class', ar: 'عاد للفصل', en: 'Back to Class', color: 'bg-green-500' },
  { value: 'sent_home', ar: 'أُرسل للمنزل', en: 'Sent Home', color: 'bg-amber-500' },
  { value: 'referred_to_hospital', ar: 'إحالة للمستشفى', en: 'Refer to Hospital', color: 'bg-orange-500' },
  { value: 'ambulance_called', ar: 'طلب إسعاف', en: 'Ambulance', color: 'bg-red-600' },
  { value: 'parent_called', ar: 'تم الاتصال بولي الأمر', en: 'Parent Called', color: 'bg-najdi-500' },
];

const COMMON_MEDS = ['Paracetamol 500mg', 'Ibuprofen 200mg', 'Antihistamine', 'Saline drops', 'Bandage'];

export default function QuickVisitPanel({ students, healthRecords, getTenantIdForCreate, onSaved }) {
  const { isRTL } = useLanguage();
  const searchRef = useRef(null);

  const [step, setStep] = useState(1); // 1=student, 2=vitals+complaint, 3=outcome+notify
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [healthRecord, setHealthRecord] = useState(null);
  const [complaint, setComplaint] = useState('fever');
  const [temp, setTemp] = useState('');
  const [med, setMed] = useState('');
  const [dose, setDose] = useState('');
  const [outcome, setOutcome] = useState('returned_to_class');
  const [notifyParent, setNotifyParent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const filteredStudents = studentSearch.length > 0
    ? students.filter(s =>
        s.name_ar?.includes(studentSearch) ||
        s.name_en?.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.student_id?.includes(studentSearch)
      ).slice(0, 8)
    : [];

  const selectStudent = (s) => {
    setSelectedStudent(s);
    setStudentSearch(s.name_ar);
    const hr = healthRecords.find(r => r.student_id === s.id);
    setHealthRecord(hr || null);
    setStep(2);
  };

  const handleSave = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const now = new Date();
      await tenantQuery('clinic_visits').insert({
        ...(tid && { tenant_id: tid }),
        student_id: selectedStudent.id,
        student_name: selectedStudent.name_ar,
        grade: selectedStudent.grade,
        visit_date: format(now, 'yyyy-MM-dd'),
        visit_time: format(now, 'HH:mm'),
        complaint_category: complaint,
        temperature: temp ? parseFloat(temp) : undefined,
        medication_dispensed: med,
        medication_dose: dose,
        outcome,
        parent_notified: notifyParent,
        parent_notified_time: notifyParent ? format(now, 'HH:mm') : undefined,
      });
      setSaved(true);
      toast.success(isRTL ? '✓ تم تسجيل الزيارة بنجاح' : '✓ Visit recorded successfully');
      setTimeout(() => {
        setSaved(false); setStep(1); setStudentSearch(''); setSelectedStudent(null);
        setHealthRecord(null); setComplaint('fever'); setTemp(''); setMed('');
        setDose(''); setOutcome('returned_to_class'); setNotifyParent(false);
        onSaved?.();
        searchRef.current?.focus();
      }, 1500);
    } finally { setSaving(false); }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <p className="text-lg font-semibold text-green-700">{isRTL ? 'تم الحفظ!' : 'Saved!'}</p>
        <p className="text-sm text-muted-foreground">{isRTL ? 'جاهز للزيارة التالية...' : 'Ready for next visit...'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress dots */}
      <div className="flex items-center gap-2 justify-center">
        {[1, 2, 3].map(s => (
          <div key={s} className={`h-2 rounded-full transition-all ${s === step ? 'w-8 bg-red-500' : s < step ? 'w-2 bg-green-400' : 'w-2 bg-sand-alt'}`} />
        ))}
      </div>

      {/* STEP 1: Student lookup */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground text-center">{isRTL ? 'ابحث عن الطالب بالاسم أو الرقم' : 'Search student by name or ID'}</p>
          <div className="relative">
            <Input
              ref={searchRef}
              value={studentSearch}
              onChange={e => setStudentSearch(e.target.value)}
              placeholder={isRTL ? 'اسم الطالب أو الرقم...' : 'Student name or ID...'}
              className="text-lg h-12 text-center"
              autoComplete="off"
            />
          </div>
          {filteredStudents.length > 0 && (
            <div className="border rounded-xl overflow-hidden shadow-sm">
              {filteredStudents.map(s => (
                <button key={s.id} onClick={() => selectStudent(s)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50 border-b last:border-0 transition-colors text-start">
                  <div>
                    <p className="font-semibold text-ink">{s.name_ar}</p>
                    <p className="text-xs text-muted-foreground">{s.grade} {s.section ? `· ${s.section}` : ''}</p>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{s.student_id}</div>
                </button>
              ))}
            </div>
          )}
          {studentSearch.length > 1 && filteredStudents.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-4">{isRTL ? 'لا نتائج' : 'No results'}</p>
          )}
        </div>
      )}

      {/* STEP 2: Vitals + Complaint */}
      {step === 2 && selectedStudent && (
        <div className="space-y-4">
          {/* Student header */}
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <div className="w-10 h-10 bg-red-200 rounded-full flex items-center justify-center text-red-700 font-bold text-sm">
              {selectedStudent.name_ar?.[0]}
            </div>
            <div>
              <p className="font-semibold text-red-800">{selectedStudent.name_ar}</p>
              <p className="text-xs text-red-600">{selectedStudent.grade}</p>
            </div>
            {healthRecord?.has_critical_condition && (
              <div className="ms-auto flex items-center gap-1 text-xs text-red-700 bg-red-200 px-2 py-1 rounded-lg">
                <AlertTriangle className="w-3 h-3" />
                {healthRecord.critical_condition_note?.slice(0, 30) || (isRTL ? 'حالة حرجة' : 'Critical')}
              </div>
            )}
          </div>

          {/* Allergies quick warning */}
          {healthRecord?.allergies?.length > 0 && (
            <div className="flex flex-wrap gap-1 px-1">
              {healthRecord.allergies.map((a, i) => (
                <span key={i} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  ⚠ {a.name}
                </span>
              ))}
            </div>
          )}

          {/* Complaint grid */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">{isRTL ? 'نوع الشكوى' : 'Complaint'}</p>
            <div className="grid grid-cols-4 gap-2">
              {COMPLAINTS.map(c => (
                <button key={c.value} onClick={() => setComplaint(c.value)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${complaint === c.value ? 'border-red-500 bg-red-50' : 'border-border hover:border-border'}`}>
                  <span className="text-xl">{c.emoji}</span>
                  <span className="text-xs font-medium leading-tight text-center">{isRTL ? c.ar : c.en}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Temperature */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground mb-1">{isRTL ? 'الحرارة °C' : 'Temp °C'}</p>
              <Input type="number" step="0.1" min="35" max="42" value={temp} onChange={e => setTemp(e.target.value)} placeholder="37.0" className="h-10" />
            </div>
            {temp && (
              <div className={`mt-5 px-3 py-1.5 rounded-lg text-sm font-bold ${parseFloat(temp) >= 38 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {parseFloat(temp) >= 38 ? (isRTL ? 'حمى' : 'Fever') : (isRTL ? 'طبيعي' : 'Normal')}
              </div>
            )}
          </div>

          {/* Medication */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{isRTL ? 'الدواء (اختياري)' : 'Medication (optional)'}</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_MEDS.map(m => (
                <button key={m} onClick={() => setMed(m)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${med === m ? 'bg-ink text-white border-najdi-900' : 'border-border hover:bg-sand'}`}>
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={med} onChange={e => setMed(e.target.value)} placeholder={isRTL ? 'الدواء...' : 'Medication...'} className="flex-1 h-9" />
              <Input value={dose} onChange={e => setDose(e.target.value)} placeholder={isRTL ? 'الجرعة' : 'Dose'} className="w-24 h-9" />
            </div>
          </div>

          <Button onClick={() => setStep(3)} className="w-full bg-red-600 hover:bg-red-700 text-white h-11">
            {isRTL ? 'التالي: النتيجة والإشعار' : 'Next: Outcome & Notify'} →
          </Button>
        </div>
      )}

      {/* STEP 3: Outcome + Parent Notify */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">{isRTL ? 'نتيجة الزيارة' : 'Visit Outcome'}</p>
            <div className="grid grid-cols-1 gap-2">
              {OUTCOMES.map(o => (
                <button key={o.value} onClick={() => { setOutcome(o.value); if (o.value !== 'returned_to_class') setNotifyParent(true); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${outcome === o.value ? 'border-najdi-900 bg-sand' : 'border-border hover:border-border'}`}>
                  <div className={`w-3 h-3 rounded-full ${o.color}`} />
                  <span className="font-medium text-sm">{isRTL ? o.ar : o.en}</span>
                  {outcome === o.value && <CheckCircle className="w-4 h-4 text-green-500 ms-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Parent notification toggle */}
          <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-colors ${notifyParent ? 'border-najdi-500 bg-najdi-50' : 'border-border'}`}>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-najdi-500" />
              <div>
                <p className="font-medium text-sm">{isRTL ? 'إشعار ولي الأمر' : 'Notify Parent'}</p>
                <p className="text-xs text-muted-foreground">{isRTL ? 'تسجيل الاتصال بولي الأمر' : 'Log parent contact'}</p>
              </div>
            </div>
            <button onClick={() => setNotifyParent(n => !n)}
              className={`w-12 h-6 rounded-full transition-colors relative ${notifyParent ? 'bg-najdi-500' : 'bg-sand-alt'}`}>
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${notifyParent ? 'left-6' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)} className="flex-1 h-11">← {isRTL ? 'رجوع' : 'Back'}</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-2 bg-red-600 hover:bg-red-700 text-white h-11 px-8">
              <Zap className="w-4 h-4 me-2" />
              {saving ? (isRTL ? 'جاري الحفظ...' : 'Saving...') : (isRTL ? 'حفظ الزيارة' : 'Save Visit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}