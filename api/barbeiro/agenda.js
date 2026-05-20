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

    const base = {
      barbeiro_id: barbeiro.barbeiro_id,
      loja_id: barbeiro.loja_id,
    };

    // Fonte 1: atendimentos (agendado + concluido + cancelado)
    const qAts = serviceClient
      .from("atendimentos")
      .select("id, gcal_event_id, cliente_nome, servicos, status, data_hora, valor_total")
      .eq("barbeiro_id", base.barbeiro_id)
      .gte("data_hora", ini)
      .lte("data_hora", fim)
      .order("data_hora");

    // Fonte 2: comandas abertas no período — cobre agendamentos futuros
    // ainda não sincronizados como atendimento
    const qCmds = serviceClient
      .from("comandas")
      .select("id, cliente_nome, servicos, status, created_at, valor_total, gcal_event_id")
      .eq("barbeiro_id", base.barbeiro_id)
      .eq("status", "aberta")
      .gte("created_at", ini)
      .lte("created_at", fim)
      .order("created_at");

    const [atsRes, cmdsRes] = await Promise.all([
      base.loja_id ? qAts.eq("loja_id", base.loja_id) : qAts,
      base.loja_id ? qCmds.eq("loja_id", base.loja_id) : qCmds,
    ]);

    if (atsRes.error) return res.status(500).json({ erro: atsRes.error.message });
    if (cmdsRes.error) return res.status(500).json({ erro: cmdsRes.error.message });

    const ats  = atsRes.data  ?? [];
    const cmds = cmdsRes.data ?? [];

    // Mescla: evita duplicatas usando gcal_event_id como chave
    const gcalIdsVistos = new Set(ats.map((a) => a.gcal_event_id).filter(Boolean));

    const extras = cmds
      .filter((c) => !c.gcal_event_id || !gcalIdsVistos.has(c.gcal_event_id))
      .map((c) => ({
        id: `cmd_${c.id}`,
        cliente_nome: c.cliente_nome,
        servicos: c.servicos,
        status: "agendado",
        data_hora: c.created_at,
        valor_total: c.valor_total,
      }));

    const resultado = [...ats, ...extras].sort(
      (a, b) => new Date(a.data_hora) - new Date(b.data_hora)
    );

    return res.status(200).json({ atendimentos: resultado });
  } catch (err) {
    return res.status(500).json({ erro: err.message, tipo: "excecao_nao_tratada" });
  }
}
