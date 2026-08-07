import React, { useState, useRef } from 'react';
import { useLanguage } from '../LanguageContext';
import { tenantQuery } from '../../api/supabaseClient';
import { useTenantFilter } from '../../hooks/useTenantFilter';
import { useBranch } from '../BranchContext';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Upload, Download, CheckCircle2, XCircle, AlertCircle,
  FileSpreadsheet, Loader2, ArrowRight, Info
} from 'lucide-react';

const CSV_COLUMNS = [
  'name_ar', 'name_en', 'national_id', 'date_of_birth', 'gender', 'nationality',
  'grade', 'section', 'academic_year', 'enrollment_date', 'status',
  'guardian_name_ar', 'guardian_name_en', 'guardian_email', 'guardian_phone',
  'guardian_relationship', 'guardian_national_id',
  'emergency_contact', 'emergency_phone', 'address', 'medical_notes',
  'blood_type', 'iqama_number',
];

const REQUIRED = ['name_ar', 'grade'];

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function validateRow(row, idx) {
  const errors = [];
  for (const req of REQUIRED) {
    if (!row[req]?.trim()) errors.push(`Row ${idx + 2}: "${req}" is required`);
  }
  return errors;
}

function downloadTemplate() {
  const header = CSV_COLUMNS.join(',');
  const example = [
    'محمد أحمد العتيبي', 'Mohammed Al-Otaibi', '1234567890', '2015-09-01', 'male', 'سعودي',
    'Grade1', 'A', '2024-2025', '2024-09-01', 'active',
    'أحمد العتيبي', 'Ahmed Al-Otaibi', 'parent@example.com', '+966501234567',
    'father', '9876543210',
    'أحمد العتيبي', '+966501234567', 'الرياض', '', 'O+', '',
  ].join(',');
  const csv = `${header}\n${example}`;
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'students_import_template.csv'; a.click();
}

