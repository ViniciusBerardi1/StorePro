import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Store, BarChart2, Smartphone, Sparkles, Sparkle } from "lucide-react";

const NOTAS = [
  {
    versao: "1.0.0",
    data: "Abril 2026",
    novidades: [
      {
        Icon: Store,
        titulo: "Lançamento do StorePro",
        descricao: "Versão inicial com controle de estoque, categorias, alertas de estoque baixo, histórico de movimentações e pedidos pendentes.",
      },
      {
        Icon: BarChart2,
        titulo: "Dashboard",
        descricao: "Painel com visão geral do estoque: total de produtos, valor em estoque, distribuição por categorias e alertas.",
      },
      {
        Icon: Smartphone,
        titulo: "PWA — funciona offline",
        descricao: "Instale o app no celular ou desktop e use sem internet. Todos os dados ficam salvos localmente no seu dispositivo.",
      },
    ],
  },
];

export default function Sobre() {
  const [easterEgg, setEasterEgg] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [notasAberto, setNotasAberto] = useState(false);
  const versao = "1.0.0";

  const handleSecretClick = () => {
    setClicks((prev) => {
      if (prev + 1 >= 5) { setEasterEgg(true); return 0; }
      return prev + 1;
    });
  };

  return (
    <div className="max-w-lg mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white border border-gray-200 rounded-2xl p-8 text-center"
      >
        <div onClick={handleSecretClick} className="cursor-default select-none">
          <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4"><Store size={32} strokeWidth={1.5} className="text-indigo-600" /></div>
          <h1 className="text-2xl font-semibold text-gray-800 mb-1">StorePro</h1>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            versão {versao}
          </span>
        </div>

        <p className="text-sm text-gray-500 mt-6 leading-relaxed">
          Sistema de gestão de loja — controle de estoque, movimentações, clientes e faturamento. Desenvolvido para funcionar offline, direto no navegador.
        </p>

        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">
            Desenvolvimento
          </p>
          <p className="text-sm text-gray-700">
            Desenvolvido por{" "}
            <span className="font-semibold text-gray-800">Vinícius Berardi</span>
            {" "}com React, Vite & IndexedDB.
          </p>
        </div>

        <button
          onClick={() => setNotasAberto(!notasAberto)}
          className="mt-6 w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors text-sm font-medium text-gray-600"
        >
          <span className="flex items-center gap-2">
            <Sparkle size={14} strokeWidth={2} className="text-indigo-500" /> O que há de novo?
          </span>
          <span className="text-gray-400 text-xs">{notasAberto ? "▲ Fechar" : "▼ Ver"}</span>
        </button>

        <AnimatePresence>
          {notasAberto && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {NOTAS.map((nota) => (
                <div key={nota.versao} className="mt-3 text-left">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className="text-xs font-semibold text-indigo-500 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                      v{nota.versao}
                    </span>
                    <span className="text-xs text-gray-400">{nota.data}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {nota.novidades.map((item, i) => (
                      <div key={i} className="flex gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
                        <item.Icon size={20} strokeWidth={1.5} className="text-gray-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-gray-700">{item.titulo}</p>
                          <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.descricao}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs text-gray-300 mt-8">Feito com React, Vite & Supabase</p>
      </motion.div>

      <AnimatePresence>
        {easterEgg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="mt-4 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-6 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-3"><Sparkles size={24} strokeWidth={1.5} className="text-indigo-500" /></div>
            <p className="text-xs text-indigo-400 uppercase font-semibold tracking-wide mb-2">
              Easter Egg desbloqueado
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              Todo o código deste app foi desenvolvido com a ajuda do{" "}
              <span className="font-semibold text-indigo-500">Claude</span>, a
              IA da Anthropic. Cada componente, cada linha, cada bug corrigido —
              uma parceria entre humano e inteligência artificial.
            </p>
            <p className="text-xs text-gray-400 mt-3">
              (clique 5x no ícone da loja para ver isso de novo)
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
