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
        .filter(([path]) => path !== 'MfaVerify')
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
      <Route path="/HRManagerDashboard" element={<LayoutWrapper currentPageName="HRManagerDashboard"><HRManagerDashboard /></LayoutWrapper>} />
      <Route path="/EOSBCalculator" element={<LayoutWrapper currentPageName="EOSBCalculator"><EOSBCalculator /></LayoutWrapper>} />
      <Route path="/FinanceDashboard" element={<LayoutWrapper currentPageName="FinanceDashboard"><FinanceDashboard /></LayoutWrapper>} />
      <Route path="/TrialBalance" element={<LayoutWrapper currentPageName="TrialBalance"><TrialBalance /></LayoutWrapper>} />
      <Route path="/MonthEndClose" element={<LayoutWrapper currentPageName="MonthEndClose"><MonthEndClose /></LayoutWrapper>} />
      <Route path="/FinancialStatements" element={<LayoutWrapper currentPageName="FinancialStatements"><FinancialStatements /></LayoutWrapper>} />
      <Route path="/IntegrationHub" element={<LayoutWrapper currentPageName="IntegrationHub"><IntegrationHub /></LayoutWrapper>} />
      <Route path="/AdminMessaging" element={<LayoutWrapper currentPageName="AdminMessaging"><AdminMessaging /></LayoutWrapper>} />

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
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
