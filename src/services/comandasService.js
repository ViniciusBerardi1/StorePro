import { supabase } from "./supabase";
import { atualizarEvento } from "./googleCalendar";

// Mapeia códigos de erro do banco para mensagens amigáveis ao usuário.
// Erros P00xx são lançados explicitamente pelas funções PL/pgSQL.
export function parsearErroComanda(message = "") {
  if (message.includes("P0010") || message.includes("Conflito"))
    return "Esta comanda foi modificada em outra aba ou dispositivo. Recarregue a página e tente novamente.";
  if (message.includes("P0002") || message.includes("já está fechada"))
    return "Esta comanda já foi fechada por outra sessão. Recarregue a página.";
  if (message.includes("P0006") || message.includes("cancelada"))
    return "Esta comanda foi cancelada. Recarregue a página.";
  if (message.includes("P0003") || message.includes("forma_pagamento"))
    return "Selecione uma forma de pagamento válida.";
  if (message.includes("P0005") || message.includes("superior à soma"))
    return "Erro de cálculo: valor total inconsistente. Recarregue e refaça os itens.";
  return message;
}

// Finalização atômica via RPC server-side.
// A version é enviada para o banco detectar conflitos entre operadores.
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
    // Optimistic locking: version que o cliente conhece.
    // Banco rejeita se outro operador já editou (version maior no DB).
    version:    comanda.version ?? null,
    data_hora:  ev?.start?.dateTime
                  ? new Date(ev.start.dateTime).toISOString()
                  : new Date().toISOString(),
    observacoes: ev?.description ?? "",
  };

  const { data, error } = await supabase.rpc("finalizar_comanda", {
    p_comanda_id: comanda.id,
    p_payload:    payload,
  });

  if (error) throw new Error(parsearErroComanda(error.message));

  // GCal: fora da transação — eventual consistency.
  // Falha aqui não reverte o banco.
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
