import { requireBarbeiro, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const barbeiro = await requireBarbeiro(req, res);
    if (!barbeiro) return;

    const { ini, fim } = req.query;
    if (!ini || !fim) {
      return res.status(400).json({ erro: "Parâmetros ini e fim obrigatórios" });
    }

    const filtros = serviceClient
      .from("atendimentos")
      .select("id, cliente_nome, servicos, status, data_hora, valor_total, evento_gcal")
      .eq("barbeiro_id", barbeiro.barbeiro_id)
      .gte("data_hora", ini)
      .lte("data_hora", fim)
      .order("data_hora");

    const { data, error } = await (
      barbeiro.loja_id ? filtros.eq("loja_id", barbeiro.loja_id) : filtros
    );

    if (error) {
      return res.status(500).json({ erro: error.message, codigo: error.code, hint: error.hint });
    }

    return res.status(200).json({ atendimentos: data ?? [] });
  } catch (err) {
    return res.status(500).json({ erro: err.message, tipo: "excecao_nao_tratada" });
  }
}
