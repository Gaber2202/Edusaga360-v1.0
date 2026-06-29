/**
 * BarcodeCheckout — AC#2: Librarian checks out a book by barcode in <5 seconds.
 * Simulates barcode scanner input: any text input ending with Enter (or scan signal)
 * instantly looks up the book by ISBN and auto-selects a student by ID scan.
 */
import React, { useState, useRef, useEffect } from 'react';
import { tenantQuery } from '../../api/supabaseClient';
import { useLanguage } from '../LanguageContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Scan, BookOpen, User, CheckCircle, Zap, AlertCircle } from 'lucide-react';

const LOAN_DAYS = { regular: 14, reference: 0, novel: 7, textbook: 120 };

export default function BarcodeCheckout({ books, students, getTenantIdForCreate, onCheckedOut }) {
  const { isRTL } = useLanguage();
  const bookInputRef = useRef(null);
  const studentInputRef = useRef(null);

  const [bookScan, setBookScan] = useState('');
  const [studentScan, setStudentScan] = useState('');
  const [scannedBook, setScannedBook] = useState(null);
  const [scannedStudent, setScannedStudent] = useState(null);
  const [phase, setPhase] = useState('book'); // 'book' | 'student' | 'confirm'
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { bookInputRef.current?.focus(); }, []);
  useEffect(() => { if (phase === 'student') studentInputRef.current?.focus(); }, [phase]);

  // Book scan: match by ISBN or book ID
  const handleBookScan = (e) => {
    if (e.key !== 'Enter') return;
    const q = bookScan.trim();
    if (!q) return;
    const book = books.find(b => b.isbn === q || b.id === q || b.title_ar?.includes(q) || b.title_en?.toLowerCase().includes(q.toLowerCase()));
    if (!book) {
      setError(isRTL ? `لم يُعثر على كتاب بالباركود: ${q}` : `No book found for: ${q}`);
      setBookScan('');
      return;
    }
    if (book.available_copies <= 0) {
      setError(isRTL ? 'الكتاب غير متاح للاستعارة' : 'Book not available for loan');
      setBookScan('');
      return;
    }
    if (book.loan_type === 'reference') {
      setError(isRTL ? 'كتاب مرجعي — للقراءة داخل المكتبة فقط' : 'Reference book — in-library only');
      setBookScan('');
      return;
    }
    setError('');
    setScannedBook(book);
    setPhase('student');
  };

  // Student scan: match by student_id or national_id
  const handleStudentScan = (e) => {
    if (e.key !== 'Enter') return;
    const q = studentScan.trim();
    if (!q) return;
    const student = students.find(s => s.student_id === q || s.national_id === q || s.id === q || s.name_ar?.includes(q));
    if (!student) {
      setError(isRTL ? `لم يُعثر على طالب: ${q}` : `No student found: ${q}`);
      setStudentScan('');
      return;
    }
    setError('');
    setScannedStudent(student);
    setPhase('confirm');
  };

  const handleCheckout = async () => {
    if (!scannedBook || !scannedStudent) return;
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const today = format(new Date(), 'yyyy-MM-dd');
      const days = LOAN_DAYS[scannedBook.loan_type] || 14;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);

      await tenantQuery('library_loans').insert({
        ...(tid && { tenant_id: tid }),
        book_id: scannedBook.id,
        book_title: scannedBook.title_ar,
        book_isbn: scannedBook.isbn,
        student_id: scannedStudent.id,
        student_name: scannedStudent.name_ar,
        grade: scannedStudent.grade,
        checkout_date: today,
        due_date: format(dueDate, 'yyyy-MM-dd'),
        status: 'active',
      });
      await tenantQuery('library_books').update({
        available_copies: scannedBook.available_copies - 1,
      });

      setDone(true);
      toast.success(isRTL ? '✓ تمت الاستعارة' : '✓ Checked out!');
      setTimeout(() => {
        setDone(false); setPhase('book'); setBookScan(''); setStudentScan('');
        setScannedBook(null); setScannedStudent(null);
        onCheckedOut?.();
        bookInputRef.current?.focus();
      }, 2000);
    } finally { setSaving(false); }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <p className="text-lg font-bold text-green-700">{isRTL ? 'تمت الاستعارة!' : 'Checked Out!'}</p>
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium">{scannedBook?.title_ar}</p>
          <p>→ {scannedStudent?.name_ar}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Phase indicator */}
      <div className="flex items-center gap-1 justify-center text-xs text-muted-foreground">
        <div className={`flex items-center gap-1 px-2 py-1 rounded ${phase === 'book' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-muted-foreground'}`}>
          <BookOpen className="w-3 h-3" />
          {isRTL ? 'مسح الكتاب' : 'Scan Book'}
        </div>
        <span>→</span>
        <div className={`flex items-center gap-1 px-2 py-1 rounded ${phase === 'student' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-muted-foreground'}`}>
          <User className="w-3 h-3" />
          {isRTL ? 'مسح بطاقة الطالب' : 'Scan Student ID'}
        </div>
        <span>→</span>
        <div className={`flex items-center gap-1 px-2 py-1 rounded ${phase === 'confirm' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-muted-foreground'}`}>
          <CheckCircle className="w-3 h-3" />
          {isRTL ? 'تأكيد' : 'Confirm'}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Book scan phase */}
      {phase === 'book' && (
        <div className="space-y-3">
          <div className="text-center">
            <Scan className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
            <p className="font-semibold text-ink">{isRTL ? 'امسح باركود الكتاب أو أدخل ISBN' : 'Scan book barcode or type ISBN'}</p>
            <p className="text-xs text-muted-foreground mt-1">{isRTL ? 'اضغط Enter أو وجّه الماسح نحو الكتاب' : 'Press Enter or point scanner at book'}</p>
          </div>
          <Input
            ref={bookInputRef}
            value={bookScan}
            onChange={e => { setBookScan(e.target.value); setError(''); }}
            onKeyDown={handleBookScan}
            placeholder={isRTL ? 'ISBN أو عنوان الكتاب...' : 'ISBN or book title...'}
            className="text-center h-12 text-lg font-mono tracking-widest"
            autoComplete="off"
          />
          <p className="text-center text-xs text-muted-foreground">{isRTL ? `${books.length} كتاب في الفهرس` : `${books.length} books in catalog`}</p>
        </div>
      )}

      {/* Book confirmed, student scan */}
      {(phase === 'student' || phase === 'confirm') && scannedBook && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-indigo-500" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-indigo-800 truncate">{scannedBook.title_ar}</p>
            <p className="text-xs text-indigo-600">ISBN: {scannedBook.isbn || '—'} · {scannedBook.available_copies} {isRTL ? 'نسخة متاحة' : 'copies available'}</p>
          </div>
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
        </div>
      )}

      {phase === 'student' && (
        <div className="space-y-3">
          <div className="text-center">
            <User className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
            <p className="font-semibold text-ink">{isRTL ? 'امسح بطاقة الطالب أو أدخل رقمه' : 'Scan student ID card or type ID'}</p>
          </div>
          <Input
            ref={studentInputRef}
            value={studentScan}
            onChange={e => { setStudentScan(e.target.value); setError(''); }}
            onKeyDown={handleStudentScan}
            placeholder={isRTL ? 'رقم الطالب أو اسمه...' : 'Student ID or name...'}
            className="text-center h-12 text-lg font-mono"
            autoComplete="off"
          />
          <button onClick={() => { setPhase('book'); setScannedBook(null); setBookScan(''); }}
            className="text-xs text-muted-foreground hover:text-muted-foreground w-full text-center">
            ← {isRTL ? 'تغيير الكتاب' : 'Change book'}
          </button>
        </div>
      )}

      {/* Confirm */}
      {phase === 'confirm' && scannedBook && scannedStudent && (
        <div className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
            <User className="w-5 h-5 text-green-500" />
            <div>
              <p className="font-semibold text-green-800">{scannedStudent.name_ar}</p>
              <p className="text-xs text-green-600">{scannedStudent.grade} · ID: {scannedStudent.student_id}</p>
            </div>
            <CheckCircle className="w-5 h-5 text-green-500 ms-auto" />
          </div>

          <div className="p-4 bg-sand rounded-xl text-sm text-ink space-y-1">
            <div className="flex justify-between"><span>{isRTL ? 'الكتاب:' : 'Book:'}</span><span className="font-medium">{scannedBook.title_ar}</span></div>
            <div className="flex justify-between"><span>{isRTL ? 'الطالب:' : 'Student:'}</span><span className="font-medium">{scannedStudent.name_ar}</span></div>
            <div className="flex justify-between"><span>{isRTL ? 'مدة الاستعارة:' : 'Loan period:'}</span><span className="font-medium">{LOAN_DAYS[scannedBook.loan_type]} {isRTL ? 'يوم' : 'days'}</span></div>
          </div>

          <Button onClick={handleCheckout} disabled={saving}
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold">
            <Zap className="w-5 h-5 me-2" />
            {saving ? (isRTL ? 'جاري...' : 'Processing...') : (isRTL ? 'تأكيد الاستعارة' : 'Confirm Checkout')}
          </Button>
        </div>
      )}
    </div>
  );
}