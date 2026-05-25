import React from 'react';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/button';
import { ShieldOff } from 'lucide-react';

export default function AccessDenied() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="text-center">
        <ShieldOff className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-300 mb-2">Access Denied</h1>
        <p className="text-slate-500 mb-6 max-w-sm">
          You do not have permission to access this portal.
        </p>
        <Button variant="outline" onClick={logout} className="text-slate-300 border-slate-600 hover:bg-slate-800">
          Sign Out
        </Button>
      </div>
    </div>
  );
}
