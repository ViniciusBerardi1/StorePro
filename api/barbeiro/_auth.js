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

  // Busca token sem join embutido (evita problema de cache do PostgREST)
  const { data: session, error: tokenErr } = await serviceClient
    .from("barbeiro_tokens")
    .select("barbeiro_id, loja_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !session) {
    res.status(401).json({ erro: "Token inválido" });
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    res.status(401).json({ erro: "Sessão expirada" });
    return null;
  }

  // Busca dados do barbeiro em query separada
  const { data: barbeiro, error: barbErr } = await serviceClient
    .from("barbeiros")
    .select("nome, ativo")
    .eq("id", session.barbeiro_id)
    .single();

  if (barbErr || !barbeiro) {
    res.status(401).json({ erro: "Barbeiro não encontrado" });
    return null;
  }

  if (!barbeiro.ativo) {
    res.status(403).json({ erro: "Barbeiro inativo" });
    return null;
  }

  return {
    barbeiro_id: session.barbeiro_id,
    loja_id: session.loja_id,
    nome: barbeiro.nome,
  };
}
