/**
 * supabaseDb — espelha a API do db.js original, mas persiste no Supabase.
 * Substitui completamente o IndexedDB quando as credenciais estiverem configuradas.
 */
import { supabase } from "./supabase";

// ─── helpers ────────────────────────────────────────────────────

// Retorna a data LOCAL hoje no formato "YYYY-MM-DD"
// (evita virar para o dia seguinte às 21h BR por causa do UTC)
function hojeLocalStr() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// Retorna { ini, fim } como ISO strings UTC correspondentes
// ao início e fim de um dia LOCAL (00:00:00 e 23:59:59.999 horário local)
function rangeLocalDia(ano, mes, dia) {
  return {
    ini: new Date(ano, mes - 1, dia, 0, 0, 0, 0).toISOString(),
    fim: new Date(ano, mes - 1, dia, 23, 59, 59, 999).toISOString(),
  };
}

// ─── Categorias ─────────────────────────────────────────────────
async function getCategorias() {
  const { data, error } = await supabase.from("categorias").select("*").order("id");
  if (error) { console.error("[Supabase] getCategorias error:", error); throw error; }
  return data;
}

// ─── Produtos ───────────────────────────────────────────────────
async function getProdutos() {
  const [{ data: produtos, error: e1 }, { data: cats, error: e2 }] = await Promise.all([
    supabase.from("produtos").select("*").order("nome"),
    supabase.from("categorias").select("id, nome"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return (produtos ?? []).map((p) => ({
    ...p,
    categoria_nome: cats?.find((c) => c.id === p.categoria_id)?.nome ?? "",
  }));
}

async function addProduto(p) {
  const { id: _id, categoria_nome: _cn, ...payload } = p;
  const { data, error } = await supabase.from("produtos").insert(payload).select().single();
  if (error) throw error;
  return data.id;
}

async function updateProduto(p) {
  const { categoria_nome: _cn, categorias: _c, ...payload } = p;
  const { error } = await supabase.from("produtos").update(payload).eq("id", p.id);
  if (error) throw error;
}

async function deleteProduto(id) {
  const { error } = await supabase.from("produtos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Histórico de estoque ────────────────────────────────────────
async function addHistorico(entrada) {
  const { error } = await supabase.from("historico").insert(entrada);
  if (error) throw error;
}

async function getHistorico() {
  const { data, error } = await supabase
    .from("historico")
    .select("*")
    .order("data_zerado", { ascending: false });
  if (error) throw error;
  return data;
}

async function limparHistorico() {
  const { error } = await supabase.from("historico").delete().neq("id", 0);
  if (error) throw error;
}

// ─── Clientes ───────────────────────────────────────────────────
async function getClientes() {
  const { data, error } = await supabase.from("clientes").select("*").order("nome");
  if (error) throw error;
  return data;
}

async function addCliente(c) {
  const { id: _id, ...payload } = c;
  const { data, error } = await supabase.from("clientes").insert(payload).select().single();
  if (error) throw error;
  return data.id;
}

async function updateCliente(c) {
  const { error } = await supabase.from("clientes").update(c).eq("id", c.id);
  if (error) throw error;
}

async function deleteCliente(id) {
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) throw error;
}

// ─── Atendimentos ────────────────────────────────────────────────
async function getAtendimentoByGcalId(gcalEventId) {
  const { data, error } = await supabase
    .from("atendimentos")
    .select("*")
    .eq("gcal_event_id", gcalEventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getAtendimentos() {
  const { data, error } = await supabase
    .from("atendimentos")
    .select("*")
    .order("data_hora", { ascending: false });
  if (error) throw error;
  return data;
}

async function getAtendimentosHoje() {
  const agora = new Date();
  const { ini, fim } = rangeLocalDia(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
  const { data, error } = await supabase
    .from("atendimentos")
    .select("*")
    .gte("data_hora", ini)
    .lte("data_hora", fim)
    .order("data_hora");
  if (error) throw error;
  return data;
}

async function getAtendimentosMes(ano, mes) {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const ini = new Date(ano, mes - 1, 1, 0, 0, 0, 0).toISOString();
  const fim = new Date(ano, mes - 1, ultimoDia, 23, 59, 59, 999).toISOString();
  const { data, error } = await supabase
    .from("atendimentos")
    .select("*")
    .gte("data_hora", ini)
    .lte("data_hora", fim);
  if (error) throw error;
  return data;
}

async function getFaturamentoUltimosDias(dias = 7) {
  // Mantida para compatibilidade — use getDashboardData() quando possível
  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setDate(agora.getDate() - (dias - 1));
  const { ini } = rangeLocalDia(inicio.getFullYear(), inicio.getMonth() + 1, inicio.getDate());
  const { fim } = rangeLocalDia(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());

  const { data, error } = await supabase
    .from("atendimentos")
    .select("data_hora, valor_total")
    .eq("status", "concluido")
    .gte("data_hora", ini)
    .lte("data_hora", fim);
  if (error) throw error;

  const resultado = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(agora);
    d.setDate(agora.getDate() - i);
    const { ini: dIni, fim: dFim } = rangeLocalDia(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const dIniMs = new Date(dIni).getTime();
    const dFimMs = new Date(dFim).getTime();
    const dataLabel = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const valor = (data ?? [])
      .filter(a => { const t = new Date(a.data_hora).getTime(); return t >= dIniMs && t <= dFimMs; })
      .reduce((s, a) => s + (Number(a.valor_total) || 0), 0);
    resultado.push({ data: dataLabel, valor });
  }
  return resultado;
}

// ─── Dashboard: UMA única query substitui 9 ─────────────────────
// Busca a janela mínima necessária (início do mês OU 7 dias atrás,
// o que vier primeiro), depois filtra tudo em memória.
async function getDashboardData() {
  const agora = new Date();

  // Janela de busca: cobre o mês atual E os últimos 7 dias
  const seteAtras = new Date(agora);
  seteAtras.setDate(agora.getDate() - 6);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const inicioJanela = seteAtras < inicioMes ? seteAtras : inicioMes;

  const { ini: iniQuery } = rangeLocalDia(
    inicioJanela.getFullYear(), inicioJanela.getMonth() + 1, inicioJanela.getDate()
  );
  const { fim: fimQuery } = rangeLocalDia(
    agora.getFullYear(), agora.getMonth() + 1, agora.getDate()
  );

  const { data, error } = await supabase
    .from("atendimentos")
    .select("*")
    .gte("data_hora", iniQuery)
    .lte("data_hora", fimQuery)
    .order("data_hora", { ascending: false });
  if (error) throw error;

  const todos = data ?? [];

  // ── Hoje (filtra em JS) ──────────────────────────────────────
  const { ini: hojeIni, fim: hojeFim } = rangeLocalDia(
    agora.getFullYear(), agora.getMonth() + 1, agora.getDate()
  );
  const hojeIniMs = new Date(hojeIni).getTime();
  const hojeFimMs = new Date(hojeFim).getTime();
  const hoje = todos
    .filter(a => { const t = new Date(a.data_hora).getTime(); return t >= hojeIniMs && t <= hojeFimMs; })
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));

  // ── Mês atual (filtra em JS) ─────────────────────────────────
  const mesIniMs = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0).getTime();
  const ultimoDiaMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const mesFimMs = new Date(agora.getFullYear(), agora.getMonth(), ultimoDiaMes, 23, 59, 59, 999).getTime();
  const mes = todos.filter(a => {
    const t = new Date(a.data_hora).getTime();
    return t >= mesIniMs && t <= mesFimMs;
  });

  // ── Gráfico 7 dias (agrupa em JS) ───────────────────────────
  const grafico = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(agora);
    d.setDate(agora.getDate() - i);
    const { ini: dIni, fim: dFim } = rangeLocalDia(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const dIniMs = new Date(dIni).getTime();
    const dFimMs = new Date(dFim).getTime();
    const dataLabel = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
    const valor = todos
      .filter(a => {
        const t = new Date(a.data_hora).getTime();
        return a.status === "concluido" && t >= dIniMs && t <= dFimMs;
      })
      .reduce((s, a) => s + (Number(a.valor_total) || 0), 0);
    grafico.push({ data: dataLabel, valor });
  }

  return { hoje, mes, grafico };
}

async function addAtendimento(a) {
  const { id: _id, ...payload } = a;

  if (payload.gcal_event_id) {
    // Verifica se já existe um registro para esse evento do Google Calendar
    const { data: existente } = await supabase
      .from("atendimentos")
      .select("id")
      .eq("gcal_event_id", payload.gcal_event_id)
      .maybeSingle();

    if (existente?.id) {
      // Já existe — atualiza em vez de inserir
      const { error } = await supabase
        .from("atendimentos")
        .update(payload)
        .eq("id", existente.id);
      if (error) throw error;
      return existente.id;
    }
  }

  const { data, error } = await supabase
    .from("atendimentos")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

async function updateAtendimento(a) {
  const { error } = await supabase.from("atendimentos").update(a).eq("id", a.id);
  if (error) throw error;
}

async function deleteAtendimento(id) {
  const { error } = await supabase.from("atendimentos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Serviços ─────────────────────────────────────────────────────
async function getServicos() {
  const { data, error } = await supabase.from("servicos").select("*").order("nome");
  if (error) throw error;
  return data ?? [];
}

async function addServico(s) {
  const { id: _id, ...payload } = s;
  const { data, error } = await supabase.from("servicos").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateServico(s) {
  const { id, created_at, ...payload } = s;
  if (!id) throw new Error("ID do serviço não encontrado.");
  const { error } = await supabase
    .from("servicos")
    .update(payload)
    .eq("id", Number(id));
  if (error) throw error;
}

async function deleteServico(id) {
  const { error } = await supabase.from("servicos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Configurações ───────────────────────────────────────────────
async function getConfiguracao(chave) {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  if (error) throw error;
  return data?.valor ?? null;
}

// ─── Comandas ────────────────────────────────────────────────────
async function getComandaByGcalId(gcalEventId) {
  const { data, error } = await supabase
    .from("comandas")
    .select("*")
    .eq("gcal_event_id", gcalEventId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getComandasAbertas() {
  const { data, error } = await supabase
    .from("comandas")
    .select("*")
    .eq("status", "aberta")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function criarComanda(comanda) {
  const { gcal_event_id } = comanda;

  if (gcal_event_id) {
    const { data: existente } = await supabase
      .from("comandas")
      .select("*")
      .eq("gcal_event_id", gcal_event_id)
      .maybeSingle();

    if (existente) {
      if (existente.status === "aberta") return existente;
      const { data: updated, error } = await supabase
        .from("comandas")
        .update({ ...comanda, status: "aberta" })
        .eq("id", existente.id)
        .select()
        .single();
      if (error) throw error;
      return updated;
    }
  }

  const { data, error } = await supabase.from("comandas").insert(comanda).select().single();
  if (error) throw error;
  return data;
}

async function updateComanda(id, updates) {
  const { error } = await supabase.from("comandas").update(updates).eq("id", id);
  if (error) throw error;
}

async function deleteComanda(id) {
  const { error } = await supabase.from("comandas").delete().eq("id", id);
  if (error) throw error;
}

async function saveComanda(comanda) {
  const { gcal_event_id } = comanda;
  const { data: existente } = await supabase
    .from("comandas")
    .select("id")
    .eq("gcal_event_id", gcal_event_id)
    .maybeSingle();

  if (existente?.id) {
    const { error } = await supabase.from("comandas").update(comanda).eq("id", existente.id);
    if (error) throw error;
    return existente.id;
  }

  const { data, error } = await supabase.from("comandas").insert(comanda).select().single();
  if (error) throw error;
  return data.id;
}

// ─── Queries genéricas por período ──────────────────────────────
async function getAtendimentosPeriodo(ini, fim) {
  const { data, error } = await supabase
    .from("atendimentos")
    .select("*")
    .gte("data_hora", ini)
    .lte("data_hora", fim)
    .order("data_hora", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function getComandasFechadasPeriodo(ini, fim) {
  const { data, error } = await supabase
    .from("comandas")
    .select("*")
    .eq("status", "fechada")
    .gte("created_at", ini)
    .lte("created_at", fim)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ─── Baixa estoque ao fechar comanda ────────────────────────────
async function baixarEstoqueComanda(itens_bar = [], itens_loja = []) {
  const todos = [...itens_bar, ...itens_loja];
  if (todos.length === 0) return;

  // Agrega por produto_id (mesmo produto pode aparecer duplicado)
  const agregado = {};
  for (const item of todos) {
    agregado[item.produto_id] = (agregado[item.produto_id] || 0) + (item.quantidade ?? 1);
  }
  const ids = Object.keys(agregado).map(Number);

  const { data: produtos, error } = await supabase
    .from("produtos")
    .select("id, quantidade, nome, cor, foto, categoria_id")
    .in("id", ids);
  if (error) throw error;

  await Promise.all(
    (produtos ?? []).map(async (prod) => {
      const novaQtd = Math.max(0, (prod.quantidade ?? 0) - agregado[prod.id]);
      const { error: ue } = await supabase
        .from("produtos")
        .update({ quantidade: novaQtd })
        .eq("id", prod.id);
      if (ue) throw ue;
      if (novaQtd === 0 && (prod.quantidade ?? 0) > 0) {
        await supabase.from("historico").insert({
          produto_id: prod.id,
          produto_nome: prod.nome,
          produto_cor: prod.cor || "",
          foto: prod.foto || "",
          data_zerado: new Date().toISOString(),
        });
      }
    })
  );
}

// ─── Produtos por tipo (bar / loja) ──────────────────────────────
async function getProdutosByTipo(tipo) {
  const [{ data: produtos, error: e1 }, { data: cats, error: e2 }] = await Promise.all([
    supabase.from("produtos").select("*").eq("tipo", tipo).order("nome"),
    supabase.from("categorias").select("id, nome"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return (produtos ?? []).map((p) => ({
    ...p,
    categoria_nome: cats?.find((c) => c.id === p.categoria_id)?.nome ?? "",
  }));
}

// ─── Barbeiros ───────────────────────────────────────────────────
async function getBarbeiros() {
  const { data, error } = await supabase
    .from("barbeiros")
    .select("*")
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

async function addBarbeiro(b) {
  const { id: _id, created_at: _ca, ...payload } = b;
  const { data, error } = await supabase.from("barbeiros").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateBarbeiro(b) {
  const { created_at: _ca, ...payload } = b;
  const { error } = await supabase.from("barbeiros").update(payload).eq("id", b.id);
  if (error) throw error;
}

async function deleteBarbeiro(id) {
  const { error } = await supabase.from("barbeiros").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

// ─── Export (mesma interface do db.js) ───────────────────────────
export const db = {
  getCategorias,
  getProdutos,
  addProduto,
  updateProduto,
  deleteProduto,
  addHistorico,
  getHistorico,
  limparHistorico,
  getClientes,
  addCliente,
  updateCliente,
  deleteCliente,
  getAtendimentoByGcalId,
  getAtendimentos,
  getAtendimentosHoje,
  getAtendimentosMes,
  getFaturamentoUltimosDias,
  addAtendimento,
  updateAtendimento,
  deleteAtendimento,
  getServicos,
  addServico,
  updateServico,
  deleteServico,
  getConfiguracao,
  getBarbeiros,
  addBarbeiro,
  updateBarbeiro,
  deleteBarbeiro,
  getComandaByGcalId,
  getComandasAbertas,
  criarComanda,
  updateComanda,
  deleteComanda,
  saveComanda,
  baixarEstoqueComanda,
  getAtendimentosPeriodo,
  getComandasFechadasPeriodo,
  getProdutosByTipo,
  // compatibilidade com código legado que usa desejos
  getDesejos: async () => [],
  addDesejo: async () => {},
  updateDesejo: async () => {},
  deleteDesejo: async () => {},
};
