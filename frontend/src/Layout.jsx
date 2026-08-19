import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import { supabase } from './api/supabaseClient';
import { isPlatformOwner } from './lib/authHelpers';
import { LanguageProvider, useLanguage } from './components/LanguageContext';
import { RoleProvider, useRole } from './components/RoleContext';
import { BranchProvider, useBranch } from './components/BranchContext';
import { TenantProvider, useTenant } from './components/TenantContext';
import { useJurisdictionFeatures } from './components/JurisdictionFeatureContext';
import ErrorBoundary from './components/ErrorBoundary';
import NotificationBell from './components/notifications/NotificationBell';
import TenantAccessGate from './components/TenantAccessGate';
import TenantContextSyncer from './components/TenantContextSyncer';
import CommandPalette from './components/CommandPalette';
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
import PullToRefresh from './components/ui/PullToRefresh';
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
          Search,
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
          Store,
          Zap,
          Megaphone,
          Plane,
          Crown,
          } from 'lucide-react';

import { PAGE_FEATURE_KEYS } from './lib/jurisdictionFeatures.js';
import { PAGE_MODULE_KEYS } from './lib/moduleFeatures.js';

function filterNavigationByFeatures(items, areAnyEnabled, isModuleEnabled) {
  const out = [];
  for (const item of items) {
    const features = item.page ? PAGE_FEATURE_KEYS[item.page] : null;
    if (features && !areAnyEnabled(features)) continue;

    const moduleKey = item.page ? PAGE_MODULE_KEYS[item.page] : null;
    if (moduleKey && isModuleEnabled && !isModuleEnabled(moduleKey)) continue;

    const filtered = { ...item };
    if (item.children) {
      filtered.children = filterNavigationByFeatures(item.children, areAnyEnabled, isModuleEnabled);
      // Drop parent menu if none of its children remain and it has no own route.
      if (filtered.children.length === 0 && !item.page) continue;
    }
    out.push(filtered);
  }
  return out;
}

