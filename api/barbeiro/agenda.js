import { requireBarbeiro, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const barbeiro = await requireBarbeiro(req, res);
  if (!barbeiro) return;

  const { ini, fim } = req.query;
  if (!ini || !fim) {
    return res.status(400).json({ erro: "Parâmetros ini e fim obrigatórios" });
  }

  let query = serviceClient
    .from("atendimentos")
    .select("id, cliente_nome, servicos, status, data_hora, valor_total, evento_gcal")
    .eq("barbeiro_id", barbeiro.barbeiro_id)
    .gte("data_hora", ini)
    .lte("data_hora", fim)
    .order("data_hora");

  // Filtra por loja apenas quando disponível
  if (barbeiro.loja_id) {
    query = query.eq("loja_id", barbeiro.loja_id);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ erro: error.message, codigo: error.code });
  }

  return res.status(200).json({ atendimentos: data ?? [] });
}