export default function StudentImportDialog({ open, onClose, onSuccess }) {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess } = useTenantFilter();
  const { selectedBranchId } = useBranch();
  const fileRef = useRef();

  const [step, setStep] = useState('upload'); // upload | preview | importing | done
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [results, setResults] = useState({ ok: 0, failed: 0 });
  const tt = (ar, en) => (isRTL ? ar : en);

  const reset = () => { setStep('upload'); setRows([]); setErrors([]); setResults({ ok: 0, failed: 0 }); };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows: parsed } = parseCsv(ev.target.result);
      const allErrors = parsed.flatMap((r, i) => validateRow(r, i));
      setErrors(allErrors);
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const runImport = async () => {
    setStep('importing');
    let ok = 0; let failed = 0;
    const batch = rows.filter((_, i) => validateRow(_, i).length === 0);

    for (const row of batch) {
      try {
        const studentId = `STU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        const payload = {
          student_id: studentId,
          name_ar: row.name_ar?.trim() || '',
          name_en: row.name_en?.trim() || '',
          national_id: row.national_id?.trim() || '',
          date_of_birth: row.date_of_birth?.trim() || null,
          gender: row.gender?.trim() || '',
          nationality: row.nationality?.trim() || '',
          grade: row.grade?.trim() || '',
          section: row.section?.trim() || '',
          academic_year: row.academic_year?.trim() || '',
          enrollment_date: row.enrollment_date?.trim() || new Date().toISOString().split('T')[0],
          status: row.status?.trim() || 'active',
          guardian_name_en: row.guardian_name_en?.trim() || '',
          guardian_name_ar: row.guardian_name_ar?.trim() || '',
          guardian_email: row.guardian_email?.trim() || '',
          guardian_phone: row.guardian_phone?.trim() || '',
          guardian_relationship: row.guardian_relationship?.trim() || 'parent',
          guardian_national_id: row.guardian_national_id?.trim() || '',
          emergency_contact: row.emergency_contact?.trim() || '',
          emergency_phone: row.emergency_phone?.trim() || '',
          address: row.address?.trim() || '',
          medical_notes: row.medical_notes?.trim() || '',
          blood_type: row.blood_type?.trim() || '',
          iqama_number: row.iqama_number?.trim() || '',
          branch_id: selectedBranchId || 'all',
        };
        await tenantQuery('students').insert(payload);
        ok++;
      } catch {
        failed++;
      }
    }

    setResults({ ok, failed });
    setStep('done');
    if (ok > 0) onSuccess?.();
  };

  const validCount = rows.filter((r, i) => validateRow(r, i).length === 0).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-najdi-700" />
            {tt('استيراد الطلاب من ملف', 'Import Students from File')}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-5">
            {/* Template download */}
            <div className="rounded-xl border border-najdi-100 bg-najdi-50 p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-najdi-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-najdi-900">{tt('ابدأ بتنزيل القالب', 'Start with the template')}</p>
                <p className="text-xs text-najdi-900 mt-0.5">
                  {tt('حمّل القالب، أدخل بيانات الطلاب، ثم ارفع الملف.', 'Download the template, fill in student data, then upload.')}
                </p>
                <Button size="sm" variant="outline" onClick={downloadTemplate} className="mt-2 gap-1.5 border-najdi-100 text-najdi-900 hover:bg-najdi-50">
                  <Download className="w-3.5 h-3.5" />
                  {tt('تنزيل قالب CSV', 'Download CSV Template')}
                </Button>
              </div>
            </div>

            {/* File drop zone */}
            <div
              className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-najdi-500 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-ink">{tt('اضغط لاختيار ملف CSV', 'Click to select a CSV file')}</p>
              <p className="text-xs text-muted-foreground mt-1">{tt('أو اسحب الملف وأفلته هنا', 'or drag and drop')}</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {tt('الأعمدة المطلوبة: name_ar, grade', 'Required columns: name_ar, grade')}
            </p>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" /> {validCount} {tt('صف جاهز للاستيراد', 'rows ready')}
              </div>
              {errors.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                  <XCircle className="w-4 h-4" /> {rows.length - validCount} {tt('صف يحتوي أخطاء', 'rows with errors')}
                </div>
              )}
            </div>

            {errors.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{tt('أخطاء:', 'Errors:')}</p>
                {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
              </div>
            )}

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border border-border max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-sand sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">{tt('الاسم', 'Name')}</th>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">{tt('الصف', 'Grade')}</th>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">{tt('البريد الإلكتروني للوالد', 'Guardian Email')}</th>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">{tt('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => {
                    const rowErrors = validateRow(r, i);
                    return (
                      <tr key={i} className={rowErrors.length > 0 ? 'bg-red-50' : 'hover:bg-sand'}>
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium">{r.name_ar || r.name_en || '—'}</td>
                        <td className="px-3 py-1.5">{r.grade || '—'}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.guardian_email || '—'}</td>
                        <td className="px-3 py-1.5">
                          {rowErrors.length > 0
                            ? <span className="text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" />{tt('خطأ', 'Error')}</span>
                            : <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />{tt('جاهز', 'Ready')}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 50 && <p className="text-xs text-muted-foreground text-center">{tt(`عرض أول 50 صف من ${rows.length}`, `Showing first 50 of ${rows.length} rows`)}</p>}

            <div className="flex justify-between gap-3 pt-2 border-t">
              <Button variant="outline" onClick={reset}>{tt('رجوع', 'Back')}</Button>
              <Button onClick={runImport} disabled={validCount === 0} className="gap-1.5 bg-najdi-700 hover:bg-najdi-900">
                {tt(`استيراد ${validCount} طالب`, `Import ${validCount} Students`)}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-10 h-10 text-najdi-700 animate-spin mx-auto" />
            <p className="font-semibold text-ink">{tt('جارٍ الاستيراد...', 'Importing students...')}</p>
            <p className="text-sm text-muted-foreground">{tt('قد يستغرق هذا لحظة', 'This may take a moment')}</p>
          </div>
        )}

        {step === 'done' && (
          <div className="py-10 text-center space-y-4">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <div>
              <p className="text-xl font-bold text-ink">{tt('اكتمل الاستيراد', 'Import Complete')}</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="text-emerald-600 font-semibold">{results.ok} {tt('ناجح', 'succeeded')}</span>
                {results.failed > 0 && <span className="text-red-500 font-semibold ms-2">{results.failed} {tt('فشل', 'failed')}</span>}
              </p>
            </div>
            <Button onClick={() => { reset(); onClose(); }} className="bg-najdi-900 hover:bg-najdi-900">
              {tt('إغلاق', 'Close')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
