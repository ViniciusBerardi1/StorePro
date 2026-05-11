import { useState, useEffect } from "react";
import { Users, CreditCard, UserCheck, Store, RefreshCw } from "lucide-react";
import StatsCard from "../../admin/StatsCard";
import { getProfilesCount, getAppStats, getRecentProfiles } from "../../../services/adminAuth";

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold
      ${role === "admin"
        ? "bg-indigo-100 text-indigo-700"
        : "bg-gray-100 text-gray-600"
      }`}>
      {role === "admin" ? "Admin" : "Usuário"}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium
      ${active ? "text-emerald-600" : "text-red-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-red-400"}`} />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day:   "2-digit",
    month: "short",
    year:  "numeric",
  });
}

export default function AdminDashboard() {
  const [stats,        setStats]        = useState(null);
  const [appStats,     setAppStats]     = useState(null);
  const [recentUsers,  setRecentUsers]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [refreshing,   setRefreshing]   = useState(false);

  const loadAll = async () => {
    try {
      const [profileCounts, app, recent] = await Promise.all([
        getProfilesCount(),
        getAppStats(),
        getRecentProfiles(8),
      ]);
      setStats(profileCounts);
      setAppStats(app);
      setRecentUsers(recent);
      setError(null);
    } catch (err) {
      setError(err.message || "Erro ao carregar dados.");
    }
  };

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Visão geral do sistema</p>
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
        <div className="mb-6 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total de usuários"
          value={stats?.total}
          icon={Users}
          color="indigo"
          loading={loading}
          subtitle={`${stats?.admins ?? 0} admin${(stats?.admins ?? 0) !== 1 ? "s" : ""}`}
        />
        <StatsCard
          title="Administradores"
          value={stats?.admins}
          icon={UserCheck}
          color="sky"
          loading={loading}
          subtitle="Com acesso ao painel"
        />
        <StatsCard
          title="Assinaturas ativas"
          value={appStats?.activeSubscriptions}
          icon={CreditCard}
          color="emerald"
          loading={loading}
          subtitle="Planos em vigor"
        />
        <StatsCard
          title="Clientes"
          value={appStats?.totalClients}
          icon={Store}
          color="amber"
          loading={loading}
          subtitle="Base de clientes"
        />
      </div>

      {/* System status */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Status do sistema</h2>
          <ul className="space-y-3">
            <li className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Supabase Auth</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-[12px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Conectado
              </span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Banco de dados</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium text-[12px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Operacional
              </span>
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Senha do app</span>
              {loading ? (
                <span className="h-3 w-16 bg-gray-200 rounded-full animate-pulse" />
              ) : (
                <span className={`inline-flex items-center gap-1.5 font-medium text-[12px]
                  ${appStats?.hasAppPassword ? "text-emerald-600" : "text-amber-600"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full
                    ${appStats?.hasAppPassword ? "bg-emerald-500" : "bg-amber-400"}`}
                  />
                  {appStats?.hasAppPassword ? "Configurada" : "Não configurada"}
                </span>
              )}
            </li>
            <li className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Usuários inativos</span>
              {loading ? (
                <span className="h-3 w-10 bg-gray-200 rounded-full animate-pulse" />
              ) : (
                <span className="text-gray-700 font-medium text-[12px]">
                  {stats?.inactive ?? 0}
                </span>
              )}
            </li>
          </ul>
        </div>

        {/* Quick stats */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribuição de papéis</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-8 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Administradores", count: stats?.admins ?? 0, color: "bg-indigo-500" },
                { label: "Usuários",        count: (stats?.total ?? 0) - (stats?.admins ?? 0), color: "bg-gray-300" },
              ].map(({ label, count, color }) => {
                const pct = stats?.total ? Math.round((count / stats.total) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="text-gray-600">{label}</span>
                      <span className="text-gray-500 font-medium">{count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent users */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Usuários recentes</h2>
        </div>
        {loading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-5 py-3.5 flex items-center gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-gray-200" />
                <div className="flex-1">
                  <div className="h-3 w-32 bg-gray-200 rounded-full mb-1.5" />
                  <div className="h-2.5 w-44 bg-gray-100 rounded-full" />
                </div>
                <div className="h-5 w-14 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : recentUsers.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            Nenhum usuário cadastrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentUsers.map((u) => (
              <div key={u.id} className="px-5 py-3.5 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center
                                justify-center text-sm font-semibold shrink-0 select-none">
                  {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {u.full_name || u.email?.split("@")[0] || "—"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoleBadge role={u.role} />
                  <StatusDot active={u.is_active} />
                  <span className="text-[11px] text-gray-400 hidden sm:block">
                    {formatDate(u.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
