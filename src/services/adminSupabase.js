import { createClient } from "@supabase/supabase-js";

const url        = import.meta.env.VITE_SUPABASE_URL;
const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY;

// Cliente com service_role — bypassa RLS e cria usuários sem confirmação de email.
// NUNCA use fora do painel admin (protegido por Supabase Auth + role=admin).
export const adminSupabase = createClient(
  url        || "https://placeholder.supabase.co",
  serviceKey || "placeholder-key"
);
