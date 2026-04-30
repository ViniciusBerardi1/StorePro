import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";

export const GCAL_CORES = {
  "1":  { label: "Lavanda",    hex: "#7986CB" },
  "2":  { label: "Sálvia",     hex: "#33B679" },
  "3":  { label: "Uva",        hex: "#8E24AA" },
  "4":  { label: "Flamingo",   hex: "#E67C73" },
  "5":  { label: "Banana",     hex: "#F6BF26" },
  "6":  { label: "Tangerina",  hex: "#F4511E" },
  "7":  { label: "Pavão",      hex: "#039BE5" },
  "8":  { label: "Grafite",    hex: "#616161" },
  "9":  { label: "Mirtilo",    hex: "#3F51B5" },
  "10": { label: "Manjericão", hex: "#0B8043" },
  "11": { label: "Tomate",     hex: "#D50000" },
};

function BarbeiroForm({ barbeiro, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    nome: barbeiro?.nome ?? "",
    gcal_color_id: barbeiro?.gcal_color_id ?? "9",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return setErro("Informe o nome do barbeiro.");
    setErro(null);
    setSalvando(true);
    try {
      await onSalvar({ ...barbeiro, ...form, nome: form.nome.trim() });
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
            <label className="text-xs font-medium text-gray-500 mb-2 block">
              Cor na agenda
            </label>
            <div className="grid grid-cols-6 gap-2">
              {Object.entries(GCAL_CORES).map(([id, { label, hex }]) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setForm((f) => ({ ...f, gcal_color_id: id }))}
                  className={`w-9 h-9 rounded-full transition-all ${
                    form.gcal_color_id === id
                      ? "ring-2 ring-offset-2 ring-gray-400 scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Cor selecionada:{" "}
              <span className="font-medium text-gray-600">
                {GCAL_CORES[form.gcal_color_id]?.label}
              </span>
            </p>
          </div>

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              ⚠️ {erro}
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
    <div className="w-full flex flex-col gap-4">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <h2 className="text-xl font-semibold text-gray-800">Barbeiros</h2>
        <button
          onClick={() => { setEditando(null); setShowForm(true); }}
          className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          + Novo
        </button>
      </motion.div>

      {erro && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          ⚠️ {erro}
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
          <div className="text-4xl mb-3">✂️</div>
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
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cor.hex }}
                    />
                    {cor.label}
                  </p>
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
            onSalvar={handleSalvar}
            onFechar={() => { setShowForm(false); setEditando(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
