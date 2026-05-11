import { useState, useEffect, useCallback } from "react";
import { supabase } from "../services/supabase";
import { invalidarCacheAssinaturas } from "../services/supabaseDb";

export function useAppAuth() {
  const [session,  setSession]  = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, role, loja_id, lojas(ativo)")
        .eq("id", userId)
        .single();
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      if (s?.user) fetchProfile(s.user.id);
      else { setProfile(null); }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    invalidarCacheAssinaturas();
    await supabase.auth.signOut();
    window.location.reload();
  };

  return {
    session,
    profile,
    loading,
    isAuthenticated: !!session,
    isAdmin:         profile?.role === "admin",
    hasLoja:         !!profile?.loja_id,
    lojaAtivo:       profile?.lojas?.ativo ?? true,
    lojaId:          profile?.loja_id ?? null,
    signOut,
  };
}
