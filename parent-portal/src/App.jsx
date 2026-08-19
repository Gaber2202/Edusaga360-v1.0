import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from './components/ui/sonner';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LanguageProvider } from './lib/LanguageContext';
import { ThemeProvider } from './lib/ThemeContext';
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
import Canteen from './pages/Canteen';
import Store from './pages/Store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
});

function AppRoutes() {
  const { user, loading, accessDenied } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--es-border)] border-t-forest-700" />
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
        <Route path="/canteen" element={<Canteen />} />
        <Route path="/store" element={<Store />} />
      </Routes>
    </ParentLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
