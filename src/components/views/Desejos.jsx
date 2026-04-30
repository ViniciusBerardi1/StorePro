import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";

function DesejoForm({ desejo, categorias, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    id: desejo?.id || null,
    nome: desejo?.nome || "",
    categoria_id: desejo?.categoria_id || categorias[0]?.id || "",
    preco_estimado: desejo?.preco_estimado ?? "",
    link: desejo?.link || "",
    notas: desejo?.notas || "",
    prioridade: desejo?.prioridade || "quero",
  });

  const handleSubmit = () => {
    if (!form.nome.trim()) return alert("Informe o nome do produto.");
    onSalvar(form);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {form.id ? "Editar desejo" : "Novo desejo"}
          </h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Nome do produto *</label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex: Hidratante Neutrogena..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Categoria</label>
            <select
              value={form.categoria_id}
              onChange={(e) => setForm((f) => ({ ...f, categoria_id: Number(e.target.value) }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Preço estimado <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.preco_estimado}
                onChange={(e) =>
                  setForm((f) => ({ ...f, preco_estimado: e.target.value === "" ? "" : parseFloat(e.target.value) || "" }))
                }
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Link do produto <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="url"
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="https://www.sephora.com.br/..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Observações <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              rows={2}
              placeholder="Ex: cor nude, tamanho 200ml..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Prioridade</label>
            <div className="flex gap-2">
              {[
                { id: "quero", label: "🛒 Quero" },
                { id: "amei", label: "💝 Amei muito" },
              ].map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, prioridade: op.id }))}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                    ${form.prioridade === op.id ? "bg-rose-50 border-rose-300 text-rose-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onFechar}
            className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Desejos({ categorias, onAdicionarAoEstoque }) {
  const [desejos, setDesejos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);

  const carregar = useCallback(async () => {
    const lista = await db.getDesejos();
    setDesejos(lista);
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const handleSalvar = async (desejo) => {
    if (desejo.id) {
      await db.updateDesejo(desejo);
    } else {
      await db.addDesejo(desejo);
    }
    await carregar();
    setShowForm(false);
    setEditando(null);
  };

  const handleDeletar = async (id) => {
    await db.deleteDesejo(id);
    await carregar();
    setConfirmandoId(null);
  };

  const porCategoria = desejos.reduce((acc, d) => {
    const cat = categorias.find((c) => c.id === d.categoria_id)?.nome || "Outros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(d);
    return acc;
  }, {});

  const totalAmei = desejos.filter((d) => d.prioridade === "amei").length;
  const totalPreco = desejos
    .filter((d) => d.preco_estimado > 0)
    .reduce((acc, d) => acc + Number(d.preco_estimado), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">💝 Lista de desejos</h2>
        <button
          onClick={() => { setEditando(null); setShowForm(true); }}
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          + Adicionar
        </button>
      </div>

      {desejos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-2xl font-semibold text-gray-800">{desejos.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {totalAmei > 0 ? `${totalAmei} favoritos` : "produtos desejados"}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            {totalPreco > 0 ? (
              <>
                <p className="text-2xl font-semibold text-gray-800">
                  R$ {totalPreco.toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">custo estimado</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold text-gray-400">—</p>
                <p className="text-xs text-gray-400 mt-0.5">sem preços cadastrados</p>
              </>
            )}
          </div>
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-gray-400 animate-pulse">Carregando...</p>
      ) : desejos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center gap-4"
        >
          <span className="text-5xl">💝</span>
          <div>
            <p className="text-gray-700 font-medium text-base">Nenhum desejo ainda</p>
            <p className="text-gray-400 text-sm mt-1">Adicione produtos que você quer comprar</p>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(porCategoria).map(([cat, itens], ci) => (
            <motion.div
              key={cat}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: ci * 0.05 }}
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                {cat}
              </p>
              <div className="flex flex-col gap-2">
                {itens.map((d, i) => (
                  <motion.div
                    key={d.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: ci * 0.05 + i * 0.03 }}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800 text-sm">{d.nome}</span>
                          {d.prioridade === "amei" && (
                            <span className="text-xs bg-rose-100 text-rose-500 px-2 py-0.5 rounded-full font-medium">
                              💝 Favorito
                            </span>
                          )}
                        </div>
                        {d.preco_estimado > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            R$ {Number(d.preco_estimado).toFixed(2).replace(".", ",")}
                          </p>
                        )}
                        {d.notas && (
                          <p className="text-xs text-gray-400 mt-0.5 italic">{d.notas}</p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {d.link && (
                          <a
                            href={d.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-white bg-black hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            🛍️ Ver produto
                          </a>
                        )}
                        <button
                          onClick={() => onAdicionarAoEstoque(d)}
                          className="text-xs text-rose-500 hover:text-rose-700 font-medium transition-colors"
                        >
                          ✓ Tenho agora
                        </button>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditando(d); setShowForm(true); }}
                            className="text-xs text-gray-400 hover:text-rose-500 transition-colors"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => setConfirmandoId(d.id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <DesejoForm
              desejo={editando}
              categorias={categorias}
              onSalvar={handleSalvar}
              onFechar={() => { setShowForm(false); setEditando(null); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmandoId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4"
            onClick={() => setConfirmandoId(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            >
              <p className="text-base font-semibold text-gray-800 mb-1">Remover desejo?</p>
              <p className="text-sm text-gray-500 mb-5">O item será removido da lista de desejos.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmandoId(null)}
                  className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeletar(confirmandoId)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  Remover
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
