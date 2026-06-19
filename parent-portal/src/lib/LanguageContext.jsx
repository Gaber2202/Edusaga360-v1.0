import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'pp_lang';

export const translations = {
  en: {
    // Shell / nav
    parentPortal: 'Parent Portal',
    dashboard: 'Dashboard',
    studentProgress: 'Student Progress',
    attendance: 'Attendance',
    feesBilling: 'Fees & Billing',
    announcements: 'Announcements',
    homework: 'Homework',
    messages: 'Messages',
    signOut: 'Sign Out',
    switchToArabic: 'العربية',
    switchToEnglish: 'English',

    // Dashboard
    welcome: 'Welcome',
    parentPortalDashboard: 'Parent Portal Dashboard',
    myChildren: 'My Children',
    attendanceRate: 'Attendance Rate',
    outstandingFees: 'Outstanding Fees',
    notifications: 'Notifications',
    noStudentsLinked: 'No students linked to your account yet.',
    contactAdmin: 'Please contact your school administrator.',

    // Login
    email: 'Email',
    password: 'Password',
    signIn: 'Sign In',
    loginFailed: 'Login failed',

    // Access denied
    accessDenied: 'Access Denied',
    accessDeniedDesc: 'This portal is for parents only. Please contact your school administrator for access.',

    // Fees
    totalOutstanding: 'Total Outstanding',
    noStudentsLinkedAccount: 'No students are linked to your account yet.',
    contactSchoolLink: 'Contact the school to link your child to your account.',
    noInvoices: 'No invoices yet.',
    invoicesWillAppear: 'Invoices issued by the school will appear here.',
    invoiceNo: 'Invoice #',
    student: 'Student',
    due: 'Due',
    total: 'Total',
    balance: 'Balance',
    status: 'Status',
    invoice: 'Invoice',
    downloadError: 'Could not download the invoice',
    notAuthorizedInvoice: 'Not authorized to view this invoice',

    // Status labels
    paid: 'Paid',
    partial: 'Partially Paid',
    unpaid: 'Unpaid',
    overdue: 'Overdue',
    cancelled: 'Cancelled',

    // Placeholder pages
    studentProgressTitle: 'Student Progress',
    progressWillAppear: 'Student grades and progress reports will appear here.',
    progressDataNote: 'Data will be available once the school adds grade records.',
    attendanceRecords: 'Attendance Records',
    attendanceWillAppear: 'Attendance records for your children will appear here.',
    attendanceDataNote: 'Data will be available once the school records attendance.',
    schoolAnnouncements: 'School Announcements',
    announcementsWillAppear: 'School announcements and communications will appear here.',
    announcementsNote: 'Stay tuned for updates from your school.',
    homeworkAssignments: 'Homework & Assignments',
    homeworkWillAppear: 'Homework assignments will appear here.',
    homeworkNote: 'Teachers will post assignments that you can view and track.',
    messagesTitle: 'Messages',
    messagesWillAppear: 'Direct messaging with teachers will be available here.',
    messagesNote: 'This feature is coming soon.',
  },
  ar: {
    // Shell / nav
    parentPortal: 'بوابة ولي الأمر',
    dashboard: 'الرئيسية',
    studentProgress: 'مستوى الطالب',
    attendance: 'الحضور',
    feesBilling: 'الرسوم والفواتير',
    announcements: 'الإعلانات',
    homework: 'الواجبات',
    messages: 'الرسائل',
    signOut: 'تسجيل الخروج',
    switchToArabic: 'العربية',
    switchToEnglish: 'English',

    // Dashboard
    welcome: 'مرحباً',
    parentPortalDashboard: 'لوحة بوابة ولي الأمر',
    myChildren: 'أبنائي',
    attendanceRate: 'نسبة الحضور',
    outstandingFees: 'الرسوم المستحقة',
    notifications: 'الإشعارات',
    noStudentsLinked: 'لا يوجد طلاب مرتبطون بحسابك بعد.',
    contactAdmin: 'يرجى التواصل مع إدارة المدرسة.',

    // Login
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    signIn: 'تسجيل الدخول',
    loginFailed: 'فشل تسجيل الدخول',

    // Access denied
    accessDenied: 'تم رفض الوصول',
    accessDeniedDesc: 'هذه البوابة مخصصة لأولياء الأمور فقط. يرجى التواصل مع إدارة المدرسة للحصول على صلاحية الدخول.',

    // Fees
    totalOutstanding: 'إجمالي المستحق',
    noStudentsLinkedAccount: 'لا يوجد طلاب مرتبطون بحسابك بعد.',
    contactSchoolLink: 'تواصل مع المدرسة لربط ابنك بحسابك.',
    noInvoices: 'لا توجد فواتير بعد.',
    invoicesWillAppear: 'ستظهر هنا الفواتير الصادرة من المدرسة.',
    invoiceNo: 'رقم الفاتورة',
    student: 'الطالب',
    due: 'الاستحقاق',
    total: 'الإجمالي',
    balance: 'المتبقي',
    status: 'الحالة',
    invoice: 'الفاتورة',
    downloadError: 'تعذّر تنزيل الفاتورة',
    notAuthorizedInvoice: 'غير مصرح لك بعرض هذه الفاتورة',

    // Status labels
    paid: 'مدفوعة',
    partial: 'مدفوعة جزئياً',
    unpaid: 'غير مدفوعة',
    overdue: 'متأخرة',
    cancelled: 'ملغاة',

    // Placeholder pages
    studentProgressTitle: 'مستوى الطالب',
    progressWillAppear: 'ستظهر هنا درجات الطالب وتقارير المستوى.',
    progressDataNote: 'ستتوفر البيانات بمجرد إضافة المدرسة لسجلات الدرجات.',
    attendanceRecords: 'سجلات الحضور',
    attendanceWillAppear: 'ستظهر هنا سجلات حضور أبنائك.',
    attendanceDataNote: 'ستتوفر البيانات بمجرد تسجيل المدرسة للحضور.',
    schoolAnnouncements: 'إعلانات المدرسة',
    announcementsWillAppear: 'ستظهر هنا إعلانات المدرسة والتواصل.',
    announcementsNote: 'ترقّب التحديثات من مدرستك.',
    homeworkAssignments: 'الواجبات والمهام',
    homeworkWillAppear: 'ستظهر هنا الواجبات المدرسية.',
    homeworkNote: 'سيقوم المعلمون بنشر المهام التي يمكنك عرضها ومتابعتها.',
    messagesTitle: 'الرسائل',
    messagesWillAppear: 'ستتوفر هنا المراسلة المباشرة مع المعلمين.',
    messagesNote: 'هذه الميزة قادمة قريباً.',
  },
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'en'; } catch { return 'en'; }
  });
  const isRTL = lang === 'ar';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    }
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, [lang, isRTL]);

  const setLang = useCallback((l) => setLangState(l), []);
  const toggle = useCallback(() => setLangState((l) => (l === 'en' ? 'ar' : 'en')), []);
  const t = useCallback((key) => translations[lang]?.[key] ?? translations.en[key] ?? key, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, isRTL, t, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
