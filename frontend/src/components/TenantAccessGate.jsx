import React from 'react';
import { useTenant } from './TenantContext';
import { useRole } from './RoleContext';
import { useLanguage } from './LanguageContext';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ShieldAlert, Clock, LogOut, AlertTriangle } from 'lucide-react'; // eslint-disable-line no-unused-vars
import { DEFAULT_UNASSIGNED_ROLE } from '../lib/authHelpers';

/**
 * TenantAccessGate — blocks tenant module access for users who:
 * - Have no tenant_id assigned
 * - Have an inactive/expired tenant
 * - Are partially configured (no role, etc.)
 * 
 * Platform owners (creators) bypass this gate entirely.
 */
export default function TenantAccessGate({ children }) {
  const { tenant, tenantLoading, isTenantActive, isTrialExpired, needsOnboarding } = useTenant();
  const { user, userRole, isCreator, loading: roleLoading } = useRole();
  const { isRTL } = useLanguage();

  // Still loading — show spinner
  if (roleLoading || tenantLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // Platform owner / creator bypasses all checks
  if (isCreator()) return children;

  // User has no tenant_id — redirect them to the registration page
  // so they can request a new organization or sign in to an existing one.
  const tenantId = tenant?.id || user?.tenant_id;
  if (!tenantId) {
    if (window.location.pathname !== '/register') {
      window.location.replace('/register');
    }
    return null;
  }

  // Tenant is expired
  if (isTrialExpired()) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {isRTL ? 'انتهت الفترة التجريبية' : 'Trial Period Expired'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isRTL 
                ? 'انتهت فترة التجربة المجانية لمؤسستك. يرجى الترقية للاستمرار.'
                : 'Your organization\'s free trial has expired. Please upgrade to continue.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tenant is suspended/cancelled
  if (!isTenantActive()) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {isRTL ? 'الحساب موقوف' : 'Account Suspended'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isRTL 
                ? 'حساب مؤسستك موقوف حالياً. يرجى التواصل مع الدعم.'
                : 'Your organization account is currently suspended. Please contact support.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Tenant needs onboarding — force redirect to wizard
  // Allow wizard page, setup page, and logout to pass through
  const currentPath = window.location.pathname;
  const onboardingExemptPaths = ['/OnboardingWizard', '/setup', '/register', '/InstitutionSetup'];
  const isExempt = onboardingExemptPaths.some(p => currentPath.startsWith(p));
  if (needsOnboarding() && !isExempt) {
    window.location.replace('/OnboardingWizard');
    return null;
  }

  // User has a tenant but no app role assigned yet — show a clear message instead of
  // silently letting them into the app with an elevated default role.
  if (userRole === DEFAULT_UNASSIGNED_ROLE) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {isRTL ? 'لم يتم تعيين صلاحية بعد' : 'Role Not Assigned Yet'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isRTL
                ? 'تم ربط حسابك بالمؤسسة بنجاح. يرجى التواصل مع مدير النظام لتعيين صلاحيتك قبل الدخول إلى النظام.'
                : 'Your account is linked to the organization, but your administrator has not yet assigned you a role. Please contact your system administrator.'}
            </p>
            <Button variant="outline" onClick={() => import('../api/supabaseClient').then(m => m.supabase.auth.signOut())}>
              <LogOut className="w-4 h-4 me-2" />
              {isRTL ? 'تسجيل الخروج' : 'Logout'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // All checks passed — render children
  return children;
}