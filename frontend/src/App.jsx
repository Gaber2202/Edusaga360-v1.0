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
import ParentIntakePage from './pages/ParentIntake';
import InstitutionSetup from './pages/InstitutionSetup';
import Register from './pages/Register';
import SetupAccount from './pages/SetupAccount';
import SchoolLogin from './pages/SchoolLogin';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PaymentResult from './pages/PaymentResult';
import { JurisdictionFeatureProvider } from './components/JurisdictionFeatureContext';
import JurisdictionFeatureRoute from './components/JurisdictionFeatureRoute';
import { PAGE_FEATURE_KEYS } from './lib/jurisdictionFeatures.js';

// Every page under ./pages is lazy-loaded (its own chunk) and rendered inside a
// Suspense boundary, so navigating to a route only downloads that page.
const Pages = Object.fromEntries(
  Object.entries(getPageLoaders()).map(([name, loader]) => [name, React.lazy(loader)])
);
const mainPageKey = 'Dashboard';
const MainPage = Pages[mainPageKey] ?? (() => <></>);

// Public / auth-entry page keys are eagerly imported and routed explicitly below.
// They must NOT be auto-registered through the lazy Pages map, otherwise React
// Router's case-insensitive matching will wrap them in Layout/TenantAccessGate.
const PUBLIC_PAGE_KEYS = new Set([
  'Register',
  'RegistrationWizard',
  'OnboardingWizard',
  'SchoolLogin',
  'ForgotPassword',
  'ResetPassword',
  'SetupAccount',
  'PaymentResult',
  'ParentSignContract',
  'ParentIntake',
  'InstitutionSetup',
  'MfaVerify',
]);

// Spinner shown while a lazy page chunk downloads.
const PageFallback = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="w-8 h-8 border-4 border-border border-t-najdi-700 rounded-full animate-spin"></div>
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

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
    pathname === '/ParentIntake' ||
    pathname === '/InstitutionSetup' ||
    pathname.startsWith('/onboarding/'); // /onboarding/:token is unauthenticated
  // ParentSignContract requires authenticated parent portal session (SCRUM-119)

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
            <Route path="/ParentIntake" element={<ParentIntakePage />} />
            <Route path="/InstitutionSetup" element={<InstitutionSetup />} />
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
            <Route path="/ParentIntake" element={<ParentIntakePage />} />
            <Route path="/InstitutionSetup" element={<InstitutionSetup />} />
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
        .filter(([path]) => !PUBLIC_PAGE_KEYS.has(path))
        .map(([path, Page]) => {
          const featureKeys = PAGE_FEATURE_KEYS[path];
          const element = (
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          );
          return (
            <Route
              key={path}
              path={`/${path}`}
              element={
                featureKeys ? (
                  <JurisdictionFeatureRoute featureKeys={featureKeys}>
                    {element}
                  </JurisdictionFeatureRoute>
                ) : element
              }
            />
          );
        })}
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
      <Route path="/ParentIntake" element={<ParentIntakePage />} />

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
