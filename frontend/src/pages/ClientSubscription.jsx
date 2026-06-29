import React from 'react';
import { useRole } from '../components/RoleContext';
import { useTenant } from '../components/TenantContext';
import ClientSubscriptionPortal from '../components/subscription/ClientSubscriptionPortal';
import SubscriptionManagement from './SubscriptionManagement';

export default function ClientSubscription() {
  const { userRole, loading } = useRole();
  const { tenant } = useTenant();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin w-8 h-8 border-4 border-najdi-900 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!['admin', 'creator'].includes(userRole)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Access restricted to admins</p>
      </div>
    );
  }

  if (!tenant && userRole === 'creator') {
    return <SubscriptionManagement />;
  }

  return <ClientSubscriptionPortal />;
}