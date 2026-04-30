import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";

export default function Historico() {
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);

  const carregar = useCallback(async () => {
    const lista = await db.getHistorico();
    setHistorico(lista);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const handleLimpar = async () => {
    await db.limparHistorico();
    setHistorico([]);
    setConfirmandoLimpar(false);
  };

  const porMes = historico.reduce((acc, entrada) => {
    const mes = format(parseISO(entrada.data_zerado), "MMMM 'de' yyyy", { locale: ptBR });
    if (!acc[mes]) acc[mes] = [];
    acc[mes].push(entrada);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">📋 Histórico de consumo</h2>
        {historico.length > 0 && (
          <button
            onClick={() => setConfirmandoLimpar(true)}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Limpar tudo
          </button>
        )}
      </div>

      {carregando ? (
        <p className="text-sm text-gray-400 animate-pulse">Carregando...</p>
      ) : historico.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 text-center gap-4"
        >
          <span className="text-5xl">📭</span>
          <div>
            <p className="text-gray-700 font-medium text-base">Nenhum registro ainda</p>
            <p className="text-gray-400 text-sm mt-1">
              Quando um produto chegar a zero, ele aparece aqui
            </p>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(porMes).map(([mes, entradas], mi) => (
            <motion.div
              key={mes}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: mi * 0.06 }}
            >
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1 capitalize">
                {mes}
              </p>
              <div className="flex flex-col gap-2">
                {entradas.map((entrada, i) => (
                  <motion.div
                    key={entrada.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: mi * 0.06 + i * 0.04 }}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3"
                  >
                    {entrada.foto ? (
                      <img
                        src={entrada.foto}
                        alt={entrada.produto_nome}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg shrink-0">
                        🧴
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {entrada.produto_nome}
                        {entrada.produto_cor ? ` — ${entrada.produto_cor}` : ""}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{entrada.categoria_nome}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-gray-500">
                        {format(parseISO(entrada.data_zerado), "dd/MM/yyyy")}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDistanceToNow(parseISO(entrada.data_zerado), { locale: ptBR, addSuffix: true })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {confirmandoLimpar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
            onClick={() => setConfirmandoLimpar(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
            >
              <p className="text-base font-semibold text-gray-800 mb-1">Limpar histórico?</p>
              <p className="text-sm text-gray-500 mb-5">Todos os registros serão apagados permanentemente.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmandoLimpar(false)}
                  className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleLimpar}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  Limpar tudo
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
