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

// Registra qualquer movimentação de estoque como evento independente
async function registrarMovimento(produto, qtdAnterior, qtdNova) {
  if (qtdAnterior === qtdNova) return;
  const tipo =
    qtdNova === 0   ? "zerado"  :
    qtdNova > qtdAnterior ? (qtdAnterior === 0 ? "reposto" : "entrada") :
    "saida";
  await supabase.from("historico").insert({
    produto_id:          produto.id,
    produto_nome:        produto.nome,
    produto_cor:         produto.cor         || "",
    categoria_nome:      produto.categoria_nome || "",
    foto:                produto.foto         || "",
    tipo,
    quantidade_anterior: qtdAnterior,
    quantidade_nova:     qtdNova,
    data_zerado:         new Date().toISOString(),
  });
}

// ─── Clientes ───────────────────────────────────────────────────
async function getClientes() {
  const { data, error } = await supabase.from("clientes").select("*").order("nome");
  if (error) throw error;
  return data;
}

async function getClientesComStats() {
  const [{ data: clientes, error: e1 }, { data: atends, error: e2 }] = await Promise.all([
    supabase.from("clientes").select("*").order("data_cadastro", { ascending: false }),
    supabase.from("atendimentos")
      .select("cliente_id, cliente_nome, valor_total, data_hora")
      .eq("status", "concluido"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const byId   = {};
  const byNome = {};
  const addStats = (map, key, a) => {
    if (!map[key]) map[key] = { count: 0, total: 0, ultima: null };
    map[key].count++;
    map[key].total += Number(a.valor_total || 0);
    if (!map[key].ultima || a.data_hora > map[key].ultima) map[key].ultima = a.data_hora;
  };
  for (const a of atends ?? []) {
    if (a.cliente_id) addStats(byId, a.cliente_id, a);
    if (a.cliente_nome) addStats(byNome, (a.cliente_nome || "").toLowerCase().trim(), a);
  }

  return (clientes ?? []).map((c) => ({
    ...c,
    stats: byId[c.id] ?? byNome[(c.nome || "").toLowerCase().trim()] ?? { count: 0, total: 0, ultima: null },
  }));
}

async function getAtendimentosByCliente(clienteId, clienteNome) {
  const norm = (clienteNome || "").trim();
  let query = supabase
    .from("atendimentos")
    .select("*")
    .order("data_hora", { ascending: false });

  if (clienteId && norm) {
    query = query.or(`cliente_id.eq.${clienteId},cliente_nome.eq.${norm}`);
  } else if (clienteId) {
    query = query.eq("cliente_id", clienteId);
  } else if (norm) {
    query = query.eq("cliente_nome", norm);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function addCliente(c) {
  const { id: _id, ...payload } = c;
  const { data, error } = await supabase.from("clientes").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateCliente(c) {
  const { id, stats, ...payload } = c;
  const { error } = await supabase.from("clientes").update(payload).eq("id", id);
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

// eslint-disable-next-line no-unused-vars
async function getFaturamentoUltimosDias(dias = 7) {
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
  const { id, ...payload } = a;
  const { error } = await supabase.from("atendimentos").update(payload).eq("id", id);
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

async function setConfiguracao(chave, valor) {
  const v = typeof valor === "string" ? valor : JSON.stringify(valor);
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data?.user) throw new Error("Não autenticado");
  const user = data.user;
  const { data: profile } = await supabase
    .from("profiles").select("loja_id").eq("id", user.id).single();
  const lojaId = profile?.loja_id ?? null;

  // Verifica se já existe linha para essa chave + loja
  const { data: existing } = await supabase
    .from("configuracoes")
    .select("chave")
    .eq("chave", chave)
    .eq("loja_id", lojaId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("configuracoes")
      .update({ valor: v })
      .eq("chave", chave)
      .eq("loja_id", lojaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("configuracoes")
      .insert({ chave, valor: v, loja_id: lojaId });
    if (error) throw new Error(error.message);
  }
}

async function getWebhookLogs(limit = 20) {
  const { data, error } = await supabase
    .from("webhook_logs")
    .select("id, gateway, evento, processado, erro, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
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

async function getComandasAbertas(page = 0, pageSize = 20) {
  const from = page * pageSize;
  const to   = from + pageSize - 1;
  const { data, error, count } = await supabase
    .from("comandas")
    .select("*", { count: "exact" })
    .eq("status", "aberta")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { data: data ?? [], total: count ?? 0 };
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
      // Comanda anterior fechada/cancelada: desvincula o gcal_event_id dela
      // para que a constraint UNIQUE permita associá-lo à nova comanda.
      // O trigger só bloqueia mudanças de STATUS em 'fechada', não outros campos.
      const { error: clearErr } = await supabase
        .from("comandas")
        .update({ gcal_event_id: null })
        .eq("id", existente.id);
      if (clearErr) throw clearErr;
    }
  }

  const { data, error } = await supabase.from("comandas").insert(comanda).select().single();
  if (error) throw error;
  return data;
}

// Retorna { id, version, updated_at } se a comanda foi atualizada,
// ou null se ela não estava mais 'aberta' (fechada/cancelada em outra sessão).
// O trigger do banco seta updated_at e incrementa version automaticamente.
async function updateComanda(id, updates) {
  const { id: _id, updated_at: _ua, version: _v, ...payload } = updates;
  const { data, error } = await supabase
    .from("comandas")
    .update(payload)
    .eq("id", id)
    .eq("status", "aberta")   // guard: não atualiza comanda já fechada/cancelada
    .is("deleted_at", null)   // guard: não atualiza comanda deletada
    .select("id, version, updated_at");
  if (error) throw error;
  return data?.length ? data[0] : null; // null = comanda não estava aberta
}

async function deleteComanda(id, motivo = null) {
  // Cancelamento atômico via RPC: estorno de benefícios + cancelamento
  // da comanda acontecem na mesma transação. Rollback automático se falhar.
  const { error } = await supabase.rpc("cancelar_comanda", {
    p_comanda_id: id,
    p_motivo:     motivo ?? null,
  });
  if (error) throw new Error(error.message);
}

async function registrarEventoComanda(comandaId, tipo, descricao, payload = {}) {
  const { error } = await supabase
    .from("comanda_eventos")
    .insert({ comanda_id: comandaId, tipo, descricao, payload });
  if (error) console.warn("registrarEventoComanda:", error.message);
}

async function getEventosComanda(comandaId) {
  const { data, error } = await supabase
    .from("comanda_eventos")
    .select("*")
    .eq("comanda_id", comandaId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data ?? [];
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
    .gte("updated_at", ini)
    .lte("updated_at", fim)
    .order("updated_at", { ascending: false });
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

  const items = Object.entries(agregado).map(([produto_id, quantidade]) => ({
    produto_id: Number(produto_id),
    quantidade,
  }));

  // Tenta o RPC atômico primeiro (stored procedure baixar_estoque_comanda)
  const { error: rpcErr } = await supabase.rpc("baixar_estoque_comanda", { items });
  if (!rpcErr) return;

  // Fallback JS para bancos sem a stored procedure ainda deployada
  console.warn("baixar_estoque_comanda RPC indisponível, usando fallback JS:", rpcErr.message);
  const ids = items.map((i) => i.produto_id);
  const { data: produtos, error } = await supabase
    .from("produtos")
    .select("id, quantidade, nome, cor, foto, categoria_id")
    .in("id", ids);
  if (error) throw error;

  await Promise.all(
    (produtos ?? []).map(async (prod) => {
      const qtdAnterior = prod.quantidade ?? 0;
      const novaQtd = Math.max(0, qtdAnterior - agregado[prod.id]);
      const { error: ue } = await supabase
        .from("produtos")
        .update({ quantidade: novaQtd })
        .eq("id", prod.id);
      if (ue) throw ue;
      if (qtdAnterior !== novaQtd) {
        await registrarMovimento(
          { id: prod.id, nome: prod.nome, cor: prod.cor, categoria_nome: "", foto: prod.foto },
          qtdAnterior,
          novaQtd
        );
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

// ─── Planos e assinaturas ─────────────────────────────────────────
async function getPlanos() {
  const { data, error } = await supabase.from("planos").select("*").eq("ativo", true).order("valor");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function upsertPlano(p) {
  const { id, created_at, ...payload } = p;
  const { data, error } = await supabase
    .from("planos")
    .upsert(id ? { id, ...payload } : payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

let _assinaturasCache   = null;
let _assinaturasCacheTs = 0;
const ASSINATURAS_TTL   = 60_000; // 60s

export function invalidarCacheAssinaturas() {
  _assinaturasCache   = null;
  _assinaturasCacheTs = 0;
}

async function getAssinaturasAtivas() {
  if (_assinaturasCache && Date.now() - _assinaturasCacheTs < ASSINATURAS_TTL) {
    return _assinaturasCache;
  }

  const { data, error } = await supabase
    .from("assinaturas")
    .select("id, cliente_id, plano_id, status, data_inicio, data_renovacao, valor, gateway, gateway_subscription_id, planos(id, nome, valor, intervalo, beneficios)")
    .eq("status", "ativa")
    .order("created_at", { ascending: false });

  let result;
  if (error) {
    // Fallback: beneficios column may not exist yet
    const { data: data2, error: error2 } = await supabase
      .from("assinaturas")
      .select("id, cliente_id, plano_id, status, data_inicio, data_renovacao, valor, gateway, gateway_subscription_id, planos(id, nome, valor, intervalo)")
      .eq("status", "ativa")
      .order("created_at", { ascending: false });
    if (error2) throw new Error(error2.message);
    result = (data2 ?? []).map((a) => ({
      ...a,
      planos: a.planos ? { ...a.planos, beneficios: [] } : null,
    }));
  } else {
    result = data ?? [];
  }

  _assinaturasCache   = result;
  _assinaturasCacheTs = Date.now();
  return result;
}

async function getAssinaturasByCliente(clienteId) {
  const { data, error } = await supabase
    .from("assinaturas")
    .select("*, planos(id, nome, valor, intervalo, beneficios)")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function upsertAssinatura(a) {
  const { id, created_at, updated_at, planos: _p, ...payload } = a;
  let data, error;
  if (id) {
    ({ data, error } = await supabase
      .from("assinaturas")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single());
  } else {
    ({ data, error } = await supabase
      .from("assinaturas")
      .insert(payload)
      .select()
      .single());
  }
  if (error) throw new Error(error.message);
  invalidarCacheAssinaturas();
  return data;
}

// ─── Benefícios de assinatura ────────────────────────────────────
async function getAssinaturaAtivaByCliente(clienteId) {
  const { data, error } = await supabase
    .from("assinaturas")
    .select("*, planos(id, nome, valor, intervalo, beneficios)")
    .eq("cliente_id", clienteId)
    .eq("status", "ativa")
    .maybeSingle();
  if (error) {
    const { data: data2, error: error2 } = await supabase
      .from("assinaturas")
      .select("*, planos(id, nome, valor, intervalo)")
      .eq("cliente_id", clienteId)
      .eq("status", "ativa")
      .maybeSingle();
    if (error2) throw new Error(error2.message);
    if (!data2) return null;
    return { ...data2, planos: data2.planos ? { ...data2.planos, beneficios: [] } : null };
  }
  return data ?? null;
}

async function getUsoBeneficios(assinaturaId, ciclo) {
  const { data, error } = await supabase
    .from("uso_beneficios")
    .select("*")
    .eq("assinatura_id", assinaturaId)
    .eq("ciclo", ciclo)
    .eq("estornado", false);
  if (error) return []; // table may not exist yet (migration pending)
  return data ?? [];
}

async function registrarUsoBeneficios(registros) {
  if (!registros || registros.length === 0) return;
  // ignoreDuplicates: conflito no unique index (mesmo benefício na mesma comanda)
  // é silenciado — idempotente em retries
  const { error } = await supabase
    .from("uso_beneficios")
    .insert(registros, { ignoreDuplicates: true });
  if (error) console.warn("registrarUsoBeneficios:", error.message);
}

// ─── Horários especiais ───────────────────────────────────────────
async function getHorariosEspeciais() {
  const { data, error } = await supabase.from("horarios_especiais").select("*").order("data");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function upsertHorarioEspecial(h) {
  const { id, created_at, ...payload } = h;
  const { data, error } = await supabase
    .from("horarios_especiais")
    .upsert(id ? { id, ...payload } : payload, { onConflict: "data,loja_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function deleteHorarioEspecial(id) {
  const { error } = await supabase.from("horarios_especiais").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Caixa ───────────────────────────────────────────────────────

async function getSessaoCaixaAberta() {
  const { data, error } = await supabase
    .from("sessoes_caixa")
    .select("*")
    .eq("status", "aberta")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getSessoesCaixa(limit = 10) {
  const { data, error } = await supabase
    .from("sessoes_caixa")
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

async function getMovimentosCaixa(sessaoId) {
  const { data, error } = await supabase
    .from("movimentos_caixa")
    .select("*")
    .eq("sessao_id", sessaoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function abrirCaixa(valorAbertura = 0, abertoPor = null) {
  const { data, error } = await supabase.rpc("abrir_caixa", {
    p_valor_abertura: valorAbertura,
    p_aberto_por:     abertoPor,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function fecharCaixa(sessaoId, valorFechamento, fechadoPor = null) {
  const { data, error } = await supabase.rpc("fechar_caixa", {
    p_sessao_id:        sessaoId,
    p_valor_fechamento: valorFechamento,
    p_fechado_por:      fechadoPor,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function registrarMovimentoCaixa(sessaoId, tipo, valor, motivo = null) {
  const { data, error } = await supabase.rpc("registrar_movimento_caixa", {
    p_sessao_id: sessaoId,
    p_tipo:      tipo,
    p_valor:     valor,
    p_motivo:    motivo,
  });
  if (error) throw new Error(error.message);
  return data;
}

// ─── Limpeza de dados operacionais (uso em testes) ───────────────
async function limparDadosOperacionais() {
  // Ordem respeita dependências: primeiro tabelas filhas, depois pais
  const tabelas = ["historico", "comandas", "atendimentos", "clientes"];
  for (const tabela of tabelas) {
    const { error } = await supabase.from(tabela).delete().neq("id", 0);
    if (error) throw error;
  }
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
  registrarMovimento,
  getClientes,
  getClientesComStats,
  getAtendimentosByCliente,
  addCliente,
  updateCliente,
  deleteCliente,
  getAtendimentoByGcalId,
  getAtendimentos,
  getAtendimentosHoje,
  getAtendimentosMes,
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
  baixarEstoqueComanda,
  getAtendimentosPeriodo,
  getComandasFechadasPeriodo,
  getProdutosByTipo,
  setConfiguracao,
  getWebhookLogs,
  getPlanos,
  upsertPlano,
  getAssinaturasAtivas,
  invalidarCacheAssinaturas,
  getAssinaturasByCliente,
  upsertAssinatura,
  getHorariosEspeciais,
  upsertHorarioEspecial,
  deleteHorarioEspecial,
  getAssinaturaAtivaByCliente,
  getUsoBeneficios,
  registrarUsoBeneficios,
  registrarEventoComanda,
  getEventosComanda,
  limparDadosOperacionais,
  getSessaoCaixaAberta,
  getSessoesCaixa,
  getMovimentosCaixa,
  abrirCaixa,
  fecharCaixa,
  registrarMovimentoCaixa,
};
