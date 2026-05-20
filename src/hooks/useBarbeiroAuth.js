import { useState, useCallback } from "react";

const STORAGE_KEY = "barbeiro_session";

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useBarbeiroAuth() {
  const [session, setSession] = useState(loadSession);

  const login = useCallback((token, barbeiro) => {
    const s = { token, barbeiro };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  return {
    isAuthenticated: !!session?.token,
    token: session?.token ?? null,
    barbeiro: session?.barbeiro ?? null,
    login,
    logout,
  };
}
