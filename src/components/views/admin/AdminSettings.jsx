import { useState, useEffect } from "react";
import { Save, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle, Settings } from "lucide-react";
import { getAllConfiguracoes, upsertConfiguracao } from "../../../services/adminAuth";

// Configs displayed in the admin panel (subset — sensitive keys listed explicitly)
const EDITABLE_KEYS = [
  { chave: "app_senha",        label: "Senha do aplicativo",      type: "password", description: "Senha usada pelos funcionários para acessar o app." },
  { chave: "financeiro_senha", label: "Senha financeiro",         type: "password", description: "Senha para destravar a área financeira e relatórios." },
];

function ConfigField({ chave, label, type, description, initialValue, onSave }) {
  const [value,   setValue]   = useState(initialValue ?? "");
  const [show,    setShow]    = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState(null); // "saved" | "error"

  // Reset field when parent reloads
  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue]);

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      await onSave(chave, value.trim());
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const inputType = type === "password" && !show ? "password" : "text";

  return (
    <div className="py-4 border-b border-gray-100 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-medium text-gray-700 mb-0.5">{label}</label>
          <p className="text-xs text-gray-400">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <input
              type={inputType}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Valor atual de "${chave}"`}
              className="w-52 border border-gray-200 rounded-xl px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow
                         pr-9"
            />
            {type === "password" && (
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400
                           hover:text-gray-600 transition-colors"
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700
                       text-white text-sm font-medium rounded-xl transition-colors
                       disabled:opacity-50 shrink-0"
          >
            {saving ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : status === "saved" ? (
              <CheckCircle size={13} />
            ) : status === "error" ? (
              <AlertCircle size={13} />
            ) : (
              <Save size={13} />
            )}
            {saving ? "..." : "Salvar"}
          </button>
        </div>
      </div>
      {status === "saved" && (
        <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
          <CheckCircle size={11} /> Salvo com sucesso
        </p>
      )}
      {status === "error" && (
        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
          <AlertCircle size={11} /> Erro ao salvar. Tente novamente.
        </p>
      )}
    </div>
  );
}

export default function AdminSettings() {
  const [configs,   setConfigs]   = useState({});
  const [allRaw,    setAllRaw]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState(null);

  const load = async () => {
    try {
      const rows = await getAllConfiguracoes();
      setAllRaw(rows);
      const map = {};
      rows.forEach((r) => { map[r.chave] = r.valor; });
      setConfigs(map);
      setError(null);
    } catch (err) {
      setError(err.message || "Erro ao carregar configurações.");
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSave = async (chave, valor) => {
    await upsertConfiguracao(chave, valor);
    setConfigs((prev) => ({ ...prev, [chave]: valor }));
  };

  // Keys NOT in the EDITABLE_KEYS list (read-only display)
  const otherKeys = allRaw.filter((r) => !EDITABLE_KEYS.some((e) => e.chave === r.chave));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerenciar configurações do sistema</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700
                     hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Editable configs */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Senhas e acesso</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Altere as senhas do aplicativo. As mudanças têm efeito imediato.
          </p>
        </div>
        <div className="px-5">
          {loading ? (
            <div className="py-6 space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            EDITABLE_KEYS.map((field) => (
              <ConfigField
                key={field.chave}
                {...field}
                initialValue={configs[field.chave]}
                onSave={handleSave}
              />
            ))
          )}
        </div>
      </div>

      {/* Read-only: other configs */}
      {!loading && otherKeys.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Outras configurações</h2>
            <p className="text-xs text-gray-400 mt-0.5">Somente leitura — altere via SQL Editor.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {otherKeys.map((r) => (
              <div key={r.chave} className="flex items-center justify-between px-5 py-3 gap-4">
                <span className="text-sm text-gray-600 font-mono">{r.chave}</span>
                <span className="text-sm text-gray-400 truncate max-w-xs text-right">
                  {r.chave.includes("senha") ? "••••••" : (r.valor ?? "—")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && allRaw.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 text-center">
          <Settings size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">Nenhuma configuração encontrada.</p>
          <p className="text-gray-300 text-xs mt-1">
            Configurações serão criadas automaticamente pelo app.
          </p>
        </div>
      )}
    </div>
  );
}
