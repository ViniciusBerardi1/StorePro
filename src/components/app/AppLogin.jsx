import { useState } from "react";
import { motion } from "framer-motion";
import { Store, Key, Lock, AlertCircle } from "lucide-react";
import { supabase } from "../../services/supabase";

export default function AppLogin() {
  const [identificador, setIdentificador] = useState("");
  const [senha,         setSenha]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!identificador.trim() || !senha) return;
    setLoading(true);
    setError(null);

    // O email interno é gerado a partir do slug: slug@loja.storepro
    const email = `${identificador.trim().toLowerCase()}@loja.storepro`;
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);

    if (err) {
      setError("Identificador ou senha incorretos.");
      setSenha("");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl w-full max-w-xs p-8 shadow-xl border border-gray-100"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white mb-4 shadow-md">
            <Store size={28} strokeWidth={2} />
          </div>
          <h1 className="text-lg font-bold text-gray-900">StorePro</h1>
          <p className="text-xs text-gray-400 mt-1">Acesse sua barbearia</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <Key size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              placeholder="Identificador da barbearia"
              autoComplete="username"
              autoFocus
              required
              className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
            />
          </div>

          <div className="relative">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Senha"
              autoComplete="current-password"
              required
              className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 text-sm text-red-600">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl
                       text-sm font-semibold transition-colors shadow-sm disabled:opacity-60 mt-1"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-300 mt-6">StorePro · Gestão de barbearias</p>
      </motion.div>
    </div>
  );
}
