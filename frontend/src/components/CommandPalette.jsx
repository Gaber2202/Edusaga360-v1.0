import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardCheck,
  DollarSign,
  Calendar,
  CheckCircle,
  Shield,
  Receipt,
  Banknote,
  FileText,
  FolderOpen,
  BarChart3,
  Settings,
  Bot,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from './ui/command';
import { useLanguage } from './LanguageContext';
import { createPageUrl } from '../utils';

const ICONS = {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardCheck,
  DollarSign,
  Calendar,
  CheckCircle,
  Shield,
  Receipt,
  Banknote,
  FileText,
  FolderOpen,
  BarChart3,
  Settings,
  Bot,
};

const NAV_ITEMS = [
  {
    group: 'School',
    items: [
      { label: 'Dashboard', labelAr: 'لوحة التحكم', page: 'Dashboard', icon: 'LayoutDashboard' },
      { label: 'Students', labelAr: 'الطلاب', page: 'Students', icon: 'Users' },
      { label: 'Admissions', labelAr: 'القبول', page: 'Admissions', icon: 'GraduationCap' },
      { label: 'Attendance', labelAr: 'الحضور', page: 'StudentAttendancePage', icon: 'ClipboardCheck' },
    ],
  },
  {
    group: 'HR',
    items: [
      { label: 'Employees', labelAr: 'الموظفون', page: 'Employees', icon: 'Users' },
      { label: 'Payroll', labelAr: 'الرواتب', page: 'Payroll', icon: 'DollarSign' },
      { label: 'Leaves', labelAr: 'الإجازات', page: 'Leaves', icon: 'Calendar' },
      { label: 'HR Approvals', labelAr: 'الموافقات', page: 'HRApprovalsInbox', icon: 'CheckCircle' },
      { label: 'Gov. Relations', labelAr: 'العلاقات الحكومية', page: 'GovernmentRelations', icon: 'Shield' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { label: 'Invoices / Fees', labelAr: 'الفواتير', page: 'Fees', icon: 'Receipt' },
      { label: 'Collections', labelAr: 'التحصيل', page: 'Collections', icon: 'Banknote' },
      { label: 'Journal Entries', labelAr: 'القيود', page: 'JournalEntries', icon: 'FileText' },
      { label: 'General Ledger', labelAr: 'دفتر الأستاذ', page: 'GeneralLedger', icon: 'FolderOpen' },
      { label: 'ZATCA / VAT', labelAr: 'زاتكا / ضريبة', page: 'VATManagement', icon: 'Receipt' },
    ],
  },
  {
    group: 'Other',
    items: [
      { label: 'Reports', labelAr: 'التقارير', page: 'Reports', icon: 'BarChart3' },
      { label: 'Settings', labelAr: 'الإعدادات', page: 'Settings', icon: 'Settings' },
      { label: 'Yamen AI', labelAr: 'يامن AI', page: 'YamenAI', icon: 'Bot' },
      { label: 'Contracts', labelAr: 'العقود', page: 'Contracts', icon: 'FileText' },
    ],
  },
];

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { isRTL } = useLanguage();

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (onOpenChange) {
          onOpenChange(true);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange]);

  function handleSelect(page) {
    if (onOpenChange) {
      onOpenChange(false);
    }
    navigate(createPageUrl(page));
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={isRTL ? 'ابحث عن صفحة...' : 'Search pages...'} />
      <CommandList>
        <CommandEmpty>{isRTL ? 'لا توجد نتائج.' : 'No results found.'}</CommandEmpty>
        {NAV_ITEMS.map(({ group, items }) => (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <CommandItem
                  key={item.page}
                  value={`${item.label} ${item.labelAr} ${item.page}`}
                  onSelect={() => handleSelect(item.page)}
                >
                  {Icon && <Icon />}
                  <span>{isRTL ? item.labelAr : item.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
      <p className="text-xs text-muted-foreground px-3 pb-2">Press Esc to close</p>
    </CommandDialog>
  );
}

export { CommandPalette };
