import { Toaster } from './components/ui/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from './lib/query-client';
import NavigationTracker from './lib/NavigationTracker';
import { pagesConfig } from './pages.config';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from './lib/AuthContext';
import UserNotRegisteredError from './components/UserNotRegisteredError';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SubscriptionManagement from './pages/SubscriptionManagement';
import ClientSubscription from './pages/ClientSubscription';
import OnboardingWizard from './pages/OnboardingWizard';
import RegistrationWizard from './pages/RegistrationWizard';
import ParentSignContractPage from './pages/ParentSignContract';
import FinanceDashboard from './pages/FinanceDashboard';
import TrialBalance from './pages/TrialBalance';
import MonthEndClose from './pages/MonthEndClose';
import FinancialStatements from './pages/FinancialStatements';
import HRManagerDashboard from './pages/HRManagerDashboard';
import EOSBCalculator from './pages/EOSBCalculator';
import IntegrationHub from './pages/IntegrationHub';
import AdminMessaging from './pages/AdminMessaging';

import InstitutionSetup from './pages/InstitutionSetup';
import Register from './pages/Register';
import SetupAccount from './pages/SetupAccount';
import SchoolLogin from './pages/SchoolLogin';
import { useRole } from './components/RoleContext';
import { isPlatformOwner } from './lib/authHelpers';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : () => <></>;

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
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    const pathname = window.location.pathname;
    const isPublicPath =
      pathname === '/RegistrationWizard' ||
      pathname === '/register' ||
      pathname === '/client/login' ||
      pathname === '/school-login' ||
      pathname === '/setup' ||
      pathname === '/OnboardingWizard' ||
      pathname.startsWith('/onboarding/'); // /onboarding/:token is unauthenticated

    if (authError.type === 'user_not_registered') {
      if (isPublicPath) {
        return (
          <Routes>
            <Route path="/RegistrationWizard" element={<RegistrationWizard />} />
            <Route path="/register" element={<Register />} />
            <Route path="/client/login" element={<Navigate to="/school-login" replace />} />
            <Route path="/school-login" element={<SchoolLogin />} />
            <Route path="/setup" element={<SetupAccount />} />
            <Route path="/OnboardingWizard" element={<OnboardingWizard />} />
            <Route path="/onboarding/:token" element={<OnboardingWizard />} />
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
            <Route path="/setup" element={<SetupAccount />} />
            <Route path="/OnboardingWizard" element={<OnboardingWizard />} />
            <Route path="/onboarding/:token" element={<OnboardingWizard />} />
          </Routes>
        );
      }
      window.location.replace('/school-login');
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
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
      <Route path="/setup" element={<SetupAccount />} />
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
