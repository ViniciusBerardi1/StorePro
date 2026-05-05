/**
 * relatoriosDb — queries dedicadas à aba Relatórios.
 * Busca janelas amplas do Supabase e processa tudo em memória,
 * evitando múltiplas round-trips desnecessárias.
 */
import { supabase } from "./supabase";

function localISO(ano, mes, dia, h = 0, mi = 0, s = 0, ms = 0) {
  return new Date(ano, mes - 1, dia, h, mi, s, ms).toISOString();
}

export async function getRelatoriosPeriodo(dataIni, dataFim) {
  const ini = new Date(dataIni + "T00:00:00").toISOString();
  const fim = new Date(dataFim + "T23:59:59.999").toISOString();

  const [{ data: atendimentos, error: e1 }, { data: comandas, error: e2 }, { data: barbeiros, error: e3 }] =
    await Promise.all([
      supabase
        .from("atendimentos")
        .select("id, data_hora, status, valor_total, forma_pagamento, cliente_nome, cliente_id, barbeiro_id, servicos")
        .gte("data_hora", ini)
        .lte("data_hora", fim)
        .order("data_hora"),
      supabase
        .from("comandas")
        .select("id, created_at, status, cliente_nome, valor_total, valor_servicos, valor_bar, valor_loja, forma_pagamento, itens_bar, itens_loja, servicos, desconto")
        .eq("status", "fechada")
        .gte("created_at", ini)
        .lte("created_at", fim),
      supabase.from("barbeiros").select("id, nome").eq("ativo", true),
    ]);

  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;

  return {
    atendimentos: atendimentos ?? [],
    comandas: comandas ?? [],
    barbeiros: barbeiros ?? [],
  };
}

// Período anterior com a mesma duração (para deltas)
export async function getRelatoriosPeriodoAnterior(dataIni, dataFim) {
  const ini = new Date(dataIni + "T00:00:00");
  const fim = new Date(dataFim + "T23:59:59.999");
  const durMs = fim - ini;
  const antFim = new Date(ini.getTime() - 1);
  const antIni = new Date(antFim.getTime() - durMs);

  const { data, error } = await supabase
    .from("atendimentos")
    .select("id, data_hora, status, valor_total, cliente_nome, barbeiro_id")
    .gte("data_hora", antIni.toISOString())
    .lte("data_hora", antFim.toISOString());

  if (error) throw error;
  return data ?? [];
}

// Busca última visita de cada cliente para detectar churn
export async function getUltimaVisitaClientes() {
  const { data, error } = await supabase
    .from("atendimentos")
    .select("cliente_nome, cliente_id, data_hora, valor_total")
    .eq("status", "concluido")
    .order("data_hora", { ascending: false });

  if (error) throw error;

  const mapaCliente = {};
  for (const a of data ?? []) {
    const key = a.cliente_id ?? (a.cliente_nome || "").toLowerCase().trim();
    if (!key) continue;
    if (!mapaCliente[key]) {
      mapaCliente[key] = {
        nome: a.cliente_nome || "Sem nome",
        ultima_visita: a.data_hora,
        total_visitas: 0,
        total_gasto: 0,
      };
    }
    mapaCliente[key].total_visitas++;
    mapaCliente[key].total_gasto += Number(a.valor_total || 0);
  }

  return Object.values(mapaCliente);
}
