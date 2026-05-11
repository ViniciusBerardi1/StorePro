import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import AdminLogin from "./AdminLogin";
import AdminLayout from "./AdminLayout";
import AdminDashboard    from "../views/admin/AdminDashboard";
import AdminLojas        from "../views/admin/AdminLojas";
import AdminUsers        from "../views/admin/AdminUsers";
import AdminSubscriptions from "../views/admin/AdminSubscriptions";
import AdminSettings     from "../views/admin/AdminSettings";

// ── Route helpers ────────────────────────────────────────────────

function getInitialPath() {
  const p = window.location.pathname;
  // Normalise trailing slash
  return p.endsWith("/") && p !== "/" ? p.slice(0, -1) : p;
}

function navigate(path) {
  window.history.pushState({}, "", path);
}

function useAdminPath() {
  const [path, setPath] = useState(getInitialPath);

  // Listen to browser back/forward
  useEffect(() => {
    const onPop = () => setPath(getInitialPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (p) => {
    navigate(p);
    setPath(p);
  };

  return [path, go];
}

// ── Loading skeleton ─────────────────────────────────────────────

function AdminLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 animate-pulse" />
        <p className="text-sm text-gray-400">Carregando painel...</p>
      </div>
    </div>
  );
}

// ── Unauthorized screen ──────────────────────────────────────────

function AdminUnauthorized({ onSignOut }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Acesso negado</h2>
        <p className="text-sm text-gray-400 mb-6">
          Sua conta não tem permissão de administrador. Entre em contato com o responsável.
        </p>
        <button
          onClick={onSignOut}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl
                     text-sm font-medium transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

// ── Page renderer ────────────────────────────────────────────────

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0  },
  exit:    { opacity: 0, y: -8 },
};

function AdminPage({ path, currentUserId }) {
  let content;
  if (path === "/admin")                           content = <AdminDashboard />;
  else if (path.startsWith("/admin/lojas"))        content = <AdminLojas />;
  else if (path.startsWith("/admin/users"))        content = <AdminUsers currentUserId={currentUserId} />;
  else if (path.startsWith("/admin/subscriptions")) content = <AdminSubscriptions />;
  else if (path.startsWith("/admin/settings"))     content = <AdminSettings />;
  else content = (
    <div className="text-center py-20">
      <p className="text-gray-400 text-sm">Página não encontrada.</p>
      <a href="/admin" className="text-indigo-600 text-sm hover:underline mt-2 inline-block">
        Voltar ao dashboard
      </a>
    </div>
  );

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={path}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.18, ease: "easeInOut" }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

// ── Root admin component ─────────────────────────────────────────

export default function AdminApp() {
  const { user, profile, loading, isAuthenticated, isAdmin } = useAdminAuth();
  const [path, go] = useAdminPath();

  const handleSignOut = async () => {
    const { adminSignOut } = await import("../../services/adminAuth");
    try { await adminSignOut(); } catch { /* ignore */ }
    window.location.href = "/admin";
  };

  if (loading) return <AdminLoading />;

  if (!isAuthenticated) return <AdminLogin />;

  // Authenticated but not admin — can't access the panel
  if (!isAdmin) return <AdminUnauthorized onSignOut={handleSignOut} />;

  return (
    <AdminLayout
      currentPath={path}
      onNavigate={go}
      user={user}
      profile={profile}
    >
      <AdminPage path={path} currentUserId={user?.id} />
    </AdminLayout>
  );
}
