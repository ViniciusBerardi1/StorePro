import { db } from "./supabaseDb";
import { atualizarEvento } from "./googleCalendar";

const fmt = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function finalizarComanda(comanda, editorData) {
  const {
    servicos: svcs,
    itens_bar,
    itens_loja,
    valor_servicos,
    valor_bar,
    valor_loja,
    valor_total,
    forma_pagamento,
    desconto,
    barbeiro_id,
    beneficio_desconto,
    beneficios_aplicados,
    _benefRegistros,
  } = editorData;

  // 1. Baixar estoque (batch atômico via RPC, fallback JS)
  await db.baixarEstoqueComanda(itens_bar, itens_loja);

  // 2. Fechar comanda
  await db.updateComanda(comanda.id, {
    servicos: svcs,
    itens_bar,
    itens_loja,
    valor_servicos,
    valor_bar,
    valor_loja,
    valor_total,
    forma_pagamento,
    desconto: desconto ?? null,
    beneficio_desconto:   beneficio_desconto   ?? 0,
    beneficios_aplicados: beneficios_aplicados ?? [],
    ...(barbeiro_id != null ? { barbeiro_id } : {}),
    status: "fechada",
    closed_at: new Date().toISOString(),
  });

  // 3. Registrar uso de benefícios
  if (_benefRegistros?.length > 0) {
    await db.registrarUsoBeneficios(
      _benefRegistros.map((r) => ({ ...r, comanda_id: comanda.id }))
    );
  }

  // 4. Evento de auditoria (não-bloqueante)
  db.registrarEventoComanda(
    comanda.id,
    "fechada",
    `Fechada — ${fmt(valor_total)} via ${forma_pagamento}`,
    {
      valor_total,
      valor_servicos,
      valor_bar,
      valor_loja,
      forma_pagamento,
      desconto_calculado: desconto?.valor_calculado ?? 0,
      beneficio_desconto: beneficio_desconto ?? 0,
      servicos_count: svcs.length,
    }
  ).catch(() => {});

  // 5. Registrar atendimento + atualizar GCal
  const barbPayload = barbeiro_id != null ? { barbeiro_id } : {};

  if (comanda.gcal_event_id) {
    const ev = comanda.evento_gcal;
    const tituloFinal = ev?.summary
      ? ev.summary.startsWith("✅") ? ev.summary : `✅ ${ev.summary}`
      : `✅ ${comanda.cliente_nome}`;

    await Promise.allSettled([
      db.addAtendimento({
        gcal_event_id: comanda.gcal_event_id,
        data_hora: ev?.start?.dateTime
          ? new Date(ev.start.dateTime).toISOString()
          : new Date().toISOString(),
        cliente_nome: comanda.cliente_nome,
        ...(comanda.cliente_id ? { cliente_id: comanda.cliente_id } : {}),
        ...barbPayload,
        servicos: svcs,
        valor_total,
        forma_pagamento,
        status: "concluido",
        observacoes: ev?.description || "",
      }),
      ...(ev
        ? [atualizarEvento(comanda.gcal_event_id, {
            summary: tituloFinal,
            start: ev.start,
            end: ev.end,
            description: ev.description,
            colorId: "2",
          })]
        : []),
    ]);
  } else {
    await db.addAtendimento({
      data_hora: new Date().toISOString(),
      cliente_nome: comanda.cliente_nome,
      ...(comanda.cliente_id ? { cliente_id: comanda.cliente_id } : {}),
      ...barbPayload,
      servicos: svcs,
      valor_total,
      forma_pagamento,
      status: "concluido",
    });
  }
}
