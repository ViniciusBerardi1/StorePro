import { useState, useEffect, lazy, Suspense } from "react";
import { useBarbeiroAuth } from "../../hooks/useBarbeiroAuth";

const BarbeiroLogin  = lazy(() => import("./BarbeiroLogin"));
const BarbeiroLayout = lazy(() => import("./BarbeiroLayout"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 rounded-2xl bg-indigo-600 animate-pulse" />
    </div>
  );
}

function pageFromPath() {
  const p = window.location.pathname;
  if (p.startsWith("/barbeiro/perfil"))   return "perfil";
  if (p.startsWith("/barbeiro/horarios")) return "horarios";
  return "agenda";
}

export default function BarbeiroApp() {
  const { isAuthenticated, barbeiro, login, logout } = useBarbeiroAuth();
  const [page, setPage] = useState(pageFromPath);

  const navigate = (p) => {
    history.pushState({}, "", `/barbeiro/${p}`);
    setPage(p);
  };

  useEffect(() => {
    const onPop = () => setPage(pageFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <BarbeiroLogin onLogin={login} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <BarbeiroLayout
        barbeiro={barbeiro}
        page={page}
        navigate={navigate}
        onLogout={logout}
      />
    </Suspense>
  );
}
