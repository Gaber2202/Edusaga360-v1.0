/**
 * YAMEN AI — shared design tokens (aligned with exec/dashboard 21st patterns).
 */

export const YAMEN_COLORS = {
  najdi: '#0E6B4F',
  green: '#16A077',
  amber: '#E0A82E',
  red: '#D1493F',
  purple: '#8B5CF6',
  gold: '#C8A451',
  info: '#2C7BB0',
  ink: '#1C2420',
};

export const yamenLayout = {
  page: 'space-y-6',
  kpiGrid: 'grid grid-cols-2 md:grid-cols-4 gap-4',
  kpiGrid3: 'grid grid-cols-1 sm:grid-cols-3 gap-4',
  chartGrid: 'grid grid-cols-1 md:grid-cols-2 gap-4',
};

export const TAB_META = {
  dashboard: { tone: 'emerald', descEn: 'HR health & alerts', descAr: 'صحة الموارد والتنبيهات' },
  risk: { tone: 'red', descEn: 'Employee risk scores', descAr: 'درجات مخاطر الموظفين' },
  saudization: { tone: 'gold', descEn: 'Nitaqat & Saudization', descAr: 'نطاقات والسعودة' },
  docs_expiry: { tone: 'amber', descEn: 'Expiring documents', descAr: 'وثائق قاربت على الانتهاء' },
  insights: { tone: 'purple', descEn: 'Predictive HR insights', descAr: 'رؤى تنبؤية' },
  documents: { tone: 'info', descEn: 'Generate HR letters', descAr: 'إنشاء خطابات الموارد' },
  processor: { tone: 'info', descEn: 'OCR & extract data', descAr: 'استخراج بيانات المستندات' },
  compliance: { tone: 'najdi', descEn: 'Compliance autopilot', descAr: 'فحص الامتثال التلقائي' },
  reports: { tone: 'purple', descEn: 'Executive AI reports', descAr: 'تقارير تنفيذية بالذكاء' },
  chat: { tone: 'emerald', descEn: 'Ask YAMEN anything', descAr: 'اسأل يامن أي شيء' },
  employee: { tone: 'amber', descEn: 'Employee safe mode', descAr: 'وضع الموظف الآمن' },
};
