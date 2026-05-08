import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { db } from "../../services/supabaseDb";

function fmtValor(v) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TABS = [
  { id: "servicos", label: "Serviços", emoji: "✂️" },
  { id: "bar", label: "Bar", emoji: "🍺" },
  { id: "loja", label: "Loja", emoji: "🛍️" },
];

const PAGAMENTOS = [
  { id: "pix",      label: "Pix",      emoji: "🔑" },
  { id: "debito",   label: "Débito",   emoji: "💳" },
  { id: "credito",  label: "Crédito",  emoji: "💳" },
  { id: "dinheiro", label: "Dinheiro", emoji: "💵" },
];

const ALVOS_DESCONTO = [
  { id: "total",    label: "Total"       },
  { id: "servicos", label: "Serviços ✂️" },
  { id: "bar",      label: "Bar 🍺"      },
  { id: "loja",     label: "Loja 🛍️"    },
];

function calcDesconto(desc, totSvc, totBar, totLoja) {
  const v = Number(desc.valor || 0);
  if (v <= 0) return 0;
  const base = { total: totSvc + totBar + totLoja, servicos: totSvc, bar: totBar, loja: totLoja }[desc.alvo] ?? 0;
  const calc = desc.tipo === "percent" ? base * (v / 100) : Math.min(v, base);
  return Math.round(calc * 100) / 100;
}

function labelDesconto(desc) {
  const nome = { total: "Total", servicos: "Serviços", bar: "Bar", loja: "Loja" }[desc.alvo] ?? "Total";
  return desc.tipo === "percent" ? `${nome} −${desc.valor}%` : nome;
}

