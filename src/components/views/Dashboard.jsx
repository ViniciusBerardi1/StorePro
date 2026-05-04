import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { db } from "../../services/supabaseDb";

const BRL = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

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

function prevPeriodRange(periodo) {
  const n = new Date();
  const iso = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) =>
    new Date(y, m, d, h, mi, s, ms).toISOString();
  if (periodo === "hoje") {
    const y = new Date(n);
    y.setDate(n.getDate() - 1);
    return {
      ini: iso(y.getFullYear(), y.getMonth(), y.getDate()),
      fim: iso(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999),
    };
  }
  if (periodo === "semana") {
    const e = new Date(n);
    e.setDate(n.getDate() - 7);
    const s = new Date(e);
    s.setDate(e.getDate() - 6);
    return {
      ini: iso(s.getFullYear(), s.getMonth(), s.getDate()),
      fim: iso(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999),
    };
  }
  const prev = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const last = new Date(n.getFullYear(), n.getMonth(), 0).getDate();
  return {
    ini: iso(prev.getFullYear(), prev.getMonth(), 1),
    fim: iso(prev.getFullYear(), prev.getMonth(), last, 23, 59, 59, 999),
  };
}

// ─── UI Primitivos ───────────────────────────────────────────────
function Card({ children, className = "" }) {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-2xl p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 mb-3">{children}</h3>
  );
}

