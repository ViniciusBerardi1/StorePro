import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Mail, Lock, AlertCircle, CheckCircle } from "lucide-react";
import { adminSignIn, resetPasswordForEmail } from "../../services/adminAuth";

export default function AdminLogin() {
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [resetSent,    setResetSent]    = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) { setError("Insira seu e-mail para recuperar a senha."); return; }
    setResetLoading(true);
    setError(null);
    try {
      await resetPasswordForEmail(email.trim().toLowerCase());
      setResetSent(true);
    } catch (err) {
      setError(err.message || "Erro ao enviar e-mail de recuperação.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      await adminSignIn(email.trim().toLowerCase(), password);
      // useAdminAuth will pick up the new session automatically via onAuthStateChange
    } catch (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : err.message || "Falha na autenticação."
      );
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-2xl w-full max-w-sm p-8 shadow-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white mb-4 shadow-lg">
            <Shield size={26} strokeWidth={2} />
          </div>
          <h1 className="text-xl font-bold text-gray-900">StorePro Admin</h1>
          <p className="text-sm text-gray-400 mt-1">Painel de administração</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <Mail
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              autoComplete="email"
              autoFocus
              required
              className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
            />
          </div>

          <div className="relative">
            <Lock
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              autoComplete="current-password"
              required
              className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-100
                            rounded-xl px-3.5 py-2.5 text-sm text-red-600">
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
            {loading ? "Autenticando..." : "Entrar no painel"}
          </button>
        </form>

        {resetSent ? (
          <div className="flex items-center gap-2 mt-5 bg-green-50 border border-green-100 rounded-xl px-3.5 py-2.5 text-sm text-green-700">
            <CheckCircle size={14} className="shrink-0" />
            E-mail de recuperação enviado. Verifique sua caixa de entrada.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            disabled={resetLoading}
            className="w-full text-center text-xs text-indigo-500 hover:text-indigo-700 mt-4 disabled:opacity-50 transition-colors"
          >
            {resetLoading ? "Enviando…" : "Esqueci minha senha"}
          </button>
        )}

        <p className="text-center text-xs text-gray-400 mt-3">
          Acesso restrito — somente administradores
        </p>
      </motion.div>
    </div>
  );
}
