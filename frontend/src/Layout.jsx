import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { supabase } from './api/supabaseClient';
import { LanguageProvider, useLanguage } from './components/LanguageContext';
import { RoleProvider, useRole } from './components/RoleContext';
import { BranchProvider, useBranch } from './components/BranchContext';
import { TenantProvider, useTenant } from './components/TenantContext';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationBell from './components/notifications/NotificationBell';
import TenantAccessGate from './components/TenantAccessGate';
import TenantContextSyncer from './components/TenantContextSyncer';
import { format } from 'date-fns';
import { Button } from './components/ui/button';
import { Avatar, AvatarFallback } from './components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from './components/ui/sheet';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './components/ui/collapsible';
import {
          LayoutDashboard,
          Users,
          GraduationCap,
          ClipboardCheck,
          CreditCard,
          FileBarChart,
          Settings,
          LogOut,
          Menu,
          ChevronLeft,
          ChevronRight,
          ChevronDown,
          Globe,
          Building2,
          Wallet,
          ShoppingCart,
          Package,
          Link2,
          Shield,
          FileText,
          BookOpen,
          Receipt,
          Banknote,
          Calculator,
          Truck,
          ClipboardList,
          FolderOpen,
          RefreshCw,
          UserCog,
          Key,
          History,
          Calendar,
          Clock,
          DollarSign,
          UserPlus,
          Fingerprint,
          User,
          Headphones,
          Monitor,
          Wrench,
          BarChart3,
          UserCircle,
          CheckCircle,
          Scroll,
          Tag,
          TestTube,
          Star,
          GitBranch,
          UserCheck,
          Landmark,
          Bot,
          Heart,
          Route,
          UtensilsCrossed,
          Zap,
          } from 'lucide-react';

