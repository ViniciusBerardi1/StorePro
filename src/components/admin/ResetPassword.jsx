import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "../../services/supabase";

export default function ResetPassword() {
  const [password,  setPassword]  = useState("");
  const [confirm,   setConfirm]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [done,      setDone]      = useState(false);
  const [ready,     setReady]     = useState(false);

  // Supabase troca o token do hash automaticamente via onAuthStateChange
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    if (password.length < 6)  { setError("A senha deve ter pelo menos 6 caracteres."); return; }

    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) { setError(err.message || "Erro ao redefinir senha."); return; }
    setDone(true);
    setTimeout(() => { window.location.href = "/admin"; }, 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white mb-4 shadow-lg">
            <Shield size={26} strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Redefinir senha</h1>
          <p className="text-sm text-gray-400 mt-1">StorePro Admin</p>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={40} className="text-green-500" />
            <p className="text-sm text-gray-700 font-medium">Senha alterada com sucesso!</p>
            <p className="text-xs text-gray-400">Redirecionando para o painel…</p>
          </div>
        ) : !ready ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">Validando link de recuperação…</p>
            <p className="text-xs text-gray-400 mt-2">
              Se demorar, o link pode ter expirado.{" "}
              <a href="/admin" className="text-indigo-600 underline">Voltar ao login</a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nova senha"
                autoFocus
                required
                className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
              />
            </div>

            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirmar nova senha"
                required
                className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
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
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-60 mt-1"
            >
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
