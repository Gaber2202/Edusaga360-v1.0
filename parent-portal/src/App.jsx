import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/sonner';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LanguageProvider } from './lib/LanguageContext';
import ParentLayout from './components/ParentLayout';
import Login from './pages/Login';
import AccessDenied from './pages/AccessDenied';
import Dashboard from './pages/Dashboard';
import Progress from './pages/Progress';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Announcements from './pages/Announcements';
import Homework from './pages/Homework';
import Messages from './pages/Messages';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
});

function AppRoutes() {
  const { user, loading, accessDenied } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-border border-t-emerald-500 rounded-full" />
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
    <ParentLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/fees" element={<Fees />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/homework" element={<Homework />} />
        <Route path="/messages" element={<Messages />} />
      </Routes>
    </ParentLayout>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
