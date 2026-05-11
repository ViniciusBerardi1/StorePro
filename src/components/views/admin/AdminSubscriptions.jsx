import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, CreditCard } from "lucide-react";
import { getAllSubscriptions } from "../../../services/adminAuth";

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold
      ${active
        ? "bg-emerald-100 text-emerald-700"
        : "bg-gray-100 text-gray-500"
      }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-gray-400"}`} />
      {active ? "Ativa" : "Encerrada"}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatCurrency(val) {
  if (val == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL",
  }).format(Number(val));
}

export default function AdminSubscriptions() {
  const [subs,      setSubs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState(null);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState("all"); // all | active | ended

  const load = async () => {
    try {
      const data = await getAllSubscriptions();
      setSubs(data);
      setError(null);
    } catch (err) {
      setError(err.message || "Erro ao carregar assinaturas.");
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

  const filtered = useMemo(() => {
    let list = subs;
    if (filter === "active") list = list.filter((s) => s.ativa);
    if (filter === "ended")  list = list.filter((s) => !s.ativa);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => {
        const clientName  = (s.clientes?.nome    || "").toLowerCase();
        const clientEmail = (s.clientes?.email   || "").toLowerCase();
        const planName    = (s.planos?.nome       || "").toLowerCase();
        return clientName.includes(q) || clientEmail.includes(q) || planName.includes(q);
      });
    }
    return list;
  }, [subs, filter, search]);

  const totalAtivas = subs.filter((s) => s.ativa).length;
  const mrr = subs
    .filter((s) => s.ativa)
    .reduce((sum, s) => sum + Number(s.planos?.valor_mensal || 0), 0);

  const FILTERS = [
    { key: "all",    label: "Todas"     },
    { key: "active", label: "Ativas"    },
    { key: "ended",  label: "Encerradas" },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Assinaturas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading ? "Carregando..." : `${totalAtivas} ativa${totalAtivas !== 1 ? "s" : ""} de ${subs.length} total`}
          </p>
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

      {/* MRR summary card */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-400 mb-1">Assinaturas ativas</p>
            <p className="text-2xl font-bold text-gray-900">{totalAtivas}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-400 mb-1">MRR estimado</p>
            <p className="text-2xl font-bold text-emerald-600">{formatCurrency(mrr)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm col-span-2 sm:col-span-1">
            <p className="text-xs font-medium text-gray-400 mb-1">Total de registros</p>
            <p className="text-2xl font-bold text-gray-900">{subs.length}</p>
          </div>
        </div>
      )}

      {/* Filters + search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4">
          <div className="relative flex-1 w-full">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por cliente ou plano..."
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${filter === key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-[1fr_160px_140px_120px_100px]
                        px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          {["Cliente", "Plano", "Valor/mês", "Data", "Status"].map((h) => (
            <span key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-32 bg-gray-200 rounded-full mb-2" />
                  <div className="h-2.5 w-20 bg-gray-100 rounded-full" />
                </div>
                <div className="h-5 w-16 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <CreditCard size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">
              {search ? "Nenhuma assinatura encontrada." : "Nenhuma assinatura cadastrada."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((s) => {
              const clientName  = s.clientes?.nome  || "Cliente removido";
              const clientEmail = s.clientes?.email || "";
              const planName    = s.planos?.nome     || "Plano removido";
              const planValue   = s.planos?.valor_mensal;

              return (
                <div
                  key={s.id}
                  className="md:grid md:grid-cols-[1fr_160px_140px_120px_100px]
                             flex flex-wrap items-center gap-3 px-5 py-4
                             hover:bg-gray-50/60 transition-colors"
                >
                  {/* Client */}
                  <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center
                                    justify-center text-sm font-semibold shrink-0 select-none">
                      {clientName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{clientName}</p>
                      {clientEmail && (
                        <p className="text-xs text-gray-400 truncate">{clientEmail}</p>
                      )}
                    </div>
                  </div>

                  {/* Plan name */}
                  <div className="md:flex items-center">
                    <span className="text-sm text-gray-700">{planName}</span>
                  </div>

                  {/* Value */}
                  <div className="md:flex items-center">
                    <span className="text-sm font-semibold text-gray-800">
                      {formatCurrency(planValue)}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="hidden md:flex items-center">
                    <span className="text-xs text-gray-400">{formatDate(s.created_at)}</span>
                  </div>

                  {/* Status */}
                  <div className="md:flex items-center">
                    <StatusBadge active={s.ativa} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
