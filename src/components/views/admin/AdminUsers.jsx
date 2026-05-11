import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, ChevronDown, AlertCircle, CheckCircle, Scissors, Trash2 } from "lucide-react";
import { getAllProfiles, updateUserRole, setUserActive, getAllLojas, assignUserToLoja, deleteUser } from "../../../services/adminAuth";

// ── Small sub-components ─────────────────────────────────────────

function RoleBadge({ role }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold
      ${role === "admin"
        ? "bg-indigo-100 text-indigo-700"
        : "bg-gray-100 text-gray-600"
      }`}>
      {role === "admin" ? "Admin" : "Usuário"}
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold
      ${active
        ? "bg-emerald-100 text-emerald-700"
        : "bg-red-100 text-red-600"
      }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-red-400"}`} />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

function ToastNotice({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5
      px-4 py-3 rounded-2xl shadow-lg border text-sm font-medium
      ${type === "success"
        ? "bg-white border-emerald-200 text-emerald-700"
        : "bg-white border-red-200 text-red-600"
      }`}>
      {type === "success"
        ? <CheckCircle size={16} className="text-emerald-500" />
        : <AlertCircle size={16} className="text-red-500" />
      }
      {message}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Role selector ────────────────────────────────────────────────

function RoleSelector({ userId, currentRole, onChanged, disabled }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  const select = async (role) => {
    if (role === currentRole) { setOpen(false); return; }
    setLoading(true);
    setOpen(false);
    try {
      await updateUserRole(userId, role);
      onChanged(userId, { role });
    } catch (err) {
      onChanged(userId, null, err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || loading}
        className="flex items-center gap-1.5 text-[12px] font-medium text-gray-600
                   hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100
                   transition-colors disabled:opacity-50"
      >
        {loading ? "..." : <RoleBadge role={currentRole} />}
        <ChevronDown size={11} className="text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200
                          rounded-xl shadow-lg overflow-hidden min-w-[130px]">
            {["user", "admin"].map((role) => (
              <button
                key={role}
                onClick={() => select(role)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors
                  ${role === currentRole
                    ? "bg-gray-50 text-gray-400 cursor-default"
                    : "hover:bg-indigo-50 text-gray-700 hover:text-indigo-700"
                  }`}
              >
                {role === "admin" ? "Admin" : "Usuário"}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Loja selector ────────────────────────────────────────────────

function LojaSelector({ userId, currentLojaId, lojas, onChanged }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  const current = lojas.find((l) => l.id === currentLojaId);

  const select = async (lojaId) => {
    if (lojaId === currentLojaId) { setOpen(false); return; }
    setLoading(true);
    setOpen(false);
    try {
      await assignUserToLoja(userId, lojaId);
      onChanged(userId, { loja_id: lojaId });
    } catch (err) {
      onChanged(userId, null, err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="flex items-center gap-1.5 text-[12px] font-medium text-gray-600
                   hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100
                   transition-colors disabled:opacity-50 max-w-[160px]"
      >
        {loading ? (
          <span className="text-gray-400">...</span>
        ) : current ? (
          <span className="flex items-center gap-1.5 truncate">
            <Scissors size={11} className="text-indigo-500 shrink-0" />
            <span className="truncate">{current.nome}</span>
          </span>
        ) : (
          <span className="text-gray-400 italic">Sem barbearia</span>
        )}
        <ChevronDown size={11} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200
                          rounded-xl shadow-lg overflow-hidden min-w-[180px] max-h-48 overflow-y-auto">
            <button
              onClick={() => select(null)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors
                ${!currentLojaId ? "bg-gray-50 text-gray-400 cursor-default" : "hover:bg-indigo-50 text-gray-700 hover:text-indigo-700"}`}
            >
              Sem barbearia
            </button>
            {lojas.map((loja) => (
              <button
                key={loja.id}
                onClick={() => select(loja.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors
                  ${loja.id === currentLojaId ? "bg-gray-50 text-gray-400 cursor-default" : "hover:bg-indigo-50 text-gray-700 hover:text-indigo-700"}`}
              >
                {loja.nome}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

export default function AdminUsers({ currentUserId }) {
  const [users,         setUsers]         = useState([]);
  const [lojas,         setLojas]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [error,         setError]         = useState(null);
  const [toast,         setToast]         = useState(null);
  const [search,        setSearch]        = useState("");
  const [filter,        setFilter]        = useState("all"); // all | admin | user | inactive
  const [confirmDelete, setConfirmDelete] = useState(null); // userId

  const load = async () => {
    try {
      const [profiles, lojasData] = await Promise.all([getAllProfiles(), getAllLojas()]);
      setUsers(profiles);
      setLojas(lojasData);
      setError(null);
    } catch (err) {
      setError(err.message || "Erro ao carregar usuários.");
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

  // Optimistic update: mutate local state immediately
  const handleChanged = (userId, patch, errMsg) => {
    if (errMsg) {
      setToast({ message: errMsg, type: "error" });
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, ...patch } : u))
    );
    setToast({ message: "Alteração salva com sucesso.", type: "success" });
  };

  const handleDelete = async (userId) => {
    try {
      await deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setConfirmDelete(null);
      setToast({ message: "Usuário excluído.", type: "success" });
    } catch (err) {
      setToast({ message: err.message || "Erro ao excluir usuário.", type: "error" });
      setConfirmDelete(null);
    }
  };

  const handleToggleActive = async (user) => {
    const next = !user.is_active;
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, is_active: next } : u))
    );
    try {
      await setUserActive(user.id, next);
      setToast({
        message: next ? "Usuário reativado." : "Usuário desativado.",
        type: "success",
      });
    } catch (err) {
      // Rollback
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: !next } : u))
      );
      setToast({ message: err.message, type: "error" });
    }
  };

  const filtered = useMemo(() => {
    let list = users;
    if (filter === "admin")    list = list.filter((u) => u.role === "admin");
    if (filter === "user")     list = list.filter((u) => u.role === "user");
    if (filter === "inactive") list = list.filter((u) => !u.is_active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (u) =>
          (u.email || "").toLowerCase().includes(q) ||
          (u.full_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, filter, search]);

  const FILTERS = [
    { key: "all",      label: "Todos" },
    { key: "admin",    label: "Admins" },
    { key: "user",     label: "Usuários" },
    { key: "inactive", label: "Inativos" },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {loading ? "Carregando..." : `${users.length} usuário${users.length !== 1 ? "s" : ""} cadastrado${users.length !== 1 ? "s" : ""}`}
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

      {/* Filters + search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-shadow"
            />
          </div>
          {/* Filter pills */}
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
        {/* Table header */}
        <div className="hidden md:grid grid-cols-[1fr_180px_140px_120px_130px_160px]
                        px-5 py-3 border-b border-gray-100 bg-gray-50/60">
          {["Usuário", "Barbearia", "Papel", "Status", "Criado em", "Ações"].map((h) => (
            <span key={h} className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {h}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-36 bg-gray-200 rounded-full mb-2" />
                  <div className="h-2.5 w-48 bg-gray-100 rounded-full" />
                </div>
                <div className="h-5 w-14 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-gray-400 text-sm">
              {search ? "Nenhum usuário encontrado para sua busca." : "Nenhum usuário cadastrado."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((u) => {
              const isMe = u.id === currentUserId;
              const name = u.full_name || u.email?.split("@")[0] || "—";
              const initial = name.charAt(0).toUpperCase();

              return (
                <div
                  key={u.id}
                  className={`md:grid md:grid-cols-[1fr_180px_140px_120px_130px_160px]
                              flex flex-wrap items-center gap-3 px-5 py-4
                              hover:bg-gray-50/60 transition-colors
                              ${!u.is_active ? "opacity-60" : ""}`}
                >
                  {/* User identity */}
                  <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-none">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center
                                    text-sm font-semibold shrink-0 select-none
                                    ${isMe ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-700"}`}>
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                        {name}
                        {isMe && (
                          <span className="text-[10px] text-indigo-500 font-semibold bg-indigo-50
                                          px-1.5 py-0.5 rounded-full">
                            Você
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                  </div>

                  {/* Loja */}
                  <div className="md:flex items-center">
                    {u.role !== "admin" && (
                      <LojaSelector
                        userId={u.id}
                        currentLojaId={u.loja_id}
                        lojas={lojas}
                        onChanged={handleChanged}
                      />
                    )}
                  </div>

                  {/* Role (with inline selector) */}
                  <div className="md:flex items-center">
                    <RoleSelector
                      userId={u.id}
                      currentRole={u.role}
                      onChanged={handleChanged}
                      disabled={isMe} // can't demote yourself
                    />
                  </div>

                  {/* Status */}
                  <div className="md:flex items-center">
                    <StatusBadge active={u.is_active} />
                  </div>

                  {/* Created at */}
                  <div className="hidden md:flex items-center">
                    <span className="text-xs text-gray-400">{formatDate(u.created_at)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleActive(u)}
                      disabled={isMe}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40
                        ${u.is_active
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        }`}
                    >
                      {u.is_active ? "Desativar" : "Ativar"}
                    </button>
                    {confirmDelete === u.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="text-[11px] font-semibold bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="text-[11px] text-gray-500 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(u.id)}
                        disabled={isMe}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <ToastNotice
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
