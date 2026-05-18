import { useState, useEffect, useCallback } from "react";
import { adminAuthClient } from "../services/adminAuthClient";
import { getMyProfile } from "../services/adminAuth";

/**
 * Manages Supabase Auth session and profile for the admin area.
 * Completely isolated from the barbershop app's password gate.
 */
export function useAdminAuth() {
  const [session,  setSession]  = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [authError, setAuthError] = useState(null);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    try {
      const p = await getMyProfile(userId);
      setProfile(p);
    } catch (err) {
      // Profile row might not exist yet (race with trigger)
      console.warn("[AdminAuth] Could not fetch profile:", err.message);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    // 1. Hydrate from existing session (avoids flash of login screen)
    adminAuthClient.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) setAuthError(error.message);
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // 2. Subscribe to future auth state changes (login / logout / token refresh)
    // Loading is handled by the getSession().finally() above; auth changes after
    // initial hydration don't need to reset the loading flag.
    const { data: { subscription } } = adminAuthClient.auth.onAuthStateChange(
      (event, s) => {
        setSession(s);
        if (s?.user) {
          fetchProfile(s.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    user:            session?.user ?? null,
    profile,
    loading,
    authError,
    isAuthenticated: !!session,
    isAdmin:         profile?.role === "admin",
    // Refresh profile after an admin mutates it
    refreshProfile:  () => session?.user && fetchProfile(session.user.id),
  };
}
