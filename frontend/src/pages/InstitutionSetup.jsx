import React from 'react';

/**
 * InstitutionSetup is no longer a self-service flow.
 * All new institutions must go through the approval process at /register.
 * This page now redirects there immediately.
 */
export default function InstitutionSetup() {
  React.useEffect(() => {
    window.location.replace('/register');
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}