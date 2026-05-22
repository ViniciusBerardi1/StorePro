import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";
import { Users, AlertTriangle, Copy, Check, Percent } from "lucide-react";
import { PageHeader } from "../ui/DS";

export const GCAL_CORES = {
  "1":  { label: "Lavanda",   hex: "#7986CB" },
  "2":  { label: "Esmeralda", hex: "#33B679" },
  "3":  { label: "Violeta",   hex: "#8E24AA" },
  "4":  { label: "Coral",     hex: "#E67C73" },
  "5":  { label: "Âmbar",     hex: "#F6BF26" },
  "6":  { label: "Terracota", hex: "#F4511E" },
  "7":  { label: "Ciano",     hex: "#039BE5" },
  "8":  { label: "Grafite",   hex: "#616161" },
  "9":  { label: "Safira",    hex: "#3F51B5" },
  "10": { label: "Floresta",  hex: "#0B8043" },
  "11": { label: "Carmim",    hex: "#D50000" },
};

function BarbeiroForm({ barbeiro, coresEmUso = [], onSalvar, onFechar }) {
  const [form, setForm] = useState({
    nome: barbeiro?.nome ?? "",
    gcal_color_id: barbeiro?.gcal_color_id ?? "9",
    codigo_acesso: barbeiro?.codigo_acesso ?? "",
    comissoes: {
      servico:   barbeiro?.comissoes?.servico   ?? "",
      adicional: barbeiro?.comissoes?.adicional ?? "",
      produto:   barbeiro?.comissoes?.produto   ?? "",
    },
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const setComissao = (campo) => (e) => {
    const raw = e.target.value;
    setForm((f) => ({ ...f, comissoes: { ...f.comissoes, [campo]: raw } }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return setErro("Informe o nome do barbeiro.");
    if (coresEmUso.includes(form.gcal_color_id))
      return setErro("Esta cor já está em uso por outro barbeiro.");
    if (form.codigo_acesso && !/^\d{4,10}$/.test(form.codigo_acesso))
      return setErro("Código de acesso deve ter 4 a 10 dígitos numéricos.");

    const toNum = (v) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : Math.min(100, Math.max(0, n)); };
    const comissoes = {
      servico:   toNum(form.comissoes.servico),
      adicional: toNum(form.comissoes.adicional),
      produto:   toNum(form.comissoes.produto),
    };

    setErro(null);
    setSalvando(true);
    try {
      await onSalvar({ ...barbeiro, ...form, nome: form.nome.trim(), comissoes });
    } catch (e) {
      const msg = e?.message ?? "";
      if (msg.includes("23505") || msg.includes("unique") || msg.includes("codigo_acesso")) {
        setErro("Este código já está em uso por outro barbeiro. Escolha um diferente.");
      } else {
        setErro(msg || "Erro ao salvar. Tente novamente.");
      }
    } finally {
      setSalvando(false);
    }
  };

  const corAtual = GCAL_CORES[form.gcal_color_id];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-800 text-base">
            {barbeiro ? "Editar barbeiro" : "Novo barbeiro"}
          </h3>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Nome *</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: João Silva"
              required
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Cor na agenda</label>
            <div className="grid grid-cols-6 gap-2">
              {Object.entries(GCAL_CORES).map(([id, { label, hex }]) => {
                const emUso = coresEmUso.includes(id);
                const selecionada = form.gcal_color_id === id;
                return (
                  <div key={id} className="relative flex items-center justify-center">
                    <button
                      type="button"
                      title={emUso ? `${label} — em uso` : label}
                      disabled={emUso}
                      onClick={() => setForm((f) => ({ ...f, gcal_color_id: id }))}
                      className={`w-9 h-9 rounded-full transition-all ${
                        selecionada
                          ? "ring-2 ring-offset-2 ring-gray-400 scale-110"
                          : emUso
                          ? "opacity-30 cursor-not-allowed"
                          : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                    {emUso && (
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-white text-[10px] font-bold drop-shadow">✕</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: corAtual?.hex }}
              />
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">{corAtual?.label}</span>
                {coresEmUso.includes(form.gcal_color_id) && (
                  <span className="ml-1.5 text-red-500">· em uso</span>
                )}
              </p>
              {coresEmUso.length > 0 && (
                <span className="ml-auto text-[10px] text-gray-400">
                  {coresEmUso.length} de {Object.keys(GCAL_CORES).length} em uso
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Código de acesso do portal{" "}
              <span className="text-gray-400 font-normal">(4–10 dígitos)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={form.codigo_acesso}
              onChange={(e) => setForm((f) => ({ ...f, codigo_acesso: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
              placeholder="Ex: 1234"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Usado pelo barbeiro para entrar em <span className="font-medium">/barbeiro</span>
            </p>
          </div>

          {/* Comissões */}
          <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl px-4 py-3 flex flex-col gap-3">
            <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
              <Percent size={12} strokeWidth={2.5} />Comissões (%)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { campo: "servico",   label: "Serviço" },
                { campo: "adicional", label: "Adicional" },
                { campo: "produto",   label: "Produto" },
              ].map(({ campo, label }) => (
                <div key={campo}>
                  <label className="text-[10px] font-medium text-gray-500 mb-1 block">{label}</label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={form.comissoes[campo]}
                      onChange={setComissao(campo)}
                      placeholder="—"
                      className="w-full border border-gray-200 rounded-xl pl-3 pr-6 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-indigo-400">Deixe em branco para usar a regra padrão da loja.</p>
          </div>

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertTriangle size={13} className="inline shrink-0 mr-1 -mt-0.5" />{erro}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function Barbeiros() {
  const [barbeiros, setBarbeiros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [erro, setErro] = useState(null);
  const [copiadoId, setCopiadoId] = useState(null);

  const copiarCodigo = useCallback((id, codigo) => {
    navigator.clipboard.writeText(codigo).then(() => {
      setCopiadoId(id);
      setTimeout(() => setCopiadoId(null), 1800);
    });
  }, []);

  const carregar = async () => {
    try {
      const data = await db.getBarbeiros();
      setBarbeiros(data);
    } catch (e) {
      setErro("Erro ao carregar barbeiros.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const handleSalvar = async (dados) => {
    if (dados.id) {
      await db.updateBarbeiro(dados);
    } else {
      await db.addBarbeiro(dados);
    }
    setShowForm(false);
    setEditando(null);
    await carregar();
  };

  const handleDeletar = async (id) => {
    await db.deleteBarbeiro(id);
    setConfirmandoId(null);
    await carregar();
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Cadastros"
        title="Equipe"
        action={
          <button
            onClick={() => { setEditando(null); setShowForm(true); }}
            className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            Novo barbeiro
          </button>
        }
      />

      {erro && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle size={13} className="inline shrink-0 mr-1 -mt-0.5" />{erro}
        </div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center py-20 text-sm text-gray-400 animate-pulse">
          Carregando...
        </div>
      ) : barbeiros.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white border border-gray-200 rounded-2xl p-10 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Users size={22} strokeWidth={1.5} className="text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm mb-4">Nenhum barbeiro cadastrado ainda.</p>
          <button
            onClick={() => { setEditando(null); setShowForm(true); }}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
          >
            + Cadastrar primeiro barbeiro
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-3">
          {barbeiros.map((b) => {
            const cor = GCAL_CORES[b.gcal_color_id] ?? GCAL_CORES["9"];
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-center gap-4"
              >
                <div
                  className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-sm"
                  style={{ backgroundColor: cor.hex }}
                >
                  {b.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm">{b.nome}</p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cor.hex }}
                    />
                    {cor.label}
                    {b.codigo_acesso ? (
                      <>
                        <span className="text-gray-200">·</span>
                        <button
                          onClick={() => copiarCodigo(b.id, b.codigo_acesso)}
                          title="Clique para copiar o código do portal"
                          className="inline-flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 rounded-md px-1.5 py-0.5 font-mono text-xs transition-colors"
                        >
                          {copiadoId === b.id ? (
                            <>
                              <Check size={10} className="text-green-500" />
                              <span className="text-green-600 not-italic text-[10px]">copiado</span>
                            </>
                          ) : (
                            <>
                              <span>{b.codigo_acesso}</span>
                              <Copy size={10} className="opacity-50" />
                            </>
                          )}
                        </button>
                        <span className="text-[10px] text-gray-300">portal /barbeiro</span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-amber-500 text-[10px]">sem código de acesso</span>
                      </>
                    )}
                  </p>
                  {/* Badges de comissão */}
                  {b.comissoes && Object.values(b.comissoes).some((v) => v != null) && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {[
                        { key: "servico",   label: "Serv." },
                        { key: "adicional", label: "Adic." },
                        { key: "produto",   label: "Prod." },
                      ].map(({ key, label }) =>
                        b.comissoes[key] != null ? (
                          <span key={key} className="inline-flex items-center gap-0.5 text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md px-1.5 py-0.5 font-medium">
                            {label} {b.comissoes[key]}%
                          </span>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setEditando(b); setShowForm(true); }}
                    className="text-xs text-gray-400 hover:text-indigo-500 px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setConfirmandoId(b.id)}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal de confirmação */}
      <AnimatePresence>
        {confirmandoId && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-xl text-center"
            >
              <p className="text-sm text-gray-700 mb-4">
                Remover este barbeiro? Os atendimentos já registrados não serão afetados.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmandoId(null)}
                  className="flex-1 border border-gray-200 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeletar(confirmandoId)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-xl text-sm font-medium"
                >
                  Remover
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <BarbeiroForm
            barbeiro={editando}
            coresEmUso={barbeiros
              .filter((b) => b.id !== editando?.id)
              .map((b) => b.gcal_color_id)}
            onSalvar={handleSalvar}
            onFechar={() => { setShowForm(false); setEditando(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
