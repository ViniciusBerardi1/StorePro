import { requireBarbeiro, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const barbeiro = await requireBarbeiro(req, res);
  if (!barbeiro) return;

  const { ini, fim } = req.query;
  if (!ini || !fim) {
    return res.status(400).json({ erro: "Parâmetros ini e fim obrigatórios" });
  }

  const { data, error } = await serviceClient
    .from("atendimentos")
    .select("id, cliente_nome, servicos, status, data_hora, valor_total, evento_gcal")
    .eq("barbeiro_id", barbeiro.barbeiro_id)
    .eq("loja_id", barbeiro.loja_id)
    .gte("data_hora", ini)
    .lte("data_hora", fim)
    .order("data_hora");

  if (error) {
    return res.status(500).json({ erro: "Erro ao buscar agenda" });
  }

  return res.status(200).json({ atendimentos: data ?? [] });
}
