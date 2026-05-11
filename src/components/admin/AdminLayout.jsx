import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Shield,
  ChevronRight,
  Scissors,
} from "lucide-react";
import { adminSignOut } from "../../services/adminAuth";

const NAV_ITEMS = [
  { path: "/admin",               label: "Dashboard",     Icon: LayoutDashboard },
  { path: "/admin/lojas",         label: "Barbearias",    Icon: Scissors        },
  { path: "/admin/users",         label: "Usuários",      Icon: Users           },
  { path: "/admin/subscriptions", label: "Assinaturas",   Icon: CreditCard      },
  { path: "/admin/settings",      label: "Configurações", Icon: Settings        },
];

function isNavActive(item, currentPath) {
  if (item.path === "/admin") return currentPath === "/admin";
  return currentPath.startsWith(item.path);
}

function NavItem({ item, currentPath, onNavigate }) {
  const active = isNavActive(item, currentPath);
  const { Icon } = item;
  return (
    <button
      onClick={() => onNavigate(item.path)}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-150 text-left
        ${active
          ? "bg-indigo-600 text-white shadow-sm"
          : "text-slate-400 hover:text-white hover:bg-slate-700/60"
        }`}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      {item.label}
    </button>
  );
}

function SidebarContent({ currentPath, onNavigate, user, profile, onSignOut }) {
  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Admin";

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 pb-6">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <Shield size={15} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold leading-tight truncate">StorePro</p>
          <p className="text-slate-500 text-xs leading-tight">Admin</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-0.5">
        <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5">
          Sistema
        </p>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            item={item}
            currentPath={currentPath}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* User info + sign out */}
      <div className="pt-3 mt-3 border-t border-slate-700/50">
        <div className="px-3 py-1.5 mb-1">
          <p className="text-white text-xs font-medium truncate">{displayName}</p>
          <p className="text-slate-500 text-[11px] truncate">{user?.email}</p>
        </div>
        <button
          onClick={onSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm
                     font-medium text-slate-400 hover:text-white hover:bg-slate-700/60
                     transition-all duration-150"
        >
          <LogOut size={15} strokeWidth={2} />
          Sair
        </button>
      </div>
    </div>
  );
}

function BreadcrumbLabel({ path }) {
  if (path === "/admin")               return "Dashboard";
  if (path.startsWith("/admin/lojas")) return "Barbearias";
  if (path.startsWith("/admin/users")) return "Usuários";
  if (path.startsWith("/admin/subscriptions")) return "Assinaturas";
  if (path.startsWith("/admin/settings"))      return "Configurações";
  return "Admin";
}

export default function AdminLayout({ children, currentPath, onNavigate, user, profile }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    try { await adminSignOut(); } catch { /* ignore */ }
    window.location.href = "/admin";
  };

  const navigate = (path) => {
    onNavigate(path);
    setMobileOpen(false);
  };

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Admin";
  const initial     = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Desktop sidebar ──────────────────────────────────────── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-56 bg-slate-900 flex-col py-5 px-3 z-40">
        <SidebarContent
          currentPath={currentPath}
          onNavigate={navigate}
          user={user}
          profile={profile}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900 h-14 px-4
                         flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Shield size={13} className="text-white" />
          </div>
          <span className="text-white text-sm font-semibold">StorePro Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="text-slate-400 hover:text-white p-2 rounded-lg
                     hover:bg-slate-700/60 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* ── Mobile drawer ────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/50 z-40"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="md:hidden fixed top-0 left-0 h-full w-64 bg-slate-900
                         flex flex-col py-5 px-3 z-50 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6 px-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                    <Shield size={13} className="text-white" />
                  </div>
                  <span className="text-white text-sm font-semibold">StorePro Admin</span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg
                             hover:bg-slate-700/60 transition-colors"
                  aria-label="Fechar menu"
                >
                  <X size={16} />
                </button>
              </div>
              <SidebarContent
                currentPath={currentPath}
                onNavigate={navigate}
                user={user}
                profile={profile}
                onSignOut={handleSignOut}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content area ────────────────────────────────────── */}
      <div className="md:ml-56 flex-1 flex flex-col min-h-screen">

        {/* Desktop top header */}
        <div className="hidden md:flex items-center justify-between h-14 px-6
                        bg-white border-b border-gray-200 sticky top-0 z-30">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-gray-400">Admin</span>
            <ChevronRight size={13} className="text-gray-300" />
            <span className="text-gray-800 font-medium">
              <BreadcrumbLabel path={currentPath} />
            </span>
          </div>
          {/* User info */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-gray-700 leading-tight">{displayName}</p>
              <p className="text-[11px] text-gray-400 leading-tight">
                {profile?.role === "admin" ? "Administrador" : "Usuário"}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center
                            justify-center text-sm font-semibold select-none">
              {initial}
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 pt-16 md:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
