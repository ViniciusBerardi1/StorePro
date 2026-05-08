import { memo } from "react";
import { FlaskConical } from "lucide-react";
import { motion } from "framer-motion";
import { differenceInDays, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const LOJAS = {
  sephora: "Sephora",
  belezanaweb: "Beleza na Web",
  epoca: "Época Cosméticos",
  boticario: "O Boticário",
};

function StatusBadge({ dataValidade }) {
  if (!dataValidade) return null;
  try {
    const dias = differenceInDays(parseISO(dataValidade), new Date());
    if (dias < 0)
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
          Vencido
        </span>
      );
    if (dias <= 60)
      return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
          Vence em {dias}d
        </span>
      );
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
        OK
      </span>
    );
  } catch {
    return null;
  }
}

function Linha({ label, valor }) {
  if (!valor && valor !== 0) return null;
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-700 text-right max-w-[60%]">{valor}</span>
    </div>
  );
}

function ProdutoDetalhe({ produto: p, onFechar, onEditar }) {
  const estoqueMinimo = p.estoque_minimo ?? 1;
  const estoqueBaixo = p.quantidade <= estoqueMinimo;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50"
      onClick={onFechar}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-t-3xl md:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {p.foto ? (
          <img
            src={p.foto}
            alt={p.nome}
            className="w-full h-52 object-cover shrink-0"
          />
        ) : (
          <div className="w-full h-36 bg-rose-50 flex items-center justify-center shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-white/70 flex items-center justify-center"><FlaskConical size={32} strokeWidth={1.5} className="text-rose-300" /></div>
          </div>
        )}

        <div className="p-5 overflow-y-auto">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-base font-semibold text-gray-800 leading-snug">
              {p.nome}
              {p.tem_cor && p.cor ? ` — ${p.cor}` : ""}
            </h2>
            {p.avaliacao > 0 && (
              <span className="text-sm shrink-0">{"⭐".repeat(p.avaliacao)}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-4">{p.categoria_nome}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            <StatusBadge dataValidade={p.data_validade} />
            {estoqueBaixo && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
                Estoque baixo
              </span>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl px-4 py-1 mb-5">
            {p.tem_tamanho && p.tamanho_quantidade && (
              <Linha label="Tamanho" valor={`${p.tamanho_quantidade} ${p.tamanho_unidade}`} />
            )}
            <Linha label="Quantidade em estoque" valor={`${p.quantidade} un`} />
            <Linha label="Mínimo para repor" valor={`${estoqueMinimo} un`} />
            {p.data_validade && (
              <Linha
                label="Validade"
                valor={format(parseISO(p.data_validade), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              />
            )}
            {p.preco_pago > 0 && (
              <Linha label="Preço pago" valor={`R$ ${Number(p.preco_pago).toFixed(2).replace(".", ",")}`} />
            )}
            {p.loja_compra && (
              <Linha label="Loja preferida" valor={LOJAS[p.loja_compra] || p.loja_compra} />
            )}
            {p.data_cadastro && (
              <Linha
                label="Cadastrado em"
                valor={format(parseISO(p.data_cadastro), "dd/MM/yyyy", { locale: ptBR })}
              />
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onFechar}
              className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Fechar
            </button>
            <button
              onClick={() => { onEditar(p); onFechar(); }}
              className="flex-1 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Editar produto
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default memo(ProdutoDetalhe);
