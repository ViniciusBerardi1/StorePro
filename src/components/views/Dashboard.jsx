import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { db } from "../../services/supabaseDb";

const BRL = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Helpers de período ──────────────────────────────────────────
function periodRange(periodo) {
  const n = new Date();
  const iso = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) =>
    new Date(y, m, d, h, mi, s, ms).toISOString();
  if (periodo === "hoje")
    return {
      ini: iso(n.getFullYear(), n.getMonth(), n.getDate()),
      fim: iso(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999),
    };
  if (periodo === "semana") {
    const s = new Date(n);
    s.setDate(n.getDate() - 6);
    return {
      ini: iso(s.getFullYear(), s.getMonth(), s.getDate()),
      fim: iso(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999),
    };
  }
  const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  return {
    ini: iso(n.getFullYear(), n.getMonth(), 1),
    fim: iso(n.getFullYear(), n.getMonth(), last, 23, 59, 59, 999),
  };
}

// ─── UI Primitivos ───────────────────────────────────────────────
function Card({ children, className = "" }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className="text-sm font-semibold text-gray-700 mb-3">{children}</h3>;
}

function KpiCard({ icon, label, valor, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-xl">{icon}</span>
      <div className="text-2xl font-bold text-gray-800 leading-tight">{valor}</div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function PagamentoBar({ atendimentos }) {
  const formas = { pix: 0, debito: 0, credito: 0 };
  const labels = { pix: "Pix 🔑", debito: "Débito 💳", credito: "Crédito 💳" };
  const cores  = { pix: "bg-emerald-400", debito: "bg-indigo-400", credito: "bg-violet-400" };

  for (const a of atendimentos.filter((a) => a.status === "concluido")) {
    if (a.forma_pagamento in formas)
      formas[a.forma_pagamento] += Number(a.valor_total || 0);
  }
  const total = Object.values(formas).reduce((s, v) => s + v, 0);
  if (total === 0) return <p className="text-xs text-gray-400">Sem dados de pagamento.</p>;

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(formas).map(([f, valor]) => {
        const pct = total > 0 ? (valor / total) * 100 : 0;
        return (
          <div key={f}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 font-medium">{labels[f]}</span>
              <span className="text-gray-400">{BRL(valor)} · {pct.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5 }}
                className={`h-full ${cores[f]} rounded-full`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba: Caixa ──────────────────────────────────────────────────
function TabCaixa({ atendimentos, comandas, produtos, setView }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");
  const fat = ok.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const ticket = ok.length > 0 ? fat / ok.length : 0;
  const cancelados = atendimentos.filter((a) => a.status === "cancelado").length;

  const receitaSvcs  = comandas.reduce((s, c) => s + Number(c.valor_servicos || 0), 0);
  const receitaBar   = comandas.reduce((s, c) => s + Number(c.valor_bar  || 0), 0);
  const receitaLoja  = comandas.reduce((s, c) => s + Number(c.valor_loja || 0), 0);
  const totalComandas = comandas.reduce((s, c) => s + Number(c.valor_total || 0), 0);

  const origens = [
    { label: "Serviços", valor: receitaSvcs || fat, icon: "✂️", cor: "bg-indigo-50 border-indigo-100", text: "text-indigo-700" },
    { label: "Bar",      valor: receitaBar,          icon: "🍺", cor: "bg-amber-50 border-amber-100",  text: "text-amber-700"  },
    { label: "Loja",     valor: receitaLoja,         icon: "🛍️", cor: "bg-emerald-50 border-emerald-100", text: "text-emerald-700" },
  ].filter((o) => o.valor > 0);

  const estoqueBaixo = (produtos ?? []).filter((p) => p.quantidade <= (p.estoque_minimo ?? 1));

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="💰" label="Faturamento" valor={BRL(fat)} sub={`${ok.length} concluídos`} />
        <KpiCard icon="✂️" label="Atendimentos" valor={ok.length} sub={cancelados > 0 ? `${cancelados} cancelados` : undefined} />
        <KpiCard icon="💳" label="Ticket médio" valor={BRL(ticket)} sub="por atendimento" />
        <KpiCard icon="🧾" label="Comandas fechadas" valor={comandas.length} sub={totalComandas > 0 ? BRL(totalComandas) : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formas de pagamento */}
        <Card>
          <SectionTitle>💳 Formas de pagamento</SectionTitle>
          <PagamentoBar atendimentos={atendimentos} />
        </Card>

        {/* Receita por origem */}
        {origens.length > 0 && (
          <Card>
            <SectionTitle>📦 Receita por origem</SectionTitle>
            <div className="flex flex-col gap-2">
              {origens.map((o) => {
                const base = Math.max(fat, totalComandas, 1);
                const pct = (o.valor / base) * 100;
                return (
                  <div key={o.label} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${o.cor}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-base">{o.icon}</span>
                      <div>
                        <p className={`text-xs font-medium ${o.text}`}>{o.label}</p>
                        <p className="text-[10px] text-gray-400">{pct.toFixed(1)}% do total</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-800">{BRL(o.valor)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Estoque baixo */}
      {estoqueBaixo.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>⚠️ Estoque baixo</SectionTitle>
            <button
              onClick={() => setView("estoque_baixo")}
              className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
            >
              Ver todos →
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {estoqueBaixo.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
                <span className="text-xs font-medium text-orange-700 truncate">{p.nome}</span>
                <span className="text-xs font-bold text-orange-500 ml-2 shrink-0">{p.quantidade}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Aba: Extrato ────────────────────────────────────────────────
const PGTO_BADGE = {
  pix:     "bg-emerald-50 text-emerald-600",
  debito:  "bg-indigo-50 text-indigo-600",
  credito: "bg-violet-50 text-violet-600",
};

const STATUS_BADGE = {
  concluido:   "text-green-600 bg-green-50",
  cancelado:   "text-red-500 bg-red-50",
  agendado:    "text-blue-600 bg-blue-50",
  em_andamento:"text-yellow-600 bg-yellow-50",
};

function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function DetalheComanda({ cmd, custoPorId }) {
  const temServicos = (cmd.servicos  || []).length > 0;
  const temBar      = (cmd.itens_bar  || []).length > 0;
  const temLoja     = (cmd.itens_loja || []).length > 0;

  let custoTotal = 0;
  for (const item of [...(cmd.itens_bar || []), ...(cmd.itens_loja || [])]) {
    custoTotal += (custoPorId[item.produto_id] || 0) * (item.quantidade || 1);
  }
  const lucro = Number(cmd.valor_total || 0) - custoTotal;

  return (
    <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100">
      {temServicos && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mt-3 mb-2 uppercase tracking-wide">✂️ Serviços</p>
          <div className="flex flex-col gap-1">
            {cmd.servicos.map((s, i) => (
              <div key={i} className="flex justify-between text-xs px-3 py-2 bg-indigo-50 rounded-xl">
                <span className="text-indigo-700 font-medium">{s.nome}</span>
                <span className="font-semibold text-indigo-600">{BRL(s.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {temBar && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">🍺 Bar</p>
          <div className="flex flex-col gap-1">
            {cmd.itens_bar.map((item, i) => {
              const custo = custoPorId[item.produto_id];
              return (
                <div key={i} className="flex items-center justify-between text-xs px-3 py-2 bg-amber-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-700 font-medium truncate">{item.nome}</p>
                    {custo > 0 && <p className="text-amber-400">custo est. {BRL(custo * (item.quantidade || 1))}</p>}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="font-semibold text-amber-600">{BRL(Number(item.preco_venda || 0) * (item.quantidade || 1))}</p>
                    <p className="text-amber-400">{item.quantidade}× {BRL(item.preco_venda)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {temLoja && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">🛍️ Loja</p>
          <div className="flex flex-col gap-1">
            {cmd.itens_loja.map((item, i) => {
              const custo = custoPorId[item.produto_id];
              return (
                <div key={i} className="flex items-center justify-between text-xs px-3 py-2 bg-emerald-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-emerald-700 font-medium truncate">{item.nome}</p>
                    {custo > 0 && <p className="text-emerald-400">custo est. {BRL(custo * (item.quantidade || 1))}</p>}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="font-semibold text-emerald-600">{BRL(Number(item.preco_venda || 0) * (item.quantidade || 1))}</p>
                    <p className="text-emerald-400">{item.quantidade}× {BRL(item.preco_venda)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Resumo</p>
        {Number(cmd.valor_servicos || 0) > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Serviços</span><span className="font-medium">{BRL(cmd.valor_servicos)}</span>
          </div>
        )}
        {Number(cmd.valor_bar || 0) > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Bar 🍺</span><span className="font-medium">{BRL(cmd.valor_bar)}</span>
          </div>
        )}
        {Number(cmd.valor_loja || 0) > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Loja 🛍️</span><span className="font-medium">{BRL(cmd.valor_loja)}</span>
          </div>
        )}
        {cmd.desconto?.valor_calculado > 0 && (() => {
          const d = cmd.desconto;
          const alvoNome = { total: "Total", servicos: "Serviços", bar: "Bar", loja: "Loja" }[d.alvo] ?? "Total";
          const label = d.tipo === "percent" ? `${alvoNome} −${d.valor}%` : alvoNome;
          const subtotal = Number(cmd.valor_servicos || 0) + Number(cmd.valor_bar || 0) + Number(cmd.valor_loja || 0);
          return (
            <>
              <div className="flex justify-between text-xs text-gray-400 border-t border-gray-200 pt-1.5 mt-0.5">
                <span>Subtotal</span><span>{BRL(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs font-medium text-orange-500">
                <span>Desconto ({label})</span><span>−{BRL(d.valor_calculado)}</span>
              </div>
            </>
          );
        })()}
        <div className="flex justify-between text-sm font-bold text-gray-800 border-t border-gray-200 pt-1.5 mt-0.5">
          <span>Total</span>
          <span className="text-indigo-600">{BRL(cmd.valor_total)}</span>
        </div>
        {custoTotal > 0 && (
          <div className={`flex justify-between text-xs border-t border-gray-100 pt-1 font-semibold ${lucro >= 0 ? "text-green-600" : "text-red-500"}`}>
            <span>Lucro estimado</span><span>{BRL(lucro)}</span>
          </div>
        )}
        {cmd.forma_pagamento && (
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>Pagamento</span>
            <span className={`px-1.5 py-0.5 rounded-full font-medium text-[10px] ${PGTO_BADGE[cmd.forma_pagamento] ?? "bg-gray-100 text-gray-500"}`}>
              {cmd.forma_pagamento}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TabExtrato({ atendimentos, comandas, produtos }) {
  const [expandida, setExpandida] = useState(null);
  const custoPorId = {};
  for (const p of produtos ?? []) custoPorId[p.id] = Number(p.preco_custo || 0);

  const sorted = [...comandas].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const atendSorted = [...atendimentos]
    .filter((a) => a.status !== "agendado")
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));

  return (
    <div className="flex flex-col gap-4">
      {/* Comandas */}
      <Card>
        <SectionTitle>🧾 Comandas finalizadas ({comandas.length})</SectionTitle>
        {comandas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma comanda finalizada no período.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((cmd) => {
              const aberta = expandida === cmd.id;
              return (
                <div key={cmd.id} className={`border rounded-2xl overflow-hidden transition-all ${aberta ? "border-indigo-200 shadow-sm" : "border-gray-200"}`}>
                  <button
                    onClick={() => setExpandida(aberta ? null : cmd.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-[10px] font-bold text-gray-300 w-8 shrink-0">#{cmd.id}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{cmd.cliente_nome || "—"}</p>
                      <p className="text-xs text-gray-400">{fmtDataHora(cmd.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cmd.forma_pagamento && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PGTO_BADGE[cmd.forma_pagamento] ?? "bg-gray-50 text-gray-500"}`}>
                          {cmd.forma_pagamento}
                        </span>
                      )}
                      <span className="text-sm font-bold text-indigo-600">{BRL(cmd.valor_total)}</span>
                      <span className="text-gray-300 text-xs">{aberta ? "▾" : "▸"}</span>
                    </div>
                  </button>
                  {aberta && <DetalheComanda cmd={cmd} custoPorId={custoPorId} />}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Atendimentos */}
      <Card>
        <SectionTitle>📋 Atendimentos do período ({atendSorted.length})</SectionTitle>
        {atendSorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum atendimento no período.</p>
        ) : (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {atendSorted.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-700 truncate">{a.cliente_nome || "—"}</p>
                  <p className="text-[10px] text-gray-400">{fmtDataHora(a.data_hora)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[a.status] ?? "text-gray-500 bg-gray-50"}`}>
                    {a.status}
                  </span>
                  {a.forma_pagamento && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PGTO_BADGE[a.forma_pagamento] ?? "bg-gray-50 text-gray-500"}`}>
                      {a.forma_pagamento}
                    </span>
                  )}
                  <span className="text-xs font-semibold text-gray-700">{BRL(a.valor_total)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Financeiro principal ────────────────────────────────────────
const PERIODOS = [
  { id: "hoje",   label: "Hoje"    },
  { id: "semana", label: "7 dias"  },
  { id: "mes",    label: "Mês"     },
];

const TABS = [
  { id: "caixa",   icon: "💰", label: "Caixa"   },
  { id: "extrato", icon: "📋", label: "Extrato"  },
];

export default function Dashboard({ produtos, setView }) {
  const [periodo, setPeriodo] = useState("hoje");
  const [tab, setTab]         = useState("caixa");
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(null);
  const [atendimentos, setAtendimentos] = useState([]);
  const [comandas, setComandas]         = useState([]);
  const [refreshKey, setRefreshKey]     = useState(0);

  const carregar = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErro(null);
    const { ini, fim } = periodRange(periodo);
    Promise.all([
      db.getAtendimentosPeriodo(ini, fim),
      db.getComandasFechadasPeriodo(ini, fim),
    ]).then(([at, cmds]) => {
      if (cancelled) return;
      setAtendimentos(at);
      setComandas(cmds);
    }).catch((e) => {
      if (!cancelled) setErro("Erro ao carregar financeiro.");
      console.error(e);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [periodo, refreshKey]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Financeiro</h2>
          <p className="text-xs text-gray-400 mt-0.5">Caixa operacional do período</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${periodo === p.id ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={carregar}
            className="text-xs text-gray-400 hover:text-indigo-500 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors
              ${tab === t.id ? "bg-indigo-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      ) : erro ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">⚠️ {erro}</div>
      ) : (
        <motion.div
          key={`${tab}-${periodo}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "caixa" && (
            <TabCaixa
              atendimentos={atendimentos}
              comandas={comandas}
              produtos={produtos}
              setView={setView}
            />
          )}
          {tab === "extrato" && (
            <TabExtrato
              atendimentos={atendimentos}
              comandas={comandas}
              produtos={produtos}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}
