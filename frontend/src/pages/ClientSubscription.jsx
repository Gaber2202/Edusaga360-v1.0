import React from 'react';
import { useRole } from '../components/RoleContext';
import ClientSubscriptionPortal from '../components/subscription/ClientSubscriptionPortal';

export default function ClientSubscription() {
  const { userRole, loading } = useRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-slate-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!['admin', 'creator'].includes(userRole)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-500">Access restricted to admins</p>
      </div>
    );
  }

  return <ClientSubscriptionPortal />;
}