import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";
import { atualizarEvento } from "../../services/googleCalendar";
import ClienteSelector from "../ui/ClienteSelector";

function fmtValor(v) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function resumoItens(cmd) {
  const partes = [];
  (cmd.servicos ?? []).forEach((s) => partes.push(s.nome));
  (cmd.itens_bar ?? []).forEach((i) => partes.push(`${i.nome} (${i.quantidade})`));
  (cmd.itens_loja ?? []).forEach((i) => partes.push(`${i.nome} (${i.quantidade})`));
  return partes.join(", ") || null;
}

const TABS = [
  { id: "servicos", emoji: "✂️", label: "Serviços" },
  { id: "bar",     emoji: "🍺", label: "Bar" },
  { id: "loja",    emoji: "🛍️", label: "Loja" },
];
const PAGAMENTOS = [
  { id: "pix",     label: "Pix",     emoji: "🔑" },
  { id: "debito",  label: "Débito",  emoji: "💳" },
  { id: "credito", label: "Crédito", emoji: "💳" },
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

// ─── Editor inline de uma comanda ───────────────────────────────────
function ComandaEditor({ comanda, barbeiros, servicos, produtosBar, produtosLoja, onFinalizar, onRemover, onAutosave }) {
  const [tab, setTab] = useState("servicos");
  const [barbeiroId, setBarbeiroId] = useState(comanda.barbeiro_id ?? null);

  const [servicosSel, setServicosSel] = useState(() => {
    const s = new Set();
    (comanda.servicos ?? []).forEach((sv) => { if (sv.id) s.add(sv.id); });
    return s;
  });
  const [qtdBar, setQtdBar]   = useState(() => {
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
  const [erro, setErro] = useState(null);
  const [statusSalvo, setStatusSalvo] = useState("idle"); // idle | saving | saved | error
  const isInitialRender = useRef(true);

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
  const total    = Math.max(0, subtotal - valorDesconto);
  const hasItems = servicosSel.size > 0 || Object.keys(qtdBar).length > 0 || Object.keys(qtdLoja).length > 0;

  const lista  = tab === "bar" ? produtosBar : produtosLoja;
  const qtds   = tab === "bar" ? qtdBar      : qtdLoja;
  const setter = tab === "bar" ? setQtdBar   : setQtdLoja;

  // ─── Autosave (debounce 600 ms) ─────────────────────────────────
  // Persiste qualquer mudança de itens / desconto / pagamento na DB
  // enquanto a comanda está aberta, sem precisar finalizar.
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (finalizando || removendo) return;

    const timer = setTimeout(async () => {
      const payload = {
        servicos:   servicos.filter((s) => servicosSel.has(s.id))
                            .map((s) => ({ id: s.id, nome: s.nome, valor: Number(s.valor) })),
        itens_bar:  produtosBar.filter((p) => qtdBar[p.id])
                               .map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdBar[p.id] })),
        itens_loja: produtosLoja.filter((p) => qtdLoja[p.id])
                                .map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdLoja[p.id] })),
        valor_servicos: totalServicos,
        valor_bar:      totalBar,
        valor_loja:     totalLoja,
        valor_total:    total,
        forma_pagamento: formaPagamento,
        desconto: valorDesconto > 0 ? { ...desconto, valor_calculado: valorDesconto } : null,
      };
      try {
        setStatusSalvo("saving");
        await db.updateComanda(comanda.id, payload);
        onAutosave?.(comanda.id, payload);
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
      await onFinalizar({
        servicos:   servicos.filter((s) => servicosSel.has(s.id)).map((s) => ({ id: s.id, nome: s.nome, valor: Number(s.valor) })),
        itens_bar:  produtosBar.filter((p) => qtdBar[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdBar[p.id] })),
        itens_loja: produtosLoja.filter((p) => qtdLoja[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdLoja[p.id] })),
        valor_servicos: totalServicos,
        valor_bar:      totalBar,
        valor_loja:     totalLoja,
        valor_total:    total,
        forma_pagamento: formaPagamento,
        desconto: valorDesconto > 0 ? { ...desconto, valor_calculado: valorDesconto } : null,
        barbeiro_id: barbeiroId,
      });
    } catch (e) {
      setErro(e.message);
      setFinalizando(false);
    }
  };

  const handleRemover = async () => {
    if (!window.confirm("Cancelar esta comanda?")) return;
    setRemovendo(true);
    try { await onRemover(); } catch { setRemovendo(false); }
  };

  return (
    <div className="flex flex-col gap-4 pt-4 border-t border-gray-100 mt-3">
      {/* Barbeiro */}
      {barbeiros.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 shrink-0">✂️ Barbeiro:</span>
          <select
            value={barbeiroId ?? ""}
            onChange={(e) => setBarbeiroId(e.target.value ? Number(e.target.value) : null)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            <option value="">— não definido —</option>
            {barbeiros.map((b) => (
              <option key={b.id} value={b.id}>{b.nome}</option>
            ))}
          </select>
        </div>
      )}
      {/* Tabs + indicador autosave */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium transition-colors
                ${tab === t.id ? "bg-indigo-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
            >{t.emoji} {t.label}</button>
          ))}
        </div>
        {statusSalvo !== "idle" && (
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors
              ${statusSalvo === "saving" ? "bg-gray-100 text-gray-500" : ""}
              ${statusSalvo === "saved"  ? "bg-green-50 text-green-600" : ""}
              ${statusSalvo === "error"  ? "bg-red-50 text-red-500" : ""}
            `}
          >
            {statusSalvo === "saving" && "Salvando..."}
            {statusSalvo === "saved"  && "✓ Salvo"}
            {statusSalvo === "error"  && "⚠️ Falha ao salvar"}
          </span>
        )}
      </div>

      {/* Itens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {tab === "servicos" && (
          servicos.length === 0
            ? <p className="col-span-2 text-sm text-gray-400 text-center py-6">Nenhum serviço cadastrado.</p>
            : servicos.map((s) => {
              const sel = servicosSel.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleServico(s.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all
                    ${sel ? "bg-indigo-50 border-indigo-200" : "bg-white border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/40"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                      ${sel ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}>
                      {sel && <span className="text-white text-[10px]">✓</span>}
                    </div>
                    <span className={`text-sm font-medium ${sel ? "text-indigo-700" : "text-gray-700"}`}>{s.nome}</span>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${sel ? "text-indigo-600" : "text-gray-400"}`}>{fmtValor(s.valor)}</span>
                </button>
              );
            })
        )}

        {tab !== "servicos" && (
          lista.length === 0
            ? <p className="col-span-2 text-sm text-gray-400 text-center py-6">
                Nenhum produto. Adicione em Estoque → {tab === "bar" ? "Bar 🍺" : "Loja 🛍️"}.
              </p>
            : lista.map((p) => {
              const qtd  = qtds[p.id] || 0;
              const isBar = tab === "bar";
              const estoqueDisp = p.quantidade != null ? p.quantidade - qtd : Infinity;
              const semEstoque  = p.quantidade != null && p.quantidade <= 0 && qtd === 0;
              const maxAtingido = estoqueDisp <= 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all
                    ${semEstoque ? "bg-gray-50 border-gray-200 opacity-50" :
                      qtd > 0 ? (isBar ? "bg-amber-50 border-amber-200" : "bg-indigo-50 border-indigo-200") : "bg-white border-gray-200"}`}
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className={`text-sm font-medium truncate ${semEstoque ? "text-gray-400" : qtd > 0 ? (isBar ? "text-amber-700" : "text-indigo-700") : "text-gray-700"}`}>
                      {p.nome}
                      {semEstoque && <span className="ml-1.5 text-[10px] font-normal text-gray-400">sem estoque</span>}
                    </p>
                    <p className={`text-xs ${qtd > 0 ? (isBar ? "text-amber-500" : "text-indigo-500") : "text-gray-400"}`}>
                      {fmtValor(p.preco_venda)}
                      {p.quantidade != null && (
                        <span className={`ml-1.5 ${maxAtingido && qtd > 0 ? "text-red-400 font-medium" : "text-gray-300"}`}>
                          · estoque: {Math.max(0, p.quantidade - qtd)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => changeQtd(setter, p.id, -1)}
                      disabled={qtd === 0}
                      className="w-7 h-7 rounded-full border border-gray-200 text-gray-500 flex items-center justify-center font-bold hover:bg-gray-100 disabled:opacity-30 transition-colors"
                    >−</button>
                    <span className={`w-5 text-center text-sm font-bold ${qtd > 0 ? (isBar ? "text-amber-600" : "text-indigo-600") : "text-gray-400"}`}>{qtd}</span>
                    <button
                      onClick={() => changeQtd(setter, p.id, 1)}
                      disabled={semEstoque || maxAtingido}
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold transition-colors border disabled:opacity-30 disabled:cursor-not-allowed
                        ${isBar ? "border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100" : "border-indigo-300 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                    >+</button>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Desconto */}
      {hasItems && (
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

      {/* Resumo */}
      {hasItems && (
        <div className="bg-gray-50 rounded-xl px-4 py-3 flex flex-col gap-1">
          {totalServicos > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Serviços ({servicosSel.size})</span><span className="font-medium text-gray-700">{fmtValor(totalServicos)}</span></div>}
          {totalBar  > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Bar 🍺</span><span className="font-medium text-gray-700">{fmtValor(totalBar)}</span></div>}
          {totalLoja > 0 && <div className="flex justify-between text-xs text-gray-500"><span>Loja 🛍️</span><span className="font-medium text-gray-700">{fmtValor(totalLoja)}</span></div>}
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
            <span>Total</span><span>{fmtValor(total)}</span>
          </div>
        </div>
      )}

      {/* Pagamento */}
      <div className="grid grid-cols-3 gap-2">
        {PAGAMENTOS.map((p) => (
          <button
            key={p.id}
            onClick={() => setFormaPagamento(p.id)}
            className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-sm transition-all
              ${formaPagamento === p.id
                ? "bg-indigo-500 border-indigo-500 text-white font-medium"
                : "bg-white border-gray-200 text-gray-400 hover:border-indigo-300 hover:bg-indigo-50 hover:text-gray-600"}`}
          >
            <span className="text-base">{p.emoji}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {erro && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {erro}</div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleRemover}
          disabled={removendo}
          className="px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
        >{removendo ? "..." : "Cancelar comanda"}</button>
        <button
          onClick={handleFinalizar}
          disabled={finalizando || !hasItems}
          className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {finalizando ? "Fechando..." : total > 0 ? `✅ Fechar — ${fmtValor(total)}${valorDesconto > 0 ? ` (−${fmtValor(valorDesconto)})` : ""}` : "✅ Fechar Comanda"}
        </button>
      </div>
    </div>
  );
}

// ─── Card de comanda (colapsável) ──────────────────────────────────
function ComandaCard({ comanda, aberta, onToggle, barbeiros, servicos, produtosBar, produtosLoja, onFinalizar, onRemover, onAutosave }) {
  const eventoGcal = comanda.evento_gcal;
  const horario = eventoGcal?.start?.dateTime
    ? `${fmtHora(eventoGcal.start.dateTime)} – ${fmtHora(eventoGcal.end?.dateTime)}`
    : null;
  const resumo = resumoItens(comanda);
  const barbeiro = barbeiros.find((b) => b.id === comanda.barbeiro_id);

  return (
    <motion.div
      layout
      className={`bg-white border rounded-2xl overflow-hidden transition-shadow ${aberta ? "border-indigo-200 shadow-md" : "border-gray-200"}`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xl shrink-0">🧾</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{comanda.cliente_nome}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">
            {barbeiro && <span className="mr-2 text-indigo-400 font-medium">✂️ {barbeiro.nome}</span>}
            {horario && <span className="mr-2">{horario}</span>}
            {resumo
              ? <span className="text-gray-500">{resumo}</span>
              : <span className="italic">Sem itens</span>
            }
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {comanda.valor_total > 0 && (
            <span className="text-sm font-bold text-indigo-600">{fmtValor(comanda.valor_total)}</span>
          )}
          <span className="text-gray-300 text-sm">{aberta ? "▾" : "▸"}</span>
        </div>
      </button>

      {/* Editor expandido */}
      <AnimatePresence>
        {aberta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="px-5 pb-5 overflow-hidden"
          >
            <ComandaEditor
              comanda={comanda}
              barbeiros={barbeiros}
              servicos={servicos}
              produtosBar={produtosBar}
              produtosLoja={produtosLoja}
              onFinalizar={onFinalizar}
              onRemover={onRemover}
              onAutosave={onAutosave}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Página principal ───────────────────────────────────────────────
export default function Comandas({ onAtendimentoFinalizado }) {
  const [comandas, setComandas]           = useState([]);
  const [servicos, setServicos]           = useState([]);
  const [produtosBar, setProdutosBar]     = useState([]);
  const [produtosLoja, setProdutosLoja]   = useState([]);
  const [clientes, setClientes]           = useState([]);
  const [barbeiros, setBarbeiros]         = useState([]);
  const [carregando, setCarregando]       = useState(true);
  const [expandida, setExpandida]         = useState(null);
  const [criandoNova, setCriandoNova]     = useState(false);
  const [clienteSel, setClienteSel]       = useState(null);
  const [barbeiroCriando, setBarbeiroCriando] = useState(null);
  const [salvandoNova, setSalvandoNova]   = useState(false);
  const [erroNova, setErroNova]           = useState(null);
  const [erro, setErro]                   = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [cmds, svcs, bar, loja, cls, barbs] = await Promise.all([
        db.getComandasAbertas(),
        db.getServicos(),
        db.getProdutosByTipo("bar"),
        db.getProdutosByTipo("loja"),
        db.getClientes(),
        db.getBarbeiros(),
      ]);
      setComandas(cmds);
      setServicos(svcs.filter((s) => s.ativo));
      setProdutosBar(bar);
      setProdutosLoja(loja);
      setClientes(cls);
      setBarbeiros(barbs.filter((b) => b.ativo));
    } catch (e) {
      setErro("Erro ao carregar comandas.");
      console.error(e);
    } finally {
      setCarregando(false);
    }
  }, []);

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
        servicos: [],
        itens_bar: [],
        itens_loja: [],
        valor_servicos: 0,
        valor_bar: 0,
        valor_loja: 0,
        valor_total: 0,
      };
      const cmd = await db.criarComanda(payload);
      setComandas((prev) => [cmd, ...prev]);
      setClienteSel(null);
      setBarbeiroCriando(null);
      setCriandoNova(false);
      setExpandida(cmd.id);
    } catch (e) {
      console.error(e);
      setErroNova(e?.message || "Erro ao criar comanda.");
    } finally {
      setSalvandoNova(false);
    }
  };

  const handleFinalizar = async (comanda, editorData) => {
    const { servicos: svcs, itens_bar, itens_loja, valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento, desconto, barbeiro_id } = editorData;

    await db.baixarEstoqueComanda(itens_bar, itens_loja);

    await db.updateComanda(comanda.id, {
      servicos: svcs,
      itens_bar,
      itens_loja,
      valor_servicos,
      valor_bar,
      valor_loja,
      valor_total,
      forma_pagamento,
      desconto: desconto ?? null,
      ...(barbeiro_id != null ? { barbeiro_id } : {}),
      status: "fechada",
    });

    const barbPayload = barbeiro_id != null ? { barbeiro_id } : {};

    if (comanda.gcal_event_id) {
      const ev = comanda.evento_gcal;
      const tituloFinal = ev?.summary
        ? (ev.summary.startsWith("✅") ? ev.summary : `✅ ${ev.summary}`)
        : `✅ ${comanda.cliente_nome}`;

      await Promise.allSettled([
        db.addAtendimento({
          gcal_event_id: comanda.gcal_event_id,
          data_hora: ev?.start?.dateTime ? new Date(ev.start.dateTime).toISOString() : new Date().toISOString(),
          cliente_nome: comanda.cliente_nome,
          ...(comanda.cliente_id ? { cliente_id: comanda.cliente_id } : {}),
          ...barbPayload,
          servicos: svcs,
          valor_total,
          forma_pagamento,
          status: "concluido",
          observacoes: ev?.description || "",
        }),
        ...(ev
          ? [atualizarEvento(comanda.gcal_event_id, {
              summary: tituloFinal,
              start: ev.start,
              end: ev.end,
              description: ev.description,
              colorId: "2",
            })]
          : []),
      ]);
    } else {
      await db.addAtendimento({
        data_hora: new Date().toISOString(),
        cliente_nome: comanda.cliente_nome,
        ...(comanda.cliente_id ? { cliente_id: comanda.cliente_id } : {}),
        ...barbPayload,
        servicos: svcs,
        valor_total,
        forma_pagamento,
        status: "concluido",
      });
    }

    setComandas((prev) => prev.filter((c) => c.id !== comanda.id));
    setExpandida(null);
    onAtendimentoFinalizado?.();
  };

  const handleRemover = async (comanda) => {
    await db.deleteComanda(comanda.id);
    setComandas((prev) => prev.filter((c) => c.id !== comanda.id));
    if (expandida === comanda.id) setExpandida(null);
  };

  // Mantém o card colapsado em sincronia com os autosaves do editor
  const handleAutosave = useCallback((comandaId, payload) => {
    setComandas((prev) => prev.map((c) => (c.id === comandaId ? { ...c, ...payload } : c)));
  }, []);

  return (
    <div className="w-full flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-xl font-semibold text-gray-800">Comandas</h2>
          {!carregando && (
            <p className="text-xs text-gray-400 mt-0.5">
              {comandas.length === 0 ? "Nenhuma comanda aberta" : `${comandas.length} aberta${comandas.length !== 1 ? "s" : ""}`}
            </p>
          )}
        </motion.div>
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="text-xs text-gray-400 hover:text-indigo-500 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
          >🔄</button>
          <button
            onClick={() => { setCriandoNova(true); setClienteSel(null); }}
            className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >+ Nova comanda</button>
        </div>
      </div>

      {/* Nova comanda */}
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
                <option value="">✂️ Barbeiro (opcional)</option>
                {barbeiros.map((b) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            )}
            {erroNova && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {erroNova}</p>
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

      {/* Lista */}
      {carregando ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-20 animate-pulse" />
          ))}
        </div>
      ) : erro ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">⚠️ {erro}</div>
      ) : comandas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white border border-gray-200 rounded-2xl px-5 py-12 text-center"
        >
          <div className="text-4xl mb-3">🧾</div>
          <p className="text-sm font-medium text-gray-500">Nenhuma comanda aberta</p>
          <p className="text-xs text-gray-400 mt-1">
            Inicie um atendimento na Agenda ou crie uma comanda avulsa.
          </p>
          <button
            onClick={() => { setCriandoNova(true); setClienteSel(null); }}
            className="mt-4 text-sm text-indigo-500 hover:text-indigo-600 font-medium"
          >+ Nova comanda avulsa</button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-3">
          {comandas.map((cmd) => (
            <ComandaCard
              key={cmd.id}
              comanda={cmd}
              aberta={expandida === cmd.id}
              onToggle={() => setExpandida(expandida === cmd.id ? null : cmd.id)}
              barbeiros={barbeiros}
              servicos={servicos}
              produtosBar={produtosBar}
              produtosLoja={produtosLoja}
              onFinalizar={(data) => handleFinalizar(cmd, data)}
              onRemover={() => handleRemover(cmd)}
              onAutosave={handleAutosave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
