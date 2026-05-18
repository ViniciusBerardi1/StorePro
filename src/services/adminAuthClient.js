import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Cliente dedicado para o painel admin com storageKey própria.
// Sessões admin ficam em "storepro_admin_auth" no localStorage,
// completamente separadas da sessão da loja ("sb-<ref>-auth-token").
// Isso permite ter o admin logado num aba e a loja em outra sem conflito.
export const adminAuthClient = createClient(
  url || "https://placeholder.supabase.co",
  key || "placeholder-key",
  {
    auth: {
      storageKey: "storepro_admin_auth",
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
