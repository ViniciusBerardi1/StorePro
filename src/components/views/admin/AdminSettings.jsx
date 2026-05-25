import { useState, useEffect } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { getAllConfiguracoes } from "../../../services/adminAuth";

export default function AdminSettings() {
  const [allRaw,     setAllRaw]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);

  const load = async () => {
    try {
      const rows = await getAllConfiguracoes();
      setAllRaw(rows);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-400 mt-0.5">Visualização das configurações do sistema</p>
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

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : allRaw.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 text-center">
          <Settings size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">Nenhuma configuração encontrada.</p>
          <p className="text-gray-300 text-xs mt-1">
            Configurações são criadas automaticamente pelo app.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Todas as configurações</h2>
            <p className="text-xs text-gray-400 mt-0.5">Somente leitura — altere via SQL Editor no Supabase.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {allRaw.map((r) => (
              <div key={r.chave} className="flex items-center justify-between px-5 py-3 gap-4">
                <span className="text-sm text-gray-600 font-mono">{r.chave}</span>
                <span className="text-sm text-gray-400 truncate max-w-xs text-right">
                  {r.chave.includes("senha") || r.chave.includes("token") || r.chave.includes("key")
                    ? "••••••"
                    : (r.valor ?? "—")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
