import React, { useState } from 'react';
import { useLanguage } from '../components/LanguageContext';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  LayoutDashboard,
  PlayCircle,
  Sliders,
  Wallet,
  GraduationCap,
  CalendarClock,
  Landmark,
  FileText,
  Settings
} from 'lucide-react';

// Import payroll components
import PayrollErrorBoundary from '../components/payroll/PayrollErrorBoundary';
import PayrollDashboard from '../components/payroll/PayrollDashboard';
import PayRunsList from '../components/payroll/PayRunsList';
import PayRunDetails from '../components/payroll/PayRunDetails';
import SalaryComponents from '../components/payroll/SalaryComponents';
import LoansManagement from '../components/payroll/LoansManagement';
import TuitionAdvanceManagement from '../components/payroll/TuitionAdvanceManagement';
import GOSISubmissions from '../components/payroll/GOSISubmissions';
import BankExports from '../components/payroll/BankExports';
import PayrollReports from '../components/payroll/PayrollReports';
import PayrollSettings from '../components/payroll/PayrollSettings';
import PayrollCalculationEngine from '../components/hr/PayrollCalculationEngine';
import { useJurisdictionFeatures } from '../components/JurisdictionFeatureContext';
import { GOSI_FEATURES, WPS_FEATURES, NATIONALISATION_FEATURES } from '../lib/jurisdictionFeatures.js';

