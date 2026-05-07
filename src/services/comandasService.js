import { supabase } from "./supabase";
import { atualizarEvento } from "./googleCalendar";

// Finalização atômica via RPC server-side.
// Toda a orquestração (estoque, comanda, atendimento, benefícios, auditoria)
// acontece em uma única transação PostgreSQL. Rollback automático em qualquer falha.
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

  const ev = comanda.evento_gcal;

  // Payload enviado ao banco — o servidor ignora closed_at e updated_at
  // do cliente e usa now() via trigger.
  const payload = {
    servicos:             svcs ?? [],
    itens_bar:            itens_bar ?? [],
    itens_loja:           itens_loja ?? [],
    valor_servicos:       valor_servicos ?? 0,
    valor_bar:            valor_bar ?? 0,
    valor_loja:           valor_loja ?? 0,
    valor_total:          valor_total ?? 0,
    forma_pagamento:      forma_pagamento,
    desconto:             desconto ?? null,
    barbeiro_id:          barbeiro_id ?? null,
    beneficio_desconto:   beneficio_desconto ?? 0,
    beneficios_aplicados: beneficios_aplicados ?? [],
    beneficio_registros:  _benefRegistros ?? [],
    data_hora: ev?.start?.dateTime
      ? new Date(ev.start.dateTime).toISOString()
      : new Date().toISOString(),
    observacoes: ev?.description ?? "",
  };

  // ── Operação atômica: tudo ou nada ────────────────────────
  // Em retry de rede, a função detecta que a comanda já está fechada
  // e retorna { ok: true, idempotent: true } sem re-executar nada.
  const { data, error } = await supabase.rpc("finalizar_comanda", {
    p_comanda_id: comanda.id,
    p_payload:    payload,
  });

  if (error) throw new Error(error.message);

  // ── GCal: sistema externo — eventual consistency ───────────
  // Executado fora da transação: falha aqui não reverte o banco.
  // O evento fica sem "✅" mas a comanda está fechada corretamente.
  if (comanda.gcal_event_id && ev) {
    const tituloFinal = ev.summary?.startsWith("✅")
      ? ev.summary
      : `✅ ${ev.summary ?? comanda.cliente_nome}`;

    atualizarEvento(comanda.gcal_event_id, {
      summary:     tituloFinal,
      start:       ev.start,
      end:         ev.end,
      description: ev.description,
      colorId:     "2",
    }).catch((e) => console.warn("[GCal] falha ao atualizar evento (não crítico):", e));
  }

  return data;
}
