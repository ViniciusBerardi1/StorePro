import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "barbeiro_session";
const EVENT = "barbeiro_session_change";

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function notifyAll() {
  window.dispatchEvent(new Event(EVENT));
}

export function useBarbeiroAuth() {
  const [session, setSession] = useState(loadSession);

  // Sincroniza quando outro componente chama login/logout
  useEffect(() => {
    const sync = () => setSession(loadSession());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const login = useCallback((token, barbeiro) => {
    const s = { token, barbeiro };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
    notifyAll();
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    notifyAll();
  }, []);

  return {
    isAuthenticated: !!session?.token,
    token: session?.token ?? null,
    barbeiro: session?.barbeiro ?? null,
    login,
    logout,
  };
}
