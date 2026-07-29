import { createContext, useState, useContext, useEffect } from 'react';
import { supabase, callApi } from '../api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const mfaRequired = !!user?.app_metadata?.mfa_required;
  const mfaVerified = !!user?.app_metadata?.mfa_verified_at;
  const requiresMfa = mfaRequired && !mfaVerified;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsAuthenticated(!!currentSession);
      setIsLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setIsAuthenticated(!!newSession);
      setIsLoadingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email, password) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setAuthError({ type: 'auth_failed', message: error.message });
      return { error };
    }
    return { data };
  };

  const signUp = async (email, password, metadata = {}) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) {
      setAuthError({ type: 'signup_failed', message: error.message });
      return { error };
    }
    return { data };
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — we redirect regardless
    }
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);
    // Hard redirect straight to the login screen — no intermediate chooser.
    window.location.replace('/school-login');
  };

  // Request a reset link. Routes through the backend so delivery uses the same
  // reliable channel as admin-initiated resets (Infobip, with a Supabase SMTP
  // fallback). The endpoint always succeeds to avoid leaking which emails exist.
  const resetPassword = async (email) => {
    await callApi('/api/auth/forgot-password', { email });
  };

  // Set a new password for the currently-authenticated (recovery) session.
  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const value = {
    user,
    session,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    mfaRequired,
    mfaVerified,
    requiresMfa,
    login,
    signUp,
    logout,
    resetPassword,
    updatePassword,
    navigateToLogin: () => window.location.replace('/school-login'),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
