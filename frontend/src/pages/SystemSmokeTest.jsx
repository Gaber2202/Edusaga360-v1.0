import React, { useState } from 'react';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { useLanguage } from '../components/LanguageContext';
import { useRole } from '../components/RoleContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import PageHeader from '../components/ui/PageHeader';
import { CheckCircle, AlertTriangle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const SMOKE_TESTS = [
  {
    name: 'API Connectivity',
    nameAr: 'اتصال API',
    test: async () => {
      const start = Date.now();
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      const duration = Date.now() - start;
      return { success: !!user, duration };
    }
  },
  {
    name: 'Student Entity',
    nameAr: 'كيان الطالب',
    test: async () => {
      const { data: students = [] } = await tenantQuery('students').select('*').order('created_at', { ascending: false }).limit();
      return { success: Array.isArray(students), count: students.length };
    }
  },
  {
    name: 'Employee Entity',
    nameAr: 'كيان الموظف',
    test: async () => {
      const { data: employees = [] } = await tenantQuery('employees').select('id, employee_id, name_ar, name_en, status, job_title, department_id, branch_id, hire_date, end_date, is_saudi, is_gosi_applicable, iqama_expiry, passport_expiry, visa_expiry, nationality, gender, employment_type, photo_url, user_id, created_at').order('created_at', { ascending: false }).limit();
      return { success: Array.isArray(employees), count: employees.length };
    }
  },
  {
    name: 'Branch Entity',
    nameAr: 'كيان الفرع',
    test: async () => {
      const { data: branches = [] } = await tenantQuery('branches').select('*').order('created_at', { ascending: false }).limit();
      return { success: Array.isArray(branches), count: branches.length };
    }
  },
  {
    name: 'Error Logging',
    nameAr: 'تسجيل الأخطاء',
    test: async () => {
      const { data: errors = [] } = await tenantQuery('system_errors').select('*').order('created_at', { ascending: false }).limit();
      return { success: Array.isArray(errors) };
    }
  },
  {
    name: 'Session Persistence',
    nameAr: 'استمرارية الجلسة',
    test: async () => {
      const user1 = await supabase.auth.getUser().then(r => r.data?.user);
      const user2 = await supabase.auth.getUser().then(r => r.data?.user);
      return { success: user1?.id === user2?.id };
    }
  }
];

export default function SystemSmokeTest() {
  const { t: _t, isRTL } = useLanguage();
  const { userRole } = useRole();
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  // Admin only
  if (userRole !== 'admin') {
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

  const runTests = async () => {
    setRunning(true);
    const testResults = [];
    
    for (const smokeTest of SMOKE_TESTS) {
      const startTime = Date.now();
      try {
        const result = await smokeTest.test();
        const duration = Date.now() - startTime;
        testResults.push({
          name: smokeTest.name,
          nameAr: smokeTest.nameAr,
          status: result.success ? 'pass' : 'fail',
          duration,
          message: result.success ? 'OK' : 'Failed',
          details: result
        });
      } catch (error) {
        const duration = Date.now() - startTime;
        testResults.push({
          name: smokeTest.name,
          nameAr: smokeTest.nameAr,
          status: 'error',
          duration,
          message: error.message,
          details: { error: error.toString() }
        });
      }
    }
    
    setResults(testResults);
    setLastRun(new Date());
    setRunning(false);
    
    const allPassed = testResults.every(r => r.status === 'pass');
    if (allPassed) {
      toast.success(isRTL ? 'جميع الاختبارات نجحت' : 'All tests passed');
    } else {
      toast.error(isRTL ? 'بعض الاختبارات فشلت' : 'Some tests failed');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'fail':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pass':
        return 'bg-green-50 border-green-200';
      case 'fail':
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status !== 'pass').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isRTL ? 'اختبار صحة النظام' : 'System Smoke Test'}
        subtitle={isRTL ? 'تشغيل اختبارات شاملة للنظام' : 'Run comprehensive system tests'}
      />

      {/* Summary */}
      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-1">{passCount}</div>
                <p className="text-sm text-slate-600">{isRTL ? 'نجحت' : 'Passed'}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600 mb-1">{failCount}</div>
                <p className="text-sm text-slate-600">{isRTL ? 'فشلت' : 'Failed'}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-slate-900 mb-1">{results.length}</div>
                <p className="text-sm text-slate-600">{isRTL ? 'الإجمالي' : 'Total'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Last Run Time */}
      {lastRun && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-slate-600">
            {isRTL ? 'آخر تشغيل: ' : 'Last run: '}
            <span className="font-mono">{lastRun.toLocaleTimeString()}</span>
          </p>
        </div>
      )}

      {/* Run Button */}
      <Button
        onClick={runTests}
        disabled={running}
        className="gap-2 bg-slate-900 hover:bg-slate-800"
        size="lg"
      >
        {running && <Loader2 className="w-5 h-5 animate-spin" />}
        <RefreshCw className="w-5 h-5" />
        {running ? (isRTL ? 'جاري التشغيل...' : 'Running...') : (isRTL ? 'تشغيل الاختبارات' : 'Run Tests')}
      </Button>

      {/* Test Results */}
      <div className="space-y-3">
        {results.map((result, idx) => (
          <Card key={idx} className={`border-2 ${getStatusColor(result.status)}`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(result.status)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">
                      {isRTL ? result.nameAr : result.name}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {result.message}
                      {result.duration && (
                        <span className="ms-2 text-xs text-slate-500">
                          ({result.duration}ms)
                        </span>
                      )}
                    </p>
                    {result.details && Object.keys(result.details).length > 0 && (
                      <pre className="text-xs bg-slate-50 p-2 rounded mt-2 overflow-auto max-h-24 text-slate-700">
                        {JSON.stringify(result.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                  result.status === 'pass' 
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {result.status.toUpperCase()}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health Status */}
      {results.length > 0 && (
        <Card className={results.every(r => r.status === 'pass') ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardHeader>
            <CardTitle className={results.every(r => r.status === 'pass') ? 'text-green-800' : 'text-red-800'}>
              {results.every(r => r.status === 'pass')
                ? (isRTL ? '✓ النظام يعمل بشكل سليم' : '✓ System is healthy')
                : (isRTL ? '✗ النظام يحتاج إلى صيانة' : '✗ System needs maintenance')}
            </CardTitle>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}