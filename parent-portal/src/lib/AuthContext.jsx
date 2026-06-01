import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext(null);

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

      const isParent = appUser.user_role === 'parent' || appUser.role === 'parent';
      if (!isParent) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setUser({
        ...authUser,
        ...authUser.user_metadata,
        ...appUser,
        email: authUser.email,
        id: authUser.id,
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