export default function Comanda({ evento, barbeiros = [], onFechar, onFinalizar }) {
  const [tab, setTab] = useState("servicos");
  const [servicos, setServicos] = useState([]);
  const [produtosBar, setProdutosBar] = useState([]);
  const [produtosLoja, setProdutosLoja] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [bloqueado, setBloqueado] = useState(false);
  const [eraFechada, setEraFechada] = useState(false);
  const [clienteNome, setClienteNome] = useState(
    (evento?.summary || "").replace(/^✅\s*/, "").split(/\s*[-—]\s*/).pop().trim() || ""
  );

  const [servicosSel, setServicosSel] = useState(new Set());
  const [qtdBar, setQtdBar] = useState({});
  const [qtdLoja, setQtdLoja] = useState({});
  const [formaPagamento, setFormaPagamento] = useState(null);
  const [barbeiroId, setBarbeiroId] = useState(null);
  const [desconto, setDesconto] = useState({ tipo: "percent", valor: "", alvo: "total" });

  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState(null);
  const [statusSalvo, setStatusSalvo] = useState("idle"); // idle | saving | saved | error
  const isInitialRender = useRef(true);

  useEffect(() => {
    setCarregando(true);
    isInitialRender.current = true;
    Promise.all([
      db.getServicos(),
      db.getProdutosByTipo("bar"),
      db.getProdutosByTipo("loja"),
      evento?.id ? db.getComandaByGcalId(evento.id) : Promise.resolve(null),
      evento?.id ? db.getAtendimentoByGcalId(evento.id) : Promise.resolve(null),
    ])
      .then(([svcs, bar, loja, cmd, atend]) => {
        setServicos(svcs.filter((s) => s.ativo));
        setProdutosBar(bar);
        setProdutosLoja(loja);

        // Barbeiro via GCal colorId ou atendimento salvo
        const barbSel = barbeiros.find((b) => b.gcal_color_id === evento?.colorId);
        if (barbSel) setBarbeiroId(barbSel.id);
        if (atend?.barbeiro_id) setBarbeiroId(atend.barbeiro_id);

        if (cmd) {
          if (cmd.status === "fechada") { setBloqueado(true); setEraFechada(true); }
          if (cmd.forma_pagamento) setFormaPagamento(cmd.forma_pagamento);
          if (cmd.cliente_nome) setClienteNome(cmd.cliente_nome);

          const selSvcs = new Set();
          (cmd.servicos ?? []).forEach((s) => { if (s.id) selSvcs.add(s.id); });
          setServicosSel(selSvcs);

          const qBar = {};
          (cmd.itens_bar ?? []).forEach((i) => { qBar[i.produto_id] = i.quantidade; });
          setQtdBar(qBar);

          const qLoja = {};
          (cmd.itens_loja ?? []).forEach((i) => { qLoja[i.produto_id] = i.quantidade; });
          setQtdLoja(qLoja);
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [evento?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleServico = (id) => {
    if (bloqueado) return;
    setServicosSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const changeQtd = (setter, id, delta) => {
    if (bloqueado) return;
    setter((prev) => {
      const cur = prev[id] || 0;
      const next = Math.max(0, cur + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });
  };

  const totalServicos = servicos
    .filter((s) => servicosSel.has(s.id))
    .reduce((sum, s) => sum + Number(s.valor || 0), 0);

  const totalBar = produtosBar
    .filter((p) => qtdBar[p.id])
    .reduce((sum, p) => sum + Number(p.preco_venda || 0) * (qtdBar[p.id] || 0), 0);

  const totalLoja = produtosLoja
    .filter((p) => qtdLoja[p.id])
    .reduce((sum, p) => sum + Number(p.preco_venda || 0) * (qtdLoja[p.id] || 0), 0);

  const subtotal = totalServicos + totalBar + totalLoja;
  const valorDesconto = bloqueado ? 0 : calcDesconto(desconto, totalServicos, totalBar, totalLoja);
  const total = Math.max(0, subtotal - valorDesconto);
  const hasItems = servicosSel.size > 0 || Object.keys(qtdBar).length > 0 || Object.keys(qtdLoja).length > 0;

  // ─── Autosave (debounce 600 ms) ─────────────────────────────────
  // Persiste itens / desconto / pagamento na comanda (status "aberta")
  // assim que o usuário adiciona ou altera algo. Encerramento real
  // continua sendo via "Fechar comanda".
  useEffect(() => {
    if (carregando || bloqueado || finalizando) return;
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (!evento?.id) return;

    const timer = setTimeout(async () => {
      const payload = {
        gcal_event_id: evento.id,
        cliente_nome: clienteNome,
        status: "aberta",
        servicos: servicos
          .filter((s) => servicosSel.has(s.id))
          .map((s) => ({ id: s.id, nome: s.nome, valor: Number(s.valor), duracao_minutos: s.duracao_minutos || 30 })),
        itens_bar: produtosBar
          .filter((p) => qtdBar[p.id])
          .map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdBar[p.id] })),
        itens_loja: produtosLoja
          .filter((p) => qtdLoja[p.id])
          .map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdLoja[p.id] })),
        valor_servicos: totalServicos,
        valor_bar: totalBar,
        valor_loja: totalLoja,
        valor_total: total,
        forma_pagamento: formaPagamento,
        desconto: valorDesconto > 0 ? { ...desconto, valor_calculado: valorDesconto } : null,
      };
      try {
        setStatusSalvo("saving");
        await db.saveComanda(payload);
        setStatusSalvo("saved");
      } catch (e) {
        console.error("Falha ao salvar rascunho da comanda:", e);
        setStatusSalvo("error");
      }
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicosSel, qtdBar, qtdLoja, formaPagamento, desconto.tipo, desconto.valor, desconto.alvo]);

  const handleFinalizar = async () => {
    if (!formaPagamento) return setErro("Selecione a forma de pagamento.");
    setErro(null);
    setFinalizando(true);
    try {
      const servicosCompletos = servicos
        .filter((s) => servicosSel.has(s.id))
        .map((s) => ({ id: s.id, nome: s.nome, valor: Number(s.valor), duracao_minutos: s.duracao_minutos || 30 }));

      const itensBarCompletos = produtosBar
        .filter((p) => qtdBar[p.id])
        .map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdBar[p.id] }));

      const itensLojaCompletos = produtosLoja
        .filter((p) => qtdLoja[p.id])
        .map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdLoja[p.id] }));

      await onFinalizar(evento, {
        servicos: servicosCompletos,
        itens_bar: itensBarCompletos,
        itens_loja: itensLojaCompletos,
        valor_servicos: totalServicos,
        valor_bar: totalBar,
        valor_loja: totalLoja,
        valor_total: total,
        forma_pagamento: formaPagamento,
        desconto: valorDesconto > 0 ? { ...desconto, valor_calculado: valorDesconto } : null,
        barbeiroId,
        eraFechada,
      });
    } catch (e) {
      setErro(e.message);
      setFinalizando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex-1 min-w-0 mr-3">
            <h3 className="font-semibold text-gray-800 text-base truncate">
              Comanda{clienteNome ? ` — ${clienteNome}` : ""}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!bloqueado && statusSalvo !== "idle" && (
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full
                  ${statusSalvo === "saving" ? "bg-gray-100 text-gray-500" : ""}
                  ${statusSalvo === "saved"  ? "bg-green-50 text-green-600" : ""}
                  ${statusSalvo === "error"  ? "bg-red-50 text-red-500" : ""}
                `}
              >
                {statusSalvo === "saving" && "Salvando..."}
                {statusSalvo === "saved"  && "✓ Salvo"}
                {statusSalvo === "error"  && "⚠️"}
              </span>
            )}
            {bloqueado && (
              <span className="text-xs font-medium bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                Fechada
              </span>
            )}
            <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
        </div>

        {carregando ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 animate-pulse py-10">
            Carregando...
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 shrink-0">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors
                    ${tab === t.id ? "bg-indigo-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                >
                  <span>{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {tab === "servicos" && (
                <div className="flex flex-col gap-2">
                  {servicos.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      Nenhum serviço cadastrado.<br />
                      <span className="text-xs">Adicione em Atendimento → Serviços.</span>
                    </p>
                  ) : servicos.map((s) => {
                    const sel = servicosSel.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleServico(s.id)}
                        disabled={bloqueado}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left
                          ${sel ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/50"}
                          ${bloqueado ? "cursor-default" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                            ${sel ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}>
                            {sel && <span className="text-white text-[10px]">✓</span>}
                          </div>
                          <span className={`text-sm font-medium ${sel ? "text-indigo-700" : "text-gray-700"}`}>
                            {s.nome}
                          </span>
                        </div>
                        <span className={`text-sm font-semibold shrink-0 ${sel ? "text-indigo-600" : "text-gray-400"}`}>
                          {fmtValor(s.valor)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {tab === "bar" && (
                <div className="flex flex-col gap-2">
                  {produtosBar.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      Nenhum produto no Bar.<br />
                      <span className="text-xs">Adicione produtos com tipo "Bar" no Estoque.</span>
                    </p>
                  ) : produtosBar.map((p) => {
                    const qtd = qtdBar[p.id] || 0;
                    return (
                      <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all
                        ${qtd > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
                        <div className="flex-1 min-w-0 mr-3">
                          <p className={`text-sm font-medium truncate ${qtd > 0 ? "text-amber-700" : "text-gray-700"}`}>{p.nome}</p>
                          <p className={`text-xs ${qtd > 0 ? "text-amber-500" : "text-gray-400"}`}>{fmtValor(p.preco_venda)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!bloqueado ? (
                            <>
                              <button
                                onClick={() => changeQtd(setQtdBar, p.id, -1)}
                                disabled={qtd === 0}
                                className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center font-bold hover:bg-gray-100 disabled:opacity-30 transition-colors text-base"
                              >−</button>
                              <span className={`w-5 text-center text-sm font-bold ${qtd > 0 ? "text-amber-600" : "text-gray-400"}`}>{qtd}</span>
                              <button
                                onClick={() => changeQtd(setQtdBar, p.id, 1)}
                                className="w-7 h-7 rounded-full border border-amber-300 bg-amber-50 text-amber-600 flex items-center justify-center font-bold hover:bg-amber-100 transition-colors text-base"
                              >+</button>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-amber-600">× {qtd}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === "loja" && (
                <div className="flex flex-col gap-2">
                  {produtosLoja.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">
                      Nenhum produto na Loja.<br />
                      <span className="text-xs">Adicione produtos com tipo "Loja" no Estoque.</span>
                    </p>
                  ) : produtosLoja.map((p) => {
                    const qtd = qtdLoja[p.id] || 0;
                    return (
                      <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all
                        ${qtd > 0 ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200"}`}>
                        <div className="flex-1 min-w-0 mr-3">
                          <p className={`text-sm font-medium truncate ${qtd > 0 ? "text-indigo-700" : "text-gray-700"}`}>{p.nome}</p>
                          <p className={`text-xs ${qtd > 0 ? "text-indigo-500" : "text-gray-400"}`}>{fmtValor(p.preco_venda)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!bloqueado ? (
                            <>
                              <button
                                onClick={() => changeQtd(setQtdLoja, p.id, -1)}
                                disabled={qtd === 0}
                                className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center font-bold hover:bg-gray-100 disabled:opacity-30 transition-colors text-base"
                              >−</button>
                              <span className={`w-5 text-center text-sm font-bold ${qtd > 0 ? "text-indigo-600" : "text-gray-400"}`}>{qtd}</span>
                              <button
                                onClick={() => changeQtd(setQtdLoja, p.id, 1)}
                                className="w-7 h-7 rounded-full border border-indigo-300 bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold hover:bg-indigo-100 transition-colors text-base"
                              >+</button>
                            </>
                          ) : (
                            <span className="text-sm font-bold text-indigo-600">× {qtd}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-4 pt-3 pb-4 shrink-0 flex flex-col gap-3">
              {/* Desconto */}
              {hasItems && !bloqueado && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex flex-col gap-2.5">
                  <p className="text-xs font-semibold text-orange-700">Desconto (opcional)</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {ALVOS_DESCONTO
                      .filter((a) => a.id === "total" || (a.id === "servicos" && totalServicos > 0) || (a.id === "bar" && totalBar > 0) || (a.id === "loja" && totalLoja > 0))
                      .map((a) => (
                        <button key={a.id} type="button"
                          onClick={() => setDesconto((d) => ({ ...d, alvo: a.id }))}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                            ${desconto.alvo === a.id ? "bg-orange-500 text-white" : "bg-white border border-orange-200 text-orange-600 hover:bg-orange-100"}`}
                        >{a.label}</button>
                      ))}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex border border-orange-200 rounded-lg overflow-hidden bg-white">
                      {[{ id: "percent", label: "%" }, { id: "fixed", label: "R$" }].map((t, i) => (
                        <button key={t.id} type="button"
                          onClick={() => setDesconto((d) => ({ ...d, tipo: t.id }))}
                          className={`px-3 py-1.5 text-xs font-bold transition-colors ${i > 0 ? "border-l border-orange-200" : ""}
                            ${desconto.tipo === t.id ? "bg-orange-500 text-white" : "text-orange-400 hover:bg-orange-50"}`}
                        >{t.label}</button>
                      ))}
                    </div>
                    <input
                      type="number" min="0" max={desconto.tipo === "percent" ? 100 : undefined} step="0.01"
                      value={desconto.valor}
                      onChange={(e) => setDesconto((d) => ({ ...d, valor: e.target.value }))}
                      placeholder={desconto.tipo === "percent" ? "0" : "0,00"}
                      className="flex-1 border border-orange-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200 bg-white"
                    />
                  </div>
                </div>
              )}

              {hasItems && (
                <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex flex-col gap-1">
                  {totalServicos > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Serviços ({servicosSel.size})</span>
                      <span className="font-medium text-gray-700">{fmtValor(totalServicos)}</span>
                    </div>
                  )}
                  {totalBar > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Bar 🍺</span>
                      <span className="font-medium text-gray-700">{fmtValor(totalBar)}</span>
                    </div>
                  )}
                  {totalLoja > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Loja 🛍️</span>
                      <span className="font-medium text-gray-700">{fmtValor(totalLoja)}</span>
                    </div>
                  )}
                  {valorDesconto > 0 && (
                    <>
                      <div className="flex justify-between text-xs text-gray-400 border-t border-gray-200 pt-1.5 mt-0.5">
                        <span>Subtotal</span><span>{fmtValor(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-medium text-orange-500">
                        <span>Desconto ({labelDesconto(desconto)})</span>
                        <span>−{fmtValor(valorDesconto)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm font-bold text-gray-800 border-t border-gray-200 pt-1.5 mt-0.5">
                    <span>Total</span>
                    <span>{fmtValor(total)}</span>
                  </div>
                </div>
              )}

              {!bloqueado && (
                <div className="grid grid-cols-3 gap-2">
                  {PAGAMENTOS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setFormaPagamento(p.id)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs transition-all
                        ${formaPagamento === p.id
                          ? "bg-indigo-500 border-indigo-500 text-white font-medium"
                          : "bg-white border-gray-200 text-gray-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-gray-600"
                        }`}
                    >
                      <span className="text-base">{p.emoji}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {bloqueado && formaPagamento && (
                <p className="text-xs text-center text-gray-400">
                  Pago via {PAGAMENTOS.find((p) => p.id === formaPagamento)?.label}
                </p>
              )}

              {erro && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  ⚠️ {erro}
                </div>
              )}

              {bloqueado ? (
                <button
                  onClick={() => setBloqueado(false)}
                  className="w-full border-2 border-indigo-300 text-indigo-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-50 transition-colors"
                >
                  ✏️ Editar comanda
                </button>
              ) : (
                <button
                  onClick={handleFinalizar}
                  disabled={finalizando || !hasItems}
                  className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {finalizando
                    ? "Fechando..."
                    : total > 0
                      ? `✅ Fechar — ${fmtValor(total)}${valorDesconto > 0 ? ` (−${fmtValor(valorDesconto)})` : ""}`
                      : "✅ Fechar Comanda"}
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
