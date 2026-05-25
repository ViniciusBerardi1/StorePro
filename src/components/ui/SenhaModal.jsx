import { useState } from "react";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { supabase } from "../../services/supabase";

export default function SenhaModal({ onConfirmar, onFechar }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [verificando, setVerificando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!senha.trim()) return;
    setVerificando(true);
    setErro(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setErro("Sessão inválida. Faça login novamente."); return; }
      const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: senha });
      if (error) {
        setErro("Senha incorreta.");
        setSenha("");
      } else {
        onConfirmar();
      }
    } catch {
      setErro("Erro ao verificar. Tente novamente.");
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-xl"
      >
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-500 mb-2">
            <Lock size={18} strokeWidth={2} />
          </div>
          <h3 className="font-semibold text-gray-800">Área de Gestão</h3>
          <p className="text-xs text-gray-400 mt-1">Financeiro e Relatórios · digite a senha para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {erro && (
            <p className="text-xs text-red-500 text-center">{erro}</p>
          )}
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={verificando}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
            >
              {verificando ? "..." : "Entrar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
