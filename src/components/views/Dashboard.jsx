import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { db } from "../../services/supabaseDb";
import { PageHeader } from "../ui/DS";
import {
  DollarSign, Scissors, CreditCard, Receipt, Package, ClipboardList,
  AlertTriangle, Beer, ShoppingBag, RefreshCw, TrendingUp, BarChart2,
  Calendar, Banknote, History,
} from "lucide-react";

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

function SectionTitle({ children, icon: Icon }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
      {Icon && <Icon size={15} strokeWidth={2} className="shrink-0" />}
      {children}
    </h3>
  );
}

function KpiCard({ icon: Icon, label, valor, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-gray-400"><Icon size={18} strokeWidth={1.75} /></span>
      <div className="text-2xl font-bold text-gray-800 leading-tight">{valor}</div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  );
}

function PagamentoBar({ atendimentos }) {
  const formas = { pix: 0, debito: 0, credito: 0, dinheiro: 0 };
  const labels = { pix: "Pix", debito: "Débito", credito: "Crédito", dinheiro: "Dinheiro" };
  const cores  = { pix: "bg-emerald-400", debito: "bg-indigo-400", credito: "bg-violet-400", dinheiro: "bg-amber-400" };

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
function TabCaixa({ atendimentos, comandas, produtos, setView, sessaoCaixa }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");
  const fat = ok.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const ticket = ok.length > 0 ? fat / ok.length : 0;
  const cancelados = atendimentos.filter((a) => a.status === "cancelado").length;

  const receitaSvcs  = comandas.reduce((s, c) => s + Number(c.valor_servicos || 0), 0);
  const receitaBar   = comandas.reduce((s, c) => s + Number(c.valor_bar  || 0), 0);
  const receitaLoja  = comandas.reduce((s, c) => s + Number(c.valor_loja || 0), 0);
  const totalComandas = comandas.reduce((s, c) => s + Number(c.valor_total || 0), 0);

  const origens = [
    { label: "Serviços", valor: receitaSvcs || fat, Icon: Scissors,   cor: "bg-indigo-50 border-indigo-100",  text: "text-indigo-700"  },
    { label: "Bar",      valor: receitaBar,          Icon: Beer,        cor: "bg-amber-50 border-amber-100",   text: "text-amber-700"   },
    { label: "Loja",     valor: receitaLoja,         Icon: ShoppingBag, cor: "bg-emerald-50 border-emerald-100", text: "text-emerald-700" },
  ].filter((o) => o.valor > 0);

  const estoqueBaixo = (produtos ?? []).filter((p) => p.quantidade <= (p.estoque_minimo ?? 1));

  return (
    <div className="flex flex-col gap-4">
      {/* Status do caixa */}
      <CaixaStatusBanner sessaoCaixa={sessaoCaixa} setView={setView} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign}  label="Faturamento"       valor={BRL(fat)}          sub={`${ok.length} concluídos`} />
        <KpiCard icon={Scissors}    label="Atendimentos"      valor={ok.length}          sub={cancelados > 0 ? `${cancelados} cancelados` : undefined} />
        <KpiCard icon={CreditCard}  label="Ticket médio"      valor={BRL(ticket)}        sub="por atendimento" />
        <KpiCard icon={Receipt}     label="Comandas fechadas" valor={comandas.length}    sub={totalComandas > 0 ? BRL(totalComandas) : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formas de pagamento */}
        <Card>
          <SectionTitle icon={CreditCard}>Formas de pagamento</SectionTitle>
          <PagamentoBar atendimentos={atendimentos} />
        </Card>

        {/* Receita por origem */}
        {origens.length > 0 && (
          <Card>
            <SectionTitle icon={TrendingUp}>Receita por origem</SectionTitle>
            <div className="flex flex-col gap-2">
              {origens.map((o) => {
                const base = Math.max(fat, totalComandas, 1);
                const pct = (o.valor / base) * 100;
                return (
                  <div key={o.label} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${o.cor}`}>
                    <div className="flex items-center gap-2">
                      <o.Icon size={15} strokeWidth={2} className={o.text} />
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
            <SectionTitle icon={AlertTriangle}>Estoque baixo</SectionTitle>
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
  pix:      "bg-emerald-50 text-emerald-600",
  debito:   "bg-indigo-50 text-indigo-600",
  credito:  "bg-violet-50 text-violet-600",
  dinheiro: "bg-amber-50 text-amber-600",
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

function fmtHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function duracaoLabel(msInicio, msFim) {
  const min = Math.floor((msFim - msInicio) / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ─── Banner: Status do Caixa ─────────────────────────────────────
function CaixaStatusBanner({ sessaoCaixa, setView }) {
  if (sessaoCaixa === undefined) {
    return <div className="h-12 bg-gray-100 rounded-2xl animate-pulse" />;
  }
  if (!sessaoCaixa) {
    return (
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gray-300" />
          <span className="text-sm font-medium text-gray-500">Caixa fechado</span>
        </div>
        <button
          onClick={() => setView("caixa")}
          className="text-xs font-medium text-indigo-500 hover:text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          Abrir caixa →
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <div>
          <span className="text-sm font-medium text-emerald-700">Caixa aberto</span>
          <p className="text-[10px] text-emerald-500">
            desde {fmtHora(sessaoCaixa.opened_at)}
            {sessaoCaixa.aberto_por ? ` · ${sessaoCaixa.aberto_por}` : ""}
          </p>
        </div>
      </div>
      <button
        onClick={() => setView("caixa")}
        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg transition-colors"
      >
        Ir para caixa →
      </button>
    </div>
  );
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
          <p className="text-xs font-semibold text-gray-400 mt-3 mb-2 uppercase tracking-wide flex items-center gap-1"><Scissors size={11} strokeWidth={2} />Serviços</p>
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
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide flex items-center gap-1"><Beer size={11} strokeWidth={2} />Bar</p>
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
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide flex items-center gap-1"><ShoppingBag size={11} strokeWidth={2} />Loja</p>
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
            <span className="flex items-center gap-1"><Beer size={11} strokeWidth={2} />Bar</span><span className="font-medium">{BRL(cmd.valor_bar)}</span>
          </div>
        )}
        {Number(cmd.valor_loja || 0) > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span className="flex items-center gap-1"><ShoppingBag size={11} strokeWidth={2} />Loja</span><span className="font-medium">{BRL(cmd.valor_loja)}</span>
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
        <SectionTitle icon={Receipt}>Comandas finalizadas ({comandas.length})</SectionTitle>
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
        <SectionTitle icon={ClipboardList}>Atendimentos do período ({atendSorted.length})</SectionTitle>
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

// ─── Aba: Histórico de Caixa ─────────────────────────────────────
function TabHistoricoCaixa({ sessoesHistorico, setView }) {
  if (!sessoesHistorico) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl h-20 animate-pulse" />
        ))}
      </div>
    );
  }
  if (sessoesHistorico.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhuma sessão de caixa encontrada.
          <br />
          <button
            onClick={() => setView("caixa")}
            className="text-indigo-500 hover:text-indigo-600 font-medium mt-2 inline-block"
          >
            Abrir o caixa →
          </button>
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sessoesHistorico.map((s) => {
        const aberta = s.status === "aberta";
        const duracao =
          s.opened_at && s.closed_at
            ? duracaoLabel(
                new Date(s.opened_at).getTime(),
                new Date(s.closed_at).getTime()
              )
            : null;

        const esperado =
          Number(s.valor_abertura || 0) +
          Number(s.total_dinheiro || 0) +
          Number(s.total_suprimentos || 0) -
          Number(s.total_sangrias || 0);
        const diferenca =
          s.valor_fechamento != null ? Number(s.valor_fechamento) - esperado : null;

        const totalMovimentado =
          Number(s.total_dinheiro || 0) +
          Number(s.total_pix || 0) +
          Number(s.total_debito || 0) +
          Number(s.total_credito || 0);

        return (
          <Card key={s.id}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${aberta ? "bg-emerald-400" : "bg-gray-300"}`} />
                  <span className="text-sm font-semibold text-gray-800">
                    {aberta ? "Caixa aberto" : `Sessão #${s.id}`}
                  </span>
                  {aberta && (
                    <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      EM ABERTO
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fmtDataHora(s.opened_at)}
                  {duracao ? ` · ${duracao}` : ""}
                  {s.aberto_por ? ` · ${s.aberto_por}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-gray-800">{BRL(totalMovimentado)}</p>
                <p className="text-xs text-gray-400">
                  {s.qtd_comandas || 0} comanda{(s.qtd_comandas || 0) !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {totalMovimentado > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {[
                  { label: "Dinheiro", valor: s.total_dinheiro, cor: "bg-amber-50 border-amber-100 text-amber-700" },
                  { label: "Pix",      valor: s.total_pix,      cor: "bg-emerald-50 border-emerald-100 text-emerald-700" },
                  { label: "Débito",   valor: s.total_debito,   cor: "bg-indigo-50 border-indigo-100 text-indigo-700" },
                  { label: "Crédito",  valor: s.total_credito,  cor: "bg-violet-50 border-violet-100 text-violet-700" },
                ]
                  .filter((f) => Number(f.valor || 0) > 0)
                  .map((f) => (
                    <div key={f.label} className={`flex flex-col px-3 py-2 rounded-xl border ${f.cor}`}>
                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{f.label}</span>
                      <span className="text-sm font-bold">{BRL(f.valor)}</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex gap-4 flex-wrap text-xs text-gray-400">
              {Number(s.valor_abertura || 0) > 0 && (
                <span>Abertura: <strong className="text-gray-600">{BRL(s.valor_abertura)}</strong></span>
              )}
              {Number(s.total_suprimentos || 0) > 0 && (
                <span className="text-emerald-600">+{BRL(s.total_suprimentos)} suprimentos</span>
              )}
              {Number(s.total_sangrias || 0) > 0 && (
                <span className="text-orange-500">−{BRL(s.total_sangrias)} sangrias</span>
              )}
            </div>

            {!aberta && diferenca !== null && (
              <div
                className={`mt-3 flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border ${
                  Math.abs(diferenca) < 0.01
                    ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                    : diferenca < 0
                    ? "bg-red-50 border-red-100 text-red-600"
                    : "bg-yellow-50 border-yellow-100 text-yellow-700"
                }`}
              >
                <span>Diferença no fechamento</span>
                <span>
                  {diferenca > 0.01 ? "+" : ""}{BRL(diferenca)}
                  {" "}
                  {Math.abs(diferenca) < 0.01 ? "✓ caixa bateu" : diferenca < 0 ? "↓ falta" : "↑ sobra"}
                </span>
              </div>
            )}
          </Card>
        );
      })}
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
  { id: "caixa",           Icon: Banknote,  label: "Caixa"    },
  { id: "extrato",         Icon: ClipboardList, label: "Extrato"  },
  { id: "historico_caixa", Icon: History,   label: "Histórico" },
];

export default function Dashboard({ produtos, setView }) {
  const [periodo, setPeriodo] = useState("hoje");
  const [tab, setTab]         = useState("caixa");
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(null);
  const [atendimentos, setAtendimentos]     = useState([]);
  const [comandas, setComandas]             = useState([]);
  const [sessaoCaixa, setSessaoCaixa]       = useState(undefined);
  const [sessoesHistorico, setSessoesHistorico] = useState(null);
  const [refreshKey, setRefreshKey]         = useState(0);

  const carregar = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setSessaoCaixa(undefined);
    setSessoesHistorico(null);
    Promise.all([
      db.getSessaoCaixaAberta(),
      db.getSessoesCaixa(15),
    ]).then(([sessao, historico]) => {
      if (cancelled) return;
      setSessaoCaixa(sessao ?? null);
      setSessoesHistorico(historico ?? []);
    }).catch(() => {
      if (!cancelled) {
        setSessaoCaixa(null);
        setSessoesHistorico([]);
      }
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

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
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        action={
          <div className="flex items-center gap-2">
            <div className="flex bg-white border border-gray-200 rounded-xl p-0.5 gap-0.5">
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriodo(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                    ${periodo === p.id ? "bg-indigo-500 text-white" : "text-gray-600 hover:text-gray-900"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              onClick={carregar}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors
              ${tab === t.id ? "bg-indigo-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
          >
            {t.Icon && <t.Icon size={14} strokeWidth={2} className="shrink-0" />} {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === "historico_caixa" ? (
        <motion.div
          key="historico_caixa"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <TabHistoricoCaixa sessoesHistorico={sessoesHistorico} setView={setView} />
        </motion.div>
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
      ) : erro ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-5 py-4"><AlertTriangle size={14} className="inline shrink-0 mr-1.5 -mt-0.5" />{erro}</div>
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
              sessaoCaixa={sessaoCaixa}
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
