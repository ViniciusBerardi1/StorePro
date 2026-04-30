import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "[StorePro] Variáveis de ambiente do Supabase não configuradas.\n" +
    "Acesse o painel do Vercel → Settings → Environment Variables e adicione:\n" +
    "  VITE_SUPABASE_URL\n" +
    "  VITE_SUPABASE_ANON_KEY"
  );
}

// Usa um URL placeholder válido para evitar crash na inicialização quando as
// variáveis não estão definidas (ex: primeiro deploy sem env vars configuradas).
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  key || "placeholder-key"
);
