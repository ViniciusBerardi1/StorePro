import { serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { codigo } = req.body ?? {};
  if (!codigo?.toString().trim()) {
    return res.status(400).json({ erro: "Código obrigatório" });
  }

  const { data: barbeiro, error } = await serviceClient
    .from("barbeiros")
    .select("id, nome, loja_id, ativo")
    .eq("codigo_acesso", codigo.toString().trim())
    .maybeSingle();

  if (error || !barbeiro) {
    return res.status(401).json({ erro: "Código inválido" });
  }

  if (!barbeiro.ativo) {
    return res.status(403).json({ erro: "Acesso desativado" });
  }

  const { data: session, error: tokenErr } = await serviceClient
    .from("barbeiro_tokens")
    .insert({ barbeiro_id: barbeiro.id, loja_id: barbeiro.loja_id })
    .select("token")
    .single();

  if (tokenErr || !session) {
    return res.status(500).json({ erro: "Erro ao criar sessão" });
  }

  await serviceClient
    .from("barbeiros")
    .update({ ultimo_login: new Date().toISOString() })
    .eq("id", barbeiro.id);

  return res.status(200).json({
    token: session.token,
    barbeiro: { id: barbeiro.id, nome: barbeiro.nome, loja_id: barbeiro.loja_id },
  });
}
