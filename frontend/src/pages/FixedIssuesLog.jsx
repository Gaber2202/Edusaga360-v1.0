import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export default function FixedIssuesLog() {
  const { t: _t, isRTL } = useLanguage();
  const { userRole } = useRole();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  const isAdmin = userRole === 'admin';

  const { data: issues = [], isLoading } = useQuery({
    queryKey: ['fixedIssues'],
    queryFn: () => tenantQuery('fixed_issues').select('*').order('-verified_date'),
    enabled: isAdmin,
  });

  // Admin only
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md w-full p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <h2 className="text-lg font-semibold">{isRTL ? 'غير مصرح' : 'Unauthorized'}</h2>
          </div>
        </Card>
      </div>
    );
  }

  const filteredIssues = issues.filter(issue => {
    const matchesSearch = 
      issue.issue_description?.toLowerCase().includes(search.toLowerCase()) ||
      issue.issue_number?.includes(search) ||
      issue.root_cause?.toLowerCase().includes(search.toLowerCase());
    
    const matchesModule = moduleFilter === 'all' || issue.module === moduleFilter;
    
    return matchesSearch && matchesModule;
  });

  const MODULES = [
    'admissions', 'students', 'fees', 'finance', 'procurement', 'assets',
    'hr', 'payroll', 'fleet', 'crm', 'facilities', 'it_helpdesk', 'general'
  ];

  const columns = [
    {
      header: isRTL ? 'رقم المشكلة' : 'Issue #',
      cell: (row) => (
        <span className="font-mono font-semibold">{row.issue_number}</span>
      )
    },
    {
      header: isRTL ? 'الوصف' : 'Description',
      cell: (row) => (
        <div className="max-w-sm">
          <p className="font-medium text-slate-900">{row.issue_description}</p>
          <p className="text-xs text-slate-500 mt-1">{row.module}</p>
        </div>
      )
    },
    {
      header: isRTL ? 'السبب الجذري' : 'Root Cause',
      cell: (row) => (
        <p className="text-sm text-slate-600 max-w-xs">{row.root_cause}</p>
      )
    },
    {
      header: isRTL ? 'الحل المطبق' : 'Fix Applied',
      cell: (row) => (
        <p className="text-sm text-slate-600 max-w-xs">{row.fix_applied}</p>
      )
    },
    {
      header: isRTL ? 'الأولوية' : 'Priority',
      cell: (row) => {
        const colors = {
          critical: 'bg-red-100 text-red-800',
          high: 'bg-orange-100 text-orange-800',
          medium: 'bg-yellow-100 text-yellow-800',
          low: 'bg-blue-100 text-blue-800'
        };
        return (
          <span className={`px-2 py-1 rounded text-xs font-semibold ${colors[row.priority] || colors.medium}`}>
            {row.priority}
          </span>
        );
      }
    },
    {
      header: isRTL ? 'التحقق' : 'Verified',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {row.verified ? (
            <>
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs">{row.verified_by}</span>
            </>
          ) : (
            <span className="text-xs text-slate-500">Pending</span>
          )}
        </div>
      )
    }
  ];

  // Root cause diagnosis of auto-reload bug
  const diagnosis = {
    timestamp: new Date('2026-01-19T12:00:00').toISOString(),
    severity: 'critical',
    rootCause: 'ErrorBoundary with infinite reload + RoleContext auth loop',
    symptoms: [
      'Page auto-reloads repeatedly',
      'Session storage error count increases',
      'No error boundary protection in Layout'
    ],
    fixApplied: [
      'Added error counter to ErrorBoundary (prevents >3 reloads)',
      'Removed auto-redirect on 401/403 - shows session expired message',
      'Added cleanup to RoleContext useEffect to prevent multiple simultaneous loads',
      'Added API error handler with safe retry limits',
      'Wrapped ErrorBoundary around entire app layout'
    ],
    verificationSteps: [
      'Run SystemSmokeTest to confirm no errors',
      'Monitor SystemErrorLog for new errors',
      'Check that page doesn\'t reload when navigation occurs',
      'Verify session expired message shows instead of reload loop'
    ]
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'سجل المشاكل المحلولة' : 'Fixed Issues Log'}
        subtitle={isRTL ? 'تتبع المشاكل التي تم حلها والتحقق منها' : 'Track resolved and verified issues'}
      />

      {/* Critical Issue Diagnosis - Auto Reload Bug Fix */}
      <Card className="border-2 border-red-200 bg-red-50">
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-900">
                {isRTL ? 'الإصلاح الحرج: حلقة إعادة تحميل النظام' : 'CRITICAL FIX: System Auto-Reload Loop'}
              </h3>
              <p className="text-sm text-red-700 mt-1">
                {isRTL 
                  ? 'تم تشخيص السبب الجذري وتطبيق الإصلاح الكامل'
                  : 'Root cause diagnosed and full fix applied'}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/50 p-3 rounded border border-red-200">
              <h4 className="font-semibold text-red-900 text-sm mb-2">{isRTL ? 'السبب الجذري' : 'ROOT CAUSE'}</h4>
              <ul className="text-xs space-y-1 text-red-800">
                {diagnosis.symptoms.map((sym, i) => (
                  <li key={i}>• {sym}</li>
                ))}
              </ul>
            </div>
            
            <div className="bg-white/50 p-3 rounded border border-green-200">
              <h4 className="font-semibold text-green-900 text-sm mb-2">{isRTL ? 'الإصلاحات المطبقة' : 'FIXES APPLIED'}</h4>
              <ul className="text-xs space-y-1 text-green-800">
                {diagnosis.fixApplied.map((fix, i) => (
                  <li key={i}>✓ {fix}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-white/50 p-3 rounded border border-blue-200">
            <h4 className="font-semibold text-blue-900 text-sm mb-2">{isRTL ? 'خطوات التحقق' : 'VERIFICATION'}</h4>
            <ol className="text-xs space-y-1 text-blue-800 ms-4">
              {diagnosis.verificationSteps.map((step, i) => (
                <li key={i}>{i + 1}. {step}</li>
              ))}
            </ol>
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline" className="text-sm">
              <a href="/admin/system-smoke-test">{isRTL ? 'اختبار النظام' : 'Run System Test'}</a>
            </Button>
            <Button asChild variant="outline" className="text-sm">
              <a href="/admin/system-errors">{isRTL ? 'سجل الأخطاء' : 'View Error Log'}</a>
            </Button>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder={isRTL ? 'بحث...' : 'Search...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <select 
          value={moduleFilter} 
          onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-2 border rounded-md bg-white"
        >
          <option value="all">{isRTL ? 'جميع الأقسام' : 'All Modules'}</option>
          {MODULES.map(mod => (
            <option key={mod} value={mod}>{mod}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-sm text-slate-600 mb-1">{isRTL ? 'إجمالي المشاكل' : 'Total Issues'}</div>
          <div className="text-2xl font-bold text-slate-900">{filteredIssues.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-600 mb-1">{isRTL ? 'تم التحقق' : 'Verified'}</div>
          <div className="text-2xl font-bold text-green-600">{filteredIssues.filter(i => i.verified).length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-slate-600 mb-1">{isRTL ? 'حرجة' : 'Critical'}</div>
          <div className="text-2xl font-bold text-red-600">{filteredIssues.filter(i => i.priority === 'critical').length}</div>
        </Card>
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredIssues}
        loading={isLoading}
        emptyMessage={isRTL ? 'لا توجد مشاكل محلولة' : 'No fixed issues'}
      />
    </div>
  );
}