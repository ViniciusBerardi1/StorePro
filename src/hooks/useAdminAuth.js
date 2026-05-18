import { useState, useEffect, useCallback } from "react";
import { adminAuthClient } from "../services/adminAuthClient";
import { getMyProfile } from "../services/adminAuth";

/**
 * Manages Supabase Auth session and profile for the admin area.
 * Completely isolated from the barbershop app's password gate.
 */
export function useAdminAuth() {
  const [session,        setSession]        = useState(null);
  const [profile,        setProfile]        = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError,      setAuthError]      = useState(null);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    setProfileLoading(true);
    try {
      const p = await getMyProfile(userId);
      setProfile(p);
    } catch (err) {
      console.warn("[AdminAuth] Could not fetch profile:", err.message);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    adminAuthClient.auth.getSession().then(({ data: { session: s }, error }) => {
      if (error) setAuthError(error.message);
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

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
    loading:         loading || profileLoading,
    authError,
    isAuthenticated: !!session,
    isAdmin:         profile?.role === "admin",
    refreshProfile:  () => session?.user && fetchProfile(session.user.id),
  };
}