function LayoutContent({ children, currentPageName }) {
  const { t, isRTL, language: _language, toggleLanguage } = useLanguage();
  const { user, userRole, canAccess: _canAccess, loading, isTrial, isCreator } = useRole();
  const { tenant, isTenantActive, isModuleEnabled } = useTenant();
  const { branches, selectedBranchId, selectBranch } = useBranch();
  const { areAnyEnabled } = useJurisdictionFeatures();
  const queryClient = useQueryClient();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
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
      name: 'executiveCommandCenter',
      icon: Crown,
      page: 'ExecutiveCommandCenter',
      roles: ['admin', 'creator', 'ceo', 'cfo', 'coo', 'chro']
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
        { name: 'engagement', icon: Megaphone, page: 'Engagement', roles: ['admin', 'hr_admin', 'hr_officer'] },
        { name: 'expenses', icon: Receipt, page: 'Expenses', roles: ['admin', 'finance', 'hr_admin', 'branch_manager', 'accountant', 'teacher', 'hr_officer'] },
        { name: 'corporateCards', icon: CreditCard, page: 'CorporateCards', roles: ['admin', 'hr_admin', 'finance'] },
        { name: 'businessTravel', icon: Plane, page: 'BusinessTravel', roles: ['admin', 'hr_admin', 'finance', 'hr_officer', 'branch_manager'] },
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
        { name: 'yamenCollections', icon: RefreshCw, page: 'YamenCollections', roles: ['admin', 'finance', 'collections'] },
        { name: 'chequeManagement', icon: Banknote, page: 'ChequeManagement', roles: ['admin', 'finance', 'collections', 'branch_manager', 'accountant'] },
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
    roles: ['admin', 'it_admin', 'hr_admin', 'finance'],
    children: [
      { name: 'integrations', icon: Link2, page: 'Integrations', roles: ['admin', 'it_admin'] },
      { name: 'govIntegrations', icon: Shield, page: 'GovIntegrations', roles: ['admin', 'hr_admin', 'finance'] },
      { name: 'integrationHub', icon: Zap, page: 'IntegrationHub', roles: ['admin', 'it_admin'] },
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
      roles: ['admin', 'finance', 'branch_manager'],
      children: [
        { name: 'canteenManagement', icon: UtensilsCrossed, page: 'CanteenManagement', roles: ['admin', 'finance', 'branch_manager'] },
        { name: 'canteenPOSOrders', icon: Receipt, page: 'CanteenPOSOrders', roles: ['admin', 'finance', 'branch_manager'] },
      ]
    },
    {
      name: 'storeManagement',
      icon: Store,
      roles: ['admin', 'finance', 'branch_manager'],
      children: [
        { name: 'storeManagement', icon: Store, page: 'StoreManagement', roles: ['admin', 'finance', 'branch_manager'] },
        { name: 'storeOrders', icon: Receipt, page: 'StoreOrders', roles: ['admin', 'finance', 'branch_manager'] },
      ]
    },
    // Expenses moved into HR module — keeping this comment for route compatibility
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
      name: 'settings',
      icon: Settings,
      roles: ['admin', 'creator'],
      children: [
        { name: 'users', icon: UserCog, page: 'UserManagement', roles: ['admin', 'creator'] },
        { name: 'rolesPermissions', icon: Key, page: 'RolesPermissions', roles: ['admin', 'creator'] },
        { name: 'auditLogs', icon: History, page: 'AuditLogs', roles: ['creator'], creatorOnly: true },
        { name: 'companies', icon: Building2, page: 'Companies', roles: ['admin', 'creator'] },
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

  const isCreatorRole = userRole === 'creator' || userRole === 'admin';
  // creatorOnly items (e.g. Audit Logs) are visible only to the actual platform
  // owner/creator — never to tenant admins, even though admins otherwise see all.
  const isPlatformCreator = typeof isCreator === 'function' ? isCreator() : false;
  const allowItem = (it) => !it.creatorOnly || isPlatformCreator;
  const roleFilteredNavigation = navigation.filter(item => {
    if (!allowItem(item)) return false;
    if (isCreatorRole) return true;
    if (!item.roles) return true;
    return item.roles.includes(userRole);
  }).map(item => {
    if (item.children) {
      return {
        ...item,
        children: item.children.filter(child => {
          if (!allowItem(child)) return false;
          if (isCreatorRole) return true;
          return !child.roles || child.roles.includes(userRole);
        })
      };
    }
    return item;
  });

  // Apply jurisdiction feature gating so Saudi-government pages are absent for non-SA tenants.
  const filteredNavigation = filterNavigationByFeatures(roleFilteredNavigation, areAnyEnabled, isModuleEnabled);

  // Resolve a tappable target page for a top-level nav item (its own page, or
  // the first accessible child). Used to build a role-aware mobile bottom nav.
  const navTarget = (item) => item.page || item.children?.find((c) => c.page)?.page;
  const isNavActive = (item) =>
    item.page === currentPageName || item.children?.some((c) => c.page === currentPageName);
  // Primary bottom-nav slots come from whatever the user can actually reach —
  // never a hardcoded list that shows RBAC-blocked pages. Cap at 4 + "More".
  const bottomNavItems = filteredNavigation.filter(navTarget).slice(0, 4);

  // Pull-to-refresh: refetch every active query so the current screen's data
  // updates regardless of which page is mounted. Small floor so the spinner
  // reads as a deliberate refresh rather than a flicker.
  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries(),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — redirect regardless of network/session state
    }
    // Immediate, clean redirect to the single login screen — no chooser page.
    window.location.replace('/school-login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-najdi-700 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Platform-owner-only pages
  if (currentPageName === 'SuperAdminDashboard' && !isPlatformOwner(user)) {
    return <Navigate to="/" replace />;
  }

  // Module feature flags: an unbuilt/disabled module is absent, not a 404.
  const moduleKey = PAGE_MODULE_KEYS[currentPageName];
  if (moduleKey && !isModuleEnabled(moduleKey)) {
    return <Navigate to="/" replace />;
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
              ${isActive ? 'bg-najdi-700 text-white shadow-sm' : 'text-ink hover:bg-najdi-50 hover:text-najdi-900'}
              ${sidebarCollapsed && !mobile ? 'justify-center' : ''}
            `}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 flex-shrink-0 text-muted-foreground`} />
                {(!sidebarCollapsed || mobile) && <span className="font-medium text-sm">{t(item.name)}</span>}
              </div>
              {(!sidebarCollapsed || mobile) && (
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
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
                      ? 'bg-najdi-700 text-white shadow-sm' 
                      : 'text-ink hover:bg-najdi-50 hover:text-najdi-900'
                    }
                  `}
                >
                  <child.icon className={`w-4 h-4 flex-shrink-0 ${isChildActive ? 'text-white' : 'text-muted-foreground'}`} />
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
            ? 'bg-najdi-700 text-white shadow-sm' 
            : 'text-ink hover:bg-najdi-50 hover:text-najdi-900'}
          ${sidebarCollapsed && !mobile ? 'justify-center' : ''}
        `}
      >
        <item.icon className={`w-5 h-5 flex-shrink-0 ${isPageActive ? 'text-white' : 'text-muted-foreground'}`} />
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
    <div className={`flex h-[100dvh] bg-sand ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`
        html, body, #root {
          width: 100%;
          /* Use the dynamic viewport height so the app is exactly as tall as the
             *visible* area on mobile — 100vh includes the space behind the
             browser toolbar, which pushed the bottom nav (and the last row of
             page content/buttons) off-screen where overflow:hidden trapped it. */
          height: 100dvh;
          margin: 0;
          padding: 0;
          overflow: hidden;
        }
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Tajawal:wght@400;500;700&display=swap');
        html, body { 
          font-family: ${isRTL ? "'Tajawal', -apple-system, sans-serif" : "'Plus Jakarta Sans', -apple-system, sans-serif"}; 
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
        /* Safe area for mobile bottom nav */
        .safe-area-pb { padding-bottom: env(safe-area-inset-bottom, 0px); }
        /* Dark mode base */
        .dark { color-scheme: dark; }
        .dark body { background: hsl(156, 30%, 4%); color: hsl(150, 15%, 92%); }
        /* Print styles */
        @media print {
          aside, nav, header, .no-print, [role="navigation"] { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; }
          body { background: white !important; color: black !important; }
          .print-break { page-break-after: always; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: right; }
          th { background: #f1f5f9; font-weight: 600; }
        }
      `}</style>

      {/* Desktop Sidebar */}
      <aside className={`
        hidden lg:flex flex-col bg-white shadow-sm
        transition-all duration-300 z-20 flex-shrink-0
        ${sidebarCollapsed ? 'w-20 min-w-20' : 'w-72 min-w-72'}
        ${isRTL ? 'border-l' : 'border-r'} border-border
      `}>
        {/* Logo */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-border flex-shrink-0 w-full">
          {!sidebarCollapsed && (
                <div className="flex items-center gap-2">
                  <img 
                    src="/edusaga-logo.svg" 
                    alt="EduSaga Logo" 
                    className="h-8 w-auto"
                  />
                  <div>
                    <span className="font-semibold text-sm text-ink block leading-tight">EduSaga 360</span>
                    <span className="text-xs text-muted-foreground">v1.0</span>
                  </div>
                </div>
              )}
              {sidebarCollapsed && (
                <img 
                  src="/edusaga-logo.svg" 
                  alt="EduSaga Logo" 
                  className="h-6 w-auto mx-auto"
                />
              )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden w-full">
          <NavItems />
        </div>

        {/* Collapse Button */}
        <div className="p-3 border-t border-border flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full justify-center text-muted-foreground hover:text-ink"
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
        <header className="w-full h-14 bg-white border-b border-border flex items-center justify-between px-2 sm:px-3 lg:px-4 sticky top-0 z-10 shadow-sm overflow-x-hidden">
          {/* Trial Banner */}
          {isTrial() && (
            <div className="absolute top-full left-0 right-0 bg-najdi-700 text-white py-2 px-4 text-center text-sm font-medium z-10">
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
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={isRTL ? 'فتح القائمة' : 'Open menu'}>
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={isRTL ? 'right' : 'left'} className="w-72 p-0 flex flex-col h-full">
              <div className="h-16 flex items-center px-4 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-3">
                  <img 
                    src="/edusaga-logo.svg" 
                    alt="EduSaga Logo" 
                    className="h-10 w-auto"
                  />
                  <div>
                    <span className="font-semibold text-base text-ink block leading-tight">EduSaga 360</span>
                    <span className="text-xs text-muted-foreground">Platform</span>
                  </div>
                </div>
              </div>
              {/* Branch selector — surfaced here since it's hidden from the
                  compact mobile header, so branch switching stays reachable. */}
              {branches.length > 0 && (
                <div className="px-3 py-3 border-b border-border flex-shrink-0">
                  <Select value={selectedBranchId || 'all'} onValueChange={selectBranch}>
                    <SelectTrigger className="w-full bg-white text-sm">
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
              )}
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
              <div className="hidden lg:flex items-center gap-1 px-2 py-1 bg-najdi-50 rounded-lg border border-border text-xs">
                <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-muted-foreground max-w-[100px] truncate">
                  {isRTL ? tenant.name_ar : tenant.name_en}
                </span>
              </div>
            )}

            {/* Cmd+K Search */}
            <Button variant="ghost" size="icon" onClick={() => setCmdOpen(true)} className="hidden sm:flex text-muted-foreground hover:text-ink h-9 w-9" title={isRTL ? 'بحث (Ctrl+K)' : 'Search (Ctrl+K)'} aria-label={isRTL ? 'بحث' : 'Search'}>
              <Search className="w-4 h-4" />
            </Button>

            {/* Notification Bell */}
            <NotificationBell />

            {/* Dark Mode Toggle */}
            {/* Language Toggle */}
            <Button variant="ghost" size="icon" onClick={toggleLanguage} className="text-muted-foreground hover:text-ink h-9 w-9" aria-label={isRTL ? 'تغيير اللغة' : 'Toggle language'}>
              <Globe className="w-4 h-4" />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1 sm:gap-2 px-1 sm:px-2 h-9">
                  <Avatar className="w-7 h-7 sm:w-8 sm:h-8">
                    <AvatarFallback className="bg-najdi-900 text-white text-xs">
                        {(user?.display_name || user?.full_name || user?.email || '?')[0]?.toUpperCase()}
                      </AvatarFallback>
                  </Avatar>
                  <div className="hidden md:flex flex-col text-left min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-ink truncate">
                      {isRTL
                        ? ([user?.first_name_ar, user?.last_name_ar].filter(Boolean).join(' ') || user?._displayName || user?.display_name || user?.full_name || user?.email || '')
                        : ([user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.display_name || user?.full_name || user?.email || '')
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">{t(userRole)}</p>
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

        {/* Page Content.
            PullToRefresh is the scroll container. Bottom padding clears the
            fixed mobile bottom nav (3.5rem) PLUS the iOS home-indicator
            safe-area inset, so the last row of content and any action buttons
            scroll fully above the nav instead of hiding behind it (where the
            nav also used to swallow taps). */}
        <main className="flex-1 w-full bg-sand overflow-hidden flex flex-col min-h-0">
          <PullToRefresh
            onRefresh={handleRefresh}
            className="flex-1 w-full overflow-y-auto p-2 sm:p-4 lg:p-6 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6"
          >
            <div className="w-full min-h-full">
              <TenantAccessGate>{children}</TenantAccessGate>
            </div>
          </PullToRefresh>
        </main>

        {/* Mobile Bottom Navigation — role-aware, derived from accessible menu.
            Height = icon row (3.5rem) + safe-area inset below, so the icons are
            never squeezed by the home indicator. */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border flex items-stretch justify-around h-[calc(3.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] px-1">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item);
            return (
              <Link
                key={item.name}
                to={createPageUrl(navTarget(item))}
                className={`flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg transition-colors ${active ? 'text-najdi-700' : 'text-muted-foreground'}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-[11px] font-medium leading-none truncate max-w-full">{t(item.name)}</span>
              </Link>
            );
          })}
          {/* "More" opens the full slide-out drawer so every module stays reachable */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-1 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-lg text-muted-foreground transition-colors"
          >
            <Menu className="w-5 h-5 flex-shrink-0" />
            <span className="text-[11px] font-medium leading-none truncate max-w-full">{isRTL ? 'المزيد' : 'More'}</span>
          </button>
        </nav>
      </div>

      {/* Global Command Palette */}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
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