import { requireBarbeiro, serviceClient } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const barbeiro = await requireBarbeiro(req, res);
    if (!barbeiro) return;

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
      .select("id, valor_total, valor_bar, valor_loja, itens_bar, itens_loja")
      .eq("barbeiro_id", barbeiro.barbeiro_id)
      .eq("status", "fechada")
      .gte("updated_at", ini)
      .lte("updated_at", fim);

    const [atsRes, cmdsRes] = await Promise.all([
      barbeiro.loja_id ? baseAts.eq("loja_id", barbeiro.loja_id) : baseAts,
      barbeiro.loja_id ? baseCmds.eq("loja_id", barbeiro.loja_id) : baseCmds,
    ]);

    if (atsRes.error) return res.status(500).json({ erro: atsRes.error.message });
    if (cmdsRes.error) return res.status(500).json({ erro: cmdsRes.error.message });

    const ats  = atsRes.data  ?? [];
    const cmds = cmdsRes.data ?? [];

    const concluidos = ats.filter((a) => a.status === "concluido");
    const agendados  = ats.filter((a) => a.status === "agendado").length;
    const cancelados = ats.filter((a) => a.status === "cancelado").length;

    // Faturamento serviços — espelha: entry.faturamento += a.valor_total
    const faturamentoServicos = concluidos.reduce((s, a) => s + Number(a.valor_total || 0), 0);

    // Horas trabalhadas — espelha: entry.minutos += s.duracao_minutos || 30
    let minutos = 0;
    const contServicos = {};
    let brutoServico   = 0; // serviços normais
    let brutoAdicional = 0; // serviços adicionais
    for (const a of concluidos) {
      for (const s of (a.servicos || [])) {
        minutos += s.duracao_minutos || 30;
        if (!s.via_plano) contServicos[s.nome] = (contServicos[s.nome] || 0) + 1;
        if (s.adicional) brutoAdicional += Number(s.valor || 0);
        else             brutoServico   += Number(s.valor || 0);
      }
    }

    // Produtos das comandas fechadas
    const receitaBar  = cmds.reduce((s, c) => s + Number(c.valor_bar  || 0), 0);
    const receitaLoja = cmds.reduce((s, c) => s + Number(c.valor_loja || 0), 0);
    const receitaProdutos = receitaBar + receitaLoja;

    // Contagem de itens distintos (todas as comandas)
    const totalItens = cmds.reduce((s, c) => {
      return s
        + (c.itens_bar  || []).reduce((x, i) => x + (i.quantidade || 1), 0)
        + (c.itens_loja || []).reduce((x, i) => x + (i.quantidade || 1), 0);
    }, 0);

    // Receita líquida pós-desconto
    const receitaLiquida = cmds.reduce((s, c) => s + Number(c.valor_total || 0), 0);

    // Ticket médio = faturamento / concluídos (igual ao sistema principal)
    const ticket = concluidos.length > 0 ? faturamentoServicos / concluidos.length : 0;

    // Ranking de serviços
    const rankServicos = Object.entries(contServicos)
      .sort((a, z) => z[1] - a[1])
      .map(([nome, count]) => ({ nome, count }));

    // Comissões — calcula por tipo usando as taxas do barbeiro
    const taxas = barbeiro.comissoes ?? {};
    const pct   = (v) => v != null ? Number(v) / 100 : null;
    const comissaoServico   = pct(taxas.servico)   != null ? brutoServico   * pct(taxas.servico)   : null;
    const comissaoAdicional = pct(taxas.adicional) != null ? brutoAdicional * pct(taxas.adicional) : null;
    const comissaoProduto   = pct(taxas.produto)   != null ? receitaProdutos * pct(taxas.produto)  : null;
    const comissaoTotal     = [comissaoServico, comissaoAdicional, comissaoProduto]
      .filter((v) => v != null)
      .reduce((s, v) => s + v, 0);
    const temComissao = comissaoServico != null || comissaoAdicional != null || comissaoProduto != null;

    return res.status(200).json({
      periodo: { ano, mes },
      atendimentos: { total: ats.length, concluidos: concluidos.length, agendados, cancelados },
      financeiro: {
        faturamentoServicos,
        receitaBar,
        receitaLoja,
        receitaProdutos,
        receitaLiquida,
        ticket,
        comandasFechadas: cmds.length,
      },
      horas: { minutos, totalItens },
      rankServicos,
      comissoes: temComissao ? {
        taxas: {
          servico:   taxas.servico   ?? null,
          adicional: taxas.adicional ?? null,
          produto:   taxas.produto   ?? null,
        },
        bruto: {
          servico:   brutoServico,
          adicional: brutoAdicional,
          produto:   receitaProdutos,
        },
        valores: {
          servico:   comissaoServico,
          adicional: comissaoAdicional,
          produto:   comissaoProduto,
          total:     comissaoTotal,
        },
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
