import { createClient } from "@supabase/supabase-js";

export const serviceClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function requireBarbeiro(req, res) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    res.status(401).json({ erro: "Não autenticado" });
    return null;
  }

  const { data: session, error } = await serviceClient
    .from("barbeiro_tokens")
    .select("barbeiro_id, loja_id, expires_at, barbeiros(nome, ativo)")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) {
    res.status(401).json({ erro: "Token inválido" });
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    res.status(401).json({ erro: "Sessão expirada" });
    return null;
  }

  if (!session.barbeiros?.ativo) {
    res.status(403).json({ erro: "Barbeiro inativo" });
    return null;
  }

  return {
    barbeiro_id: session.barbeiro_id,
    loja_id: session.loja_id,
    nome: session.barbeiros.nome,
  };
}
