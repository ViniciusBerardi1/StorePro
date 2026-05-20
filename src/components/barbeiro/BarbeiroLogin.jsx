import { useState } from "react";
import { motion } from "framer-motion";
import { Scissors, Hash } from "lucide-react";

export default function BarbeiroLogin({ onLogin }) {
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/barbeiro/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: codigo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro ?? "Código inválido");
        setCodigo("");
        return;
      }
      onLogin(data.token, data.barbeiro);
      history.pushState({}, "", "/barbeiro/agenda");
    } catch {
      setErro("Erro de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-xs"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white mb-5 shadow-lg shadow-indigo-900/40">
            <Scissors size={28} strokeWidth={1.8} />
          </div>
          <h1 className="text-xl font-bold text-white">Portal do Barbeiro</h1>
          <p className="text-sm text-gray-400 mt-1.5">Digite seu código de acesso</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Hash size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              inputMode="numeric"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="000000"
              autoFocus
              className="w-full bg-gray-900 border border-gray-800 rounded-2xl pl-10 pr-4 py-4 text-white text-center text-2xl tracking-[0.4em] font-mono placeholder:text-gray-700 placeholder:text-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          {erro && (
            <p className="text-xs text-red-400 text-center bg-red-950/40 border border-red-900/40 rounded-xl px-3 py-2.5">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando || !codigo.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white py-4 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-40 shadow-lg"
          >
            {carregando ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
