import React from 'react';
import { useTenant } from './TenantContext';
import { useRole } from './RoleContext';
import { useLanguage } from './LanguageContext';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { ShieldAlert, Clock, LogOut, AlertTriangle } from 'lucide-react';  
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

  // User is authenticated but has no resolvable tenant. DO NOT auto-redirect to
  // /register — that creates an endless sign-in -> register bounce for accounts
  // whose tenant linkage is missing. Show a clear screen with explicit actions
  // instead, so the user can retry, register, or sign out.
  const tenantId = tenant?.id || user?.tenant_id;
  if (!tenantId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {isRTL ? 'لم يتم العثور على مؤسسة مرتبطة' : 'No Linked Organization Found'}
            </h2>
            <p className="text-slate-500 text-sm">
              {isRTL
                ? 'حسابك غير مرتبط بأي مؤسسة بعد. إذا أكملت الإعداد للتو، أعد تحميل الصفحة. وإلا سجّل مؤسسة جديدة أو تواصل مع الدعم.'
                : 'Your account is not linked to any organization yet. If you just completed setup, reload the page. Otherwise register a new organization or contact support.'}
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => window.location.reload()}>
                {isRTL ? 'إعادة تحميل' : 'Reload'}
              </Button>
              <Button variant="outline" onClick={() => window.location.replace('/register')}>
                {isRTL ? 'تسجيل مؤسسة جديدة' : 'Register a new organization'}
              </Button>
              <Button variant="ghost" onClick={() => import('../api/supabaseClient').then(m => m.supabase.auth.signOut().then(() => window.location.replace('/school-login')))}>
                {isRTL ? 'تسجيل الخروج' : 'Sign out'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
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
  const onboardingExemptPaths = ['/OnboardingWizard', '/onboarding/', '/setup', '/register', '/InstitutionSetup', '/school-login'];
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