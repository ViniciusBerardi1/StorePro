import { useState, useEffect } from "react";
import { Eye, EyeOff, Save, CheckCircle, AlertCircle, Lock } from "lucide-react";
import { db } from "../../services/supabaseDb";

export default function Configuracoes() {
  const [senha,     setSenha]     = useState("");
  const [show,      setShow]      = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [status,    setStatus]    = useState(null); // "saved" | "error"
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    db.getConfiguracao("financeiro_senha").then((v) => {
      if (v) setHasExisting(true);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!senha.trim() || senha.length < 4) return;
    setSaving(true);
    setStatus(null);
    try {
      await db.setConfiguracao("financeiro_senha", senha.trim());
      setStatus("saved");
      setHasExisting(true);
      setSenha("");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Configurações</h1>
      <p className="text-sm text-gray-400 mb-6">Ajustes da sua barbearia</p>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
            <Lock size={15} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Senha do financeiro</p>
            <p className="text-xs text-gray-400">
              {hasExisting ? "Senha configurada — redefina abaixo" : "Nenhuma senha definida ainda"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="px-5 py-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              {hasExisting ? "Nova senha" : "Definir senha"}
            </label>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              Essa senha protege o acesso à área de Financeiro e Relatórios.
            </p>
          </div>

          {status === "saved" && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
              <CheckCircle size={14} className="shrink-0" />
              Senha salva com sucesso.
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              Erro ao salvar. Tente novamente.
            </div>
          )}

          <button
            type="submit"
            disabled={saving || senha.trim().length < 4}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700
                       text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? "Salvando..." : "Salvar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
