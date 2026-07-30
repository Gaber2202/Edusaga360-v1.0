import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/sonner';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import AccessDenied from './pages/AccessDenied';
import Dashboard from './pages/Dashboard';
import Tenants from './pages/Tenants';
import Trials from './pages/Trials';
import PlatformUsers from './pages/PlatformUsers';
import UserRequests from './pages/UserRequests';
import Invitations from './pages/Invitations';
import Subscriptions from './pages/Subscriptions';
import Analytics from './pages/Analytics';
import EmailTemplates from './pages/EmailTemplates';
import FeatureFlags from './pages/FeatureFlags';
import AuditLogs from './pages/AuditLogs';
import YamenAIUsage from './pages/YamenAIUsage';
import AdminSettings from './pages/AdminSettings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
});

function AppRoutes() {
  const { user, loading, accessDenied } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-najdi-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-slate-600 border-t-emerald-400 rounded-full" />
      </div>
    );
  }

  if (!user && !accessDenied) {
    return <Login />;
  }

  if (accessDenied) {
    return <AccessDenied />;
  }

  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tenants" element={<Tenants />} />
        <Route path="/trials" element={<Trials />} />
        <Route path="/users" element={<PlatformUsers />} />
        <Route path="/user-requests" element={<UserRequests />} />
        <Route path="/invitations" element={<Invitations />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/email-templates" element={<EmailTemplates />} />
        <Route path="/feature-flags" element={<FeatureFlags />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/yamen-ai-usage" element={<YamenAIUsage />} />
        <Route path="/settings" element={<AdminSettings />} />
      </Routes>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}
