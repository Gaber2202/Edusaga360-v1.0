import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const AuthContext = createContext(null);

async function rosterLinkedStudentIds(appUser, email) {
  const claimed = Array.isArray(appUser.linked_student_ids) ? appUser.linked_student_ids : [];
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const res = await fetch(`${API_BASE_URL}/api/parent/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const me = await res.json();
        if (Array.isArray(me.linked_student_ids)) return me.linked_student_ids;
      }
    }
  } catch {
    /* fall through to local roster check */
  }

  const tenantId = appUser.tenant_id;
  if (!tenantId) return [];
  const found = new Set();
  if (claimed.length > 0) {
    const { data } = await supabase.from('students').select('id').eq('tenant_id', tenantId).in('id', claimed);
    (data || []).forEach((row) => found.add(row.id));
  }
  if (email) {
    const { data: guardian } = await supabase
      .from('guardians')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', email)
      .maybeSingle();
    if (guardian?.id) {
      const { data: kids } = await supabase.from('students').select('id').eq('tenant_id', tenantId).eq('guardian_id', guardian.id);
      (kids || []).forEach((row) => found.add(row.id));
    }
  }
  return [...found];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        validateAccess(session.user);
      } else {
        setUser(null);
        setAccessDenied(false);
        setLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await validateAccess(authUser);
    } else {
      setLoading(false);
    }
  };

  const validateAccess = async (authUser) => {
    try {
      const { data: appUsers } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authUser.id)
        .limit(1);

      const appUser = appUsers?.[0];
      if (!appUser) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const metaRole = authUser.app_metadata?.role || authUser.user_metadata?.role;
      const isParent = appUser.user_role === 'parent' || appUser.role === 'parent' || metaRole === 'parent';
      const isPlatformOwner = appUser.is_platform_owner === true || authUser.app_metadata?.is_platform_owner === true;
      if (!isParent && !isPlatformOwner) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      const meta = authUser.user_metadata || {};
      setUser({
        ...authUser,
        ...meta,
        ...appUser,
        first_name: appUser.first_name || meta.first_name,
        last_name: appUser.last_name || meta.last_name,
        name: appUser.name || meta.full_name || meta.name,
        email: authUser.email,
        id: authUser.id,
        linked_student_ids: await rosterLinkedStudentIds(appUser, authUser.email),
      });
      setAccessDenied(false);
    } catch (err) {
      console.error('Auth validation error:', err);
      setAccessDenied(true);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, accessDenied, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
