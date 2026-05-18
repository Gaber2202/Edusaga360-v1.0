import React from 'react';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  async componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });

    // Increment error count to prevent infinite reload loops
    const errorCount = sessionStorage.getItem('error_boundary_count') || '0';
    const newCount = parseInt(errorCount) + 1;
    sessionStorage.setItem('error_boundary_count', newCount.toString());
    sessionStorage.setItem('error_boundary_last_error', new Date().toISOString());

    try {
      const user = await supabase.auth.getUser().then(r => r.data?.user).catch(() => null);
      await tenantQuery('system_errors').insert({
        error_id: `ERR-${Date.now()}`,
        timestamp: new Date().toISOString(),
        user_email: user?.email,
        user_name: user?.full_name,
        page: window.location.pathname,
        module: this.props.module || 'unknown',
        action: 'page_render',
        error_message: error.toString(),
        stack_trace: errorInfo.componentStack,
        severity: 'high',
        browser_info: navigator.userAgent
      });
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
  }

  handleGoHome = () => {
    sessionStorage.removeItem('error_boundary_count');
    sessionStorage.removeItem('error_boundary_last_error');
    // Use React Router navigation instead of full page reload
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.history.pushState({}, '', '/');
    window.location.reload(); // Only reload after navigation
  };

  handleReset = () => {
    // Reset error state without reloading the page
    const errorCount = parseInt(sessionStorage.getItem('error_boundary_count') || '0');
    if (errorCount < 3) {
      this.setState({ hasError: false, error: null, errorInfo: null });
      sessionStorage.setItem('error_boundary_count', '0');
    } else {
      alert(this.props.isRTL 
        ? 'حدثت مشاكل متعددة. يرجى الاتصال بدعم النظام.'
        : 'Multiple errors detected. Please contact system support.');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <CardTitle className="text-xl">حدث خطأ / Error Occurred</CardTitle>
                  <p className="text-sm text-slate-500">Something went wrong</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                {this.props.isRTL 
                  ? 'عذراً، حدث خطأ غير متوقع. تم تسجيل المشكلة وسيتم حلها قريباً.'
                  : 'Sorry, an unexpected error occurred. The issue has been logged and will be resolved shortly.'}
              </p>
              
              <div className="bg-slate-50 p-3 rounded-lg border max-h-24 overflow-auto">
                <p className="text-xs font-mono text-slate-700 break-all">
                  {this.state.error?.toString()}
                </p>
              </div>

              <div className="flex gap-2">
                <Button 
                  onClick={this.handleReset} 
                  className="flex-1 gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  {this.props.isRTL ? 'إعادة المحاولة' : 'Retry'}
                </Button>
                <Button 
                  variant="outline"
                  onClick={this.handleGoHome}
                  className="flex-1 gap-2"
                >
                  <Home className="w-4 h-4" />
                  {this.props.isRTL ? 'الرئيسية' : 'Home'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}