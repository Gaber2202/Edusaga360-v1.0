import React from 'react';
import { useLanguage } from '../LanguageContext';
import { supabase, tenantQuery } from '../../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class PayrollErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  async componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    
    // Log to system error log
    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user);
      await tenantQuery('system_errors').insert({
        error_type: 'payroll_runtime_error',
        severity: 'high',
        page: this.props.page || 'Payroll',
        module: 'Payroll',
        action: this.props.action || 'unknown',
        error_message: error?.message || 'Unknown error',
        stack_trace: error?.stack || errorInfo?.componentStack || '',
        user_email: user?.email || 'unknown',
        metadata: { 
          errorInfo: errorInfo?.componentStack,
          props: this.props
        }
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <PayrollErrorUI 
          error={this.state.error} 
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

function PayrollErrorUI({ error, onReset }) {
  const { isRTL } = useLanguage();

  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <Card className="max-w-md w-full border-red-200 bg-red-50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-red-900">
                {isRTL ? 'حدث خطأ' : 'An Error Occurred'}
              </CardTitle>
              <p className="text-sm text-red-700 mt-1">
                {isRTL ? 'حدث خطأ غير متوقع في نظام الرواتب' : 'An unexpected error occurred in the payroll system'}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-white p-3 rounded border border-red-200">
              <p className="text-xs font-mono text-red-800">{error.message}</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              onClick={onReset}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              <RefreshCw className="w-4 h-4 me-2" />
              {isRTL ? 'إعادة المحاولة' : 'Retry'}
            </Button>
            <Button 
              variant="outline"
              onClick={() => window.history.back()}
              className="flex-1"
            >
              {isRTL ? 'رجوع' : 'Go Back'}
            </Button>
          </div>
          <p className="text-xs text-red-600 text-center">
            {isRTL 
              ? 'تم تسجيل الخطأ للمراجعة. يرجى التواصل مع الدعم إذا استمرت المشكلة.'
              : 'Error has been logged for review. Please contact support if the issue persists.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default PayrollErrorBoundary;