function KpiCard({ icon, label, valor, sub, delta }) {
  const positivo = delta > 0;
  const semDelta = delta === null || delta === undefined || isNaN(delta);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-xl">{icon}</span>
      <div className="text-2xl font-bold text-gray-800 leading-tight">
        {valor}
      </div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {!semDelta && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              positivo ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50"
            }`}
          >
            {positivo ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function RankingBars({
  itens,
  formatValor = String,
  cor = "bg-indigo-400",
  limit = 8,
}) {
  const lista = itens.slice(0, limit);
  const max = Math.max(...lista.map((i) => i.valor), 1);
  if (lista.length === 0)
    return <p className="text-xs text-gray-400">Sem dados no período.</p>;
  return (
    <div className="flex flex-col gap-3">
      {lista.map((item, i) => (
        <div key={item.nome + i} className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-300 w-5 shrink-0">
            #{i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-gray-700 truncate">
                {item.nome}
              </span>
              <span className="text-xs font-semibold text-gray-600 ml-2 shrink-0">
                {formatValor(item.valor)}
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(item.valor / max) * 100}%` }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
                className={`h-full ${cor} rounded-full`}
              />
            </div>
          </div>
          {item.sub && (
            <span className="text-[10px] text-gray-400 shrink-0">
              {item.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function BarChart({ dados, labelFn }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {dados.map((d, i) => {
        const pct = (d.valor / max) * 100;
        const isLast = i === dados.length - 1;
        return (
          <div
            key={d.key ?? i}
            className="flex-1 flex flex-col items-center gap-1 min-w-0"
          >
            <div
              className="w-full flex items-end justify-center"
              style={{ height: 96 }}
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(pct, d.valor > 0 ? 3 : 0)}%` }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.04 }}
                className={`w-full rounded-t-md ${isLast ? "bg-indigo-500" : "bg-indigo-200"}`}
                style={{ minHeight: d.valor > 0 ? 4 : 0 }}
                title={BRL(d.valor)}
              />
            </div>
            <span className="text-[10px] text-gray-400 truncate w-full text-center">
              {labelFn ? labelFn(d, i) : d.key}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HeatmapHoras({ atendimentos }) {
  const horas = Array.from({ length: 17 }, (_, i) => i + 6);
  const cnt = {};
  for (const a of atendimentos) {
    const h = new Date(a.data_hora).getHours();
    if (h >= 6 && h <= 22) cnt[h] = (cnt[h] || 0) + 1;
  }
  const max = Math.max(...Object.values(cnt), 1);

  if (atendimentos.length === 0)
    return <p className="text-xs text-gray-400">Sem dados no período.</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-9 gap-1.5 sm:grid-cols-17">
        {horas.map((h) => {
          const c = cnt[h] || 0;
          const intensity = c / max;
          const bg =
            intensity === 0
              ? "bg-gray-100"
              : intensity < 0.33
                ? "bg-indigo-100"
                : intensity < 0.66
                  ? "bg-indigo-300"
                  : "bg-indigo-500";
          const textColor =
            intensity >= 0.66 ? "text-white" : "text-indigo-700";
          return (
            <div key={h} className="flex flex-col items-center gap-1">
              <div
                title={`${h}h — ${c} atendimento${c !== 1 ? "s" : ""}`}
                className={`w-full aspect-square rounded-lg ${bg} flex items-center justify-center`}
              >
                {c > 0 && (
                  <span className={`text-[10px] font-bold ${textColor}`}>
                    {c}
                  </span>
                )}
              </div>
              <span className="text-[9px] text-gray-400">{h}h</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {[
          ["bg-gray-100", "Vazio"],
          ["bg-indigo-100", "Baixo"],
          ["bg-indigo-300", "Médio"],
          ["bg-indigo-500", "Alto"],
        ].map(([c, l]) => (
          <div key={l} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${c}`} />
            <span className="text-[10px] text-gray-400">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PagamentoBar({ atendimentos }) {
  const formas = { pix: 0, debito: 0, credito: 0 };
  const labels = { pix: "Pix 🔑", debito: "Débito 💳", credito: "Crédito 💳" };
  const cores = {
    pix: "bg-emerald-400",
    debito: "bg-indigo-400",
    credito: "bg-violet-400",
  };

  for (const a of atendimentos.filter((a) => a.status === "concluido")) {
    if (a.forma_pagamento in formas)
      formas[a.forma_pagamento] += Number(a.valor_total || 0);
  }
  const total = Object.values(formas).reduce((s, v) => s + v, 0);
  if (total === 0)
    return <p className="text-xs text-gray-400">Sem dados de pagamento.</p>;

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(formas).map(([f, valor]) => {
        const pct = total > 0 ? (valor / total) * 100 : 0;
        return (
          <div key={f}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-600 font-medium">{labels[f]}</span>
              <span className="text-gray-400">
                {BRL(valor)} · {pct.toFixed(0)}%
              </span>
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

// ─── Aba: Visão Geral ────────────────────────────────────────────
function TabGeral({
  atendimentos,
  prevAtendimentos,
  periodo,
  produtos,
  setView,
}) {
  const ok = atendimentos.filter((a) => a.status === "concluido");
  const pOk = prevAtendimentos.filter((a) => a.status === "concluido");
  const fat = ok.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const pFat = pOk.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const delta = (base, prev) =>
    prev > 0 ? ((base - prev) / prev) * 100 : null;

  const totalAtend = atendimentos.length;
  const cancelados = atendimentos.filter(
    (a) => a.status === "cancelado",
  ).length;
  const ticket = ok.length > 0 ? fat / ok.length : 0;
  const pTicket = pOk.length > 0 ? pFat / pOk.length : 0;
  const txCancel = totalAtend > 0 ? (cancelados / totalAtend) * 100 : 0;

  const estoqueBaixo = (produtos ?? []).filter(
    (p) => p.quantidade <= (p.estoque_minimo ?? 1),
  );

  // Agrupar por dia para o gráfico
  const porDia = {};
  for (const a of atendimentos) {
    const d = new Date(a.data_hora);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!porDia[k]) porDia[k] = { key: k, valor: 0 };
    if (a.status === "concluido") porDia[k].valor += Number(a.valor_total || 0);
  }
  const grafico = Object.values(porDia).sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="💰"
          label="Faturamento"
          valor={BRL(fat)}
          sub={`${ok.length} concluídos`}
          delta={delta(fat, pFat)}
        />
        <KpiCard
          icon="✂️"
          label="Atendimentos"
          valor={totalAtend}
          sub={`${cancelados} cancelados`}
          delta={delta(totalAtend, prevAtendimentos.length)}
        />
        <KpiCard
          icon="💳"
          label="Ticket médio"
          valor={BRL(ticket)}
          sub="por atendimento"
          delta={delta(ticket, pTicket)}
        />
        <KpiCard
          icon="❌"
          label="Cancelamentos"
          valor={`${txCancel.toFixed(1)}%`}
          sub={`${cancelados} de ${totalAtend}`}
        />
      </div>

      {grafico.length > 1 && (
        <Card>
          <SectionTitle>📈 Faturamento por dia</SectionTitle>
          <BarChart
            dados={grafico}
            labelFn={(d) => {
              const p = d.key.split("-");
              return `${p[2]}/${p[1]}`;
            }}
          />
        </Card>
      )}

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
              <div
                key={p.id}
                className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-xl px-3 py-2"
              >
                <span className="text-xs font-medium text-orange-700 truncate">
                  {p.nome}
                </span>
                <span className="text-xs font-bold text-orange-500 ml-2 shrink-0">
                  {p.quantidade}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>📋 Atendimentos do período</SectionTitle>
        {atendimentos.length === 0 ? (
          <p className="text-xs text-gray-400">
            Nenhum atendimento no período.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {[...atendimentos]
              .reverse()
              .slice(0, 20)
              .map((a) => {
                const dt = new Date(a.data_hora).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const badge =
                  {
                    concluido: "text-green-600 bg-green-50",
                    cancelado: "text-red-500 bg-red-50",
                    agendado: "text-blue-600 bg-blue-50",
                    em_andamento: "text-yellow-600 bg-yellow-50",
                  }[a.status] ?? "text-gray-500 bg-gray-50";
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 rounded-xl"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">
                        {a.cliente_nome || "—"}
                      </p>
                      <p className="text-[10px] text-gray-400">{dt}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge}`}
                      >
                        {a.status}
                      </span>
                      <span className="text-xs font-semibold text-gray-700">
                        {BRL(a.valor_total)}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Aba: Serviços ───────────────────────────────────────────────
function TabServicos({ atendimentos }) {
  const mapaServico = {};
  for (const a of atendimentos.filter((a) => a.status === "concluido")) {
    for (const s of a.servicos || []) {
      if (!mapaServico[s.nome])
        mapaServico[s.nome] = { nome: s.nome, count: 0, receita: 0 };
      mapaServico[s.nome].count += 1;
      mapaServico[s.nome].receita += Number(s.valor || 0);
    }
  }
  const lista = Object.values(mapaServico).sort(
    (a, b) => b.receita - a.receita,
  );
  const totalReceita = lista.reduce((s, sv) => s + sv.receita, 0);

  if (lista.length === 0)
    return (
      <Card>
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhum serviço realizado no período.
        </p>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>🏆 Mais realizados</SectionTitle>
          <RankingBars
            itens={lista.map((s) => ({
              nome: s.nome,
              valor: s.count,
              sub: BRL(s.receita),
            }))}
            formatValor={(v) => `${v}x`}
            cor="bg-indigo-400"
          />
        </Card>
        <Card>
          <SectionTitle>💰 Receita por serviço</SectionTitle>
          <RankingBars
            itens={lista.map((s) => ({ nome: s.nome, valor: s.receita }))}
            formatValor={BRL}
            cor="bg-emerald-400"
          />
        </Card>
      </div>

      <Card>
        <SectionTitle>📋 Tabela completa</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-2 font-medium">Serviço</th>
                <th className="text-right py-2 font-medium">Qtd</th>
                <th className="text-right py-2 font-medium">Receita</th>
                <th className="text-right py-2 font-medium">% Total</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr
                  key={s.nome}
                  className="border-b border-gray-50 hover:bg-gray-50"
                >
                  <td className="py-2 text-gray-700 font-medium">{s.nome}</td>
                  <td className="py-2 text-right text-gray-500">{s.count}x</td>
                  <td className="py-2 text-right font-semibold text-gray-700">
                    {BRL(s.receita)}
                  </td>
                  <td className="py-2 text-right text-gray-400">
                    {totalReceita > 0
                      ? ((s.receita / totalReceita) * 100).toFixed(1)
                      : 0}
                    %
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td className="py-2 font-bold text-gray-700">Total</td>
                <td className="py-2 text-right font-semibold text-gray-600">
                  {lista.reduce((s, sv) => s + sv.count, 0)}x
                </td>
                <td className="py-2 text-right font-bold text-gray-800">
                  {BRL(totalReceita)}
                </td>
                <td className="py-2 text-right text-gray-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Aba: Produtos ───────────────────────────────────────────────
function TabProdutos({ comandas, produtos, setView }) {
  const mapaProd = {};
  for (const c of comandas) {
    for (const item of [...(c.itens_bar || []), ...(c.itens_loja || [])]) {
      const k = item.produto_id ?? item.nome;
      if (!mapaProd[k]) mapaProd[k] = { nome: item.nome, count: 0, receita: 0 };
      mapaProd[k].count += item.quantidade || 1;
      mapaProd[k].receita +=
        (item.quantidade || 1) * Number(item.preco_venda || 0);
    }
  }
  const vendidos = Object.values(mapaProd).sort(
    (a, b) => b.receita - a.receita,
  );
  const estoqueBaixo = (produtos ?? []).filter(
    (p) => p.quantidade <= (p.estoque_minimo ?? 1),
  );

  return (
    <div className="flex flex-col gap-4">
      {vendidos.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <SectionTitle>🏆 Mais vendidos (qtd)</SectionTitle>
            <RankingBars
              itens={vendidos.map((p) => ({
                nome: p.nome,
                valor: p.count,
                sub: BRL(p.receita),
              }))}
              formatValor={(v) => `${v}x`}
              cor="bg-amber-400"
            />
          </Card>
          <Card>
            <SectionTitle>💰 Receita por produto</SectionTitle>
            <RankingBars
              itens={vendidos.map((p) => ({ nome: p.nome, valor: p.receita }))}
              formatValor={BRL}
              cor="bg-emerald-400"
            />
          </Card>
        </div>
      ) : (
        <Card>
          <p className="text-sm text-gray-400 text-center py-8">
            Nenhum produto vendido em comandas no período.
          </p>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>⚠️ Estoque baixo</SectionTitle>
          {estoqueBaixo.length > 0 && (
            <button
              onClick={() => setView("estoque_baixo")}
              className="text-xs text-indigo-500 hover:text-indigo-600 font-medium"
            >
              Ver todos →
            </button>
          )}
        </div>
        {estoqueBaixo.length === 0 ? (
          <p className="text-xs text-gray-400">
            ✅ Todos os produtos com estoque adequado.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {estoqueBaixo.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-xl px-3 py-2.5"
              >
                <div>
                  <p className="text-xs font-medium text-orange-700">
                    {p.nome}
                  </p>
                  <p className="text-[10px] text-orange-400">
                    Mínimo: {p.estoque_minimo ?? 1}
                  </p>
                </div>
                <span className="text-sm font-bold text-orange-500">
                  {p.quantidade}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Aba: Horários ───────────────────────────────────────────────
function TabHorarios({ atendimentos }) {
  const horas = Array.from({ length: 17 }, (_, i) => i + 6);
  const cnt = {};
  for (const a of atendimentos) {
    const h = new Date(a.data_hora).getHours();
    if (h >= 6 && h <= 22) cnt[h] = (cnt[h] || 0) + 1;
  }
  const max = Math.max(...Object.values(cnt), 1);
  const top = Object.entries(cnt).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )[0];
  const ociosos = horas.filter((h) => !cnt[h]);

  if (atendimentos.length === 0)
    return (
      <Card>
        <p className="text-sm text-gray-400 text-center py-8">
          Nenhum atendimento no período.
        </p>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          icon="🔥"
          label="Horário mais movimentado"
          valor={top ? `${top[0]}h` : "—"}
          sub={top ? `${top[1]} atend.` : ""}
        />
        <KpiCard
          icon="😴"
          label="Horários ociosos"
          valor={ociosos.length}
          sub="entre 6h–22h"
        />
        <KpiCard
          icon="📊"
          label="Total no período"
          valor={atendimentos.length}
          sub="atendimentos"
        />
      </div>

      <Card>
        <SectionTitle>🕐 Heatmap de atendimentos (6h – 22h)</SectionTitle>
        <HeatmapHoras atendimentos={atendimentos} />
      </Card>

      <Card>
        <SectionTitle>📊 Volume por hora</SectionTitle>
        <div className="flex items-end gap-1 h-24">
          {horas.map((h) => {
            const c = cnt[h] || 0;
            const pct = (c / max) * 100;
            return (
              <div
                key={h}
                className="flex-1 flex flex-col items-center gap-0.5"
              >
                <div
                  className="w-full flex items-end justify-center"
                  style={{ height: 72 }}
                >
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(pct, c > 0 ? 5 : 0)}%` }}
                    transition={{ duration: 0.4, delay: (h - 6) * 0.025 }}
                    className={`w-full rounded-t ${c > 0 ? "bg-indigo-400" : "bg-gray-100"}`}
                    title={`${h}h: ${c}`}
                  />
                </div>
                <span className="text-[9px] text-gray-300">{h}h</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── Aba: Clientes ───────────────────────────────────────────────
function TabClientes({ atendimentos }) {
  const mapa = {};
  for (const a of atendimentos.filter((a) => a.status === "concluido")) {
    const nome = a.cliente_nome || "Sem nome";
    if (!mapa[nome]) mapa[nome] = { nome, visitas: 0, gasto: 0 };
    mapa[nome].visitas += 1;
    mapa[nome].gasto += Number(a.valor_total || 0);
  }
  const clientes = Object.values(mapa).sort((a, b) => b.gasto - a.gasto);
  const recorrentes = clientes.filter((c) => c.visitas > 1).length;
  const totalVisitas = clientes.reduce((s, c) => s + c.visitas, 0);
  const ticketMedio =
    totalVisitas > 0
      ? clientes.reduce((s, c) => s + c.gasto, 0) / totalVisitas
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          icon="👥"
          label="Clientes únicos"
          valor={clientes.length}
          sub="no período"
        />
        <KpiCard
          icon="🔁"
          label="Recorrentes"
          valor={recorrentes}
          sub={`${clientes.length > 0 ? ((recorrentes / clientes.length) * 100).toFixed(0) : 0}% do total`}
        />
        <KpiCard
          icon="💳"
          label="Ticket médio/visita"
          valor={BRL(ticketMedio)}
          sub="por atendimento"
        />
      </div>

      {clientes.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 text-center py-8">
            Nenhum cliente no período.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle>🏆 Top clientes por gasto</SectionTitle>
            <RankingBars
              itens={clientes.map((c) => ({
                nome: c.nome,
                valor: c.gasto,
                sub: `${c.visitas}x`,
              }))}
              formatValor={BRL}
              cor="bg-violet-400"
            />
          </Card>

          <Card>
            <SectionTitle>📋 Todos os clientes</SectionTitle>
            <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
              {clientes.map((c, i) => (
                <div
                  key={c.nome}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-gray-300 w-5 shrink-0">
                      #{i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">
                        {c.nome}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {c.visitas} visita{c.visitas !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.visitas > 1 && (
                      <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full font-medium">
                        recorrente
                      </span>
                    )}
                    <span className="text-xs font-semibold text-gray-700">
                      {BRL(c.gasto)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Aba: Financeiro ─────────────────────────────────────────────
function TabFinanceiro({ atendimentos, comandas }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");
  const receitaTotal = ok.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const receitaBar = comandas.reduce((s, c) => s + Number(c.valor_bar || 0), 0);
  const receitaLoja = comandas.reduce(
    (s, c) => s + Number(c.valor_loja || 0),
    0,
  );
  const receitaSvcs = comandas.reduce(
    (s, c) => s + Number(c.valor_servicos || 0),
    0,
  );

  // Ticket com produto vs sem produto (via comandas)
  const comProduto = comandas.filter(
    (c) => Number(c.valor_bar || 0) + Number(c.valor_loja || 0) > 0,
  );
  const semProduto = comandas.filter(
    (c) => Number(c.valor_bar || 0) + Number(c.valor_loja || 0) === 0,
  );
  const tkComProd =
    comProduto.length > 0
      ? comProduto.reduce((s, c) => s + Number(c.valor_total || 0), 0) /
        comProduto.length
      : 0;
  const tkSemProd =
    semProduto.length > 0
      ? semProduto.reduce((s, c) => s + Number(c.valor_total || 0), 0) /
        semProduto.length
      : 0;

  const receitas = [
    { nome: "Serviços ✂️", valor: receitaSvcs || receitaTotal },
    { nome: "Bar 🍺", valor: receitaBar },
    { nome: "Loja 🛍️", valor: receitaLoja },
  ].filter((r) => r.valor > 0);

  const totalComandas = comandas.reduce(
    (s, c) => s + Number(c.valor_total || 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="💰"
          label="Receita (atend.)"
          valor={BRL(receitaTotal)}
          sub={`${ok.length} concluídos`}
        />
        <KpiCard
          icon="🧾"
          label="Receita (comandas)"
          valor={BRL(totalComandas)}
          sub={`${comandas.length} fechadas`}
        />
        <KpiCard
          icon="🛒"
          label="Ticket c/ produto"
          valor={BRL(tkComProd)}
          sub={`${comProduto.length} comandas`}
        />
        <KpiCard
          icon="✂️"
          label="Ticket s/ produto"
          valor={BRL(tkSemProd)}
          sub={`${semProduto.length} comandas`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>💳 Formas de pagamento</SectionTitle>
          <PagamentoBar atendimentos={atendimentos} />
        </Card>

        {receitas.length > 1 && (
          <Card>
            <SectionTitle>📦 Receita por origem (comandas)</SectionTitle>
            <RankingBars
              itens={receitas}
              formatValor={BRL}
              cor="bg-amber-400"
            />
          </Card>
        )}
      </div>

      <Card>
        <SectionTitle>📊 Resumo por origem</SectionTitle>
        <div className="flex flex-col gap-2">
          {[
            {
              label: "Serviços",
              valor: receitaSvcs || receitaTotal,
              icon: "✂️",
              cor: "bg-indigo-50 border-indigo-100",
            },
            {
              label: "Bar",
              valor: receitaBar,
              icon: "🍺",
              cor: "bg-amber-50 border-amber-100",
            },
            {
              label: "Loja",
              valor: receitaLoja,
              icon: "🛍️",
              cor: "bg-emerald-50 border-emerald-100",
            },
          ].map((item) => {
            const base = Math.max(receitaTotal, totalComandas, 1);
            const pct = (item.valor / base) * 100;
            return (
              <div
                key={item.label}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border ${item.cor}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.icon}</span>
                  <div>
                    <p className="text-xs font-medium text-gray-700">
                      {item.label}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {pct.toFixed(1)}% do total
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-800">
                  {BRL(item.valor)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── Aba: Comandas ──────────────────────────────────────────────
const PGTO_BADGE = {
  pix: "bg-emerald-50 text-emerald-600",
  debito: "bg-indigo-50 text-indigo-600",
  credito: "bg-violet-50 text-violet-600",
};

function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetalheComanda({ cmd, custoPorId }) {
  const temServicos = (cmd.servicos || []).length > 0;
  const temBar = (cmd.itens_bar || []).length > 0;
  const temLoja = (cmd.itens_loja || []).length > 0;

  let custoTotal = 0;
  for (const item of [...(cmd.itens_bar || []), ...(cmd.itens_loja || [])]) {
    custoTotal += (custoPorId[item.produto_id] || 0) * (item.quantidade || 1);
  }
  const lucro = Number(cmd.valor_total || 0) - custoTotal;
  const temCusto = custoTotal > 0;

  return (
    <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100">
      {temServicos && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mt-3 mb-2 uppercase tracking-wide">
            ✂️ Serviços
          </p>
          <div className="flex flex-col gap-1">
            {cmd.servicos.map((s, i) => (
              <div
                key={i}
                className="flex justify-between text-xs px-3 py-2 bg-indigo-50 rounded-xl"
              >
                <span className="text-indigo-700 font-medium">{s.nome}</span>
                <span className="font-semibold text-indigo-600">
                  {BRL(s.valor)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {temBar && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
            🍺 Bar
          </p>
          <div className="flex flex-col gap-1">
            {cmd.itens_bar.map((item, i) => {
              const custo = custoPorId[item.produto_id];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs px-3 py-2 bg-amber-50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-amber-700 font-medium truncate">
                      {item.nome}
                    </p>
                    {custo > 0 && (
                      <p className="text-amber-400">
                        custo est. {BRL(custo * (item.quantidade || 1))}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="font-semibold text-amber-600">
                      {BRL(
                        Number(item.preco_venda || 0) * (item.quantidade || 1),
                      )}
                    </p>
                    <p className="text-amber-400">
                      {item.quantidade}× {BRL(item.preco_venda)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {temLoja && (
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
            🛍️ Loja
          </p>
          <div className="flex flex-col gap-1">
            {cmd.itens_loja.map((item, i) => {
              const custo = custoPorId[item.produto_id];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs px-3 py-2 bg-emerald-50 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-emerald-700 font-medium truncate">
                      {item.nome}
                    </p>
                    {custo > 0 && (
                      <p className="text-emerald-400">
                        custo est. {BRL(custo * (item.quantidade || 1))}
                      </p>
                    )}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="font-semibold text-emerald-600">
                      {BRL(
                        Number(item.preco_venda || 0) * (item.quantidade || 1),
                      )}
                    </p>
                    <p className="text-emerald-400">
                      {item.quantidade}× {BRL(item.preco_venda)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resumo financeiro */}
      <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Resumo
        </p>
        {Number(cmd.valor_servicos || 0) > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Serviços</span>
            <span className="font-medium">{BRL(cmd.valor_servicos)}</span>
          </div>
        )}
        {Number(cmd.valor_bar || 0) > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Bar 🍺</span>
            <span className="font-medium">{BRL(cmd.valor_bar)}</span>
          </div>
        )}
        {Number(cmd.valor_loja || 0) > 0 && (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Loja 🛍️</span>
            <span className="font-medium">{BRL(cmd.valor_loja)}</span>
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
                <span>Subtotal</span>
                <span>{BRL(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs font-medium text-orange-500">
                <span>Desconto ({label})</span>
                <span>−{BRL(d.valor_calculado)}</span>
              </div>
            </>
          );
        })()}
        <div className="flex justify-between text-sm font-bold text-gray-800 border-t border-gray-200 pt-1.5 mt-0.5">
          <span>Total</span>
          <span className="text-indigo-600">{BRL(cmd.valor_total)}</span>
        </div>
        {temCusto && (
          <div
            className={`flex justify-between text-xs border-t border-gray-100 pt-1 font-semibold ${lucro >= 0 ? "text-green-600" : "text-red-500"}`}
          >
            <span>Lucro estimado</span>
            <span>{BRL(lucro)}</span>
          </div>
        )}
        {cmd.forma_pagamento && (
          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
            <span>Pagamento</span>
            <span
              className={`px-1.5 py-0.5 rounded-full font-medium text-[10px] ${PGTO_BADGE[cmd.forma_pagamento] ?? "bg-gray-100 text-gray-500"}`}
            >
              {cmd.forma_pagamento}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TabComandas({ comandas, produtos = [] }) {
  const [expandida, setExpandida] = useState(null);

  const totalFat = comandas.reduce((s, c) => s + Number(c.valor_total || 0), 0);
  const ticket = comandas.length > 0 ? totalFat / comandas.length : 0;

  const mapaProd = {};
  for (const c of comandas) {
    for (const item of [...(c.itens_bar || []), ...(c.itens_loja || [])]) {
      const k = item.produto_id ?? item.nome;
      if (!mapaProd[k]) mapaProd[k] = { nome: item.nome, count: 0, receita: 0 };
      mapaProd[k].count += item.quantidade || 1;
      mapaProd[k].receita +=
        (item.quantidade || 1) * Number(item.preco_venda || 0);
    }
  }
  const topProdutos = Object.values(mapaProd).sort((a, b) => b.count - a.count);

  const mapaServico = {};
  for (const c of comandas) {
    for (const s of c.servicos || []) {
      if (!mapaServico[s.nome])
        mapaServico[s.nome] = { nome: s.nome, count: 0, receita: 0 };
      mapaServico[s.nome].count += 1;
      mapaServico[s.nome].receita += Number(s.valor || 0);
    }
  }
  const topServicos = Object.values(mapaServico).sort(
    (a, b) => b.count - a.count,
  );

  const custoPorId = {};
  for (const p of produtos) custoPorId[p.id] = Number(p.preco_custo || 0);

  const sorted = [...comandas].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="🧾"
          label="Comandas fechadas"
          valor={comandas.length}
          sub="no período"
        />
        <KpiCard
          icon="💰"
          label="Faturamento total"
          valor={BRL(totalFat)}
          sub="via comandas"
        />
        <KpiCard
          icon="💳"
          label="Ticket médio"
          valor={BRL(ticket)}
          sub="por comanda"
        />
        <KpiCard
          icon="🏆"
          label="Produto top"
          valor={topProdutos[0]?.nome ?? "—"}
          sub="mais consumido"
        />
      </div>

      {/* Rankings */}
      {(topServicos.length > 0 || topProdutos.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {topServicos.length > 0 && (
            <Card>
              <SectionTitle>✂️ Serviços mais realizados</SectionTitle>
              <RankingBars
                itens={topServicos.map((s) => ({
                  nome: s.nome,
                  valor: s.count,
                  sub: BRL(s.receita),
                }))}
                formatValor={(v) => `${v}×`}
                cor="bg-indigo-400"
              />
            </Card>
          )}
          {topProdutos.length > 0 && (
            <Card>
              <SectionTitle>📦 Produtos mais consumidos</SectionTitle>
              <RankingBars
                itens={topProdutos.map((p) => ({
                  nome: p.nome,
                  valor: p.count,
                  sub: BRL(p.receita),
                }))}
                formatValor={(v) => `${v}×`}
                cor="bg-amber-400"
              />
            </Card>
          )}
        </div>
      )}

      {/* Lista */}
      <Card>
        <SectionTitle>🧾 Comandas finalizadas ({comandas.length})</SectionTitle>
        {comandas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">
            Nenhuma comanda finalizada no período.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((cmd) => {
              const aberta = expandida === cmd.id;
              return (
                <div
                  key={cmd.id}
                  className={`border rounded-2xl overflow-hidden transition-all ${aberta ? "border-indigo-200 shadow-sm" : "border-gray-200"}`}
                >
                  <button
                    onClick={() => setExpandida(aberta ? null : cmd.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-[10px] font-bold text-gray-300 w-8 shrink-0">
                      #{cmd.id}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {cmd.cliente_nome || "—"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {fmtDataHora(cmd.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cmd.forma_pagamento && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PGTO_BADGE[cmd.forma_pagamento] ?? "bg-gray-50 text-gray-500"}`}
                        >
                          {cmd.forma_pagamento}
                        </span>
                      )}
                      <span className="text-sm font-bold text-indigo-600">
                        {BRL(cmd.valor_total)}
                      </span>
                      <span className="text-gray-300 text-xs">
                        {aberta ? "▾" : "▸"}
                      </span>
                    </div>
                  </button>

                  {aberta && (
                    <DetalheComanda cmd={cmd} custoPorId={custoPorId} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Dashboard principal ─────────────────────────────────────────
const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "7 dias" },
  { id: "mes", label: "Mês" },
];

const TABS = [
  { id: "geral",     icon: "📊", label: "Visão Geral" },
  { id: "comandas",  icon: "🧾", label: "Comandas"    },
  { id: "servicos",  icon: "✂️", label: "Serviços"    },
  { id: "produtos",  icon: "📦", label: "Produtos"    },
  { id: "horarios",  icon: "🕐", label: "Horários"    },
  { id: "clientes",  icon: "👥", label: "Clientes"    },
  { id: "financeiro",icon: "💰", label: "Financeiro"  },
];

export default function Dashboard({ produtos, setView }) {
  const [periodo, setPeriodo] = useState("semana");
  const [tab, setTab]         = useState("geral");
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(null);
  const [atendimentos, setAtendimentos]         = useState([]);
  const [prevAtendimentos, setPrevAtendimentos] = useState([]);
  const [comandas, setComandas]                 = useState([]);
  const [refreshKey, setRefreshKey]             = useState(0);

  const carregar = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErro(null);
    const { ini, fim }             = periodRange(periodo);
    const { ini: pIni, fim: pFim } = prevPeriodRange(periodo);
    Promise.all([
      db.getAtendimentosPeriodo(ini, fim),
      db.getAtendimentosPeriodo(pIni, pFim),
      db.getComandasFechadasPeriodo(ini, fim),
    ]).then(([atual, prev, cmds]) => {
      if (cancelled) return;
      setAtendimentos(atual);
      setPrevAtendimentos(prev);
      setComandas(cmds);
    }).catch((e) => {
      if (!cancelled) setErro("Erro ao carregar dashboard.");
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
        <h2 className="text-xl font-semibold text-gray-800">Dashboard</h2>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${
                    periodo === p.id
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={carregar}
            className="text-xs text-gray-400 hover:text-indigo-500 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            title="Atualizar"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors shrink-0
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
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-2xl h-24 animate-pulse"
            />
          ))}
        </div>
      ) : erro ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
          ⚠️ {erro}
        </div>
      ) : (
        <motion.div
          key={`${tab}-${periodo}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "geral" && (
            <TabGeral
              atendimentos={atendimentos}
              prevAtendimentos={prevAtendimentos}
              periodo={periodo}
              produtos={produtos}
              setView={setView}
            />
          )}
          {tab === "comandas" && (
            <TabComandas comandas={comandas} produtos={produtos} />
          )}
          {tab === "servicos" && <TabServicos atendimentos={atendimentos} />}
          {tab === "produtos" && (
            <TabProdutos
              comandas={comandas}
              produtos={produtos}
              setView={setView}
            />
          )}
          {tab === "horarios" && <TabHorarios atendimentos={atendimentos} />}
          {tab === "clientes" && <TabClientes atendimentos={atendimentos} />}
          {tab === "financeiro" && (
            <TabFinanceiro atendimentos={atendimentos} comandas={comandas} />
          )}
        </motion.div>
      )}
    </div>
  );
}
