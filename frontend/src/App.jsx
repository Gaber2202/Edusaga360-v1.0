import React, { Suspense } from 'react';
import ChunkLoadErrorBoundary from './components/ChunkLoadErrorBoundary';
import { Toaster } from './components/ui/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from './lib/query-client';
import NavigationTracker from './lib/NavigationTracker';
import Layout from './Layout.jsx';
import { getPageLoaders } from './pageModules';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from './lib/AuthContext';
import UserNotRegisteredError from './components/UserNotRegisteredError';
// Public / auth-entry pages stay eagerly imported — they're on the
// unauthenticated critical path and are rendered outside the Suspense boundary.
import OnboardingWizard from './pages/OnboardingWizard';
import RegistrationWizard from './pages/RegistrationWizard';
import ParentSignContractPage from './pages/ParentSignContract';
import InstitutionSetup from './pages/InstitutionSetup';
import Register from './pages/Register';
import SetupAccount from './pages/SetupAccount';
import SchoolLogin from './pages/SchoolLogin';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PaymentResult from './pages/PaymentResult';
import { useRole } from './components/RoleContext';
import { isPlatformOwner } from './lib/authHelpers';
import { JurisdictionFeatureProvider } from './components/JurisdictionFeatureContext';
import JurisdictionFeatureRoute from './components/JurisdictionFeatureRoute';
import ModuleFeatureRoute from './components/ModuleFeatureRoute';
import { PAGE_FEATURE_KEYS } from './lib/jurisdictionFeatures.js';
import { PAGE_MODULE_KEYS } from './lib/moduleFeatures.js';

// Every page under ./pages is lazy-loaded (its own chunk) and rendered inside a
// Suspense boundary, so navigating to a route only downloads that page.
const Pages = Object.fromEntries(
  Object.entries(getPageLoaders()).map(([name, loader]) => [name, React.lazy(loader)])
);
const mainPageKey = 'Dashboard';
const MainPage = Pages[mainPageKey] ?? (() => <></>);

// Lazy pages that also have explicit (guarded / aliased) routes below.
const SuperAdminDashboard = Pages.SuperAdminDashboard;
const SubscriptionManagement = Pages.SubscriptionManagement;
const ClientSubscription = Pages.ClientSubscription;
const FinanceDashboard = Pages.FinanceDashboard;
const TrialBalance = Pages.TrialBalance;
const MonthEndClose = Pages.MonthEndClose;
const FinancialStatements = Pages.FinancialStatements;
const HRManagerDashboard = Pages.HRManagerDashboard;
const EOSBCalculator = Pages.EOSBCalculator;
const IntegrationHub = Pages.IntegrationHub;
const AdminMessaging = Pages.AdminMessaging;

// Spinner shown while a lazy page chunk downloads.
const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-border border-t-najdi-700 rounded-full animate-spin"></div>
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

/** Guard that renders children only for platform owners; redirects others to root. */
const PlatformOwnerRoute = ({ children }) => {
  const { currentUser } = useRole();
  if (!isPlatformOwner(currentUser)) return <Navigate to="/" replace />;
  return children;
};

