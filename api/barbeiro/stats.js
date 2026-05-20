import { requireBarbeiro, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const barbeiro = await requireBarbeiro(req, res);
    if (!barbeiro) return;

    // Mês atual no servidor (ou parâmetros opcionais)
    const agora = new Date();
    const ano = Number(req.query.ano) || agora.getFullYear();
    const mes = Number(req.query.mes) || (agora.getMonth() + 1);

    const ini = new Date(ano, mes - 1, 1, 0, 0, 0, 0).toISOString();
    const fim = new Date(ano, mes,     0, 23, 59, 59, 999).toISOString();

    const baseAts = serviceClient
      .from("atendimentos")
      .select("id, status, valor_total, servicos")
      .eq("barbeiro_id", barbeiro.barbeiro_id)
      .gte("data_hora", ini)
      .lte("data_hora", fim);

    const baseCmds = serviceClient
      .from("comandas")
      .select("id, valor_total, valor_servicos, valor_bar, valor_loja, status, itens_bar, itens_loja")
      .eq("barbeiro_id", barbeiro.barbeiro_id)
      .eq("status", "fechada")
      .gte("created_at", ini)
      .lte("created_at", fim);

    const [atsRes, cmdsRes] = await Promise.all([
      barbeiro.loja_id ? baseAts.eq("loja_id", barbeiro.loja_id) : baseAts,
      barbeiro.loja_id ? baseCmds.eq("loja_id", barbeiro.loja_id) : baseCmds,
    ]);

    if (atsRes.error) return res.status(500).json({ erro: atsRes.error.message });
    if (cmdsRes.error) return res.status(500).json({ erro: cmdsRes.error.message });

    const ats  = atsRes.data  ?? [];
    const cmds = cmdsRes.data ?? [];

    // Counts — espelha TabBarbeiros
    const concluidos = ats.filter((a) => a.status === "concluido");
    const agendados  = ats.filter((a) => a.status === "agendado").length;
    const cancelados = ats.filter((a) => a.status === "cancelado").length;

    // Faturamento de serviços = valor_total dos atendimentos concluídos
    // (mesma fórmula: entry.faturamento += a.valor_total)
    const faturamentoServicos = concluidos.reduce((s, a) => s + Number(a.valor_total || 0), 0);

    // Receita de produtos = bar + loja das comandas fechadas (brutas — sem desconto proporcional
    // para manter leveza no serverless; desconto já está absorvido no valor_total da comanda)
    const receitaBar  = cmds.reduce((s, c) => s + Number(c.valor_bar  || 0), 0);
    const receitaLoja = cmds.reduce((s, c) => s + Number(c.valor_loja || 0), 0);
    const receitaProdutos = receitaBar + receitaLoja;

    // Receita líquida total da comanda (pós-desconto)
    const receitaLiquida = cmds.reduce((s, c) => s + Number(c.valor_total || 0), 0);

    // Ticket médio = faturamento serviços / concluídos (igual ao sistema principal)
    const ticket = concluidos.length > 0 ? faturamentoServicos / concluidos.length : 0;

    // Serviço mais realizado no mês
    const contServicos = {};
    for (const a of concluidos) {
      for (const s of (a.servicos || [])) {
        if (!s.via_plano) contServicos[s.nome] = (contServicos[s.nome] || 0) + 1;
      }
    }
    const rankServicos = Object.entries(contServicos)
      .sort((a, z) => z[1] - a[1])
      .map(([nome, count]) => ({ nome, count }));

    return res.status(200).json({
      periodo: { ano, mes },
      atendimentos: {
        total:     ats.length,
        concluidos: concluidos.length,
        agendados,
        cancelados,
      },
      financeiro: {
        faturamentoServicos,
        receitaBar,
        receitaLoja,
        receitaProdutos,
        receitaLiquida,
        ticket,
        comandasFechadas: cmds.length,
      },
      rankServicos,
    });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
