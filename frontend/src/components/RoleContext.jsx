import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, tenantQuery } from '../api/supabaseClient';
import { isPlatformOwner, VALID_APP_ROLES, DEFAULT_UNASSIGNED_ROLE } from '../lib/authHelpers';

const RoleContext = createContext();

export function RoleProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [roleData, setRoleData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    (async () => {
      if (isMounted) {
        await loadUser();
      }
    })();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const loadUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setLoading(false); return; }
      // app_metadata is the authoritative, admin-only source for tenant_id/role.
      // It comes straight from the JWT, so it is always present even when an RLS
      // policy blocks the users-table read (which previously left tenant_id
      // undefined and bounced freshly onboarded admins to /register forever).
      const appMeta = authUser.app_metadata || {};
      let currentUser = {
        ...authUser,
        ...authUser.user_metadata,
        email: authUser.email,
        id: authUser.id,
        tenant_id: appMeta.tenant_id ?? authUser.user_metadata?.tenant_id,
        role: appMeta.role ?? authUser.user_metadata?.role,
        is_platform_owner: appMeta.is_platform_owner ?? false,
      };

      // Load application-level user record from the users table (enrichment only).
      // Match by auth_id first; fall back to email in case the row was created
      // with a mismatched auth_id (legacy/broken accounts).
      let appUser = null;
      const byAuthId = await supabase.from('users').select('*').eq('auth_id', authUser.id).limit(1);
      if (byAuthId.data && byAuthId.data.length > 0) {
        appUser = byAuthId.data[0];
      } else if (authUser.email) {
        const byEmail = await supabase.from('users').select('*').eq('email', authUser.email).limit(1);
        if (byEmail.data && byEmail.data.length > 0) appUser = byEmail.data[0];
      }
      if (appUser) {
        currentUser = {
          ...currentUser,
          tenant_id: currentUser.tenant_id || appUser.tenant_id,
          role_id: appUser.role_id || currentUser.role_id,
          user_role: appUser.user_role || currentUser.user_role,
          is_platform_owner: currentUser.is_platform_owner || appUser.is_platform_owner || false,
          branch_id: appUser.branch_id || currentUser.branch_id,
          _appUserId: appUser.id,
        };
        if (appUser.is_platform_owner) {
          currentUser.role = 'creator';
        }
      }

      // Check trial expiration
      if (currentUser.is_trial_user && currentUser.trial_expires_date) {
        const expiryDate = new Date(currentUser.trial_expires_date);
        if (expiryDate < new Date()) {
          setUser(null);
          setUserRole(null);
          setRoleData(null);
          setLoading(false);
          return;
        }
      }

      // Build human-readable display names for both languages
      const enName = (currentUser.first_name || currentUser.last_name)
        ? [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ')
        : (currentUser.display_name || currentUser.full_name || currentUser.email);
      const arName = (currentUser.first_name_ar || currentUser.last_name_ar)
        ? [currentUser.first_name_ar, currentUser.last_name_ar].filter(Boolean).join(' ')
        : enName;
      let enrichedUser = { ...currentUser, _displayName: enName, _displayNameAr: arName };
      setUser(enrichedUser);
      // Determine effective role: prefer user_role, fallback to platform role mapping.
      // 'user' is a platform-level role, not a valid app-level role for navigation.
      let roleCode = currentUser.user_role;

      if (!roleCode || !VALID_APP_ROLES.includes(roleCode)) {
        // Platform-level roles that should not be auto-elevated inside a tenant.
        if (isPlatformOwner(currentUser)) {
          roleCode = 'creator';
        } else if (currentUser.role === 'admin' && !currentUser.tenant_id) {
          // Admin without tenant — treat as platform admin (can manage tenants).
          roleCode = 'admin';
        } else {
          // Tenant user whose administrator has not assigned an app role yet.
          // Default to the least-privileged role, never 'admin'.
          roleCode = DEFAULT_UNASSIGNED_ROLE;
        }
      }
      setUserRole(roleCode);

      // Load role data for granular permissions
      if (currentUser.role_id) {
        try {
          const { data: roles } = await tenantQuery('roles').select('*').eq('id', currentUser.role_id);
          setRoleData(roles?.[0] || null);
        } catch (err) {
          console.error('Error loading role data:', err);
        }
      }

      sessionStorage.removeItem('session_expired');
    } catch (error) {
      console.error('Error loading user:', error);
      setUser(null);
      setUserRole(null);
      setRoleData(null);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = React.useCallback((permission) => {
    if (userRole === 'creator') return true;
    if (roleData?.is_creator_role) return true;
    if (roleData?.action_permissions?.[permission]) return true;
    const permissions = {
      admin: ['all'], creator: ['all'],
      ceo: ['view', 'approve_strategic'],
      cfo: ['view', 'export', 'approve_finance', 'post', 'reverse', 'view_salary_amounts', 'view_finance_amounts'],
      hr_head: ['create', 'edit', 'delete', 'approve', 'export', 'send', 'view_salary_amounts'],
      it_user: ['view', 'manage_users', 'view_logs'],
      accountant: ['create', 'edit', 'view', 'export', 'view_finance_amounts'],
      teacher: ['view', 'edit_attendance'],
      parent: ['view_own'],
      hr_admin: ['all_hr', 'employees', 'attendance', 'leaves', 'payroll', 'eosb', 'view_salary_amounts'],
      hr_officer: ['employees', 'attendance', 'leaves'],
      finance: ['fees', 'finance', 'procurement', 'assets', 'payroll_approve', 'eosb_approve', 'view_salary_amounts', 'view_finance_amounts'],
      branch_manager: ['dashboard', 'admissions', 'students', 'attendance', 'fees', 'employees', 'reports']
    };
    if (userRole === 'admin' || userRole === 'creator') return true;
    const rolePermissions = permissions[userRole] || [];
    return rolePermissions.includes(permission) || rolePermissions.includes('all');
  }, [userRole, roleData]);

  const canAccess = React.useCallback((module) => {
    if (userRole === 'creator') return true;
    if (roleData?.is_creator_role) return true;
    if (roleData?.module_access?.[module] === true) return true;
    const moduleAccess = {
      admin: ['all'], creator: ['all'],
      ceo: ['dashboard', 'reports', 'audit_logs'],
      cfo: ['dashboard', 'fees', 'finance', 'procurement', 'assets', 'payroll', 'reports'],
      hr_head: ['dashboard', 'hr', 'employees', 'employee_attendance', 'leaves', 'overtime', 'payroll', 'eosb', 'reports', 'settings'],
      it_user: ['dashboard', 'settings', 'integrations', 'security', 'audit_logs'],
      accountant: ['dashboard', 'students', 'fees', 'finance', 'reports'],
      teacher: ['dashboard', 'student_attendance', 'students'],
      parent: ['dashboard', 'students', 'student_attendance', 'fees'],
      hr_admin: ['dashboard', 'employees', 'employee_attendance', 'leaves', 'overtime', 'payroll', 'eosb', 'reports'],
      hr_officer: ['dashboard', 'employees', 'employee_attendance', 'leaves', 'reports'],
      finance: ['dashboard', 'fees', 'finance', 'procurement', 'assets', 'payroll', 'eosb', 'reports'],
      branch_manager: ['dashboard', 'admissions', 'students', 'student_attendance', 'employees', 'employee_attendance', 'leaves', 'fees', 'reports', 'settings']
    };
    const allowed = moduleAccess[userRole] || [];
    return allowed.includes(module) || allowed.includes('all') || userRole === 'creator';
  }, [userRole, roleData]);

  const isCreator = React.useCallback(() => {
    if (roleData?.is_creator_role === true) return true;
    return isPlatformOwner(user) || userRole === 'creator';
  }, [userRole, roleData, user]);

  const isTrial = React.useCallback(() => {
    return user?.is_trial_user === true;
  }, [user]);

  const value = React.useMemo(() => ({
    user,
    userRole,
    roleDetails: roleData,
    hasPermission,
    canAccess,
    isCreator,
    isTrial,
    loading,
    refreshUser: loadUser
  }), [user, userRole, roleData, loading, hasPermission, canAccess, isCreator, isTrial]);

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    // Safe fallback — never crash the app if used outside provider during transitions
    console.warn('⚠️ useRole called outside RoleProvider - using safe defaults');
    return {
      user: null,
      userRole: null,
      roleDetails: null,
      hasPermission: () => false,
      canAccess: () => false,
      isCreator: () => false,
      isTrial: () => false,
      loading: true,
      refreshUser: () => {},
    };
  }
  return context;
}

export default RoleContext;