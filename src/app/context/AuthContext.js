'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/app/lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  // Whose role we've loaded (or are loading). Stays loading until a newly
  // signed-in user's role arrives, so pages never check access against the
  // previous user's role. Token refreshes keep the same id and don't reload.
  const roleUserId = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        if (session.user.id !== roleUserId.current) {
          roleUserId.current = session.user.id;
          fetchRole(session.user.id);
        }
      } else {
        setLoading(false);
      }
    });

    // IMPORTANT: this callback must NOT be async, and must NOT await any
    // supabase.* call directly. Doing so deadlocks the client's internal
    // lock — every future supabase call anywhere in the app hangs forever
    // until a hard reload. See:
    // https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          if (session.user.id !== roleUserId.current) {
            roleUserId.current = session.user.id;
            setLoading(true);
            // Deferred with setTimeout so it runs *after* this callback
            // finishes and releases the auth lock, instead of blocking
            // inside it.
            setTimeout(() => {
              fetchRole(session.user.id);
            }, 0);
          }
        } else {
          roleUserId.current = null;
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchRole = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    setRole(!error && data ? data.role : null);
    setLoading(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);