const AuthenticatedApp = () => {
  const { isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, requiresMfa } = useAuth();
  const pathname = window.location.pathname;
  const isPublicPath =
    pathname === '/RegistrationWizard' ||
    pathname === '/register' ||
    pathname === '/client/login' ||
    pathname === '/school-login' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/setup' ||
    pathname === '/OnboardingWizard' ||
    pathname === '/payment/result' ||
    pathname.startsWith('/onboarding/'); // /onboarding/:token is unauthenticated

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-najdi-700 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Prevent the guest placeholder (avatar letter 'U', no tenant access) from
  // appearing on protected routes. Public pages stay reachable without a session.
  if (!isAuthenticated && !isPublicPath) {
    return <Navigate to="/school-login" replace />;
  }

  // MFA-pending users must verify before reaching any protected page.
  if (isAuthenticated && requiresMfa && pathname !== '/MfaVerify') {
    return <Navigate to="/MfaVerify" replace />;
  }

  if (authError) {

    if (authError.type === 'user_not_registered') {
      if (isPublicPath) {
        return (
          <Routes>
            <Route path="/RegistrationWizard" element={<RegistrationWizard />} />
            <Route path="/register" element={<Register />} />
            <Route path="/client/login" element={<Navigate to="/school-login" replace />} />
            <Route path="/school-login" element={<SchoolLogin />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/setup" element={<SetupAccount />} />
            <Route path="/OnboardingWizard" element={<OnboardingWizard />} />
            <Route path="/onboarding/:token" element={<OnboardingWizard />} />
            <Route path="/payment/result" element={<PaymentResult />} />
          </Routes>
        );
      }
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      if (isPublicPath) {
        return (
          <Routes>
            <Route path="/RegistrationWizard" element={<RegistrationWizard />} />
            <Route path="/register" element={<Register />} />
            <Route path="/client/login" element={<Navigate to="/school-login" replace />} />
            <Route path="/school-login" element={<SchoolLogin />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/setup" element={<SetupAccount />} />
            <Route path="/OnboardingWizard" element={<OnboardingWizard />} />
            <Route path="/onboarding/:token" element={<OnboardingWizard />} />
            <Route path="/payment/result" element={<PaymentResult />} />
          </Routes>
        );
      }
      window.location.replace('/school-login');
      return null;
    }
  }

  return (
    <Suspense fallback={<PageFallback />}>
    <ChunkLoadErrorBoundary>
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages)
        .filter(([path]) => path !== 'MfaVerify' && !PAGE_FEATURE_KEYS[path] && !PAGE_MODULE_KEYS[path])
        .map(([path, Page]) => (
          <Route
            key={path}
            path={`/${path}`}
            element={
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            }
          />
        ))}
      {Object.entries(PAGE_FEATURE_KEYS)
        .filter(([path]) => Pages[path] && !PAGE_MODULE_KEYS[path])
        .map(([path, featureKeys]) => {
          const Page = Pages[path];
          return (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <JurisdictionFeatureRoute featureKeys={featureKeys}>
                  <LayoutWrapper currentPageName={path}>
                    <Page />
                  </LayoutWrapper>
                </JurisdictionFeatureRoute>
              }
            />
          );
        })}
      {Object.entries(PAGE_MODULE_KEYS)
        .filter(([path]) => Pages[path])
        .map(([path, moduleKeys]) => {
          const Page = Pages[path];
          return (
            <Route
              key={path}
              path={`/${path}`}
              element={
                <ModuleFeatureRoute moduleKeys={[moduleKeys]}>
                  <LayoutWrapper currentPageName={path}>
                    <Page />
                  </LayoutWrapper>
                </ModuleFeatureRoute>
              }
            />
          );
        })}
      <Route path="/SuperAdminDashboard" element={<PlatformOwnerRoute><LayoutWrapper currentPageName="SuperAdminDashboard"><SuperAdminDashboard /></LayoutWrapper></PlatformOwnerRoute>} />
      <Route path="/SubscriptionManagement" element={
        <LayoutWrapper currentPageName="SubscriptionManagement"><SubscriptionManagement /></LayoutWrapper>
      } />
      <Route path="/ClientSubscription" element={
        <LayoutWrapper currentPageName="ClientSubscription"><ClientSubscription /></LayoutWrapper>
      } />
      <Route path="/OnboardingWizard" element={<OnboardingWizard />} />
      <Route path="/onboarding/:token" element={<OnboardingWizard />} />
      <Route path="/RegistrationWizard" element={<RegistrationWizard />} />
      <Route path="/InstitutionSetup" element={<InstitutionSetup />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Navigate to="/school-login" replace />} />
      <Route path="/client/login" element={<Navigate to="/school-login" replace />} />
      <Route path="/school-login" element={<SchoolLogin />} />
      <Route path="/MfaVerify" element={<Pages.MfaVerify />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/setup" element={<SetupAccount />} />
      <Route path="/payment/result" element={<PaymentResult />} />
      <Route path="/ParentSignContract" element={<ParentSignContractPage />} />
      <Route path="/HRManagerDashboard" element={<ModuleFeatureRoute moduleKeys={['basic_hr']}><LayoutWrapper currentPageName="HRManagerDashboard"><HRManagerDashboard /></LayoutWrapper></ModuleFeatureRoute>} />
      <Route path="/EOSBCalculator" element={<ModuleFeatureRoute moduleKeys={['basic_hr']}><LayoutWrapper currentPageName="EOSBCalculator"><EOSBCalculator /></LayoutWrapper></ModuleFeatureRoute>} />
      <Route path="/FinanceDashboard" element={<ModuleFeatureRoute moduleKeys={['accounting']}><LayoutWrapper currentPageName="FinanceDashboard"><FinanceDashboard /></LayoutWrapper></ModuleFeatureRoute>} />
      <Route path="/TrialBalance" element={<ModuleFeatureRoute moduleKeys={['accounting']}><LayoutWrapper currentPageName="TrialBalance"><TrialBalance /></LayoutWrapper></ModuleFeatureRoute>} />
      <Route path="/MonthEndClose" element={<ModuleFeatureRoute moduleKeys={['accounting']}><LayoutWrapper currentPageName="MonthEndClose"><MonthEndClose /></LayoutWrapper></ModuleFeatureRoute>} />
      <Route path="/FinancialStatements" element={<ModuleFeatureRoute moduleKeys={['accounting']}><LayoutWrapper currentPageName="FinancialStatements"><FinancialStatements /></LayoutWrapper></ModuleFeatureRoute>} />
      <Route path="/IntegrationHub" element={<ModuleFeatureRoute moduleKeys={['integrations']}><LayoutWrapper currentPageName="IntegrationHub"><IntegrationHub /></LayoutWrapper></ModuleFeatureRoute>} />
      <Route path="/AdminMessaging" element={<ModuleFeatureRoute moduleKeys={['communications']}><LayoutWrapper currentPageName="AdminMessaging"><AdminMessaging /></LayoutWrapper></ModuleFeatureRoute>} />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </ChunkLoadErrorBoundary>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <JurisdictionFeatureProvider>
          <Router>
            <NavigationTracker />
            <AuthenticatedApp />
          </Router>
        </JurisdictionFeatureProvider>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
