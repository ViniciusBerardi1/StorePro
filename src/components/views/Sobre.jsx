import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { limparDadosOperacionais } from "../../services/supabaseDb";
import { Store, BarChart2, Smartphone, Receipt, Calendar, Users, Package,
  Trash2, AlertTriangle, Loader2, CheckCircle2, Sparkles, Sparkle } from "lucide-react";

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

const TABELAS_LIMPAS = [
  { Icon: Receipt,  label: "Comandas" },
  { Icon: Calendar, label: "Atendimentos" },
  { Icon: Users,    label: "Clientes" },
  { Icon: Package,  label: "Histórico de estoque" },
];

export default function Sobre() {
  const [easterEgg, setEasterEgg] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [notasAberto, setNotasAberto] = useState(false);
  const [limpandoEtapa, setLimpandoEtapa] = useState(0); // 0=oculto 1=confirmar 2=limpando 3=ok
  const [erroLimpeza, setErroLimpeza] = useState(null);
  const versao = "1.0.0";

  const handleLimpar = async () => {
    setLimpandoEtapa(2);
    setErroLimpeza(null);
    try {
      await limparDadosOperacionais();
      setLimpandoEtapa(3);
    } catch (e) {
      console.error(e);
      setErroLimpeza(e.message || "Erro ao limpar. Tente novamente.");
      setLimpandoEtapa(1);
    }
  };

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

        {/* ─── Zona de testes ─────────────────────────────────── */}
        <div className="mt-6 border-t border-dashed border-gray-200 pt-6">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-3">
            Ferramentas de teste
          </p>

          {limpandoEtapa === 0 && (
            <button
              onClick={() => setLimpandoEtapa(1)}
              className="w-full flex items-center justify-between px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors text-sm font-medium text-red-600"
            >
              <span className="flex items-center gap-2"><Trash2 size={15} strokeWidth={2} />Limpar banco de dados</span>
              <span className="text-xs text-red-400">dados de teste</span>
            </button>
          )}

          <AnimatePresence>
            {limpandoEtapa === 1 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="bg-red-50 border border-red-200 rounded-xl p-4 text-left flex flex-col gap-3"
              >
                <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5"><AlertTriangle size={14} strokeWidth={2} className="shrink-0" />Isso apagará permanentemente:</p>
                <div className="flex flex-col gap-1.5">
                  {TABELAS_LIMPAS.map((t) => (
                    <div key={t.label} className="flex items-center gap-2 text-xs text-red-600">
                      <t.Icon size={12} strokeWidth={2} className="shrink-0" /><span>{t.label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  Produtos, serviços, barbeiros e configurações <strong>não</strong> serão afetados.
                </p>
                {erroLimpeza && (
                  <p className="text-xs text-red-500 bg-red-100 rounded-lg px-3 py-2">{erroLimpeza}</p>
                )}
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => { setLimpandoEtapa(0); setErroLimpeza(null); }}
                    className="flex-1 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors"
                  >Cancelar</button>
                  <button
                    onClick={handleLimpar}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >Sim, apagar tudo</button>
                </div>
              </motion.div>
            )}

            {limpandoEtapa === 2 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-red-50 border border-red-200 rounded-xl px-4 py-5 text-center"
              >
                <Loader2 size={28} className="animate-spin text-red-500 mx-auto mb-2" />
                <p className="text-sm text-red-600 font-medium">Limpando dados...</p>
              </motion.div>
            )}

            {limpandoEtapa === 3 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-green-50 border border-green-200 rounded-xl px-4 py-5 text-center flex flex-col gap-2"
              >
                <CheckCircle2 size={28} strokeWidth={1.5} className="text-green-500 mx-auto" />
                <p className="text-sm text-green-700 font-semibold">Banco limpo com sucesso!</p>
                <p className="text-xs text-green-500">Pronto para novos testes.</p>
                <button
                  onClick={() => setLimpandoEtapa(0)}
                  className="mt-1 text-xs text-green-600 hover:underline"
                >Fechar</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
