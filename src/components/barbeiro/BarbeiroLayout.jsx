import { lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, User, Clock } from "lucide-react";
import { useBarbeiroAuth } from "../../hooks/useBarbeiroAuth";

const BarbeiroAgenda  = lazy(() => import("./BarbeiroAgenda"));
const BarberoPerfil   = lazy(() => import("./BarberoPerfil"));

const NAV_ITEMS = [
  { id: "agenda",   label: "Agenda",   icon: Calendar },
  { id: "perfil",   label: "Perfil",   icon: User     },
  { id: "horarios", label: "Horários", icon: Clock    },
];

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-7 h-7 rounded-xl bg-indigo-600 animate-pulse" />
    </div>
  );
}

function EmBreveHorarios() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center">
        <Clock size={22} className="text-gray-600" />
      </div>
      <div>
        <p className="text-white font-semibold">Meus Horários</p>
        <p className="text-sm text-gray-500 mt-1">Em breve</p>
      </div>
    </div>
  );
}

export default function BarbeiroLayout({ barbeiro, page, navigate }) {
  const { logout } = useBarbeiroAuth();

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3.5 flex items-center gap-3 sticky top-0 z-20">
        <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {barbeiro?.nome?.charAt(0)?.toUpperCase() ?? "B"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-tight truncate">{barbeiro?.nome ?? "Barbeiro"}</p>
          <p className="text-xs text-gray-500">Portal do Barbeiro</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-auto pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="flex-1 flex flex-col"
          >
            <Suspense fallback={<PageLoader />}>
              {page === "agenda" ? (
                <BarbeiroAgenda />
              ) : page === "perfil" ? (
                <BarberoPerfil />
              ) : (
                <EmBreveHorarios />
              )}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex items-stretch z-20 safe-area-inset-bottom">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors ${
                active ? "text-indigo-400" : "text-gray-600 hover:text-gray-400"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.6} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
