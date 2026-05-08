import { useState, useEffect } from "react";
import { db } from "../../services/supabaseDb";
import { Scissors, Beer, ShoppingBag, QrCode, CreditCard, Banknote, AlertTriangle, Receipt, Crown, CheckCircle2, XCircle } from "lucide-react";

function fmtValor(v) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TABS = [
  { id: "servicos", Icon: Scissors,   label: "Srv"  },
  { id: "bar",      Icon: Beer,        label: "Bar"  },
  { id: "loja",     Icon: ShoppingBag, label: "Loja" },
];

const PAGAMENTOS = [
  { id: "pix",      label: "Pix" },
  { id: "debito",   label: "Déb" },
  { id: "credito",  label: "Cré" },
  { id: "dinheiro", label: "Din" },
];

export default function ComandaLateral({ evento, barbeiros = [], onFinalizar, onCancelar }) {
  const clienteNome = evento?.summary?.replace(/^✅\s*/, "").split(/[-—]/)[0].trim() || "cliente";

  const [tab, setTab] = useState("servicos");
  const [servicos, setServicos] = useState([]);
  const [produtosBar, setProdutosBar] = useState([]);
  const [produtosLoja, setProdutosLoja] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [servicosSel, setServicosSel] = useState(new Set());
  const [qtdBar, setQtdBar]   = useState({});
  const [qtdLoja, setQtdLoja] = useState({});
  const [formaPagamento, setFormaPagamento] = useState(null);
  const [barbeiroId, setBarbeiroId] = useState(null);

  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setCarregando(true);
    const barbSel = barbeiros.find((b) => b.gcal_color_id === evento?.colorId);
    if (barbSel) setBarbeiroId(barbSel.id);

    Promise.all([
      db.getServicos(),
      db.getProdutosByTipo("bar"),
      db.getProdutosByTipo("loja"),
    ])
      .then(([svcs, bar, loja]) => {
        setServicos(svcs.filter((s) => s.ativo));
        setProdutosBar(bar);
        setProdutosLoja(loja);
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [evento?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleServico = (id) =>
    setServicosSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const changeQtd = (setter, id, delta) =>
    setter((prev) => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      if (next === 0) { const { [id]: _, ...rest } = prev; return rest; }
      return { ...prev, [id]: next };
    });

  const totalServicos = servicos.filter((s) => servicosSel.has(s.id)).reduce((s, x) => s + Number(x.valor || 0), 0);
  const totalBar  = produtosBar.filter((p) => qtdBar[p.id]).reduce((s, p) => s + Number(p.preco_venda || 0) * qtdBar[p.id], 0);
  const totalLoja = produtosLoja.filter((p) => qtdLoja[p.id]).reduce((s, p) => s + Number(p.preco_venda || 0) * qtdLoja[p.id], 0);
  const total = totalServicos + totalBar + totalLoja;
  const hasItems = servicosSel.size > 0 || Object.keys(qtdBar).length > 0 || Object.keys(qtdLoja).length > 0;

  const handleFinalizar = async () => {
    if (!formaPagamento) return setErro("Selecione o pagamento.");
    setErro(null);
    setFinalizando(true);
    try {
      await onFinalizar(evento, {
        servicos: servicos.filter((s) => servicosSel.has(s.id)).map((s) => ({ id: s.id, nome: s.nome, valor: Number(s.valor) })),
        itens_bar: produtosBar.filter((p) => qtdBar[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdBar[p.id] })),
        itens_loja: produtosLoja.filter((p) => qtdLoja[p.id]).map((p) => ({ produto_id: p.id, nome: p.nome, preco_venda: Number(p.preco_venda || 0), quantidade: qtdLoja[p.id] })),
        valor_servicos: totalServicos,
        valor_bar: totalBar,
        valor_loja: totalLoja,
        valor_total: total,
        forma_pagamento: formaPagamento,
        barbeiroId,
      });
    } catch (e) {
      setErro(e.message);
      setFinalizando(false);
    }
  };

  const lista = tab === "servicos" ? null : tab === "bar" ? produtosBar : produtosLoja;
  const qtds  = tab === "bar" ? qtdBar : qtdLoja;
  const setter = tab === "bar" ? setQtdBar : setQtdLoja;
  const accentCls = tab === "bar" ? "text-amber-600 bg-amber-50" : "text-indigo-600 bg-indigo-50";
  const plusCls   = tab === "bar" ? "text-amber-500 hover:bg-amber-100" : "text-indigo-500 hover:bg-indigo-100";

  return (
    <div className="border-t border-indigo-100 mt-3 pt-3 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1"><Receipt size={11} strokeWidth={2.5} /> Comanda aberta</span>
          <p className="text-xs font-semibold text-gray-700 truncate leading-tight">{clienteNome}</p>
        </div>
        <button
          onClick={onCancelar}
          className="text-gray-300 hover:text-red-400 text-xs ml-2 transition-colors shrink-0 mt-0.5"
          title="Cancelar comanda"
        >✕</button>
      </div>

      {carregando ? (
        <p className="text-xs text-gray-400 animate-pulse py-2 text-center">Carregando...</p>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-1 rounded-lg text-[11px] font-medium transition-colors
                  ${tab === t.id ? "bg-indigo-500 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                <span className="inline-flex items-center gap-1"><t.Icon size={11} strokeWidth={2} />{t.label}</span>
              </button>
            ))}
          </div>

          {/* Items */}
          <div className="max-h-44 overflow-y-auto flex flex-col gap-0.5">
            {tab === "servicos" && (
              servicos.length === 0
                ? <p className="text-[11px] text-gray-400 text-center py-3">Nenhum serviço.</p>
                : servicos.map((s) => {
                  const sel = servicosSel.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleServico(s.id)}
                      className={`flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-left transition-colors
                        ${sel ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                    >
                      <span className={`w-3 h-3 rounded-full border shrink-0 flex items-center justify-center
                        ${sel ? "bg-indigo-500 border-indigo-500" : "border-gray-300"}`}>
                        {sel && <span className="text-white" style={{ fontSize: 7 }}>✓</span>}
                      </span>
                      <span className={`flex-1 text-[11px] truncate ${sel ? "text-indigo-700 font-medium" : "text-gray-600"}`}>
                        {s.nome}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        R${Number(s.valor || 0).toFixed(0)}
                      </span>
                    </button>
                  );
                })
            )}

            {tab !== "servicos" && (
              lista.length === 0
                ? <p className="text-[11px] text-gray-400 text-center py-3">Nenhum produto.</p>
                : lista.map((p) => {
                  const qtd = qtds[p.id] || 0;
                  return (
                    <div key={p.id} className={`flex items-center gap-1 px-1.5 py-1 rounded-lg ${qtd > 0 ? accentCls : ""}`}>
                      <span className="flex-1 text-[11px] text-gray-700 truncate">{p.nome}</span>
                      <button
                        onClick={() => changeQtd(setter, p.id, -1)}
                        disabled={qtd === 0}
                        className="w-5 h-5 text-gray-400 hover:text-gray-600 flex items-center justify-center rounded disabled:opacity-30 font-bold text-sm"
                      >−</button>
                      <span className={`w-4 text-center text-[11px] font-bold ${qtd > 0 ? "" : "text-gray-300"}`}>{qtd}</span>
                      <button
                        onClick={() => changeQtd(setter, p.id, 1)}
                        className={`w-5 h-5 flex items-center justify-center rounded font-bold text-sm ${plusCls}`}
                      >+</button>
                    </div>
                  );
                })
            )}
          </div>

          {/* Total */}
          {hasItems && (
            <div className="flex justify-between items-center bg-gray-50 rounded-lg px-2 py-1.5">
              <span className="text-[11px] text-gray-500">Total</span>
              <span className="text-sm font-bold text-gray-800">{fmtValor(total)}</span>
            </div>
          )}

          {/* Pagamento */}
          <div className="flex gap-1">
            {PAGAMENTOS.map((p) => (
              <button
                key={p.id}
                onClick={() => setFormaPagamento(p.id)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors border
                  ${formaPagamento === p.id
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : "border-gray-200 text-gray-400 hover:border-indigo-200 hover:text-gray-600"}`}
              >{p.label}</button>
            ))}
          </div>

          {erro && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertTriangle size={11} className="shrink-0" />{erro}</p>}

          <button
            onClick={handleFinalizar}
            disabled={finalizando || !hasItems}
            className="w-full bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60"
          >
            {finalizando ? "Fechando..." : total > 0 ? `Fechar — ${fmtValor(total)}` : "Fechar Comanda"}
          </button>
        </>
      )}
    </div>
  );
}