export default function Payroll() {
  const { isRTL } = useLanguage();
  const { isFeatureEnabled, areAnyEnabled } = useJurisdictionFeatures();
  const gosiEnabled = isFeatureEnabled(GOSI_FEATURES[0]);
  const wpsEnabled = areAnyEnabled(WPS_FEATURES);
  const nationalisationEnabled = isFeatureEnabled(NATIONALISATION_FEATURES[0]);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [selectedPayRun, setSelectedPayRun] = useState(null);
  const [enginePeriod, setEnginePeriod] = useState(new Date().toISOString().substring(0, 7));

  const allNavItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: { ar: 'لوحة التحكم', en: 'Dashboard' } },
    { id: 'engine', icon: PlayCircle, label: { ar: '⚡ محرك الرواتب', en: '⚡ Payroll Engine' } },
    { id: 'payruns', icon: PlayCircle, label: { ar: 'كشوفات الرواتب', en: 'Pay Runs' } },
    { id: 'components', icon: Sliders, label: { ar: 'عناصر الراتب', en: 'Salary Components' } },
    { id: 'loans', icon: Wallet, label: { ar: 'القروض والسلف', en: 'Loans & Advances' } },
    { id: 'tuition', icon: GraduationCap, label: { ar: 'سلف الرسوم', en: 'Tuition Advances' } },
    { id: 'gosi', icon: CalendarClock, label: { ar: 'تقديمات GOSI', en: 'GOSI Submissions' } },
    { id: 'bank', icon: Landmark, label: { ar: 'ملفات البنك', en: 'Bank Exports' } },
    { id: 'reports', icon: FileText, label: { ar: 'التقارير', en: 'Reports' } },
    { id: 'settings', icon: Settings, label: { ar: 'الإعدادات', en: 'Settings' } },
  ];
  const navItems = allNavItems.filter(item => {
    if (item.id === 'gosi') return gosiEnabled;
    if (item.id === 'bank') return wpsEnabled;
    return true;
  });

  const handleNavigate = (section) => {
    setActiveSection(section);
    setSelectedPayRun(null);
  };

  const handleViewPayRun = (payRun) => {
    setSelectedPayRun(payRun);
    setActiveSection('payrun-details');
  };

  const renderContent = () => {
    if (activeSection === 'payrun-details' && selectedPayRun) {
      return (
        <PayrollErrorBoundary page="PayRunDetails" action="view_pay_run">
          <PayRunDetails 
            payRun={selectedPayRun} 
            onBack={() => {
              setSelectedPayRun(null);
              setActiveSection('payruns');
            }}
          />
        </PayrollErrorBoundary>
      );
    }

    if (activeSection === 'engine') {
      return (
        <PayrollErrorBoundary page="PayrollEngine" action="run_engine">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-ink">{isRTL ? 'الفترة:' : 'Period:'}</label>
              <input type="month" value={enginePeriod} onChange={e => setEnginePeriod(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <PayrollCalculationEngine isRTL={isRTL} period={enginePeriod} onComplete={() => handleNavigate('payruns')} />
          </div>
        </PayrollErrorBoundary>
      );
    }

    switch (activeSection) {
      case 'dashboard':
        return (
          <PayrollErrorBoundary page="PayrollDashboard" action="view_dashboard">
            <PayrollDashboard onNavigate={handleNavigate} />
          </PayrollErrorBoundary>
        );
      case 'payruns':
        return (
          <PayrollErrorBoundary page="PayRunsList" action="view_list">
            <PayRunsList onViewPayRun={handleViewPayRun} />
          </PayrollErrorBoundary>
        );
      case 'components':
        return (
          <PayrollErrorBoundary page="SalaryComponents" action="view_components">
            <SalaryComponents />
          </PayrollErrorBoundary>
        );
      case 'loans':
        return (
          <PayrollErrorBoundary page="LoansManagement" action="view_loans">
            <LoansManagement />
          </PayrollErrorBoundary>
        );
      case 'tuition':
        return (
          <PayrollErrorBoundary page="TuitionAdvanceManagement" action="view_tuition">
            <TuitionAdvanceManagement />
          </PayrollErrorBoundary>
        );
      case 'gosi':
        return gosiEnabled ? (
          <PayrollErrorBoundary page="GOSISubmissions" action="view_gosi">
            <GOSISubmissions />
          </PayrollErrorBoundary>
        ) : null;
      case 'bank':
        return wpsEnabled ? (
          <PayrollErrorBoundary page="BankExports" action="view_bank">
            <BankExports />
          </PayrollErrorBoundary>
        ) : null;
      case 'reports':
        return (
          <PayrollErrorBoundary page="PayrollReports" action="view_reports">
            <PayrollReports />
          </PayrollErrorBoundary>
        );
      case 'settings':
        return (
          <PayrollErrorBoundary page="PayrollSettings" action="view_settings">
            <PayrollSettings />
          </PayrollErrorBoundary>
        );
      default:
        return (
          <PayrollErrorBoundary page="PayrollDashboard" action="view_dashboard">
            <PayrollDashboard onNavigate={handleNavigate} />
          </PayrollErrorBoundary>
        );
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-120px)] bg-sand -m-6">
      {/* Left Sidebar Navigation */}
      <aside className="hidden lg:flex lg:w-64 bg-white border-e border-border flex-shrink-0 flex-col">
        <div className="p-4 border-b border-border">
          <h1 className="text-xl font-bold text-ink">
            {isRTL ? 'نظام الرواتب' : 'Payroll System'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRTL ? 'إدارة رواتب الموظفين' : 'Employee Payroll Management'}
          </p>
        </div>
        
        <ScrollArea className="h-[calc(100%-80px)]">
          <nav className="p-2 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeSection === item.id || 
                (activeSection === 'payrun-details' && item.id === 'payruns');
              
              return (
                <Button
                  key={item.id}
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={`w-full justify-start gap-3 h-11 ${
                    isActive ? 'bg-sand-alt text-ink font-medium' : 'text-muted-foreground'
                  }`}
                  onClick={() => handleNavigate(item.id)}
                >
                  <Icon className="w-5 h-5" />
                  {isRTL ? item.label.ar : item.label.en}
                </Button>
              );
            })}
          </nav>
        </ScrollArea>
      </aside>

      {/* Mobile Navigation */}
      <div className="lg:hidden bg-white border-b border-border p-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeSection === item.id || 
              (activeSection === 'payrun-details' && item.id === 'payruns');
            
            return (
              <Button
                key={item.id}
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                className={`gap-2 ${isActive ? 'bg-najdi-900' : ''}`}
                onClick={() => handleNavigate(item.id)}
              >
                <Icon className="w-4 h-4" />
                <span className="whitespace-nowrap">{isRTL ? item.label.ar : item.label.en}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}