import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { getRelatoriosPeriodo, getRelatoriosPeriodoAnterior, getUltimaVisitaClientes } from "../../services/relatoriosDb";

const BRL = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function subDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inicioMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function diasEntre(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ─── Primitivos UI ────────────────────────────────────────────────

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className="text-sm font-semibold text-gray-700 mb-3">{children}</h3>;
}

function KpiCard({ icon, label, valor, sub, delta }) {
  const positivo = delta > 0;
  const semDelta = delta === null || delta === undefined || isNaN(delta);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-1">
      <span className="text-xl">{icon}</span>
      <div className="text-2xl font-bold text-gray-800 leading-tight">{valor}</div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
        {!semDelta && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${positivo ? "text-green-600 bg-green-50" : "text-red-500 bg-red-50"}`}>
            {positivo ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function RankingBars({ itens, formatValor = String, cor = "bg-indigo-400", limit = 8 }) {
  const lista = itens.slice(0, limit);
  const max = Math.max(...lista.map((i) => i.valor), 1);
  if (!lista.length) return <p className="text-xs text-gray-400">Sem dados no período.</p>;
  return (
    <div className="flex flex-col gap-3">
      {lista.map((item, i) => (
        <div key={item.nome + i} className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-300 w-5 shrink-0">#{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-gray-700 truncate">{item.nome}</span>
              <span className="text-xs font-semibold text-gray-600 ml-2 shrink-0">{formatValor(item.valor)}</span>
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
          {item.sub && <span className="text-[10px] text-gray-400 shrink-0">{item.sub}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Engine de Insights ──────────────────────────────────────────

function gerarInsights(atendimentos, prevAtendimentos, comandas, clientes, barbeiros) {
  const insights = [];
  const ok = atendimentos.filter((a) => a.status === "concluido");
  const pOk = prevAtendimentos.filter((a) => a.status === "concluido");

  const fat = ok.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const pFat = pOk.reduce((s, a) => s + Number(a.valor_total || 0), 0);

  // 1. Queda/alta de faturamento
  if (pFat > 0) {
    const delta = ((fat - pFat) / pFat) * 100;
    if (delta <= -10) {
      insights.push({
        tipo: "alerta",
        icone: "📉",
        mensagem: `Faturamento caiu ${Math.abs(delta).toFixed(1)}% em relação ao período anterior`,
        detalhe: `${BRL(pFat)} → ${BRL(fat)}`,
      });
    } else if (delta >= 15) {
      insights.push({
        tipo: "positivo",
        icone: "📈",
        mensagem: `Faturamento cresceu ${delta.toFixed(1)}% em relação ao período anterior`,
        detalhe: `${BRL(pFat)} → ${BRL(fat)}`,
      });
    }
  }

  // 2. Cancelamentos altos
  const cancelados = atendimentos.filter((a) => a.status === "cancelado").length;
  const txCancel = atendimentos.length > 0 ? (cancelados / atendimentos.length) * 100 : 0;
  if (txCancel >= 20) {
    insights.push({
      tipo: "alerta",
      icone: "❌",
      mensagem: `Taxa de cancelamento alta: ${txCancel.toFixed(1)}% dos atendimentos`,
      detalhe: `${cancelados} de ${atendimentos.length} cancelados`,
    });
  }

  // 3. Clientes em risco de churn (não retornam há +30 dias)
  const agora = new Date();
  const emRisco = clientes.filter((c) => {
    const dias = (agora - new Date(c.ultima_visita)) / 86400000;
    return dias >= 30 && c.total_visitas >= 2;
  });
  if (emRisco.length > 0) {
    insights.push({
      tipo: "alerta",
      icone: "👻",
      mensagem: `${emRisco.length} clientes recorrentes sem visita há mais de 30 dias`,
      detalhe: emRisco.slice(0, 3).map((c) => c.nome).join(", ") + (emRisco.length > 3 ? "..." : ""),
    });
  }

  // 4. Horários ociosos (menos de 10% do horário mais movimentado)
  const cntHora = {};
  for (const a of atendimentos) {
    const h = new Date(a.data_hora).getHours();
    if (h >= 8 && h <= 20) cntHora[h] = (cntHora[h] || 0) + 1;
  }
  const maxHora = Math.max(...Object.values(cntHora), 1);
  const ociosos = Array.from({ length: 13 }, (_, i) => i + 8).filter(
    (h) => !cntHora[h] || cntHora[h] < maxHora * 0.1
  );
  if (ociosos.length >= 3 && atendimentos.length > 0) {
    insights.push({
      tipo: "info",
      icone: "😴",
      mensagem: `${ociosos.length} horários com baixíssimo movimento no período`,
      detalhe: `Horários ociosos: ${ociosos.map((h) => `${h}h`).join(", ")}`,
    });
  }

  // 5. Produtos sem saída (via comandas)
  const produtosVendidos = new Set();
  for (const c of comandas) {
    for (const item of [...(c.itens_bar || []), ...(c.itens_loja || [])]) {
      if (item.nome) produtosVendidos.add(item.nome.toLowerCase());
    }
  }
  if (produtosVendidos.size === 0 && comandas.length > 5) {
    insights.push({
      tipo: "info",
      icone: "📦",
      mensagem: "Nenhum produto consumido em comandas no período",
      detalhe: "Considere ativar venda de produtos nas comandas",
    });
  }

  // 6. Dia mais forte
  const porDia = {};
  for (const a of ok) {
    const d = new Date(a.data_hora);
    const dow = d.getDay();
    if (!porDia[dow]) porDia[dow] = { count: 0, fat: 0 };
    porDia[dow].count++;
    porDia[dow].fat += Number(a.valor_total || 0);
  }
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const topDow = Object.entries(porDia).sort((a, b) => b[1].fat - a[1].fat)[0];
  if (topDow) {
    insights.push({
      tipo: "positivo",
      icone: "🏆",
      mensagem: `Melhor dia da semana: ${dias[topDow[0]]}`,
      detalhe: `${topDow[1].count} atendimentos · ${BRL(topDow[1].fat)}`,
    });
  }

  // 7. Barbeiro destaque (se tiver dados)
  if (barbeiros.length > 1) {
    const fatBarbeiro = {};
    for (const a of ok) {
      if (a.barbeiro_id) {
        if (!fatBarbeiro[a.barbeiro_id]) fatBarbeiro[a.barbeiro_id] = 0;
        fatBarbeiro[a.barbeiro_id] += Number(a.valor_total || 0);
      }
    }
    const topBarb = Object.entries(fatBarbeiro).sort((a, b) => b[1] - a[1])[0];
    if (topBarb) {
      const barb = barbeiros.find((b) => b.id === Number(topBarb[0]));
      if (barb) {
        insights.push({
          tipo: "positivo",
          icone: "✂️",
          mensagem: `Barbeiro destaque: ${barb.nome}`,
          detalhe: `${BRL(topBarb[1])} gerado no período`,
        });
      }
    }
  }

  if (!insights.length) {
    insights.push({
      tipo: "info",
      icone: "✅",
      mensagem: "Tudo dentro da normalidade no período selecionado",
      detalhe: "Nenhum alerta identificado",
    });
  }

  return insights;
}

// ─── Aba: Insights ────────────────────────────────────────────────

function TabInsights({ insights }) {
  const cores = {
    alerta: "border-red-200 bg-red-50",
    positivo: "border-green-200 bg-green-50",
    info: "border-blue-200 bg-blue-50",
  };
  const textCores = {
    alerta: "text-red-700",
    positivo: "text-green-700",
    info: "text-blue-700",
  };
  const subCores = {
    alerta: "text-red-500",
    positivo: "text-green-500",
    info: "text-blue-500",
  };

  return (
    <div className="flex flex-col gap-3">
      {insights.map((ins, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className={`border rounded-2xl px-4 py-3.5 flex items-start gap-3 ${cores[ins.tipo]}`}
        >
          <span className="text-xl shrink-0 mt-0.5">{ins.icone}</span>
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${textCores[ins.tipo]}`}>{ins.mensagem}</p>
            {ins.detalhe && (
              <p className={`text-xs mt-0.5 ${subCores[ins.tipo]}`}>{ins.detalhe}</p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Aba: Resumo ──────────────────────────────────────────────────

function TabResumo({ atendimentos, prevAtendimentos }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");
  const pOk = prevAtendimentos.filter((a) => a.status === "concluido");

  const fat = ok.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const pFat = pOk.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const delta = (base, prev) => (prev > 0 ? ((base - prev) / prev) * 100 : null);

  const ticket = ok.length > 0 ? fat / ok.length : 0;
  const pTicket = pOk.length > 0 ? pFat / pOk.length : 0;
  const cancelados = atendimentos.filter((a) => a.status === "cancelado").length;

  // Serviços mais vendidos
  const mapaServico = {};
  for (const a of ok) {
    for (const s of a.servicos || []) {
      if (!mapaServico[s.nome]) mapaServico[s.nome] = { nome: s.nome, count: 0, receita: 0 };
      mapaServico[s.nome].count++;
      mapaServico[s.nome].receita += Number(s.valor || 0);
    }
  }
  const servicos = Object.values(mapaServico).sort((a, b) => b.count - a.count);

  // Forma de pagamento
  const pgto = { pix: 0, debito: 0, credito: 0 };
  for (const a of ok) {
    if (a.forma_pagamento in pgto) pgto[a.forma_pagamento] += Number(a.valor_total || 0);
  }

  // Faturamento por dia da semana
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const porDow = Array(7).fill(0);
  for (const a of ok) {
    porDow[new Date(a.data_hora).getDay()] += Number(a.valor_total || 0);
  }
  const maxDow = Math.max(...porDow, 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="💰" label="Faturamento" valor={BRL(fat)} sub={`${ok.length} concluídos`} delta={delta(fat, pFat)} />
        <KpiCard icon="✂️" label="Atendimentos" valor={atendimentos.length} sub={`${cancelados} cancelados`} delta={delta(atendimentos.length, prevAtendimentos.length)} />
        <KpiCard icon="💳" label="Ticket médio" valor={BRL(ticket)} sub="por atendimento" delta={delta(ticket, pTicket)} />
        <KpiCard icon="🔁" label="Período anterior" valor={BRL(pFat)} sub={`${pOk.length} atendimentos`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>📅 Faturamento por dia da semana</SectionTitle>
          <div className="flex items-end gap-1.5 h-24">
            {dias.map((d, i) => {
              const pct = (porDow[i] / maxDow) * 100;
              return (
                <div key={d} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: 72 }}>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max(pct, porDow[i] > 0 ? 5 : 0)}%` }}
                      transition={{ duration: 0.4, delay: i * 0.05 }}
                      className={`w-full rounded-t-md ${porDow[i] > 0 ? "bg-indigo-400" : "bg-gray-100"}`}
                      style={{ minHeight: porDow[i] > 0 ? 4 : 0 }}
                      title={BRL(porDow[i])}
                    />
                  </div>
                  <span className="text-[10px] text-gray-400">{d}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionTitle>💳 Formas de pagamento</SectionTitle>
          {Object.values(pgto).every((v) => v === 0) ? (
            <p className="text-xs text-gray-400">Sem dados de pagamento.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {[
                { id: "pix", label: "Pix", cor: "bg-emerald-400" },
                { id: "debito", label: "Débito", cor: "bg-indigo-400" },
                { id: "credito", label: "Crédito", cor: "bg-violet-400" },
              ].map(({ id, label, cor }) => {
                const total = Object.values(pgto).reduce((s, v) => s + v, 0);
                const pct = total > 0 ? (pgto[id] / total) * 100 : 0;
                return (
                  <div key={id}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">{label}</span>
                      <span className="text-gray-400">{BRL(pgto[id])} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                        className={`h-full ${cor} rounded-full`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {servicos.length > 0 && (
        <Card>
          <SectionTitle>✂️ Serviços mais realizados</SectionTitle>
          <RankingBars
            itens={servicos.map((s) => ({ nome: s.nome, valor: s.count, sub: BRL(s.receita) }))}
            formatValor={(v) => `${v}x`}
            cor="bg-indigo-400"
          />
        </Card>
      )}
    </div>
  );
}

// ─── Helpers de tempo ─────────────────────────────────────────────

function fmtHoras(minutos) {
  if (!minutos) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ─── Aba: Barbeiros ───────────────────────────────────────────────

function TabBarbeiros({ atendimentos, comandas, barbeiros, detalhe, setDetalhe }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");

  if (!ok.length) {
    return (
      <Card>
        <p className="text-sm text-gray-400 text-center py-8">Nenhum atendimento concluído no período.</p>
      </Card>
    );
  }

  // Índice: atendimento_id → barbeiro_id (para cruzar com comandas)
  const atendBarbeiro = {};
  for (const a of ok) {
    if (a.barbeiro_id) atendBarbeiro[a.id] = a.barbeiro_id;
  }

  // Agrupa por barbeiro_id
  const mapa = {};
  const getEntry = (barbId) => {
    const barb = barbeiros.find((b) => b.id === barbId);
    const key = barb ? String(barb.id) : "sem";
    if (!mapa[key]) {
      mapa[key] = {
        nome: barb ? barb.nome : "Sem barbeiro",
        atendimentos: 0,
        faturamento: 0,
        minutos: 0,
        servicos: {},        // { nome: count }
        produtos: {},        // { nome: { count, receita } }
      };
    }
    return mapa[key];
  };

  for (const a of ok) {
    const entry = getEntry(a.barbeiro_id);
    entry.atendimentos++;
    entry.faturamento += Number(a.valor_total || 0);

    for (const s of a.servicos || []) {
      // duracao_minutos salvo a partir desta versão; fallback 30min para registros antigos
      entry.minutos += s.duracao_minutos || 30;
      entry.servicos[s.nome] = (entry.servicos[s.nome] || 0) + 1;
    }
  }

  // Cruzar produtos consumidos com barbeiro — usa barbeiro_id direto da comanda
  // ou fallback via atendimento_id para registros antigos
  for (const cmd of comandas) {
    const barbId = cmd.barbeiro_id ?? atendBarbeiro[cmd.atendimento_id];
    if (!barbId) continue;
    const entry = getEntry(barbId);
    for (const item of [...(cmd.itens_bar || []), ...(cmd.itens_loja || [])]) {
      if (!entry.produtos[item.nome]) entry.produtos[item.nome] = { count: 0, receita: 0 };
      entry.produtos[item.nome].count += item.quantidade || 1;
      entry.produtos[item.nome].receita += (item.quantidade || 1) * Number(item.preco_venda || 0);
    }
  }

  const lista = Object.values(mapa).map((b) => ({
    ...b,
    ticket: b.atendimentos > 0 ? b.faturamento / b.atendimentos : 0,
    topServico: Object.entries(b.servicos).sort((a, z) => z[1] - a[1])[0]?.[0] ?? "—",
    topProduto: Object.entries(b.produtos).sort((a, z) => z[1].count - a[1].count)[0]?.[0] ?? "—",
    totalProdutos: Object.values(b.produtos).reduce((s, p) => s + p.count, 0),
    receitaProdutos: Object.values(b.produtos).reduce((s, p) => s + p.receita, 0),
  })).sort((a, b) => b.faturamento - a.faturamento);

  const totalFat = lista.reduce((s, b) => s + b.faturamento, 0);
  const totalMin = lista.reduce((s, b) => s + b.minutos, 0);

  const barbDetalhe = detalhe ? lista.find((b) => b.nome === detalhe) : null;

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs de equipe */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="✂️" label="Barbeiros ativos" valor={lista.length} sub="no período" />
        <KpiCard icon="💰" label="Faturamento total" valor={BRL(totalFat)} sub="equipe completa" />
        <KpiCard icon="⏱️" label="Horas totais" valor={fmtHoras(totalMin)} sub="tempo em atendimentos" />
        <KpiCard icon="💳" label="Ticket médio geral" valor={BRL(ok.length > 0 ? totalFat / ok.length : 0)} sub="todos os barbeiros" />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <SectionTitle>💰 Faturamento</SectionTitle>
          <RankingBars itens={lista.map((b) => ({ nome: b.nome, valor: b.faturamento, sub: `${b.atendimentos}x` }))} formatValor={BRL} cor="bg-indigo-400" />
        </Card>
        <Card>
          <SectionTitle>💳 Ticket médio</SectionTitle>
          <RankingBars itens={lista.map((b) => ({ nome: b.nome, valor: b.ticket }))} formatValor={BRL} cor="bg-emerald-400" />
        </Card>
        <Card>
          <SectionTitle>⏱️ Horas trabalhadas</SectionTitle>
          <RankingBars itens={lista.map((b) => ({ nome: b.nome, valor: b.minutos, sub: fmtHoras(b.minutos) }))} formatValor={fmtHoras} cor="bg-amber-400" />
        </Card>
      </div>

      {/* Tabela completa — sem Fragment em tbody */}
      <Card>
        <SectionTitle>📋 Performance por profissional</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-2 font-medium">Profissional</th>
                <th className="text-right py-2 font-medium">Atend.</th>
                <th className="text-right py-2 font-medium">Faturamento</th>
                <th className="text-right py-2 font-medium">Ticket</th>
                <th className="text-right py-2 font-medium">Horas</th>
                <th className="text-right py-2 font-medium">% Fat.</th>
                <th className="text-right py-2 font-medium hidden lg:table-cell">Produtos</th>
                <th className="text-right py-2 font-medium hidden lg:table-cell">Rec. Produtos</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((b) => (
                <tr
                  key={b.nome}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${detalhe === b.nome ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                  onClick={() => setDetalhe(detalhe === b.nome ? null : b.nome)}
                >
                  <td className="py-2.5 font-medium text-gray-700">
                    {b.nome} <span className="text-gray-300 text-[10px]">{detalhe === b.nome ? "▾" : "▸"}</span>
                  </td>
                  <td className="py-2.5 text-right text-gray-500">{b.atendimentos}</td>
                  <td className="py-2.5 text-right font-semibold text-gray-700">{BRL(b.faturamento)}</td>
                  <td className="py-2.5 text-right text-gray-500">{BRL(b.ticket)}</td>
                  <td className="py-2.5 text-right text-gray-500">{fmtHoras(b.minutos)}</td>
                  <td className="py-2.5 text-right text-gray-400">
                    {totalFat > 0 ? ((b.faturamento / totalFat) * 100).toFixed(1) : 0}%
                  </td>
                  <td className="py-2.5 text-right text-gray-400 hidden lg:table-cell">{b.totalProdutos}x</td>
                  <td className="py-2.5 text-right text-gray-400 hidden lg:table-cell">{BRL(b.receitaProdutos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td className="py-2 font-bold text-gray-700">Total</td>
                <td className="py-2 text-right font-semibold text-gray-600">{lista.reduce((s, b) => s + b.atendimentos, 0)}</td>
                <td className="py-2 text-right font-bold text-gray-800">{BRL(totalFat)}</td>
                <td className="py-2 text-right text-gray-400">{BRL(ok.length > 0 ? totalFat / ok.length : 0)}</td>
                <td className="py-2 text-right text-gray-400">{fmtHoras(totalMin)}</td>
                <td className="py-2 text-right text-gray-400">100%</td>
                <td className="py-2 text-right text-gray-400 hidden lg:table-cell">{lista.reduce((s, b) => s + b.totalProdutos, 0)}x</td>
                <td className="py-2 text-right text-gray-400 hidden lg:table-cell">{BRL(lista.reduce((s, b) => s + b.receitaProdutos, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[10px] text-gray-300 mt-2">Clique em um profissional para ver detalhes.</p>
      </Card>

      {/* Painel de detalhes — fora da tabela, sem Fragment */}
      {barbDetalhe && (
        <Card>
          <SectionTitle>🔍 Detalhes — {barbDetalhe.nome}</SectionTitle>
          <div className="flex flex-col gap-3">
            {Object.keys(barbDetalhe.servicos).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">✂️ Serviços realizados</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(barbDetalhe.servicos)
                    .sort((a, z) => z[1] - a[1])
                    .map(([nome, cnt]) => (
                      <span key={nome} className="bg-indigo-50 text-indigo-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        {nome} × {cnt}
                      </span>
                    ))}
                </div>
              </div>
            )}
            {Object.keys(barbDetalhe.produtos).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">📦 Produtos vendidos</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(barbDetalhe.produtos)
                    .sort((a, z) => z[1].count - a[1].count)
                    .map(([nome, p]) => (
                      <span key={nome} className="bg-amber-50 text-amber-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        {nome} × {p.count} · {BRL(p.receita)}
                      </span>
                    ))}
                </div>
              </div>
            )}
            {Object.keys(barbDetalhe.servicos).length === 0 && Object.keys(barbDetalhe.produtos).length === 0 && (
              <p className="text-xs text-gray-400">Sem detalhes disponíveis.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Aba: Retenção de Clientes ────────────────────────────────────

function TabRetencao({ atendimentos, clientesUltimaVisita }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");
  const agora = new Date();

  // Novos vs recorrentes no período (baseado em histórico completo)
  const nomesNoPeriodo = new Set(ok.map((a) => (a.cliente_nome || "").toLowerCase().trim()).filter(Boolean));

  // Quem tem mais de 1 visita no histórico total E apareceu no período = recorrente
  const mapaHistorico = {};
  for (const c of clientesUltimaVisita) {
    mapaHistorico[(c.nome || "").toLowerCase().trim()] = c.total_visitas;
  }
  let novos = 0, recorrentes = 0;
  for (const nome of nomesNoPeriodo) {
    if ((mapaHistorico[nome] || 1) <= 1) novos++;
    else recorrentes++;
  }
  const totalUnicos = novos + recorrentes;
  const txRetencao = totalUnicos > 0 ? (recorrentes / totalUnicos) * 100 : 0;

  // Clientes em risco: sem visita há 30-90 dias, mas têm histórico
  const emRisco = clientesUltimaVisita
    .filter((c) => {
      const dias = (agora - new Date(c.ultima_visita)) / 86400000;
      return dias >= 30 && dias < 90 && c.total_visitas >= 2;
    })
    .sort((a, b) => new Date(a.ultima_visita) - new Date(b.ultima_visita));

  // Clientes perdidos: sem visita há 90+ dias
  const perdidos = clientesUltimaVisita
    .filter((c) => {
      const dias = (agora - new Date(c.ultima_visita)) / 86400000;
      return dias >= 90 && c.total_visitas >= 2;
    })
    .sort((a, b) => new Date(a.ultima_visita) - new Date(b.ultima_visita));

  // Ranking de clientes no período
  const mapaCliente = {};
  for (const a of ok) {
    const nome = a.cliente_nome || "Sem nome";
    if (!mapaCliente[nome]) mapaCliente[nome] = { nome, visitas: 0, gasto: 0 };
    mapaCliente[nome].visitas++;
    mapaCliente[nome].gasto += Number(a.valor_total || 0);
  }
  const ranking = Object.values(mapaCliente).sort((a, b) => b.gasto - a.gasto);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="👥" label="Clientes únicos" valor={totalUnicos} sub="no período" />
        <KpiCard icon="🆕" label="Novos clientes" valor={novos} sub="primeira visita" />
        <KpiCard icon="🔁" label="Recorrentes" valor={recorrentes} sub="voltaram no período" />
        <KpiCard icon="📊" label="Taxa de retenção" valor={`${txRetencao.toFixed(0)}%`} sub="recorrentes/total" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {emRisco.length > 0 && (
          <Card>
            <SectionTitle>⚠️ Em risco (30–90 dias sem visita)</SectionTitle>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {emRisco.slice(0, 15).map((c) => {
                const dias = Math.round((agora - new Date(c.ultima_visita)) / 86400000);
                return (
                  <div key={c.nome} className="flex items-center justify-between px-3 py-2 bg-orange-50 border border-orange-100 rounded-xl">
                    <div>
                      <p className="text-xs font-medium text-orange-700">{c.nome}</p>
                      <p className="text-[10px] text-orange-400">{c.total_visitas} visitas · {BRL(c.total_gasto)} total</p>
                    </div>
                    <span className="text-xs font-bold text-orange-500 shrink-0">{dias}d</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {perdidos.length > 0 && (
          <Card>
            <SectionTitle>👻 Perdidos (+90 dias sem visita)</SectionTitle>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {perdidos.slice(0, 15).map((c) => {
                const dias = Math.round((agora - new Date(c.ultima_visita)) / 86400000);
                return (
                  <div key={c.nome} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-xl">
                    <div>
                      <p className="text-xs font-medium text-red-700">{c.nome}</p>
                      <p className="text-[10px] text-red-400">{c.total_visitas} visitas · {BRL(c.total_gasto)} total</p>
                    </div>
                    <span className="text-xs font-bold text-red-400 shrink-0">{dias}d</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {emRisco.length === 0 && perdidos.length === 0 && (
          <Card className="col-span-2">
            <p className="text-sm text-gray-400 text-center py-6">✅ Nenhum cliente em risco identificado</p>
          </Card>
        )}
      </div>

      {ranking.length > 0 && (
        <Card>
          <SectionTitle>🏆 Top clientes no período</SectionTitle>
          <RankingBars
            itens={ranking.map((c) => ({ nome: c.nome, valor: c.gasto, sub: `${c.visitas}x` }))}
            formatValor={BRL}
            cor="bg-violet-400"
          />
        </Card>
      )}
    </div>
  );
}

// ─── Aba: Serviços ────────────────────────────────────────────────

function TabServicos({ atendimentos }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");

  const mapa = {};
  for (const a of ok) {
    for (const s of a.servicos || []) {
      if (!mapa[s.nome]) mapa[s.nome] = { nome: s.nome, count: 0, receita: 0 };
      mapa[s.nome].count++;
      mapa[s.nome].receita += Number(s.valor || 0);
    }
  }
  const lista = Object.values(mapa).sort((a, b) => b.count - a.count);
  const totalServicos = lista.reduce((s, i) => s + i.count, 0);
  const receitaTotal  = lista.reduce((s, i) => s + i.receita, 0);
  const topServico    = lista[0]?.nome ?? "—";

  if (!ok.length) return (
    <Card><p className="text-sm text-gray-400 text-center py-8">Nenhum atendimento concluído no período.</p></Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="✂️" label="Serviços realizados" valor={totalServicos} sub={`${ok.length} atendimentos`} />
        <KpiCard icon="💰" label="Receita de serviços" valor={BRL(receitaTotal)} sub="valor total" />
        <KpiCard icon="🏆" label="Mais realizado" valor={topServico} sub={lista[0] ? `${lista[0].count}× · ${BRL(lista[0].receita)}` : undefined} />
        <KpiCard icon="💳" label="Ticket médio/serviço" valor={BRL(totalServicos > 0 ? receitaTotal / totalServicos : 0)} sub="por serviço" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>📊 Ranking por quantidade</SectionTitle>
          <RankingBars itens={lista.map((s) => ({ nome: s.nome, valor: s.count, sub: BRL(s.receita) }))} formatValor={(v) => `${v}×`} cor="bg-indigo-400" />
        </Card>
        <Card>
          <SectionTitle>💰 Ranking por receita</SectionTitle>
          <RankingBars itens={[...lista].sort((a, b) => b.receita - a.receita).map((s) => ({ nome: s.nome, valor: s.receita, sub: `${s.count}×` }))} formatValor={BRL} cor="bg-violet-400" />
        </Card>
      </div>

      <Card>
        <SectionTitle>📋 Tabela completa de serviços</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-2 font-medium">Serviço</th>
                <th className="text-right py-2 font-medium">Qtd</th>
                <th className="text-right py-2 font-medium">Receita</th>
                <th className="text-right py-2 font-medium">Ticket médio</th>
                <th className="text-right py-2 font-medium">% do total</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.nome} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-700">{s.nome}</td>
                  <td className="py-2.5 text-right text-gray-500">{s.count}</td>
                  <td className="py-2.5 text-right font-semibold text-gray-700">{BRL(s.receita)}</td>
                  <td className="py-2.5 text-right text-gray-500">{BRL(s.count > 0 ? s.receita / s.count : 0)}</td>
                  <td className="py-2.5 text-right text-gray-400">{receitaTotal > 0 ? ((s.receita / receitaTotal) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200">
                <td className="py-2 font-bold text-gray-700">Total</td>
                <td className="py-2 text-right font-semibold text-gray-600">{totalServicos}</td>
                <td className="py-2 text-right font-bold text-gray-800">{BRL(receitaTotal)}</td>
                <td className="py-2 text-right text-gray-400">{BRL(totalServicos > 0 ? receitaTotal / totalServicos : 0)}</td>
                <td className="py-2 text-right text-gray-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Aba: Produtos ────────────────────────────────────────────────

function TabProdutos({ comandas }) {
  const mapaBar  = {};
  const mapaLoja = {};

  for (const cmd of comandas) {
    for (const item of cmd.itens_bar || []) {
      if (!item.nome) continue;
      if (!mapaBar[item.nome]) mapaBar[item.nome] = { nome: item.nome, count: 0, receita: 0 };
      mapaBar[item.nome].count   += item.quantidade || 1;
      mapaBar[item.nome].receita += (item.quantidade || 1) * Number(item.preco_venda || 0);
    }
    for (const item of cmd.itens_loja || []) {
      if (!item.nome) continue;
      if (!mapaLoja[item.nome]) mapaLoja[item.nome] = { nome: item.nome, count: 0, receita: 0 };
      mapaLoja[item.nome].count   += item.quantidade || 1;
      mapaLoja[item.nome].receita += (item.quantidade || 1) * Number(item.preco_venda || 0);
    }
  }

  const listaBar  = Object.values(mapaBar).sort((a, b) => b.count - a.count);
  const listaLoja = Object.values(mapaLoja).sort((a, b) => b.count - a.count);
  const totalItens = [...listaBar, ...listaLoja].reduce((s, i) => s + i.count, 0);
  const receitaBar  = listaBar.reduce((s, i) => s + i.receita, 0);
  const receitaLoja = listaLoja.reduce((s, i) => s + i.receita, 0);

  if (!comandas.length) return (
    <Card><p className="text-sm text-gray-400 text-center py-8">Nenhuma comanda fechada no período.</p></Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="📦" label="Itens vendidos" valor={totalItens} sub={`${comandas.length} comandas`} />
        <KpiCard icon="🍺" label="Receita bar" valor={BRL(receitaBar)} sub={`${listaBar.reduce((s, i) => s + i.count, 0)} itens`} />
        <KpiCard icon="🛍️" label="Receita loja" valor={BRL(receitaLoja)} sub={`${listaLoja.reduce((s, i) => s + i.count, 0)} itens`} />
        <KpiCard icon="💰" label="Total produtos" valor={BRL(receitaBar + receitaLoja)} sub="bar + loja" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {listaBar.length > 0 && (
          <Card>
            <SectionTitle>🍺 Produtos mais vendidos — Bar</SectionTitle>
            <RankingBars itens={listaBar.map((p) => ({ nome: p.nome, valor: p.count, sub: BRL(p.receita) }))} formatValor={(v) => `${v}×`} cor="bg-amber-400" />
          </Card>
        )}
        {listaLoja.length > 0 && (
          <Card>
            <SectionTitle>🛍️ Produtos mais vendidos — Loja</SectionTitle>
            <RankingBars itens={listaLoja.map((p) => ({ nome: p.nome, valor: p.count, sub: BRL(p.receita) }))} formatValor={(v) => `${v}×`} cor="bg-emerald-400" />
          </Card>
        )}
        {listaBar.length === 0 && listaLoja.length === 0 && (
          <Card className="col-span-2"><p className="text-sm text-gray-400 text-center py-8">Nenhum produto vendido em comandas no período.</p></Card>
        )}
      </div>
    </div>
  );
}

// ─── Aba: Horários ────────────────────────────────────────────────

function TabHorarios({ atendimentos }) {
  const HORAS = Array.from({ length: 13 }, (_, i) => i + 8); // 8h–20h
  const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const cntHora  = {};
  const cntDow   = Array(7).fill(0);
  const heatmap  = {}; // "dow-hora" → count

  for (const a of atendimentos) {
    const d = new Date(a.data_hora);
    const h = d.getHours();
    const dow = d.getDay();
    cntHora[h]  = (cntHora[h]  || 0) + 1;
    cntDow[dow] += 1;
    const key = `${dow}-${h}`;
    heatmap[key] = (heatmap[key] || 0) + 1;
  }

  const maxHora = Math.max(...Object.values(cntHora), 1);
  const maxCell = Math.max(...Object.values(heatmap), 1);

  const peakHora = Object.entries(cntHora).sort((a, b) => b[1] - a[1])[0];
  const peakDow  = cntDow.indexOf(Math.max(...cntDow));

  if (!atendimentos.length) return (
    <Card><p className="text-sm text-gray-400 text-center py-8">Nenhum atendimento no período.</p></Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="⏰" label="Horário de pico" valor={peakHora ? `${peakHora[0]}h` : "—"} sub={peakHora ? `${peakHora[1]} atendimentos` : undefined} />
        <KpiCard icon="📅" label="Dia mais movimentado" valor={DIAS_SEMANA[peakDow]} sub={`${cntDow[peakDow]} atendimentos`} />
        <KpiCard icon="✂️" label="Total no período" valor={atendimentos.length} sub="atendimentos" />
        <KpiCard icon="💤" label="Horários ociosos" valor={HORAS.filter((h) => !cntHora[h]).length} sub="sem atendimento" />
      </div>

      {/* Barras por hora */}
      <Card>
        <SectionTitle>📊 Atendimentos por horário</SectionTitle>
        <div className="flex items-end gap-1 h-32 mt-2">
          {HORAS.map((h) => {
            const cnt = cntHora[h] || 0;
            const pct = (cnt / maxHora) * 100;
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: 96 }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(pct, cnt > 0 ? 5 : 0)}%` }}
                    transition={{ duration: 0.4, delay: (h - 8) * 0.04 }}
                    className={`w-full rounded-t-md ${cnt > 0 ? (h === Number(peakHora?.[0]) ? "bg-indigo-500" : "bg-indigo-300") : "bg-gray-100"}`}
                    title={`${h}h: ${cnt} atendimento${cnt !== 1 ? "s" : ""}`}
                  />
                </div>
                <span className="text-[9px] text-gray-400">{h}h</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Heatmap dia × hora */}
      <Card>
        <SectionTitle>🗓️ Heatmap — dia da semana × horário</SectionTitle>
        <div className="overflow-x-auto">
          <table className="text-[9px] border-collapse w-full">
            <thead>
              <tr>
                <th className="text-gray-300 pr-2 font-normal text-right w-8"></th>
                {HORAS.map((h) => (
                  <th key={h} className="text-gray-400 font-normal text-center py-1 px-0.5 w-7">{h}h</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DIAS_SEMANA.map((dia, dow) => (
                <tr key={dia}>
                  <td className="text-gray-400 pr-2 text-right py-0.5 font-medium">{dia}</td>
                  {HORAS.map((h) => {
                    const cnt = heatmap[`${dow}-${h}`] || 0;
                    const intensity = cnt / maxCell;
                    const bg = cnt === 0
                      ? "bg-gray-50"
                      : intensity < 0.25 ? "bg-indigo-100"
                      : intensity < 0.5  ? "bg-indigo-200"
                      : intensity < 0.75 ? "bg-indigo-400"
                      : "bg-indigo-600";
                    const text = intensity >= 0.5 ? "text-white" : "text-indigo-800";
                    return (
                      <td key={h} className="py-0.5 px-0.5">
                        <div
                          className={`${bg} ${cnt > 0 ? text : "text-gray-200"} rounded text-center leading-none flex items-center justify-center font-semibold`}
                          style={{ width: 24, height: 20, fontSize: 9 }}
                          title={`${dia} ${h}h: ${cnt}`}
                        >
                          {cnt || ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Barras por dia da semana */}
      <Card>
        <SectionTitle>📅 Atendimentos por dia da semana</SectionTitle>
        <div className="flex items-end gap-2 h-28 mt-2">
          {DIAS_SEMANA.map((dia, dow) => {
            const cnt = cntDow[dow];
            const pct = (cnt / Math.max(...cntDow, 1)) * 100;
            return (
              <div key={dia} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: 88 }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(pct, cnt > 0 ? 5 : 0)}%` }}
                    transition={{ duration: 0.4, delay: dow * 0.06 }}
                    className={`w-full rounded-t-md ${cnt > 0 ? (dow === peakDow ? "bg-emerald-500" : "bg-emerald-300") : "bg-gray-100"}`}
                    title={`${dia}: ${cnt}`}
                  />
                </div>
                <span className="text-[10px] text-gray-400">{dia}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─── Aba: Clientes ────────────────────────────────────────────────

function TabClientes({ atendimentos, clientesUltimaVisita }) {
  const ok = atendimentos.filter((a) => a.status === "concluido");

  const mapa = {};
  for (const a of ok) {
    const nome = (a.cliente_nome || "").trim() || "Sem nome";
    if (!mapa[nome]) mapa[nome] = { nome, visitas: 0, gasto: 0, datas: [] };
    mapa[nome].visitas++;
    mapa[nome].gasto += Number(a.valor_total || 0);
    mapa[nome].datas.push(new Date(a.data_hora));
  }

  const ranking = Object.values(mapa).sort((a, b) => b.gasto - a.gasto);
  const totalUnicos = ranking.length;
  const gastoMedio  = totalUnicos > 0 ? ranking.reduce((s, c) => s + c.gasto, 0) / totalUnicos : 0;
  const mapaHistorico = {};
  for (const c of clientesUltimaVisita) {
    mapaHistorico[(c.nome || "").toLowerCase().trim()] = c.total_visitas;
  }
  const recorrentes = ranking.filter((c) => (mapaHistorico[c.nome.toLowerCase()] || 1) > 1).length;

  if (!ok.length) return (
    <Card><p className="text-sm text-gray-400 text-center py-8">Nenhum atendimento concluído no período.</p></Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon="👥" label="Clientes únicos" valor={totalUnicos} sub="no período" />
        <KpiCard icon="🔁" label="Recorrentes" valor={recorrentes} sub="com histórico anterior" />
        <KpiCard icon="💰" label="Gasto médio" valor={BRL(gastoMedio)} sub="por cliente" />
        <KpiCard icon="📊" label="Taxa de retorno" valor={`${totalUnicos > 0 ? ((recorrentes / totalUnicos) * 100).toFixed(0) : 0}%`} sub="clientes que voltaram" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle>🏆 Top clientes por gasto</SectionTitle>
          <RankingBars
            itens={ranking.slice(0, 10).map((c) => ({ nome: c.nome, valor: c.gasto, sub: `${c.visitas}x` }))}
            formatValor={BRL}
            cor="bg-violet-400"
          />
        </Card>
        <Card>
          <SectionTitle>🔁 Top clientes por visitas</SectionTitle>
          <RankingBars
            itens={[...ranking].sort((a, b) => b.visitas - a.visitas).slice(0, 10).map((c) => ({ nome: c.nome, valor: c.visitas, sub: BRL(c.gasto) }))}
            formatValor={(v) => `${v}×`}
            cor="bg-indigo-400"
          />
        </Card>
      </div>

      <Card>
        <SectionTitle>📋 Todos os clientes do período</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-2 font-medium">Cliente</th>
                <th className="text-right py-2 font-medium">Visitas</th>
                <th className="text-right py-2 font-medium">Total gasto</th>
                <th className="text-right py-2 font-medium">Ticket médio</th>
                <th className="text-right py-2 font-medium hidden lg:table-cell">Histórico</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((c) => {
                const totalHist = mapaHistorico[c.nome.toLowerCase()] ?? c.visitas;
                return (
                  <tr key={c.nome} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium text-gray-700">{c.nome}</td>
                    <td className="py-2.5 text-right text-gray-500">{c.visitas}</td>
                    <td className="py-2.5 text-right font-semibold text-gray-700">{BRL(c.gasto)}</td>
                    <td className="py-2.5 text-right text-gray-500">{BRL(c.visitas > 0 ? c.gasto / c.visitas : 0)}</td>
                    <td className="py-2.5 text-right text-gray-400 hidden lg:table-cell">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${totalHist > 1 ? "bg-green-50 text-green-600" : "bg-gray-50 text-gray-400"}`}>
                        {totalHist > 1 ? `${totalHist}× total` : "novo"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────

const PRESETS = [
  { id: "hoje",     label: "Hoje",      ini: () => hoje(),       fim: () => hoje() },
  { id: "7d",       label: "7 dias",    ini: () => subDias(6),   fim: () => hoje() },
  { id: "30d",      label: "30 dias",   ini: () => subDias(29),  fim: () => hoje() },
  { id: "mes",      label: "Este mês",  ini: () => inicioMes(),  fim: () => hoje() },
  { id: "custom",   label: "Período",   ini: null, fim: null },
];

function DateRangePicker({ dataIni, dataFim, onChange }) {
  const [presetAtivo, setPresetAtivo] = useState("7d");
  const [customIni, setCustomIni] = useState(dataIni);
  const [customFim, setCustomFim] = useState(dataFim);
  const [showCustom, setShowCustom] = useState(false);

  const aplicarPreset = (preset) => {
    setPresetAtivo(preset.id);
    if (preset.id === "custom") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onChange(preset.ini(), preset.fim());
    }
  };

  const aplicarCustom = () => {
    if (customIni && customFim && customIni <= customFim) {
      onChange(customIni, customFim);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => aplicarPreset(p)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
              ${presetAtivo === p.id ? "bg-indigo-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customIni}
            max={customFim}
            onChange={(e) => setCustomIni(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <span className="text-gray-400 text-xs">até</span>
          <input
            type="date"
            value={customFim}
            min={customIni}
            max={hoje()}
            onChange={(e) => setCustomFim(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            onClick={aplicarCustom}
            className="bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-indigo-600 transition-colors"
          >
            Aplicar
          </button>
        </div>
      )}
      <p className="text-[10px] text-gray-400">
        {dataIni} → {dataFim} · {diasEntre(dataIni, dataFim) + 1} dias
      </p>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────

const TABS = [
  { id: "insights",  icon: "🧠", label: "Insights"  },
  { id: "resumo",    icon: "📊", label: "Resumo"    },
  { id: "servicos",  icon: "✂️", label: "Serviços"  },
  { id: "produtos",  icon: "📦", label: "Produtos"  },
  { id: "horarios",  icon: "🕐", label: "Horários"  },
  { id: "clientes",  icon: "👤", label: "Clientes"  },
  { id: "barbeiros", icon: "💈", label: "Barbeiros" },
  { id: "retencao",  icon: "👥", label: "Retenção"  },
];

// ─── Relatórios principal ─────────────────────────────────────────

export default function Relatorios() {
  const [tab, setTab] = useState("insights");
  const [dataIni, setDataIni] = useState(subDias(6));
  const [dataFim, setDataFim] = useState(hoje());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [detalheBarbeiro, setDetalheBarbeiro] = useState(null);

  const [atendimentos, setAtendimentos] = useState([]);
  const [prevAtendimentos, setPrevAtendimentos] = useState([]);
  const [comandas, setComandas] = useState([]);
  const [barbeiros, setBarbeiros] = useState([]);
  const [clientesUltimaVisita, setClientesUltimaVisita] = useState([]);
  const [insights, setInsights] = useState([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [{ atendimentos: at, comandas: cm, barbeiros: barbs }, prev, clientes] = await Promise.all([
        getRelatoriosPeriodo(dataIni, dataFim),
        getRelatoriosPeriodoAnterior(dataIni, dataFim),
        getUltimaVisitaClientes(),
      ]);
      setAtendimentos(at);
      setPrevAtendimentos(prev);
      setComandas(cm);
      setBarbeiros(barbs);
      setClientesUltimaVisita(clientes);
      setInsights(gerarInsights(at, prev, cm, clientes, barbs));
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar relatórios. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [dataIni, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handlePeriodo = useCallback((ini, fim) => {
    setDataIni(ini);
    setDataFim(fim);
  }, []);

  const alertasCount = insights.filter((i) => i.tipo === "alerta").length;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Relatórios</h2>
          <p className="text-xs text-gray-400 mt-0.5">Análise estratégica por período</p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-indigo-500 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40"
          title="Atualizar"
        >
          🔄
        </button>
      </div>

      {/* Date range */}
      <Card className="!p-3">
        <DateRangePicker dataIni={dataIni} dataFim={dataFim} onChange={handlePeriodo} />
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors shrink-0 relative
              ${tab === t.id ? "bg-indigo-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
          >
            {t.icon} {t.label}
            {t.id === "insights" && alertasCount > 0 && !loading && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 ${tab === t.id ? "bg-white text-indigo-600" : "bg-red-100 text-red-600"}`}>
                {alertasCount}
              </span>
            )}
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
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
          ⚠️ {erro}
        </div>
      ) : (
        <motion.div
          key={`${tab}-${dataIni}-${dataFim}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "insights"  && <TabInsights insights={insights} />}
          {tab === "resumo"    && <TabResumo atendimentos={atendimentos} prevAtendimentos={prevAtendimentos} />}
          {tab === "servicos"  && <TabServicos atendimentos={atendimentos} />}
          {tab === "produtos"  && <TabProdutos comandas={comandas} />}
          {tab === "horarios"  && <TabHorarios atendimentos={atendimentos} />}
          {tab === "clientes"  && <TabClientes atendimentos={atendimentos} clientesUltimaVisita={clientesUltimaVisita} />}
          {tab === "barbeiros" && <TabBarbeiros atendimentos={atendimentos} comandas={comandas} barbeiros={barbeiros} detalhe={detalheBarbeiro} setDetalhe={setDetalheBarbeiro} />}
          {tab === "retencao"  && <TabRetencao atendimentos={atendimentos} clientesUltimaVisita={clientesUltimaVisita} />}
        </motion.div>
      )}
    </div>
  );
}
