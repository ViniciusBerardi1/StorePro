import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";

function fmtValor(v) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ServicoForm({ servico, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    nome: servico?.nome ?? "",
    valor: servico?.valor ?? "",
    duracao_minutos: servico?.duracao_minutos ?? 30,
    ativo: servico?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const valor = parseFloat(String(form.valor).replace(",", "."));
    if (!form.nome.trim()) return setErro("Informe o nome do serviço.");
    if (isNaN(valor) || valor < 0) return setErro("Informe um valor válido.");
    setErro(null);
    setSalvando(true);
    try {
      await onSalvar({ ...form, valor });
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

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
            {servico ? "Editar serviço" : "Novo serviço"}
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
              onChange={set("nome")}
              placeholder="Ex: Sobrancelha, Corte, Hidratação..."
              required
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Valor (R$) *</label>
            <input
              type="number"
              value={form.valor}
              onChange={set("valor")}
              placeholder="0,00"
              min="0"
              step="0.01"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Duração estimada</label>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {[15, 30, 45, 60, 90, 120].map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, duracao_minutos: min }))}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
                    ${form.duracao_minutos === min ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >{min < 60 ? `${min}min` : `${min / 60}h`}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={form.duracao_minutos}
                onChange={(e) => setForm((f) => ({ ...f, duracao_minutos: Number(e.target.value) }))}
                min="5"
                step="5"
                className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <span className="text-xs text-gray-400">minutos</span>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={set("ativo")}
              className="w-4 h-4 accent-indigo-500"
            />
            <span className="text-sm text-gray-600">Serviço ativo</span>
          </label>

          {erro && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              ⚠️ {erro}
            </div>
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

export default function Servicos() {
  const [servicos, setServicos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [erro, setErro] = useState(null);
  const [toast, setToast] = useState(null);

  const carregar = async () => {
    try {
      setServicos(await db.getServicos());
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSalvar = async (form) => {
    if (editando) {
      // Espera o banco confirmar antes de fechar — evita duplicatas
      try {
        await db.updateServico({ ...editando, ...form });
        setServicos((prev) => prev.map((s) =>
          s.id === editando.id ? { ...editando, ...form } : s
        ));
        setToast("Serviço atualizado!");
        setShowForm(false);
        setEditando(null);
      } catch (e) {
        // Propaga para o form mostrar o erro sem fechar
        throw e;
      }
    } else {
      // Para novo precisa esperar o ID do banco
      try {
        const novo = await db.addServico(form);
        setServicos((prev) => [...prev, novo]);
        setToast("Serviço criado!");
        setShowForm(false);
        setEditando(null);
      } catch (e) {
        throw e;
      }
    }
  };

  const handleDeletar = async (id) => {
    // Feedback imediato — não espera o banco
    setServicos((prev) => prev.filter((s) => s.id !== id));
    setConfirmandoId(null);
    setToast("Serviço removido.");
    // Sincroniza com banco em background
    try {
      await db.deleteServico(id);
    } catch (e) {
      setErro("Erro ao excluir: " + e.message);
      carregar(); // reverte se falhou
    }
  };

  const ativos = servicos.filter((s) => s.ativo);
  const inativos = servicos.filter((s) => !s.ativo);

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-semibold text-gray-800"
        >
          Serviços
        </motion.h2>
        <button
          onClick={() => { setEditando(null); setShowForm(true); }}
          className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          + Novo serviço
        </button>
      </div>

      {erro && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          ⚠️ {erro}
        </div>
      )}

      {carregando ? (
        <div className="py-16 text-center text-sm text-gray-400 animate-pulse">Carregando...</div>
      ) : servicos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-gray-200 rounded-2xl p-10 text-center"
        >
          <div className="text-4xl mb-3">✂️</div>
          <p className="text-sm text-gray-500 mb-4">Nenhum serviço cadastrado ainda.</p>
          <button
            onClick={() => { setEditando(null); setShowForm(true); }}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
          >
            + Criar primeiro serviço
          </button>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Serviços ativos */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-2xl p-5"
          >
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Ativos ({ativos.length})
            </p>
            {ativos.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum serviço ativo.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ativos.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 hover:bg-indigo-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.nome}</p>
                      <p className="text-sm font-semibold text-indigo-600 mt-0.5">{fmtValor(s.valor)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setEditando(s); setShowForm(true); }}
                        className="text-xs text-gray-400 hover:text-indigo-500 px-2 py-1 rounded-lg hover:bg-white transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmandoId(s.id)}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-white transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Serviços inativos */}
          {inativos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-gray-200 rounded-2xl p-5"
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Inativos ({inativos.length})
              </p>
              <div className="flex flex-col gap-2">
                {inativos.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-600 truncate line-through">{s.nome}</p>
                      <p className="text-sm text-gray-400 mt-0.5">{fmtValor(s.valor)}</p>
                    </div>
                    <button
                      onClick={() => { setEditando(s); setShowForm(true); }}
                      className="text-xs text-gray-400 hover:text-indigo-500 px-2 py-1 rounded-lg transition-colors"
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Modal confirmação delete */}
      <AnimatePresence>
        {confirmandoId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl text-center"
            >
              <div className="text-3xl mb-3">🗑️</div>
              <p className="text-sm text-gray-700 font-medium mb-1">Excluir serviço?</p>
              <p className="text-xs text-gray-400 mb-5">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmandoId(null)}
                  className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeletar(confirmandoId)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de formulário */}
      <AnimatePresence>
        {showForm && (
          <ServicoForm
            servico={editando}
            onSalvar={handleSalvar}
            onFechar={() => { setShowForm(false); setEditando(null); }}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-3 rounded-2xl shadow-lg z-50"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