function LayoutContent({ children, currentPageName }) {
  const { t, isRTL, language: _language, toggleLanguage } = useLanguage();
  const { user, userRole, canAccess: _canAccess, loading, isTrial } = useRole();
  const { tenant, isTenantActive, isModuleEnabled: _isModuleEnabled } = useTenant();
  const { branches, selectedBranchId, selectBranch } = useBranch();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState({});

  const toggleMenu = (menuId) => {
    setExpandedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }));
  };

  const navigation = [
    { 
      name: 'dashboard', 
      icon: LayoutDashboard, 
      page: 'Dashboard',
      roles: ['admin', 'finance', 'procurement', 'admissions', 'collections', 'branch_manager', 'auditor', 'teacher', 'parent', 'accountant', 'hr_admin', 'hr_officer']
    },
    { 
      name: 'admissions', 
      icon: GraduationCap,
      roles: ['admin', 'admissions', 'branch_manager'],
      children: [
        { name: 'admissions', icon: GraduationCap, page: 'Admissions', roles: ['admin', 'admissions', 'branch_manager'] },
        { name: 'parentIntakeLinks', icon: Link2, page: 'ParentIntakeManagement', roles: ['admin', 'admissions'] },
      ]
    },
    { 
      name: 'students', 
      icon: Users,
      roles: ['admin', 'admissions', 'branch_manager', 'teacher', 'parent', 'collections'],
      children: [
        { name: 'students', icon: Users, page: 'Students', roles: ['admin', 'admissions', 'branch_manager', 'teacher', 'parent', 'collections'] },
        { name: 'student_attendance', icon: ClipboardCheck, page: 'StudentAttendancePage', roles: ['admin', 'teacher', 'branch_manager'] },
        { name: 'studentTags', icon: Tag, page: 'StudentTags', roles: ['admin', 'creator'] },
      ]
    },
    { 
      name: 'contracts', 
      icon: FileText,
      roles: ['admin', 'finance', 'collections', 'branch_manager', 'admissions'],
      children: [
        { name: 'contracts', icon: FileText, page: 'Contracts', roles: ['admin', 'finance', 'collections', 'branch_manager', 'admissions'] },
        { name: 'contractTemplates', icon: FileText, page: 'ContractTemplates', roles: ['admin', 'creator'] },
      ]
    },
    {
      name: 'hr',
      icon: Users,
      roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager'],
      children: [
        { name: 'hrDashboard', icon: BarChart3, page: 'HRManagerDashboard', roles: ['admin', 'hr_admin', 'branch_manager'] },
        { name: 'employees', icon: Users, page: 'Employees', roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager'] },
        { name: 'recruitment', icon: UserPlus, page: 'RecruitmentPage', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'onboarding', icon: CheckCircle, page: 'Onboarding', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'archiveAndDocuments', icon: FolderOpen, page: 'HRContracts', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'employee_attendance', icon: ClipboardCheck, page: 'EmployeeAttendance', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'attendanceDevices', icon: Fingerprint, page: 'AttendanceDevices', roles: ['admin', 'hr_admin'] },
        { name: 'leaves', icon: Calendar, page: 'Leaves', roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager'] },
        { name: 'overtime', icon: Clock, page: 'Overtime', roles: ['admin', 'hr_admin', 'hr_officer', 'finance'] },
        { name: 'payroll', icon: DollarSign, page: 'Payroll', roles: ['admin', 'hr_admin', 'finance'] },
        { name: 'payslips', icon: Receipt, page: 'PayslipsManagementPage', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'hrApprovalsInbox', icon: CheckCircle, page: 'HRApprovalsInbox', roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager'] },
        { name: 'bankManagement', icon: Building2, page: 'BankManagement', roles: ['admin', 'hr_admin', 'finance'] },
        { name: 'eosb', icon: Calculator, page: 'EOSBCalculator', roles: ['admin', 'hr_admin', 'finance', 'hr_officer'] },
        { name: 'governmentRelations', icon: Shield, page: 'GovernmentRelations', roles: ['admin', 'hr_admin', 'hr_officer', 'finance'] },
        { name: 'holidayCalendar', icon: Calendar, page: 'HolidayCalendar', roles: ['admin', 'hr_admin', 'branch_manager'] },
        { name: 'leaveBalances', icon: Clock, page: 'LeaveBalances', roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager'] },
        { name: 'hrPoliciesLibrary', icon: FileText, page: 'HRPoliciesLibrary', roles: ['admin', 'hr_admin'] },
        { name: 'performanceEvaluation', icon: Star, page: 'PerformanceEvaluation', roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager'] },
        { name: 'yamenAI', icon: Bot, page: 'YamenAI', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'trainingDevelopment', icon: GraduationCap, page: 'TrainingDevelopment', roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager'] },
        { name: 'disciplinaryCases', icon: Shield, page: 'DisciplinaryCases', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'workforcePlanning', icon: BarChart3, page: 'WorkforcePlanning', roles: ['admin', 'hr_admin', 'finance', 'branch_manager'] },
        { name: 'workflowEngine', icon: GitBranch, page: 'WorkflowEngine', roles: ['admin', 'creator'] },
        ]
        },
    {
      name: 'ess',
      icon: User,
      page: 'ESSPortal',
      roles: ['admin', 'hr_admin', 'hr_officer', 'branch_manager', 'teacher', 'accountant', 'finance', 'procurement']
    },
    {
      name: 'fees',
      icon: CreditCard,
      roles: ['admin', 'finance', 'collections', 'branch_manager', 'accountant', 'parent'],
      children: [
        { name: 'invoices', icon: Receipt, page: 'Fees', roles: ['admin', 'finance', 'collections', 'branch_manager', 'accountant', 'parent'] },
        { name: 'collections', icon: Banknote, page: 'Collections', roles: ['admin', 'finance', 'collections', 'branch_manager'] },
        { name: 'refunds', icon: RefreshCw, page: 'Refunds', roles: ['admin', 'finance', 'branch_manager'] },
        { name: 'reconciliation', icon: Calculator, page: 'Reconciliation', roles: ['admin', 'finance', 'accountant'] },
        { name: 'tuitionFeesConfiguration', icon: DollarSign, page: 'TuitionFeesConfiguration', roles: ['admin', 'finance'] },
        { name: 'gradeConfiguration', icon: GraduationCap, page: 'GradeConfiguration', roles: ['admin', 'creator'] },
      ]
    },
    {
      name: 'finance',
      icon: Wallet,
      roles: ['admin', 'finance', 'accountant', 'auditor'],
      children: [
        { name: 'financeDashboard', icon: BarChart3, page: 'FinanceDashboard', roles: ['admin', 'finance', 'accountant', 'auditor'] },
        { name: 'chartOfAccounts', icon: BookOpen, page: 'ChartOfAccounts', roles: ['admin', 'finance', 'accountant'] },
        { name: 'journalEntries', icon: FileText, page: 'JournalEntries', roles: ['admin', 'finance', 'accountant'] },
        { name: 'generalLedger', icon: FolderOpen, page: 'GeneralLedger', roles: ['admin', 'finance', 'accountant', 'auditor'] },
        { name: 'trialBalance', icon: Receipt, page: 'TrialBalance', roles: ['admin', 'finance', 'accountant', 'auditor'] },
        { name: 'financialStatements', icon: FileBarChart, page: 'FinancialStatements', roles: ['admin', 'finance', 'accountant', 'auditor'] },
        { name: 'monthEndClose', icon: CheckCircle, page: 'MonthEndClose', roles: ['admin', 'finance', 'accountant'] },
        { name: 'fiscalPeriods', icon: Calendar, page: 'FiscalPeriods', roles: ['admin', 'finance'] },
        { name: 'costCenters', icon: Building2, page: 'CostCenters', roles: ['admin', 'finance'] },
        { name: 'vat', icon: Receipt, page: 'VATManagement', roles: ['admin', 'finance', 'accountant'] },
        { name: 'bankFileTemplates', icon: Scroll, page: 'BankFileTemplates', roles: ['admin', 'creator'] },
      ]
    },
    {
      name: 'procurement',
      icon: ShoppingCart,
      roles: ['admin', 'procurement', 'finance', 'branch_manager'],
      children: [
        { name: 'vendors', icon: Truck, page: 'Vendors', roles: ['admin', 'procurement', 'finance'] },
        { name: 'purchaseRequisitions', icon: ClipboardList, page: 'PurchaseRequisitions', roles: ['admin', 'procurement', 'branch_manager'] },
        { name: 'purchaseOrders', icon: FileText, page: 'PurchaseOrders', roles: ['admin', 'procurement', 'finance'] },
        { name: 'bills', icon: Receipt, page: 'APBills', roles: ['admin', 'procurement', 'finance', 'accountant'] },
      ]
    },
    {
      name: 'assets',
      icon: Package,
      roles: ['admin', 'finance', 'accountant', 'hr_admin'],
      children: [
        { name: 'assetRegister', icon: FolderOpen, page: 'Assets', roles: ['admin', 'finance', 'accountant'] },
        { name: 'depreciation', icon: Calculator, page: 'Depreciation', roles: ['admin', 'finance', 'accountant'] },
        { name: 'assetAssignments', icon: UserCheck, page: 'AssetAssignments', roles: ['admin', 'hr_admin', 'finance'] },
        { name: 'assetRentals', icon: Landmark, page: 'AssetRentals', roles: ['admin', 'finance', 'hr_admin'] },
      ]
    },
    { 
      name: 'reports', 
      icon: FileBarChart, 
      page: 'Reports',
      roles: ['admin', 'finance', 'branch_manager', 'auditor', 'accountant']
    },
    { 
    name: 'integrations', 
    icon: Link2, 
    roles: ['admin', 'hr_admin', 'finance'],
    children: [
      { name: 'integrations', icon: Link2, page: 'Integrations', roles: ['admin'] },
      { name: 'govIntegrations', icon: Shield, page: 'GovIntegrations', roles: ['admin', 'hr_admin', 'finance'] },
      { name: 'integrationHub', icon: Zap, page: 'IntegrationHub', roles: ['admin'] },
    ]
    },
    {
      name: 'security',
      icon: Shield,
      roles: ['admin', 'auditor', 'creator'],
      children: [
        { name: 'rolesPermissions', icon: Shield, page: 'RolesPermissions', roles: ['creator'] },
        { name: 'auditLogs', icon: History, page: 'AuditLogs', roles: ['admin', 'auditor', 'creator'] },
        { name: 'platformConsole', icon: LayoutDashboard, page: 'PlatformConsole', roles: ['creator'] },
        { name: 'superAdmin', icon: Shield, page: 'SuperAdminDashboard', roles: ['creator'] },
        ]
        },
    {
      name: 'fleetManagement',
      icon: Truck,
      roles: ['admin', 'branch_manager', 'facilities_manager'],
      children: [
        { name: 'fleetManagement', icon: Truck, page: 'FleetManagement', roles: ['admin', 'branch_manager', 'facilities_manager'] },
        { name: 'transportManagement', icon: Route, page: 'TransportManagement', roles: ['admin', 'branch_manager', 'facilities_manager'] },
      ]
    },
    {
      name: 'schoolClinic',
      icon: Heart,
      page: 'SchoolClinic',
      roles: ['admin', 'branch_manager', 'teacher']
    },
    {
      name: 'libraryManagement',
      icon: BookOpen,
      page: 'LibraryManagement',
      roles: ['admin', 'branch_manager', 'teacher']
    },
    {
      name: 'canteenManagement',
      icon: UtensilsCrossed,
      page: 'CanteenManagement',
      roles: ['admin', 'finance', 'branch_manager']
    },
    { 
      name: 'expenses', 
      icon: Receipt, 
      page: 'Expenses',
      roles: ['admin', 'finance', 'hr_admin', 'branch_manager', 'accountant', 'teacher', 'hr_officer']
    },
    // Phase 2 - Service & Operations
    {
      name: 'crm',
      icon: Headphones,
      page: 'CRM',
      roles: ['admin', 'crm_agent', 'branch_manager', 'collections']
    },
    {
      name: 'itHelpdesk',
      icon: Monitor,
      page: 'ITHelpdesk',
      roles: ['admin', 'it_admin', 'it_support']
    },
    {
      name: 'facilities',
      icon: Wrench,
      page: 'Facilities',
      roles: ['admin', 'facilities_manager', 'branch_manager']
    },

    {
      name: 'operations',
      icon: BarChart3,
      page: 'OperationsDashboard',
      roles: ['admin', 'branch_manager', 'crm_agent', 'it_admin', 'facilities_manager']
    },
    {
      name: 'parentPortal',
      icon: UserCircle,
      page: 'ParentPortal',
      roles: ['parent']
    },
    {
      name: 'settings',
      icon: Settings,
      roles: ['admin', 'creator'],
      children: [
        { name: 'users', icon: UserCog, page: 'UserManagement', roles: ['admin', 'creator'] },
        { name: 'roles', icon: Key, page: 'RoleManagement', roles: ['admin', 'creator'] },
        { name: 'companies', icon: Building2, page: 'Companies', roles: ['admin', 'creator'] },
        { name: 'subsidiaries', icon: Building2, page: 'Companies', roles: ['admin', 'creator'] },
        { name: 'branches', icon: Building2, page: 'Branches', roles: ['admin', 'creator'] },
        { name: 'notificationSettings', icon: Settings, page: 'NotificationSettings', roles: ['admin', 'creator'] },
      ]
    },
    {
      name: 'subscription',
      icon: Star,
      page: 'ClientSubscription',
      roles: ['admin']
    },
  ];

  const filteredNavigation = navigation.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  }).map(item => {
    if (item.children) {
      return {
        ...item,
        children: item.children.filter(child => !child.roles || child.roles.includes(userRole))
      };
    }
    return item;
  });

  const handleLogout = () => {
    supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  const NavItem = ({ item, mobile = false, depth: _depth = 0 }) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus[item.name];
    const isPageActive = currentPageName === item.page;
    const isParentOfActive = item.children?.some(c => c.page === currentPageName);
    const isActive = isPageActive || isParentOfActive;

    if (hasChildren) {
      return (
        <Collapsible open={isExpanded} onOpenChange={() => toggleMenu(item.name)}>
          <CollapsibleTrigger asChild>
            <button
            className={`
              w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-base font-medium
              ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'}
              ${sidebarCollapsed && !mobile ? 'justify-center' : ''}
            `}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 flex-shrink-0 text-slate-600`} />
                {(!sidebarCollapsed || mobile) && <span className="font-medium text-sm">{t(item.name)}</span>}
              </div>
              {(!sidebarCollapsed || mobile) && (
                <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className={`${isRTL ? 'pr-4' : 'pl-4'} mt-2 space-y-1`}>
              {item.children.map(child => {
                const isChildActive = currentPageName === child.page;
                return (
                <Link
                  key={child.name}
                  to={createPageUrl(child.page)}
                  onClick={() => mobile && setMobileOpen(false)}
                  className={`
                    flex items-center gap-2 px-2 py-2 rounded-lg transition-all duration-200 text-sm
                    ${isChildActive
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }
                  `}
                >
                  <child.icon className={`w-4 h-4 flex-shrink-0 ${isChildActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{t(child.name)}</span>
                </Link>
              );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <Link
        to={createPageUrl(item.page)}
        onClick={() => mobile && setMobileOpen(false)}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
          ${isPageActive
            ? 'bg-blue-600 text-white shadow-sm' 
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'}
          ${sidebarCollapsed && !mobile ? 'justify-center' : ''}
        `}
      >
        <item.icon className={`w-5 h-5 flex-shrink-0 ${isPageActive ? 'text-white' : 'text-slate-600'}`} />
        {(!sidebarCollapsed || mobile) && <span className="font-medium text-sm">{t(item.name)}</span>}
      </Link>
    );
  };

  const NavItems = ({ mobile = false }) => (
    <nav className="space-y-1.5 px-3 py-3 w-full">
      {filteredNavigation.map((item) => (
        <NavItem key={item.name} item={item} mobile={mobile} />
      ))}
    </nav>
  );

  return (
    <div className={`flex h-screen bg-slate-50 ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        html, body, #root { 
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        html, body { 
          font-family: ${isRTL ? "'IBM Plex Sans Arabic', -apple-system, sans-serif" : "'Inter', -apple-system, sans-serif"}; 
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        * { 
          font-family: inherit;
          box-sizing: border-box;
        }
        /* Mobile-first typography */
        @media (max-width: 768px) {
          body { font-size: 14px; line-height: 1.5; }
          h1 { font-size: 18px; }
          h2 { font-size: 16px; }
          h3 { font-size: 14px; }
          table { font-size: 12px; }
        }
      `}</style>

      {/* Desktop Sidebar */}
      <aside className={`
        hidden lg:flex flex-col bg-white shadow-sm
        transition-all duration-300 z-20 flex-shrink-0
        ${sidebarCollapsed ? 'w-20 min-w-20' : 'w-72 min-w-72'}
        ${isRTL ? 'border-l' : 'border-r'} border-slate-200
      `}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-slate-200 flex-shrink-0 w-full">
          {!sidebarCollapsed && (
                <div className="flex items-center gap-2">
                  <img 
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6964bc9bb6c7937565369920/d84349133_EduSaga.png" 
                    alt="EduSaga Logo" 
                    className="h-8 w-auto"
                  />
                  <div>
                    <span className="font-semibold text-sm text-slate-900 block leading-tight">EduSaga 360</span>
                    <span className="text-xs text-slate-500">v1.0</span>
                  </div>
                </div>
              )}
              {sidebarCollapsed && (
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6964bc9bb6c7937565369920/d84349133_EduSaga.png" 
                  alt="EduSaga Logo" 
                  className="h-6 w-auto mx-auto"
                />
              )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full">
          <NavItems />
        </div>

        {/* Collapse Button */}
        <div className="p-3 border-t border-slate-200 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full justify-center text-slate-500 hover:text-slate-900"
          >
            {sidebarCollapsed 
              ? (isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)
              : (isRTL ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />)
            }
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden`}>
        {/* Top Header */}
        <header className="w-full h-14 bg-white border-b border-slate-200 flex items-center justify-between px-2 sm:px-3 lg:px-4 sticky top-0 z-10 shadow-sm overflow-x-hidden">
          {/* Trial Banner */}
          {isTrial() && (
            <div className="absolute top-full left-0 right-0 bg-blue-600 text-white py-2 px-4 text-center text-sm font-medium z-10">
              <TestTube className="w-4 h-4 inline me-2" />
              {isRTL ? 'وضع تجريبي' : 'Trial Mode'}
              {user?.trial_expires_date && (
                <span className="opacity-90">
                  {' • '}
                  {isRTL ? 'ينتهي في:' : 'Expires:'} {format(new Date(user.trial_expires_date), 'dd/MM/yyyy')}
                </span>
              )}
            </div>
          )}
          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={isRTL ? 'right' : 'left'} className="w-72 p-0 flex flex-col h-full">
              <div className="h-16 flex items-center px-4 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <img 
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6964bc9bb6c7937565369920/d84349133_EduSaga.png" 
                    alt="EduSaga Logo" 
                    className="h-10 w-auto"
                  />
                  <div>
                    <span className="font-semibold text-base text-slate-900 block leading-tight">EduSaga 360</span>
                    <span className="text-xs text-slate-500">Platform</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavItems mobile />
              </div>
            </SheetContent>
          </Sheet>

          {/* Branch Selector */}
          <div className="hidden md:flex items-center gap-2 lg:gap-4 flex-1">
            <Select value={selectedBranchId || 'all'} onValueChange={selectBranch}>
              <SelectTrigger className="w-32 sm:w-40 lg:w-48 bg-white text-xs sm:text-sm">
                <Building2 className="w-4 h-4 flex-shrink-0" />
                <SelectValue placeholder={t('selectBranch')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allBranches')}</SelectItem>
                {branches.map(branch => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {isRTL ? branch.name_ar : branch.name_en || branch.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 lg:gap-3 ml-auto">
            {/* Tenant Badge */}
            {tenant && (
              <div className="hidden lg:flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
                <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className="font-medium text-slate-600 max-w-[100px] truncate">
                  {isRTL ? tenant.name_ar : tenant.name_en}
                </span>
              </div>
            )}

            {/* Notification Bell */}
            <NotificationBell />

            {/* Language Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleLanguage} className="text-slate-600 hover:text-slate-900 h-9 w-9">
              <Globe className="w-4 h-4" />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1 sm:gap-2 px-1 sm:px-2 h-9">
                  <Avatar className="w-7 h-7 sm:w-8 sm:h-8">
                    <AvatarFallback className="bg-slate-900 text-white text-xs">
                        {(user?.display_name || user?.full_name || user?.email || 'U')[0]?.toUpperCase()}
                      </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col text-left min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-slate-900 truncate">
                      {isRTL
                        ? ([user?.first_name_ar, user?.last_name_ar].filter(Boolean).join(' ') || user?._displayName || user?.display_name || user?.full_name || user?.email || '')
                        : ([user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.display_name || user?.full_name || user?.email || '')
                      }
                    </p>
                    <p className="text-xs text-slate-500">{t(userRole)}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isRTL ? 'start' : 'end'} className="w-56">
                <DropdownMenuItem asChild>
                  <Link to={createPageUrl('NotificationPreferences')} className="cursor-pointer">
                    <Settings className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                    {isRTL ? 'تفضيلات الإشعارات' : 'Notification Preferences'}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={createPageUrl('Settings')} className="cursor-pointer">
                    <Settings className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                    {t('settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
                  <LogOut className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {t('logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Suspended Tenant Banner */}
        {tenant && !isTenantActive() && (
          <div className="bg-red-600 text-white py-2 px-4 text-center text-sm font-medium">
            {isRTL ? '⚠ حساب المؤسسة موقوف. يرجى التواصل مع الدعم.' : '⚠ Your institution account is suspended. Please contact support.'}
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 w-full p-2 sm:p-4 lg:p-6 bg-slate-50 overflow-hidden overflow-y-auto">
          <div className="w-full h-full">
            <TenantAccessGate>{children}</TenantAccessGate>
          </div>
        </main>
      </div>
    </div>
  );
}

function TenantAwareLayout({ children, currentPageName }) {
  const { user } = useRole();
  return (
    <TenantProvider user={user}>
      <TenantContextSyncer />
      <BranchProvider>
        <LayoutContent currentPageName={currentPageName}>{children}</LayoutContent>
      </BranchProvider>
    </TenantProvider>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <RoleProvider>
          <TenantAwareLayout currentPageName={currentPageName}>{children}</TenantAwareLayout>
        </RoleProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}