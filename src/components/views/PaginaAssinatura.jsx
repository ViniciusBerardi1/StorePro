import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";

const INTERVALO_LABEL = {
  semanal:    "por semana",
  mensal:     "por mês",
  trimestral: "a cada 3 meses",
  anual:      "por ano",
};

function BRL(v) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PaginaAssinatura() {
  const [planos, setPlanos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState(null);
  const [nomeApp, setNomeApp]     = useState("StorePro");

  useEffect(() => {
    async function carregar() {
      try {
        const [p, nome] = await Promise.allSettled([
          db.getPlanos(),
          db.getConfiguracao("nome_estabelecimento"),
        ]);
        if (p.status === "fulfilled") setPlanos(p.value);
        else setErro("Não foi possível carregar os planos.");
        if (nome.status === "fulfilled" && nome.value) setNomeApp(nome.value);
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      {/* Header */}
      <header className="pt-12 pb-8 px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500 text-white text-3xl mb-4 shadow-lg">
            👑
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{nomeApp}</h1>
          <p className="text-gray-500 mt-2 text-sm max-w-xs mx-auto">
            Escolha um plano de assinatura e aproveite benefícios exclusivos.
          </p>
        </motion.div>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 px-4 pb-16 max-w-lg mx-auto w-full">
        {loading ? (
          <div className="py-20 text-center text-sm text-gray-400 animate-pulse">
            Carregando planos...
          </div>
        ) : erro ? (
          <div className="py-12 text-center text-sm text-red-500">{erro}</div>
        ) : planos.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">🔜</div>
            <p className="text-sm text-gray-400">Nenhum plano disponível no momento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <AnimatePresence>
              {planos.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                  className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">{p.nome}</h2>
                      {p.descricao && (
                        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{p.descricao}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xl font-bold text-indigo-600">{BRL(p.valor)}</p>
                      <p className="text-xs text-gray-400">{INTERVALO_LABEL[p.intervalo] ?? p.intervalo}</p>
                    </div>
                  </div>

                  {p.checkout_url ? (
                    <a
                      href={p.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-medium py-3 rounded-xl text-sm transition-colors shadow-sm"
                    >
                      Assinar agora →
                    </a>
                  ) : (
                    <div className="w-full text-center bg-gray-100 text-gray-400 font-medium py-3 rounded-xl text-sm cursor-default select-none">
                      Em breve
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-xs text-gray-400">
          Pagamento processado com segurança pelo gateway de pagamentos.
        </p>
      </footer>
    </div>
  );
}
