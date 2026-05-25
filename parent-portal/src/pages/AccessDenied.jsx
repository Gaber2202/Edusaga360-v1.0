import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { ShieldOff } from 'lucide-react';

export default function AccessDenied() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center">
        <ShieldOff className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-700 mb-2">Access Denied</h1>
        <p className="text-slate-500 mb-6 max-w-sm">
          This portal is for parents only. Please contact your school administrator for access.
        </p>
        <Button variant="outline" onClick={logout}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
