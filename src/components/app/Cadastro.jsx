import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Store, Mail, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "../../services/supabase";

export default function Cadastro() {
  const params  = new URLSearchParams(window.location.search);
  const lojaId  = params.get("loja") || "";

  const [lojaOk,    setLojaOk]    = useState(null); // null=checking, true, false
  const [lojaNome,  setLojaNome]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [done,      setDone]      = useState(false);

  useEffect(() => {
    if (!lojaId) { setLojaOk(false); return; }
    supabase.from("lojas").select("nome").eq("id", lojaId).eq("ativo", true).maybeSingle()
      .then(({ data }) => {
        if (data) { setLojaNome(data.nome); setLojaOk(true); }
        else setLojaOk(false);
      });
  }, [lojaId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { loja_id: lojaId } },
    });

    setLoading(false);
    if (err) { setError(err.message || "Erro ao criar conta."); return; }
    setDone(true);
  };

  if (lojaOk === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Verificando convite...</p>
      </div>
    );
  }

  if (!lojaOk) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle size={36} className="mx-auto text-red-400 mb-3" />
          <p className="text-gray-700 font-semibold">Convite inválido ou expirado</p>
          <p className="text-gray-400 text-sm mt-1">Solicite um novo link ao administrador.</p>
        </div>
      </div>
    );
  }

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
          <h1 className="text-lg font-bold text-gray-900">Criar conta</h1>
          <p className="text-xs text-indigo-600 font-medium mt-1">{lojaNome}</p>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={40} className="text-green-500" />
            <p className="text-sm text-gray-700 font-medium text-center">
              Conta criada! Verifique seu e-mail para confirmar o cadastro e depois{" "}
              <a href="/" className="text-indigo-600 underline">acesse o app</a>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Seu e-mail"
                autoComplete="email"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Crie uma senha (mín. 6 caracteres)"
                autoComplete="new-password"
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
              {loading ? "Criando..." : "Criar conta"}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
