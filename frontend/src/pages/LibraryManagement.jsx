import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useTenantFilter } from '../hooks/useTenantFilter';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Card } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import StatCard from '../components/ui/StatCard';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { BookOpen, Plus, Search, AlertTriangle, RotateCcw, BookMarked, Scan } from 'lucide-react';
import BarcodeCheckout from '../components/library/BarcodeCheckout';

const LOAN_DAYS = { regular: 14, reference: 0, novel: 7, textbook: 120 };
const LANG_OPTIONS = [
  { value: 'arabic', ar: 'عربي', en: 'Arabic' },
  { value: 'english', ar: 'إنجليزي', en: 'English' },
  { value: 'french', ar: 'فرنسي', en: 'French' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];
const LOAN_TYPES = [
  { value: 'regular', ar: 'عادي', en: 'Regular', days: 14 },
  { value: 'reference', ar: 'مرجعي', en: 'Reference', days: 0 },
  { value: 'novel', ar: 'رواية', en: 'Novel', days: 7 },
  { value: 'textbook', ar: 'كتاب مدرسي', en: 'Textbook', days: 120 },
];

const BLANK_BOOK = { isbn: '', title_ar: '', title_en: '', author: '', publisher: '', year: new Date().getFullYear(), language: 'arabic', category: '', total_copies: 1, available_copies: 1, shelf_location: '', loan_type: 'regular', replacement_cost: 0 };

export default function LibraryManagement() {
  const { isRTL } = useLanguage();
  const { tenantFilter, tenantId, hasTenantAccess, getTenantIdForCreate } = useTenantFilter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('catalog');
  const [showBookForm, setShowBookForm] = useState(false);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [bookForm, setBookForm] = useState(BLANK_BOOK);
  const [editingBook, setEditingBook] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [checkoutData, setCheckoutData] = useState({ book_id: '', student_id: '', student_name: '' });
  const [bookSearch, setBookSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['libraryBooks', tenantId],
    queryFn: () => tenantQuery('library_books').select('*').match(tenantFilter()),
    enabled: hasTenantAccess,
  });

  const { data: loans = [] } = useQuery({
    queryKey: ['libraryLoans', tenantId],
    queryFn: () => tenantQuery('library_loans').select('*').match(tenantFilter(), '-created_date'),
    enabled: hasTenantAccess,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', tenantId],
    queryFn: () => tenantQuery('students').select('*').match(tenantFilter({ status: 'active' })),
    enabled: hasTenantAccess,
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const activeLoans = loans.filter(l => l.status === 'active');
  const overdueLoans = loans.filter(l => l.status === 'active' && l.due_date < today);
  const totalBooks = books.reduce((s, b) => s + (b.total_copies || 1), 0);
  const availableBooks = books.reduce((s, b) => s + (b.available_copies || 0), 0);

  const filteredBooks = books.filter(b => {
    const q = search.toLowerCase();
    return !q || b.title_ar?.includes(search) || b.title_en?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q) || b.isbn?.includes(search);
  });

  const handleSaveBook = async () => {
    if (!bookForm.title_ar) return toast.error(isRTL ? 'أدخل عنوان الكتاب' : 'Enter book title');
    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      if (editingBook) {
        await tenantQuery('library_books').update(bookForm);
      } else {
        await tenantQuery('library_books').insert({ ...bookForm, ...(tid && { tenant_id: tid }) });
      }
      queryClient.invalidateQueries({ queryKey: ['libraryBooks'] });
      setShowBookForm(false);
      setBookForm(BLANK_BOOK);
      setEditingBook(null);
      toast.success(isRTL ? 'تم الحفظ' : 'Saved');
    } finally { setSaving(false); }
  };

  const handleCheckout = async () => {
    if (!checkoutData.book_id || !checkoutData.student_id) return toast.error(isRTL ? 'اختر كتاباً وطالباً' : 'Select book and student');
    const book = books.find(b => b.id === checkoutData.book_id);
    if (!book || book.available_copies <= 0) return toast.error(isRTL ? 'الكتاب غير متاح' : 'Book not available');
    if (book.loan_type === 'reference') return toast.error(isRTL ? 'كتاب مرجعي — للقراءة داخل المكتبة فقط' : 'Reference book — in-library use only');

    setSaving(true);
    try {
      const tid = getTenantIdForCreate();
      const days = LOAN_DAYS[book.loan_type] || 14;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      const student = students.find(s => s.id === checkoutData.student_id);
      await tenantQuery('library_loans').insert({
        ...(tid && { tenant_id: tid }),
        book_id: book.id, book_title: book.title_ar, book_isbn: book.isbn,
        student_id: checkoutData.student_id, student_name: student?.name_ar,
        grade: student?.grade,
        checkout_date: today, due_date: format(dueDate, 'yyyy-MM-dd'),
        status: 'active',
      });
      await tenantQuery('library_books').update({ available_copies: book.available_copies - 1 });
      queryClient.invalidateQueries({ queryKey: ['libraryBooks', 'libraryLoans'] });
      setShowCheckoutForm(false);
      setCheckoutData({ book_id: '', student_id: '', student_name: '' });
      toast.success(isRTL ? 'تم الاستعارة بنجاح' : 'Checked out successfully');
    } finally { setSaving(false); }
  };

  const handleReturn = async (loan) => {
    const book = books.find(b => b.id === loan.book_id);
    const daysLate = loan.due_date < today ? differenceInDays(new Date(today), new Date(loan.due_date)) : 0;
    const fine = daysLate * 1; // SAR 1/day
    await tenantQuery('library_loans').update({ status: 'returned', return_date: today, fine_amount: fine });
    if (book) await tenantQuery('library_books').update({ available_copies: (book.available_copies || 0) + 1 });
    queryClient.invalidateQueries({ queryKey: ['libraryBooks', 'libraryLoans'] });
    toast.success(isRTL ? `تم الإرجاع${fine > 0 ? ` — غرامة: ${fine} ر.س` : ''}` : `Returned${fine > 0 ? ` — Fine: ${fine} SAR` : ''}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{isRTL ? 'إدارة المكتبة' : 'Library Management'}</h1>
          <p className="text-sm text-slate-500">{isRTL ? 'فهرس الكتب، الاستعارة، والتقارير' : 'Book catalog, circulation & reports'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCheckoutForm(true)}>
            <BookMarked className="w-4 h-4 me-1" />{isRTL ? 'استعارة' : 'Checkout'}
          </Button>
          <Button onClick={() => { setEditingBook(null); setBookForm(BLANK_BOOK); setShowBookForm(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="w-4 h-4 me-1" />{isRTL ? 'إضافة كتاب' : 'Add Book'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title={isRTL ? 'إجمالي الكتب' : 'Total Books'} value={totalBooks} icon={BookOpen} iconClassName="bg-indigo-50" />
        <StatCard title={isRTL ? 'متاح للاستعارة' : 'Available'} value={availableBooks} icon={BookOpen} iconClassName="bg-green-50" />
        <StatCard title={isRTL ? 'مستعار حالياً' : 'On Loan'} value={activeLoans.length} icon={BookMarked} iconClassName="bg-amber-50" />
        <StatCard title={isRTL ? 'متأخرة' : 'Overdue'} value={overdueLoans.length} icon={AlertTriangle} iconClassName="bg-red-50" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border">
          <TabsTrigger value="scan"><Scan className="w-4 h-4 me-1 text-indigo-500" />{isRTL ? 'مسح سريع' : 'Quick Scan'}</TabsTrigger>
          <TabsTrigger value="catalog"><BookOpen className="w-4 h-4 me-1" />{isRTL ? 'الفهرس' : 'Catalog'}</TabsTrigger>
          <TabsTrigger value="loans"><BookMarked className="w-4 h-4 me-1" />{isRTL ? 'الاستعارات' : 'Loans'}</TabsTrigger>
          <TabsTrigger value="overdue"><AlertTriangle className="w-4 h-4 me-1" />{isRTL ? 'المتأخرة' : 'Overdue'} {overdueLoans.length > 0 && <span className="ms-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{overdueLoans.length}</span>}</TabsTrigger>
        </TabsList>

        {/* QUICK SCAN */}
        <TabsContent value="scan" className="mt-4">
          <div className="max-w-md mx-auto bg-white border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Scan className="w-5 h-5 text-indigo-500" />
              <h2 className="font-semibold text-slate-700">{isRTL ? 'استعارة بالباركود — أقل من 5 ثوانٍ' : 'Barcode Checkout — Under 5 Seconds'}</h2>
            </div>
            <BarcodeCheckout
              books={books}
              students={students}
              getTenantIdForCreate={getTenantIdForCreate}
              onCheckedOut={() => queryClient.invalidateQueries({ queryKey: ['libraryBooks', 'libraryLoans'] })}
            />
          </div>
        </TabsContent>

        {/* CATALOG */}
        <TabsContent value="catalog" className="mt-4 space-y-4">
          <div className="relative max-w-72">
            <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
            <Input placeholder={isRTL ? 'بحث بالعنوان أو المؤلف...' : 'Search by title or author...'} value={search} onChange={e => setSearch(e.target.value)} className={`${isRTL ? 'pr-9' : 'pl-9'} bg-white h-9`} />
          </div>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'العنوان' : 'Title'}</TableHead>
                    <TableHead>{isRTL ? 'المؤلف' : 'Author'}</TableHead>
                    <TableHead>{isRTL ? 'اللغة' : 'Language'}</TableHead>
                    <TableHead>{isRTL ? 'الفئة' : 'Category'}</TableHead>
                    <TableHead>{isRTL ? 'متاح / إجمالي' : 'Avail / Total'}</TableHead>
                    <TableHead>{isRTL ? 'الموقع' : 'Location'}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filteredBooks.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-slate-400">{isRTL ? 'لا توجد كتب' : 'No books found'}</TableCell></TableRow>
                  ) : filteredBooks.map(b => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{b.title_ar}</p>
                        {b.title_en && <p className="text-xs text-slate-400">{b.title_en}</p>}
                        {b.isbn && <p className="text-xs text-slate-300 font-mono">{b.isbn}</p>}
                      </TableCell>
                      <TableCell className="text-sm">{b.author}</TableCell>
                      <TableCell><span className="text-xs px-2 py-0.5 bg-slate-100 rounded">{LANG_OPTIONS.find(l => l.value === b.language)?.[isRTL ? 'ar' : 'en']}</span></TableCell>
                      <TableCell className="text-sm text-slate-600">{b.category}</TableCell>
                      <TableCell>
                        <span className={`font-semibold ${b.available_copies === 0 ? 'text-red-500' : 'text-green-600'}`}>{b.available_copies}</span>
                        <span className="text-slate-400"> / {b.total_copies}</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{b.shelf_location}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingBook(b); setBookForm({ ...b }); setShowBookForm(true); }}>{isRTL ? 'تعديل' : 'Edit'}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* LOANS */}
        <TabsContent value="loans" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isRTL ? 'الكتاب' : 'Book'}</TableHead>
                    <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                    <TableHead>{isRTL ? 'تاريخ الاستعارة' : 'Checkout'}</TableHead>
                    <TableHead>{isRTL ? 'تاريخ الإرجاع' : 'Due Date'}</TableHead>
                    <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loans.slice(0, 50).map(l => {
                    const overdue = l.status === 'active' && l.due_date < today;
                    return (
                      <TableRow key={l.id} className={overdue ? 'bg-red-50/30' : ''}>
                        <TableCell className="text-sm font-medium">{l.book_title}</TableCell>
                        <TableCell>
                          <p className="text-sm">{l.student_name}</p>
                          <p className="text-xs text-slate-400">{l.grade}</p>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">{l.checkout_date}</TableCell>
                        <TableCell>
                          <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-600'}`}>{l.due_date}</span>
                          {overdue && <p className="text-xs text-red-500">{differenceInDays(new Date(), new Date(l.due_date))} {isRTL ? 'يوم تأخر' : 'days late'}</p>}
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.status === 'returned' ? 'bg-green-100 text-green-700' : overdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {l.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {l.status === 'active' && (
                            <Button size="sm" variant="outline" onClick={() => handleReturn(l)} className="h-7 text-xs">
                              <RotateCcw className="w-3 h-3 me-1" />{isRTL ? 'إرجاع' : 'Return'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* OVERDUE */}
        <TabsContent value="overdue" className="mt-4">
          {overdueLoans.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>{isRTL ? 'لا توجد استعارات متأخرة' : 'No overdue loans'}</p>
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isRTL ? 'الطالب' : 'Student'}</TableHead>
                      <TableHead>{isRTL ? 'الكتاب' : 'Book'}</TableHead>
                      <TableHead>{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</TableHead>
                      <TableHead>{isRTL ? 'أيام التأخر' : 'Days Late'}</TableHead>
                      <TableHead>{isRTL ? 'الغرامة المقدرة' : 'Est. Fine'}</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueLoans.map(l => {
                      const days = differenceInDays(new Date(), new Date(l.due_date));
                      return (
                        <TableRow key={l.id}>
                          <TableCell><p className="font-medium text-sm">{l.student_name}</p><p className="text-xs text-slate-400">{l.grade}</p></TableCell>
                          <TableCell className="text-sm">{l.book_title}</TableCell>
                          <TableCell className="text-xs text-red-600 font-medium">{l.due_date}</TableCell>
                          <TableCell><span className="text-red-600 font-bold">{days}</span></TableCell>
                          <TableCell><span className="font-semibold">{days} SAR</span></TableCell>
                          <TableCell><Button size="sm" variant="outline" onClick={() => handleReturn(l)} className="h-7 text-xs"><RotateCcw className="w-3 h-3 me-1" />{isRTL ? 'إرجاع' : 'Return'}</Button></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Book Form */}
      <Dialog open={showBookForm} onOpenChange={setShowBookForm}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingBook ? (isRTL ? 'تعديل كتاب' : 'Edit Book') : (isRTL ? 'إضافة كتاب' : 'Add Book')}</DialogTitle></DialogHeader>
          <div className="space-y-3 grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>{isRTL ? 'العنوان (عربي) *' : 'Title (Arabic) *'}</Label><Input value={bookForm.title_ar} onChange={e => setBookForm(f => ({ ...f, title_ar: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{isRTL ? 'العنوان (إنجليزي)' : 'Title (English)'}</Label><Input value={bookForm.title_en} onChange={e => setBookForm(f => ({ ...f, title_en: e.target.value }))} /></div>
            <div className="space-y-1"><Label>ISBN</Label><Input value={bookForm.isbn} onChange={e => setBookForm(f => ({ ...f, isbn: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{isRTL ? 'المؤلف' : 'Author'}</Label><Input value={bookForm.author} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{isRTL ? 'الناشر' : 'Publisher'}</Label><Input value={bookForm.publisher} onChange={e => setBookForm(f => ({ ...f, publisher: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{isRTL ? 'اللغة' : 'Language'}</Label>
              <Select value={bookForm.language} onValueChange={v => setBookForm(f => ({ ...f, language: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LANG_OPTIONS.map(l => <SelectItem key={l.value} value={l.value}>{isRTL ? l.ar : l.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{isRTL ? 'نوع الإعارة' : 'Loan Type'}</Label>
              <Select value={bookForm.loan_type} onValueChange={v => setBookForm(f => ({ ...f, loan_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LOAN_TYPES.map(l => <SelectItem key={l.value} value={l.value}>{isRTL ? l.ar : l.en} {l.days > 0 ? `(${l.days}d)` : '(in-library)'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{isRTL ? 'الفئة' : 'Category'}</Label><Input value={bookForm.category} onChange={e => setBookForm(f => ({ ...f, category: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{isRTL ? 'موقع الرف' : 'Shelf Location'}</Label><Input value={bookForm.shelf_location} onChange={e => setBookForm(f => ({ ...f, shelf_location: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{isRTL ? 'عدد النسخ' : 'Copies'}</Label><Input type="number" min="1" value={bookForm.total_copies} onChange={e => setBookForm(f => ({ ...f, total_copies: parseInt(e.target.value) || 1, available_copies: parseInt(e.target.value) || 1 }))} /></div>
            <div className="space-y-1"><Label>{isRTL ? 'تكلفة الاستبدال' : 'Replacement Cost'}</Label><Input type="number" value={bookForm.replacement_cost} onChange={e => setBookForm(f => ({ ...f, replacement_cost: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveBook} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">{isRTL ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Checkout Form */}
      <Dialog open={showCheckoutForm} onOpenChange={setShowCheckoutForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{isRTL ? 'استعارة كتاب' : 'Book Checkout'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'ابحث عن كتاب' : 'Search Book'}</Label>
              <Input placeholder={isRTL ? 'عنوان أو ISBN...' : 'Title or ISBN...'} value={bookSearch} onChange={e => setBookSearch(e.target.value)} />
              {bookSearch && !checkoutData.book_id && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {books.filter(b => b.available_copies > 0 && (b.title_ar?.includes(bookSearch) || b.isbn?.includes(bookSearch))).slice(0, 6).map(b => (
                    <button key={b.id} onClick={() => { setCheckoutData(d => ({ ...d, book_id: b.id })); setBookSearch(b.title_ar); }} className="w-full text-start px-3 py-2 hover:bg-slate-50 text-sm border-b last:border-0">
                      {b.title_ar} <span className="text-green-600 text-xs ms-2">{b.available_copies} {isRTL ? 'متاح' : 'available'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'ابحث عن الطالب' : 'Search Student'}</Label>
              <Input placeholder={isRTL ? 'اسم الطالب...' : 'Student name...'} value={studentSearch} onChange={e => { setStudentSearch(e.target.value); setCheckoutData(d => ({ ...d, student_id: '' })); }} />
              {studentSearch && !checkoutData.student_id && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {students.filter(s => s.name_ar?.includes(studentSearch) || s.name_en?.toLowerCase().includes(studentSearch.toLowerCase())).slice(0, 6).map(s => (
                    <button key={s.id} onClick={() => { setCheckoutData(d => ({ ...d, student_id: s.id, student_name: s.name_ar })); setStudentSearch(s.name_ar); }} className="w-full text-start px-3 py-2 hover:bg-slate-50 text-sm border-b last:border-0">
                      {s.name_ar} <span className="text-slate-400 ms-2">{s.grade}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckoutForm(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleCheckout} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">{isRTL ? 'تأكيد الاستعارة' : 'Confirm Checkout'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}