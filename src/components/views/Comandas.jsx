import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";
import {
  Scissors, Beer, ShoppingBag,
  Crown, Receipt, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Pencil, Plus, ChevronLeft, Trash2, CheckCheck,
} from "lucide-react";
import { PageHeader, ChannelChip, StatusPill } from "../ui/DS";
import { fmtValor, fmtHora } from "../../utils/fmt";
import ClienteSelector from "./ClienteSelector";
import { calcularBeneficios, cicloAtual } from "../../services/beneficiosCalc";
import { finalizarComanda, parsearErroComanda } from "../../services/comandasService";

function fmtTempo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

import { PAGAMENTOS, ALVOS_DESCONTO, calcDesconto, labelDesconto } from "../../utils/desconto";

// ─── Full-page editor (2-column layout) ────────────────────────────────────
function ComandaEditor({ comanda, barbeiros, servicos, produtosBar, produtosLoja, onFinalizar, onRemover, onAutosave, assinaturaData, onBack }) {
  const [barbeiroId, setBarbeiroId] = useState(comanda.barbeiro_id ?? null);
  const [servicosSel, setServicosSel] = useState(() => {
    const s = new Set();
    (comanda.servicos ?? []).forEach((sv) => { if (sv.id) s.add(sv.id); });
    return s;
  });
  const [qtdBar, setQtdBar] = useState(() => {
    const q = {};
    (comanda.itens_bar ?? []).forEach((i) => { q[i.produto_id] = i.quantidade; });
    return q;
  });
  const [qtdLoja, setQtdLoja] = useState(() => {
    const q = {};
    (comanda.itens_loja ?? []).forEach((i) => { q[i.produto_id] = i.quantidade; });
    return q;
  });
  const [formaPagamento, setFormaPagamento] = useState(comanda.forma_pagamento ?? null);
  const [desconto, setDesconto] = useState(() => comanda.desconto ?? { tipo: "percent", valor: "", alvo: "total" });
  const [finalizando, setFinalizando] = useState(false);
  const [removendo, setRemovendo]     = useState(false);
  const [cancelando, setCancelando]   = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [erro, setErro] = useState(null);
  const [statusSalvo, setStatusSalvo] = useState("idle");
  const [eventos, setEventos] = useState([]);
  const isInitialRender = useRef(true);
  const finalizandoRef  = useRef(false);

  useEffect(() => {
    db.getEventosComanda(comanda.id).then(setEventos).catch(() => {});
  }, [comanda.id]);

  const [usoBeneficios, setUsoBeneficios] = useState([]);
  useEffect(() => {
    if (!assinaturaData?.id) { setUsoBeneficios([]); return; }
    db.getUsoBeneficios(assinaturaData.id, cicloAtual()).then(setUsoBeneficios).catch(console.error);
  }, [assinaturaData?.id]);

  const { beneficioDesconto, beneficiosAplicados, benefRegistros } = useMemo(() => {
    if (!assinaturaData) return { beneficioDesconto: 0, beneficiosAplicados: [], benefRegistros: [] };
    return calcularBeneficios({
      plano: assinaturaData.planos,
      assinatura: assinaturaData,
      servicosSelecionados: servicos.filter((s) => servicosSel.has(s.id)),
      itensLoja: produtosLoja.filter((p) => qtdLoja[p.id]).map((p) => ({ ...p, quantidade: qtdLoja[p.id] })),
      itensBar:  produtosBar.filter((p) => qtdBar[p.id]).map((p) => ({ ...p, quantidade: qtdBar[p.id] })),
      usoBeneficios,
    });
  }, [assinaturaData, servicos, servicosSel, produtosLoja, qtdLoja, produtosBar, qtdBar, usoBeneficios]);

  const beneficioDispPorServico = useMemo(() => {
    const usoMap = {};
    for (const uso of usoBeneficios) usoMap[uso.beneficio_id] = (usoMap[uso.beneficio_id] || 0) + uso.quantidade;
    const map = {};
    for (const b of assinaturaData?.planos?.beneficios ?? []) {
      if (!b.servico_id) continue;
      const usado = usoMap[b.id] || 0;
      const limite = b.limite_mes != null ? Number(b.limite_mes) : Infinity;
      if (usado < limite) map[String(b.servico_id)] = b;
    }
    return map;
  }, [assinaturaData, usoBeneficios]);

  // IDs de serviços cobertos gratuitamente pelo plano nesta comanda
  const idsViaPlano = useMemo(() => new Set(
    beneficiosAplicados
      .filter((b) => b.tipo === "servico_gratis")
      .map((b) => String(b.servico_id))
  ), [beneficiosAplicados]);

  // Array de serviços selecionados já com flag via_plano quando aplicável
  const servicosFinais = useMemo(() =>
    servicos
      .filter((s) => servicosSel.has(s.id))
      .map((s) => ({
        id: s.id, nome: s.nome, valor: Number(s.valor),
        ...(idsViaPlano.has(String(s.id)) ? { via_plano: true } : {}),
      })),
  [servicos, servicosSel, idsViaPlano]);

  const toggleServico = (id) =>
    setServicosSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const changeQtd = (setter, id, delta) =>
    setter((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });

  const totalServicos = servicos.filter((s) => servicosSel.has(s.id)).reduce((a, s) => a + Number(s.valor || 0), 0);
  const totalBar  = produtosBar.filter((p) => qtdBar[p.id]).reduce((a, p) => a + Number(p.preco_venda || 0) * qtdBar[p.id], 0);
  const totalLoja = produtosLoja.filter((p) => qtdLoja[p.id]).reduce((a, p) => a + Number(p.preco_venda || 0) * qtdLoja[p.id], 0);
  const subtotal  = totalServicos + totalBar + totalLoja;
  const valorDesconto = calcDesconto(desconto, totalServicos, totalBar, totalLoja);
  const total    = Math.max(0, subtotal - beneficioDesconto - valorDesconto);
  const hasItems = servicosSel.size > 0 || Object.keys(qtdBar).length > 0 || Object.keys(qtdLoja).length > 0;

  // ─── Autosave (debounce 600 ms) ─────────────────────────────────
  useEffect(() => {
    if (isInitialRender.current) { isInitialRender.current = false; return; }
    if (finalizando || removendo || cancelando) return;
    const timer = setTimeout(async () => {
      const payload = {
        servicos:   servicosFinais,
        itens_bar:  produtosBar.filter((p) => qtdBar[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdBar[p.id] })),
        itens_loja: produtosLoja.filter((p) => qtdLoja[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdLoja[p.id] })),
        valor_servicos: totalServicos, valor_bar: totalBar, valor_loja: totalLoja, valor_total: total,
        forma_pagamento: formaPagamento,
        desconto: valorDesconto > 0 ? { ...desconto, valor_calculado: valorDesconto } : null,
        beneficio_desconto: beneficioDesconto,
        beneficios_aplicados: beneficiosAplicados,
      };
      try {
        setStatusSalvo("saving");
        const result = await db.updateComanda(comanda.id, payload);
        if (result) { onAutosave?.(comanda.id, { ...payload, version: result.version }); setStatusSalvo("saved"); }
        else setStatusSalvo("idle");
      } catch (e) {
        console.error("Falha ao salvar rascunho da comanda:", e);
        setStatusSalvo("error");
      }
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicosSel, qtdBar, qtdLoja, formaPagamento, desconto.tipo, desconto.valor, desconto.alvo, beneficioDesconto, servicos, produtosBar, produtosLoja]);

  const handleFinalizar = async () => {
    if (!formaPagamento) return setErro("Selecione a forma de pagamento.");
    if (finalizandoRef.current) return;
    finalizandoRef.current = true;
    setFinalizando(true); setErro(null);
    try {
      await onFinalizar({
        servicos:   servicosFinais,
        itens_bar:  produtosBar.filter((p) => qtdBar[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdBar[p.id] })),
        itens_loja: produtosLoja.filter((p) => qtdLoja[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdLoja[p.id] })),
        valor_servicos: totalServicos, valor_bar: totalBar, valor_loja: totalLoja, valor_total: total,
        forma_pagamento: formaPagamento,
        desconto: valorDesconto > 0 ? { ...desconto, valor_calculado: valorDesconto } : null,
        barbeiro_id: barbeiroId,
        beneficio_desconto: beneficioDesconto, beneficios_aplicados: beneficiosAplicados, _benefRegistros: benefRegistros,
      });
    } catch (e) {
      setErro(parsearErroComanda(e.message));
      setFinalizando(false);
      finalizandoRef.current = false;
    }
  };

  const handleRemover = async () => {
    if (removendo) return;
    setRemovendo(true); setErro(null);
    try {
      await onRemover(motivoCancel || null);
    } catch (e) {
      console.error("[cancelar comanda]", e);
      setErro(e?.message || "Erro ao cancelar comanda.");
      setRemovendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft size={16} strokeWidth={2.2} /> Voltar
        </button>
        <div className="flex items-center gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Comanda #{comanda.id} · aberta {fmtHora(comanda.created_at)}
          </div>
          {statusSalvo !== "idle" && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full
              ${statusSalvo === "saving" ? "bg-gray-100 text-gray-500" : ""}
              ${statusSalvo === "saved"  ? "bg-green-50 text-green-600" : ""}
              ${statusSalvo === "error"  ? "bg-red-50 text-red-500"    : ""}`}>
              {statusSalvo === "saving" && "Salvando..."}
              {statusSalvo === "saved"  && "✓ Salvo"}
              {statusSalvo === "error"  && "Falha ao salvar"}
            </span>
          )}
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">

        {/* ── LEFT ── */}
        <div className="flex flex-col gap-4">

          {/* Client */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Cliente</div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                {comanda.cliente_nome?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900">{comanda.cliente_nome}</div>
                {assinaturaData && (
                  <div className="text-[11px] text-amber-600 font-semibold mt-0.5 flex items-center gap-1">
                    <Crown size={11} strokeWidth={2} />
                    Assinante {assinaturaData.planos?.nome}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Items list */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Itens</div>
            <div className="flex flex-col divide-y divide-gray-100 -mx-2">
              {servicos.filter((s) => servicosSel.has(s.id)).map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-2 py-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50 shrink-0">
                    <Scissors size={15} strokeWidth={2.2} className="text-indigo-700" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{s.nome}</div>
                    <div className="text-[11px] text-gray-500">{fmtValor(s.valor)}</div>
                  </div>
                  <div className="flex items-center border border-gray-200 rounded-lg shrink-0">
                    <button onClick={() => toggleServico(s.id)} className="w-7 h-7 text-gray-500 hover:bg-gray-100 rounded-l-lg flex items-center justify-center">−</button>
                    <span className="w-6 text-sm font-semibold text-gray-800 text-center tabular-nums">1</span>
                    <button disabled className="w-7 h-7 text-gray-300 rounded-r-lg flex items-center justify-center cursor-not-allowed">+</button>
                  </div>
                  <div className="text-sm font-bold text-gray-900 w-16 text-right tabular-nums shrink-0">{fmtValor(s.valor)}</div>
                  <button onClick={() => toggleServico(s.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
              {produtosBar.filter((p) => qtdBar[p.id]).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-2 py-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50 shrink-0">
                    <Beer size={15} strokeWidth={2.2} className="text-amber-700" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{p.nome}</div>
                    <div className="text-[11px] text-gray-500">{fmtValor(p.preco_venda)}</div>
                  </div>
                  <div className="flex items-center border border-gray-200 rounded-lg shrink-0">
                    <button onClick={() => changeQtd(setQtdBar, p.id, -1)} className="w-7 h-7 text-gray-500 hover:bg-gray-100 rounded-l-lg flex items-center justify-center">−</button>
                    <span className="w-6 text-sm font-semibold text-gray-800 text-center tabular-nums">{qtdBar[p.id]}</span>
                    <button onClick={() => changeQtd(setQtdBar, p.id, 1)} className="w-7 h-7 text-gray-500 hover:bg-gray-100 rounded-r-lg flex items-center justify-center">+</button>
                  </div>
                  <div className="text-sm font-bold text-gray-900 w-16 text-right tabular-nums shrink-0">{fmtValor(Number(p.preco_venda || 0) * qtdBar[p.id])}</div>
                  <button onClick={() => changeQtd(setQtdBar, p.id, -qtdBar[p.id])} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
              {produtosLoja.filter((p) => qtdLoja[p.id]).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-2 py-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 shrink-0">
                    <ShoppingBag size={15} strokeWidth={2.2} className="text-emerald-700" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{p.nome}</div>
                    <div className="text-[11px] text-gray-500">{fmtValor(p.preco_venda)}</div>
                  </div>
                  <div className="flex items-center border border-gray-200 rounded-lg shrink-0">
                    <button onClick={() => changeQtd(setQtdLoja, p.id, -1)} className="w-7 h-7 text-gray-500 hover:bg-gray-100 rounded-l-lg flex items-center justify-center">−</button>
                    <span className="w-6 text-sm font-semibold text-gray-800 text-center tabular-nums">{qtdLoja[p.id]}</span>
                    <button onClick={() => changeQtd(setQtdLoja, p.id, 1)} className="w-7 h-7 text-gray-500 hover:bg-gray-100 rounded-r-lg flex items-center justify-center">+</button>
                  </div>
                  <div className="text-sm font-bold text-gray-900 w-16 text-right tabular-nums shrink-0">{fmtValor(Number(p.preco_venda || 0) * qtdLoja[p.id])}</div>
                  <button onClick={() => changeQtd(setQtdLoja, p.id, -qtdLoja[p.id])} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
              {!hasItems && (
                <div className="px-2 py-6 text-center text-xs text-gray-400">Nenhum item ainda. Adicione abaixo.</div>
              )}
            </div>
          </div>

          {/* Add section */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Adicionar</div>
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Serviços</div>
                {servicos.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum serviço cadastrado.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {servicos.map((s) => {
                      const sel = servicosSel.has(s.id);
                      const benef = beneficioDispPorServico[String(s.id)];
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleServico(s.id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors
                            ${sel ? "bg-indigo-500 border-indigo-500 text-white" : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-100"}`}
                        >
                          {s.nome}
                          {benef ? (
                            <span className={`ml-1 ${sel ? "text-indigo-200" : "text-green-600"}`}>
                              {benef.tipo === "servico_gratis" ? "GRÁTIS" : `-${benef.percentual}%`}
                            </span>
                          ) : (
                            <span className={`ml-1 tabular-nums ${sel ? "text-indigo-200" : "text-indigo-400"}`}>{fmtValor(s.valor)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Bar</div>
                {produtosBar.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum produto no bar.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {produtosBar.map((p) => {
                      const qtd = qtdBar[p.id] || 0;
                      const semEstoque = p.quantidade != null && p.quantidade <= 0 && qtd === 0;
                      const maxAtingido = p.quantidade != null && (p.quantidade - qtd) <= 0 && qtd > 0;
                      return (
                        <button
                          key={p.id}
                          onClick={() => !semEstoque && !maxAtingido && changeQtd(setQtdBar, p.id, 1)}
                          disabled={semEstoque || maxAtingido}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-40
                            ${qtd > 0 ? "bg-amber-500 border-amber-500 text-white" : "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-100"}`}
                        >
                          {p.nome}
                          {qtd > 0
                            ? <span className="ml-1 text-amber-200">×{qtd}</span>
                            : <span className="ml-1 tabular-nums text-amber-400">{fmtValor(p.preco_venda)}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">Loja</div>
                {produtosLoja.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum produto na loja.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {produtosLoja.map((p) => {
                      const qtd = qtdLoja[p.id] || 0;
                      const semEstoque = p.quantidade != null && p.quantidade <= 0 && qtd === 0;
                      const maxAtingido = p.quantidade != null && (p.quantidade - qtd) <= 0 && qtd > 0;
                      return (
                        <button
                          key={p.id}
                          onClick={() => !semEstoque && !maxAtingido && changeQtd(setQtdLoja, p.id, 1)}
                          disabled={semEstoque || maxAtingido}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-40
                            ${qtd > 0 ? "bg-emerald-500 border-emerald-500 text-white" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-100"}`}
                        >
                          {p.nome}
                          {qtd > 0
                            ? <span className="ml-1 text-emerald-200">×{qtd}</span>
                            : <span className="ml-1 tabular-nums text-emerald-500">{fmtValor(p.preco_venda)}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Desconto manual */}
          {hasItems && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex flex-col gap-2.5">
              <p className="text-xs font-semibold text-orange-700">Desconto manual (opcional)</p>
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
        </div>

        {/* ── RIGHT ── */}
        <div className="flex flex-col gap-4">

          {/* Barbeiro */}
          {barbeiros.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Barbeiro</div>
              <select
                value={barbeiroId ?? ""}
                onChange={(e) => setBarbeiroId(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              >
                <option value="">— não definido —</option>
                {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            </div>
          )}

          {/* Assinante */}
          {assinaturaData && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
              <Crown size={15} strokeWidth={2} className="text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-amber-700">Assinante {assinaturaData.planos?.nome}</span>
              {(assinaturaData.planos?.beneficios ?? []).length > 0 && (
                <span className="ml-auto text-[10px] text-amber-500">
                  {assinaturaData.planos.beneficios.length} benefício{assinaturaData.planos.beneficios.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {/* Resumo */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Resumo</div>
            <div className="flex flex-col gap-2 text-sm">
              {totalServicos > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Serviços ({servicosSel.size})</span>
                  <span className="tabular-nums font-medium text-gray-700">{fmtValor(totalServicos)}</span>
                </div>
              )}
              {totalBar > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1"><Beer size={11} strokeWidth={2} />Bar</span>
                  <span className="tabular-nums font-medium text-gray-700">{fmtValor(totalBar)}</span>
                </div>
              )}
              {totalLoja > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1"><ShoppingBag size={11} strokeWidth={2} />Loja</span>
                  <span className="tabular-nums font-medium text-gray-700">{fmtValor(totalLoja)}</span>
                </div>
              )}
              {(beneficioDesconto > 0 || valorDesconto > 0) && (
                <div className="flex justify-between text-gray-400 text-xs border-t border-gray-100 pt-2 mt-1">
                  <span>Subtotal</span><span className="tabular-nums">{fmtValor(subtotal)}</span>
                </div>
              )}
              {beneficioDesconto > 0 && (
                <div className="flex justify-between text-xs font-medium text-green-600">
                  <span className="flex items-center gap-1"><Crown size={12} strokeWidth={2} />Benefícios</span>
                  <span className="tabular-nums">−{fmtValor(beneficioDesconto)}</span>
                </div>
              )}
              {valorDesconto > 0 && (
                <div className="flex justify-between text-xs font-medium text-orange-500">
                  <span>Desconto ({labelDesconto(desconto)})</span>
                  <span className="tabular-nums">−{fmtValor(valorDesconto)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-900 font-bold text-lg pt-2 border-t border-gray-100 mt-1">
                <span>Total</span>
                <span className="tabular-nums">{fmtValor(total)}</span>
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Forma de pagamento</div>
            <div className="grid grid-cols-2 gap-2">
              {PAGAMENTOS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFormaPagamento(p.id)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border transition-all text-sm
                    ${formaPagamento === p.id
                      ? "bg-indigo-500 border-indigo-500 text-white font-semibold"
                      : "bg-white border-gray-200 text-gray-600 hover:border-indigo-200 hover:bg-indigo-50/30"}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                    ${formaPagamento === p.id ? "bg-indigo-400" : "bg-gray-100"}`}>
                    <p.Icon size={15} strokeWidth={2} className={formaPagamento === p.id ? "text-white" : "text-gray-500"} />
                  </span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Erro (fora do bloco cancelar) */}
          {erro && !cancelando && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertTriangle size={13} className="inline shrink-0 mr-1 -mt-0.5" />{erro}
            </div>
          )}

          {/* Ações */}
          {cancelando ? (
            <div className="flex flex-col gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-700">Confirmar cancelamento</p>
              <input
                type="text" value={motivoCancel}
                onChange={(e) => setMotivoCancel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRemover()}
                placeholder="Motivo (opcional — ex: cliente desmarcou)"
                className="border border-red-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 bg-white"
                autoFocus
              />
              {erro && (
                <p className="text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg px-2 py-1">
                  <AlertTriangle size={13} className="inline shrink-0 mr-1 -mt-0.5" />{erro}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setCancelando(false); setMotivoCancel(""); setErro(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                >Voltar</button>
                <button
                  type="button" onClick={handleRemover} disabled={removendo}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
                >{removendo ? "Cancelando..." : "Confirmar cancelamento"}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleFinalizar} disabled={finalizando || !hasItems}
                className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {finalizando ? "Fechando..." : total > 0 ? `Fechar comanda · ${fmtValor(total)}` : "Fechar comanda"}
              </button>
              <button
                onClick={() => setCancelando(true)} disabled={removendo}
                className="w-full py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors disabled:opacity-50"
              >Cancelar comanda</button>
            </div>
          )}

          {/* Histórico */}
          {eventos.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Histórico</div>
              <div className="flex flex-col gap-1.5">
                {eventos.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5">
                      {ev.tipo === "criada"    && <Plus size={13} strokeWidth={2} className="text-indigo-400" />}
                      {ev.tipo === "fechada"   && <CheckCircle2 size={13} strokeWidth={2} className="text-green-500" />}
                      {ev.tipo === "cancelada" && <XCircle size={13} strokeWidth={2} className="text-red-400" />}
                      {!["criada","fechada","cancelada"].includes(ev.tipo) && <Pencil size={13} strokeWidth={2} className="text-gray-400" />}
                    </span>
                    <span className="flex-1 text-gray-600">{ev.descricao}</span>
                    <span className="shrink-0 text-gray-400 tabular-nums">{fmtTempo(ev.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Non-expandable comanda card ────────────────────────────────────────────
function ComandaCardGrid({ comanda, assinaturaData, barbeiros, onClick }) {
  const barbeiro = barbeiros.find((b) => b.id === comanda.barbeiro_id);
  const eventoGcal = comanda.evento_gcal;
  const horario = eventoGcal?.start?.dateTime ? fmtHora(eventoGcal.start.dateTime) : null;

  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-gray-200 rounded-2xl p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Comanda #{comanda.id}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="text-base font-semibold text-gray-900">{comanda.cliente_nome}</div>
            {assinaturaData && <ChannelChip channel="premium" label={assinaturaData.planos?.nome ?? "Premium"} size="sm" />}
          </div>
        </div>
        <StatusPill
          status={comanda.status ?? "aberto"}
          label={comanda.status === "em_andamento" ? "Em atendimento" : "Aberta"}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {comanda.valor_servicos > 0 && <ChannelChip size="sm" channel="servicos" label={fmtValor(comanda.valor_servicos)} />}
        {comanda.valor_bar      > 0 && <ChannelChip size="sm" channel="bar"      label={fmtValor(comanda.valor_bar)} />}
        {comanda.valor_loja     > 0 && <ChannelChip size="sm" channel="loja"     label={fmtValor(comanda.valor_loja)} />}
        {comanda.valor_servicos === 0 && comanda.valor_bar === 0 && comanda.valor_loja === 0 && (
          <span className="text-[11px] text-gray-400 italic">Sem itens</span>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="text-[11px] text-gray-500">
          {barbeiro
            ? `${barbeiro.nome}${horario ? ` · ${horario}` : ""}`
            : (horario ?? fmtTempo(comanda.created_at))}
        </div>
        <div className="text-sm font-bold text-gray-900 tabular-nums">{fmtValor(comanda.valor_total)}</div>
      </div>
    </button>
  );
}

// ─── Página principal ───────────────────────────────────────────────────────
export default function Comandas({ onAtendimentoFinalizado }) {
  const [aba, setAba]                     = useState("abertas"); // "abertas" | "fechadas"
  const [comandas, setComandas]           = useState([]);
  const [servicos, setServicos]           = useState([]);
  const [produtosBar, setProdutosBar]     = useState([]);
  const [produtosLoja, setProdutosLoja]   = useState([]);
  const [clientes, setClientes]           = useState([]);
  const [barbeiros, setBarbeiros]         = useState([]);
  const [assinaturasMap, setAssinaturasMap] = useState({});
  const [carregando, setCarregando]       = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [totalComandas, setTotalComandas] = useState(0);
  const paginaAtual = useRef(0);
  const [comandaAberta, setComandaAberta] = useState(null);
  const [criandoNova, setCriandoNova]     = useState(false);
  const [clienteSel, setClienteSel]       = useState(null);

  // ── Aba fechadas ─────────────────────────────────────────────────────────
  const [fechadas, setFechadas]               = useState([]);
  const [totalFechadas, setTotalFechadas]     = useState(0);
  const [carregandoFechadas, setCarregandoFechadas] = useState(false);
  const [carregandoMaisFechadas, setCarregandoMaisFechadas] = useState(false);
  const paginaFechadas = useRef(0);

  const carregarFechadas = useCallback(async () => {
    setCarregandoFechadas(true);
    paginaFechadas.current = 0;
    try {
      const { data, total } = await db.getComandasFechadas(0);
      setFechadas(data);
      setTotalFechadas(total);
    } catch { /* silently fail */ }
    finally { setCarregandoFechadas(false); }
  }, []);

  const carregarMaisFechadas = async () => {
    setCarregandoMaisFechadas(true);
    try {
      const next = paginaFechadas.current + 1;
      const { data } = await db.getComandasFechadas(next);
      paginaFechadas.current = next;
      setFechadas((prev) => [...prev, ...data]);
    } catch { /* silently fail */ }
    finally { setCarregandoMaisFechadas(false); }
  };

  useEffect(() => {
    if (aba === "fechadas" && fechadas.length === 0 && !carregandoFechadas) {
      carregarFechadas();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);
  const [barbeiroCriando, setBarbeiroCriando] = useState(null);
  const [salvandoNova, setSalvandoNova]   = useState(false);
  const [erroNova, setErroNova]           = useState(null);
  const [erro, setErro]                   = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    paginaAtual.current = 0;
    try {
      const [{ data: cmds, total }, svcs, bar, loja, cls, barbs, assinaturas] = await Promise.all([
        db.getComandasAbertas(0),
        db.getServicos(),
        db.getProdutosByTipo("bar"),
        db.getProdutosByTipo("loja"),
        db.getClientes(),
        db.getBarbeiros(),
        db.getAssinaturasAtivas().catch(() => []),
      ]);
      setComandas(cmds);
      setTotalComandas(total);
      setServicos(svcs.filter((s) => s.ativo));
      setProdutosBar(bar);
      setProdutosLoja(loja);
      setClientes(cls);
      setBarbeiros(barbs.filter((b) => b.ativo));
      const aMap = {};
      for (const a of assinaturas) if (a.cliente_id) aMap[a.cliente_id] = a;
      setAssinaturasMap(aMap);
    } catch (e) {
      setErro("Erro ao carregar comandas.");
      console.error(e);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarMais = async () => {
    setCarregandoMais(true);
    try {
      const nextPage = paginaAtual.current + 1;
      const { data: mais } = await db.getComandasAbertas(nextPage);
      paginaAtual.current = nextPage;
      setComandas((prev) => [...prev, ...mais]);
    } catch { /* silently fail */ }
    finally { setCarregandoMais(false); }
  };

  useEffect(() => { carregar(); }, [carregar]);

  const handleCriarNova = async () => {
    if (!clienteSel) return;
    setSalvandoNova(true);
    setErroNova(null);
    try {
      const payload = {
        cliente_nome: clienteSel.nome,
        ...(clienteSel.id ? { cliente_id: clienteSel.id } : {}),
        ...(barbeiroCriando ? { barbeiro_id: barbeiroCriando } : {}),
        status: "aberta",
        servicos: [], itens_bar: [], itens_loja: [],
        valor_servicos: 0, valor_bar: 0, valor_loja: 0, valor_total: 0,
      };
      const cmd = await db.criarComanda(payload);
      db.registrarEventoComanda(
        cmd.id, "criada",
        `Comanda criada para ${cmd.cliente_nome}`,
        { fonte: "avulsa", cliente_id: cmd.cliente_id ?? null, barbeiro_id: cmd.barbeiro_id ?? null }
      ).catch(() => {});
      setComandas((prev) => [cmd, ...prev]);
      setTotalComandas((prev) => prev + 1);
      setClienteSel(null);
      setBarbeiroCriando(null);
      setCriandoNova(false);
      setComandaAberta(cmd);
    } catch (e) {
      console.error(e);
      setErroNova(e?.message || "Erro ao criar comanda.");
    } finally {
      setSalvandoNova(false);
    }
  };

  const finalizandoIds = useRef(new Set());

  const handleFinalizar = async (comanda, editorData) => {
    if (finalizandoIds.current.has(comanda.id)) return;
    finalizandoIds.current.add(comanda.id);
    try {
      await finalizarComanda(comanda, editorData);
      setComandas((prev) => prev.filter((c) => c.id !== comanda.id));
      setTotalComandas((prev) => Math.max(0, prev - 1));
      setComandaAberta(null);
      onAtendimentoFinalizado?.();
    } finally {
      finalizandoIds.current.delete(comanda.id);
    }
  };

  const handleRemover = async (comanda, motivo = null) => {
    await db.deleteComanda(comanda.id, motivo);
    setComandas((prev) => prev.filter((c) => c.id !== comanda.id));
    setTotalComandas((prev) => Math.max(0, prev - 1));
    if (comandaAberta?.id === comanda.id) setComandaAberta(null);
  };

  const handleAutosave = useCallback((comandaId, payload) => {
    setComandas((prev) => prev.map((c) => (c.id === comandaId ? { ...c, ...payload } : c)));
    setComandaAberta((prev) => prev?.id === comandaId ? { ...prev, ...payload } : prev);
  }, []);

  // ── Full-page editor ─────────────────────────────────────────────────────
  if (comandaAberta) {
    return (
      <ComandaEditor
        comanda={comandaAberta}
        barbeiros={barbeiros}
        servicos={servicos}
        produtosBar={produtosBar}
        produtosLoja={produtosLoja}
        onFinalizar={(data) => handleFinalizar(comandaAberta, data)}
        onRemover={(motivo) => handleRemover(comandaAberta, motivo)}
        onAutosave={handleAutosave}
        assinaturaData={comandaAberta.cliente_id ? (assinaturasMap[comandaAberta.cliente_id] ?? null) : null}
        onBack={() => setComandaAberta(null)}
      />
    );
  }

  // ── Grid list ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Operação"
        title="Comandas"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={aba === "abertas" ? carregar : carregarFechadas}
              className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              title="Atualizar"
            >
              <RefreshCw size={15} strokeWidth={2} />
            </button>
            {aba === "abertas" && (
              <button
                onClick={() => { setCriandoNova(true); setClienteSel(null); }}
                className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Nova comanda avulsa
              </button>
            )}
          </div>
        }
      />

      {/* Tabs abertas / fechadas */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setAba("abertas")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === "abertas" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <Receipt size={14} strokeWidth={2} />
          Abertas {!carregando && totalComandas > 0 && <span className="ml-0.5 text-xs text-indigo-500 font-semibold">{totalComandas}</span>}
        </button>
        <button
          onClick={() => setAba("fechadas")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === "fechadas" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
        >
          <CheckCheck size={14} strokeWidth={2} />
          Fechadas {!carregandoFechadas && totalFechadas > 0 && <span className="ml-0.5 text-xs text-green-600 font-semibold">{totalFechadas}</span>}
        </button>
      </div>

      <AnimatePresence>
        {criandoNova && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-white border border-indigo-200 rounded-2xl px-5 py-4 flex flex-col gap-3"
          >
            <p className="text-sm font-medium text-gray-700">Nova comanda avulsa</p>
            <ClienteSelector
              clientes={clientes}
              value={clienteSel}
              onChange={(v) => { setClienteSel(v); setErroNova(null); }}
            />
            {barbeiros.length > 0 && (
              <select
                value={barbeiroCriando ?? ""}
                onChange={(e) => setBarbeiroCriando(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              >
                <option value="">Barbeiro (opcional)</option>
                {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
              </select>
            )}
            {erroNova && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                <AlertTriangle size={13} className="inline shrink-0 mr-1 -mt-0.5" />{erroNova}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setCriandoNova(false); setClienteSel(null); setBarbeiroCriando(null); setErroNova(null); }}
                className="px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-100 transition-colors"
              >Cancelar</button>
              <button
                onClick={handleCriarNova}
                disabled={salvandoNova || !clienteSel}
                className="flex-1 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
              >{salvandoNova ? "..." : "Criar comanda"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Aba Abertas ── */}
      {aba === "abertas" && (carregando ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-32 animate-pulse" />
          ))}
        </div>
      ) : erro ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
          <AlertTriangle size={13} className="inline shrink-0 mr-1 -mt-0.5" />{erro}
        </div>
      ) : comandas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white border border-gray-200 rounded-2xl px-5 py-12 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Receipt size={22} strokeWidth={1.5} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">Nenhuma comanda aberta</p>
          <p className="text-xs text-gray-400 mt-1">Inicie um atendimento na Agenda ou crie uma comanda avulsa.</p>
          <button
            onClick={() => { setCriandoNova(true); setClienteSel(null); }}
            className="mt-4 text-sm text-indigo-500 hover:text-indigo-600 font-medium"
          >+ Nova comanda avulsa</button>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {comandas.map((cmd) => (
              <ComandaCardGrid
                key={cmd.id}
                comanda={cmd}
                assinaturaData={cmd.cliente_id ? (assinaturasMap[cmd.cliente_id] ?? null) : null}
                barbeiros={barbeiros}
                onClick={() => setComandaAberta(cmd)}
              />
            ))}
          </div>
          {comandas.length < totalComandas && (
            <button
              onClick={carregarMais}
              disabled={carregandoMais}
              className="text-sm text-indigo-500 hover:text-indigo-600 disabled:opacity-50 py-2 text-center"
            >
              {carregandoMais ? "Carregando..." : `Ver mais (${totalComandas - comandas.length} restantes)`}
            </button>
          )}
        </>
      ))}

      {/* ── Aba Fechadas ── */}
      {aba === "fechadas" && (carregandoFechadas ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-16 animate-pulse" />
          ))}
        </div>
      ) : fechadas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white border border-gray-200 rounded-2xl px-5 py-12 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <CheckCheck size={22} strokeWidth={1.5} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">Nenhuma comanda fechada ainda</p>
        </motion.div>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1fr_110px_110px_90px] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100 bg-gray-50/60">
              <div>Cliente</div>
              <div>Barbeiro</div>
              <div className="text-right">Valor</div>
              <div className="text-right">Fechada</div>
            </div>
            {fechadas.map((cmd) => {
              const barbeiro = barbeiros.find((b) => b.id === cmd.barbeiro_id);
              const pagBadge = { pix: "Pix", debito: "Débito", credito: "Crédito", dinheiro: "Dinheiro" }[cmd.forma_pagamento];
              return (
                <div
                  key={cmd.id}
                  className="grid grid-cols-[1fr_110px_110px_90px] items-center px-5 py-3.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{cmd.cliente_nome ?? "—"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {cmd.valor_servicos > 0 && <span className="text-[10px] text-indigo-500">{fmtValor(cmd.valor_servicos)} serv.</span>}
                      {cmd.valor_bar      > 0 && <span className="text-[10px] text-amber-500">{fmtValor(cmd.valor_bar)} bar</span>}
                      {cmd.valor_loja     > 0 && <span className="text-[10px] text-emerald-500">{fmtValor(cmd.valor_loja)} loja</span>}
                      {pagBadge && <span className="text-[10px] text-gray-400">· {pagBadge}</span>}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{barbeiro?.nome ?? "—"}</div>
                  <div className="text-sm font-bold text-gray-900 text-right tabular-nums">{fmtValor(cmd.valor_total)}</div>
                  <div className="text-[11px] text-gray-400 text-right">{fmtTempo(cmd.updated_at)}</div>
                </div>
              );
            })}
          </div>
          {fechadas.length < totalFechadas && (
            <button
              onClick={carregarMaisFechadas}
              disabled={carregandoMaisFechadas}
              className="text-sm text-indigo-500 hover:text-indigo-600 disabled:opacity-50 py-2 text-center"
            >
              {carregandoMaisFechadas ? "Carregando..." : `Ver mais (${totalFechadas - fechadas.length} restantes)`}
            </button>
          )}
        </>
      ))}
    </div>
  );
}
