import { useState, useEffect, useRef, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ProdutoDetalhe from "./ProdutoDetalhe";

function EstoqueBadge({ quantidade, estoqueMinimo }) {
  if (quantidade <= estoqueMinimo)
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
        Estoque baixo
      </span>
    );
  return null;
}

function ControladorQuantidade({ produto, onAtualizar, onDeletar }) {
  const [qtd, setQtd] = useState(produto.quantidade);
  const timerRef = useRef(null);

  useEffect(() => {
    setQtd(produto.quantidade);
  }, [produto.quantidade]);

  const alterar = (delta) => {
    if (delta === -1 && qtd === 0) {
      onDeletar(produto.id);
      return;
    }
    const nova = Math.max(0, qtd + delta);
    setQtd(nova);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onAtualizar(produto, nova), 600);
  };

  return (
    <div
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => alterar(-1)}
        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-rose-100 text-gray-500 hover:text-rose-500 text-base flex items-center justify-center transition-colors font-bold leading-none"
      >
        −
      </button>
      <motion.span
        key={qtd}
        initial={{ scale: 1.35 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.15 }}
        className="text-sm font-semibold text-gray-700 w-5 text-center"
      >
        {qtd}
      </motion.span>
      <button
        onClick={() => alterar(1)}
        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-rose-100 text-gray-500 hover:text-rose-500 text-base flex items-center justify-center transition-colors font-bold leading-none"
      >
        +
      </button>
    </div>
  );
}

function ProdutoList({
  titulo,
  produtos,
  categorias,
  onEditar,
  onDeletar,
  onNovo,
  mostrarBotaoNovo,
  onAtualizarQuantidade,
}) {
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState("recentes");
  const [ordem, setOrdem] = useState("desc");
  const [produtoAberto, setProdutoAberto] = useState(null);

  const filtrados = produtos
    .filter((p) => {
      const matchBusca = p.nome.toLowerCase().includes(busca.toLowerCase());
      const matchCat = filtroCategoria
        ? String(p.categoria_id) === String(filtroCategoria)
        : true;
      return matchBusca && matchCat;
    })
    .sort((a, b) => {
      const aZero = a.quantidade === 0 ? 1 : 0;
      const bZero = b.quantidade === 0 ? 1 : 0;
      if (aZero !== bZero) return aZero - bZero;
      let comparacao = 0;
      if (ordenacao === "alfabetica") {
        comparacao = a.nome.localeCompare(b.nome);
      } else {
        comparacao = new Date(a.data_cadastro || 0) - new Date(b.data_cadastro || 0);
      }
      return ordem === "desc" ? -comparacao : comparacao;
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">{titulo}</h2>
      </div>

      <div className="flex flex-col gap-3 mb-5">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Buscar produto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          {[
            { id: "recentes", label: "🕐 Recentes" },
            { id: "alfabetica", label: "🔤 A-Z" },
          ].map((op) => (
            <button
              key={op.id}
              onClick={() => {
                if (ordenacao === op.id) {
                  setOrdem((o) => (o === "asc" ? "desc" : "asc"));
                } else {
                  setOrdenacao(op.id);
                  setOrdem("desc");
                }
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${ordenacao === op.id ? "bg-rose-50 border-rose-300 text-rose-600" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}
            >
              {op.label}
              {ordenacao === op.id && (
                <span>{ordem === "desc" ? "↓" : "↑"}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        produtos.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-20 text-center gap-4"
          >
            <span className="text-5xl">🧴</span>
            <div>
              <p className="text-gray-700 font-medium text-base">Nenhum produto por aqui</p>
              <p className="text-gray-400 text-sm mt-1">Adicione seu primeiro produto para começar</p>
            </div>
            <button
              onClick={onNovo}
              className="mt-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-5 py-2.5 rounded-2xl transition-colors shadow-sm"
            >
              ✨ Adicionar produto
            </button>
          </motion.div>
        ) : (
          <div className="text-center text-gray-400 py-16 text-sm">
            Nenhum resultado para a busca.
          </div>
        )
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-3">
          <AnimatePresence initial={false}>
          {filtrados.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
              className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer active:brightness-95"
              onClick={() => setProdutoAberto(p)}
            >
              {p.foto ? (
                <img
                  src={p.foto}
                  alt={p.nome}
                  className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg bg-gray-100 flex items-center justify-center text-xl shrink-0">
                  🧴
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-gray-800 text-sm">
                    {p.nome}
                    {p.tem_cor && p.cor ? ` - ${p.cor}` : ""}
                    {p.tem_tamanho && p.tamanho_quantidade
                      ? ` ${p.tamanho_quantidade}${p.tamanho_unidade}`
                      : ""}
                  </span>
                  <EstoqueBadge quantidade={p.quantidade} estoqueMinimo={p.estoque_minimo ?? 1} />
                </div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
                  <span>{p.categoria_nome}</span>
                  {p.preco_venda > 0 && <span>· R$ {Number(p.preco_venda).toFixed(2)}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <ControladorQuantidade produto={p} onAtualizar={onAtualizarQuantidade} onDeletar={onDeletar} />
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onEditar(p)}
                    className="text-xs text-gray-400 hover:text-rose-500 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onDeletar(p.id)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {produtoAberto && (
          <ProdutoDetalhe
            produto={produtoAberto}
            onFechar={() => setProdutoAberto(null)}
            onEditar={onEditar}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(ProdutoList);
