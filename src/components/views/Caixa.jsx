import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";

function fmtValor(v) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtHora(ts) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDataHora(ts) {
  const d = new Date(ts);
  const hoje = new Date();
  const eHoje =
    d.getDate() === hoje.getDate() &&
    d.getMonth() === hoje.getMonth() &&
    d.getFullYear() === hoje.getFullYear();
  return eHoje
    ? `Hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const TIPO_INFO = {
  abertura:        { label: "Abertura",  cor: "text-gray-500",    positivo: true  },
  entrada_comanda: { label: "Comanda",   cor: "text-emerald-600", positivo: true  },
  suprimento:      { label: "Suprimento",cor: "text-blue-600",    positivo: true  },
  sangria:         { label: "Sangria",   cor: "text-red-500",     positivo: false },
  ajuste:          { label: "Ajuste",    cor: "text-amber-600",   positivo: true  },
};

function calcSaldo(movimentos) {
  return movimentos.reduce((acc, m) => {
    const info = TIPO_INFO[m.tipo];
    return info?.positivo ? acc + Number(m.valor) : acc - Number(m.valor);
  }, 0);
}

// ─── Skeleton ────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-32" />
      <div className="h-32 bg-gray-200 rounded-2xl" />
      <div className="h-48 bg-gray-200 rounded-2xl" />
    </div>
  );
}

// ─── Modal genérico ──────────────────────────────────────────

function Modal({ titulo, children, onFechar }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
      >
        <h3 className="text-base font-semibold text-gray-800 mb-4">{titulo}</h3>
        {children}
      </motion.div>
    </motion.div>
  );
}

// ─── Modal: Sangria / Suprimento ────────────────────────────

function MovimentoModal({ tipo, valor, motivo, onValorChange, onMotivoChange, onConfirmar, onFechar, salvando }) {
  const isSangria = tipo === "sangria";
  return (
    <Modal
      titulo={isSangria ? "Registrar Sangria" : "Registrar Suprimento"}
      onFechar={onFechar}
    >
      <p className="text-xs text-gray-500 mb-4">
        {isSangria
          ? "Retirada de dinheiro físico do caixa."
          : "Adição de dinheiro ao caixa (reforço de troco, etc)."}
      </p>
      <label className="block text-xs font-medium text-gray-600 mb-1">Valor</label>
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={valor}
          onChange={(e) => onValorChange(e.target.value)}
          placeholder="0,00"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          autoFocus
        />
      </div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Motivo (opcional)</label>
      <input
        type="text"
        value={motivo}
        onChange={(e) => onMotivoChange(e.target.value)}
        placeholder={isSangria ? "Ex: depósito bancário" : "Ex: reforço de troco"}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
      <div className="flex gap-2">
        <button
          onClick={onFechar}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          disabled={salvando || !valor || Number(valor) <= 0}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            isSangria ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
          }`}
        >
          {salvando ? "Salvando..." : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Modal: Fechar Caixa ────────────────────────────────────

function FecharModal({ saldoEsperado, valorContado, onValorChange, onConfirmar, onFechar, fechando }) {
  const contado = Number(valorContado || 0);
  const diferenca = contado - saldoEsperado;
  const temDiferenca = Math.abs(diferenca) > 0.01;

  return (
    <Modal titulo="Fechar Caixa" onFechar={onFechar}>
      <div className="bg-gray-50 rounded-xl p-3 mb-4 flex justify-between">
        <span className="text-xs text-gray-500">Saldo esperado</span>
        <span className="text-sm font-semibold text-gray-700">{fmtValor(saldoEsperado)}</span>
      </div>

      <label className="block text-xs font-medium text-gray-600 mb-1">Valor contado fisicamente</label>
      <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={valorContado}
          onChange={(e) => onValorChange(e.target.value)}
          placeholder="0,00"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          autoFocus
        />
      </div>

      {valorContado !== "" && (
        <div className={`rounded-xl p-3 mb-4 flex justify-between ${
          !temDiferenca
            ? "bg-emerald-50"
            : diferenca > 0 ? "bg-blue-50" : "bg-red-50"
        }`}>
          <span className="text-xs font-medium text-gray-600">Diferença</span>
          <span className={`text-sm font-bold ${
            !temDiferenca
              ? "text-emerald-600"
              : diferenca > 0 ? "text-blue-600" : "text-red-600"
          }`}>
            {diferenca >= 0 ? "+" : ""}{fmtValor(diferenca)}
            {!temDiferenca && " ✓"}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onFechar}
          className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirmar}
          disabled={fechando || valorContado === ""}
          className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {fechando ? "Fechando..." : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}

// ─── Resumo pós-fechamento ────────────────────────────────────

function FechamentoResumo({ dados, onFechar }) {
  const snap = dados.snapshot ?? {};
  const diff = Number(dados.diferenca ?? 0);
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 border border-emerald-100">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-sm font-semibold text-gray-800">Caixa fechado</p>
          <p className="text-xs text-gray-400">Sessão #{dados.sessao_id}</p>
        </div>
        <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        {[
          ["Dinheiro entrou",  snap.total_dinheiro,    "text-emerald-600"],
          ["Sangrias",        snap.total_sangrias,    "text-red-500"    ],
          ["Suprimentos",     snap.total_suprimentos, "text-blue-600"   ],
          ["Pix",             snap.total_pix,         "text-gray-600"   ],
          ["Débito",          snap.total_debito,      "text-gray-600"   ],
          ["Crédito",         snap.total_credito,     "text-gray-600"   ],
        ].map(([label, val, cor]) => (
          <div key={label} className="flex justify-between bg-gray-50 rounded-xl px-3 py-2">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-xs font-semibold ${cor}`}>{fmtValor(val)}</span>
          </div>
        ))}
      </div>
      <div className={`rounded-xl px-4 py-2.5 flex justify-between ${
        Math.abs(diff) < 0.01 ? "bg-emerald-50" : diff > 0 ? "bg-blue-50" : "bg-red-50"
      }`}>
        <span className="text-xs font-medium text-gray-600">Diferença</span>
        <span className={`text-sm font-bold ${
          Math.abs(diff) < 0.01 ? "text-emerald-600" : diff > 0 ? "text-blue-600" : "text-red-600"
        }`}>
          {diff >= 0 ? "+" : ""}{fmtValor(diff)}
          {Math.abs(diff) < 0.01 && " ✓"}
        </span>
      </div>
    </div>
  );
}

// ─── Item de sessão histórica ─────────────────────────────────

function SessaoItem({ sessao }) {
  const snap = sessao.snapshot ?? {};
  const diff = Number(sessao.diferenca ?? 0);
  return (
    <div className="px-4 py-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-gray-600">
          {new Date(sessao.opened_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
          {" "}
          {fmtHora(sessao.opened_at)} — {sessao.closed_at ? fmtHora(sessao.closed_at) : "aberta"}
        </span>
        {sessao.closed_at && (
          <span className={`text-xs font-semibold ${
            Math.abs(diff) < 0.01 ? "text-emerald-600" : diff > 0 ? "text-blue-600" : "text-red-500"
          }`}>
            {diff >= 0 ? "+" : ""}{fmtValor(diff)}
          </span>
        )}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-400">
        <span>💵 {fmtValor(snap.total_dinheiro)}</span>
        <span>🔑 {fmtValor(snap.total_pix)}</span>
        <span>💳 {fmtValor((snap.total_debito ?? 0) + (snap.total_credito ?? 0))}</span>
        <span>{snap.qtd_comandas ?? 0} cmd</span>
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────

export default function Caixa() {
  const [loading, setLoading]           = useState(true);
  const [sessao, setSessao]             = useState(null);
  const [movimentos, setMovimentos]     = useState([]);
  const [historico, setHistorico]       = useState([]);
  const [erro, setErro]                 = useState(null);

  const [valorAbertura, setValorAbertura] = useState("");
  const [abrindo, setAbrindo]           = useState(false);

  const [modal, setModal]               = useState(null);
  const [modalValor, setModalValor]     = useState("");
  const [modalMotivo, setModalMotivo]   = useState("");
  const [salvandoModal, setSalvandoModal] = useState(false);

  const [showFechar, setShowFechar]     = useState(false);
  const [valorContado, setValorContado] = useState("");
  const [fechando, setFechando]         = useState(false);
  const [ultimoFechamento, setUltimoFechamento] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [s, hist] = await Promise.all([
        db.getSessaoCaixaAberta(),
        db.getSessoesCaixa(6),
      ]);
      setSessao(s);
      setHistorico(hist.filter((h) => h.status === "fechada").slice(0, 5));
      if (s) {
        const movs = await db.getMovimentosCaixa(s.id);
        setMovimentos(movs);
      } else {
        setMovimentos([]);
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const saldo = calcSaldo(movimentos);

  async function handleAbrirCaixa() {
    setAbrindo(true);
    try {
      await db.abrirCaixa(Number(valorAbertura || 0), null);
      setValorAbertura("");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setAbrindo(false);
    }
  }

  async function handleMovimento() {
    if (!modal || !sessao) return;
    const valor = Number(modalValor || 0);
    if (valor <= 0) { alert("Informe um valor maior que zero."); return; }
    setSalvandoModal(true);
    try {
      await db.registrarMovimentoCaixa(sessao.id, modal.tipo, valor, modalMotivo || null);
      setModal(null);
      setModalValor("");
      setModalMotivo("");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setSalvandoModal(false);
    }
  }

  async function handleFecharCaixa() {
    if (!sessao) return;
    setFechando(true);
    try {
      const resultado = await db.fecharCaixa(sessao.id, Number(valorContado || 0), null);
      setUltimoFechamento(resultado);
      setShowFechar(false);
      setValorContado("");
      await carregar();
    } catch (e) {
      alert(e.message);
    } finally {
      setFechando(false);
    }
  }

  if (loading) return <Skeleton />;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Caixa</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
          sessao
            ? "bg-emerald-100 text-emerald-700"
            : "bg-gray-100 text-gray-500"
        }`}>
          {sessao ? "Aberto" : "Fechado"}
        </span>
      </div>

      {erro && (
        <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm">{erro}</div>
      )}

      {/* Resumo do último fechamento */}
      <AnimatePresence>
        {ultimoFechamento && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <FechamentoResumo
              dados={ultimoFechamento}
              onFechar={() => setUltimoFechamento(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sem sessão aberta */}
      {!sessao && (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <p className="text-sm text-gray-500 mb-5">
            Nenhum caixa aberto. Informe o fundo inicial de troco para começar.
          </p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorAbertura}
                onChange={(e) => setValorAbertura(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAbrirCaixa()}
                placeholder="0,00"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
            </div>
            <button
              onClick={handleAbrirCaixa}
              disabled={abrindo}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {abrindo ? "Abrindo..." : "Abrir Caixa"}
            </button>
          </div>
        </div>
      )}

      {/* Sessão aberta */}
      {sessao && (
        <>
          {/* Cards de saldo e info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400 mb-1">Saldo em dinheiro</p>
              <p className="text-2xl font-bold text-gray-800 tabular-nums">{fmtValor(saldo)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400 mb-1">Aberto em</p>
              <p className="text-sm font-semibold text-gray-700">{fmtDataHora(sessao.opened_at)}</p>
              {sessao.aberto_por && (
                <p className="text-xs text-gray-400 mt-0.5">por {sessao.aberto_por}</p>
              )}
            </div>
          </div>

          {/* Lista de movimentos */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-600">Movimentos</h2>
              <span className="text-xs text-gray-400">{movimentos.length} registros</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {movimentos.length === 0 ? (
                <p className="text-xs text-gray-400 px-4 py-4 text-center">Nenhum movimento registrado ainda.</p>
              ) : (
                movimentos.map((m) => {
                  const info = TIPO_INFO[m.tipo] ?? { label: m.tipo, cor: "text-gray-500", positivo: true };
                  return (
                    <div key={m.id} className="flex items-center px-4 py-2.5 gap-3">
                      <span className="text-[11px] text-gray-400 w-11 shrink-0 tabular-nums">{fmtHora(m.created_at)}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${info.cor}`}>{info.label}</p>
                        {m.motivo && (
                          <p className="text-[11px] text-gray-400 truncate">{m.motivo}</p>
                        )}
                      </div>
                      <span className={`text-sm font-semibold tabular-nums ${
                        info.positivo ? "text-emerald-600" : "text-red-500"
                      }`}>
                        {info.positivo ? "+" : "−"}{fmtValor(m.valor)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => { setModal({ tipo: "sangria" }); setModalValor(""); setModalMotivo(""); }}
              className="py-3 bg-white hover:bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm font-medium transition-colors"
            >
              Sangria
            </button>
            <button
              onClick={() => { setModal({ tipo: "suprimento" }); setModalValor(""); setModalMotivo(""); }}
              className="py-3 bg-white hover:bg-blue-50 border border-blue-200 text-blue-600 rounded-xl text-sm font-medium transition-colors"
            >
              Suprimento
            </button>
            <button
              onClick={() => { setShowFechar(true); setValorContado(""); }}
              className="py-3 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              Fechar Caixa
            </button>
          </div>
        </>
      )}

      {/* Histórico de sessões fechadas */}
      {historico.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="text-sm font-semibold text-gray-600">Sessões anteriores</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {historico.map((s) => (
              <SessaoItem key={s.id} sessao={s} />
            ))}
          </div>
        </div>
      )}

      {/* Modal sangria/suprimento */}
      <AnimatePresence>
        {modal && (
          <MovimentoModal
            tipo={modal.tipo}
            valor={modalValor}
            motivo={modalMotivo}
            onValorChange={setModalValor}
            onMotivoChange={setModalMotivo}
            onConfirmar={handleMovimento}
            onFechar={() => setModal(null)}
            salvando={salvandoModal}
          />
        )}
      </AnimatePresence>

      {/* Modal fechar caixa */}
      <AnimatePresence>
        {showFechar && sessao && (
          <FecharModal
            saldoEsperado={saldo}
            valorContado={valorContado}
            onValorChange={setValorContado}
            onConfirmar={handleFecharCaixa}
            onFechar={() => setShowFechar(false)}
            fechando={fechando}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
