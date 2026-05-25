import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Store, AlertTriangle, LogOut } from "lucide-react";
import Sidebar from "./components/layout/Sidebar";
import ProdutoList from "./components/produto/ProdutoList";
import ProdutoForm from "./components/produto/ProdutoForm";
import AppLogin from "./components/app/AppLogin";
import { useAppAuth } from "./hooks/useAppAuth";
import { useEstoque } from "./hooks/useEstoque";
import { useFinanceiroLock } from "./hooks/useFinanceiroLock";
import Toast from "./components/ui/Toast";
import ConfirmModal from "./components/ui/ConfirmModal";
import SenhaModal from "./components/ui/SenhaModal";
import { db } from "./services/supabaseDb";
import { supabase } from "./services/supabase";

// ─── Lazy imports — rotas especiais (nunca precisam estar no bundle principal) ─
const AdminApp         = lazy(() => import("./components/admin/AdminApp"));
const ResetPassword    = lazy(() => import("./components/admin/ResetPassword"));
const Cadastro         = lazy(() => import("./components/app/Cadastro"));
const PaginaAssinatura = lazy(() => import("./components/views/PaginaAssinatura"));
const BarbeiroApp      = lazy(() => import("./components/barbeiro/BarbeiroApp"));

// ─── Lazy imports — views do app (carregadas sob demanda) ──────────────────────
const Agenda       = lazy(() => import("./components/views/Agenda"));
const Comandas     = lazy(() => import("./components/views/Comandas"));
const Dashboard    = lazy(() => import("./components/views/Dashboard"));
const Relatorios   = lazy(() => import("./components/views/Relatorios"));
const Caixa        = lazy(() => import("./components/views/Caixa"));
const Barbeiros    = lazy(() => import("./components/views/Barbeiros"));
const Servicos     = lazy(() => import("./components/views/Servicos"));
const Configuracoes = lazy(() => import("./components/views/Configuracoes"));
const Sobre        = lazy(() => import("./components/views/Sobre"));
const EmBreve      = lazy(() => import("./components/views/EmBreve"));
const ClientesLista = lazy(() => import("./components/views/ClientesLista"));
const PlanosManager = lazy(() =>
  import("./components/views/ClientesLista").then((m) => ({ default: m.PlanosManager }))
);

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 rounded-2xl bg-indigo-600 animate-pulse" />
    </div>
  );
}

// ─── Detecção de rotas especiais ─────────────────────────────────
const isPublicRoute    = window.location.pathname.startsWith("/assinar");
const isAdminRoute     = window.location.pathname.startsWith("/admin");
const isResetRoute     = window.location.pathname.startsWith("/reset-password");
const isCadastroRoute  = window.location.pathname.startsWith("/cadastro");
const isBarbeiroRoute  = window.location.pathname.startsWith("/barbeiro");

const VIEWS_ESTOQUE = ["estoque", "estoque_baixo", "produtos", "estoque_loja", "estoque_bar"];

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const pageTransition = { duration: 0.2, ease: "easeInOut" };


export default function App() {
  if (isPublicRoute)   return <Suspense fallback={<PageLoader />}><PaginaAssinatura /></Suspense>;
  if (isResetRoute)    return <Suspense fallback={<PageLoader />}><ResetPassword /></Suspense>;
  if (isCadastroRoute) return <Suspense fallback={<PageLoader />}><Cadastro /></Suspense>;
  if (isAdminRoute)    return <Suspense fallback={<PageLoader />}><AdminApp /></Suspense>;
  if (isBarbeiroRoute) return <Suspense fallback={<PageLoader />}><BarbeiroApp /></Suspense>;

  return <AppInterno />;
}

function AppInterno() {
  const { isAuthenticated, isAdmin, hasLoja, lojaAtivo, loading, signOut } = useAppAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated) return <AppLogin />;

  // Sessão de admin detectada no cliente da loja (sessão residual ou troca de contexto).
  // Limpa do cliente da loja e redireciona para /admin.
  if (isAdmin) {
    supabase.auth.signOut().then(() => { window.location.href = "/admin"; });
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 animate-pulse" />
      </div>
    );
  }

  // Loja desativada — bloqueia acesso e força logout
  if (isAuthenticated && hasLoja && !lojaAtivo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Acesso suspenso</h2>
          <p className="text-sm text-gray-400 mb-6">
            Sua barbearia foi desativada. Entre em contato com o administrador.
          </p>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </div>
    );
  }

  // Usuário autenticado mas sem loja vinculada
  if (!hasLoja) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <Store size={22} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Conta sem barbearia</h2>
          <p className="text-sm text-gray-400 mb-6">
            Sua conta ainda não foi vinculada a uma barbearia. Entre em contato com o administrador.
          </p>
          <button
            onClick={signOut}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return <AppPrincipal />;
}

function AppPrincipal() {
  const [view, setView] = useState(() => {
    const stored = localStorage.getItem("storepro_view") || "agenda";
    if (stored === "dashboard") return "agenda";
    if (stored === "estoque") return "estoque_loja";
    if (stored.startsWith("cat_") && isNaN(Number(stored.replace("cat_", "")))) return "agenda";
    return stored;
  });
  const [toast, setToast] = useState(null);
  const viewRef = useRef(view);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { localStorage.setItem("storepro_view", view); }, [view]);

  const estoque = useEstoque(setToast);
  const { showSenhaModal, pendingView, precisaSenha, abrirModal, confirmar, fechar } = useFinanceiroLock(viewRef);

  const navegar = useCallback((destino) => {
    if (precisaSenha(destino)) {
      abrirModal(destino);
    } else {
      setView(destino);
    }
  }, [precisaSenha, abrirModal]);

  const onAbrirComanda = useCallback(async (evento, servicosPreSel = []) => {
    const clienteNome = (evento.summary || "")
      .replace(/^✅\s*/, "")
      .split(/\s*[-—]\s*/)
      .pop()
      .trim() || "Cliente";
    try {
      const [barbeiros, clientes] = await Promise.all([
        db.getBarbeiros(),
        db.getClientes(),
      ]);

      let barbeiro_id = null;
      if (evento.colorId) {
        const barb = barbeiros.find((b) => b.gcal_color_id === evento.colorId);
        if (barb) barbeiro_id = barb.id;
      }

      const clienteMatch = clientes.find(
        (c) => c.nome.trim().toLowerCase() === clienteNome.trim().toLowerCase()
      );
      const cliente_id = clienteMatch?.id ?? null;

      const valorServicos = servicosPreSel.reduce((sum, s) => sum + Number(s.valor), 0);
      const cmd = await db.criarComanda({
        gcal_event_id: evento.id,
        cliente_nome: clienteNome,
        ...(cliente_id ? { cliente_id } : {}),
        status: "aberta",
        servicos: servicosPreSel,
        itens_bar: [],
        itens_loja: [],
        valor_servicos: valorServicos,
        valor_bar: 0,
        valor_loja: 0,
        valor_total: valorServicos,
        ...(barbeiro_id ? { barbeiro_id } : {}),
        evento_gcal: {
          summary: evento.summary,
          start: evento.start,
          end: evento.end,
          description: evento.description,
          colorId: evento.colorId,
        },
      });
      if (cmd?.id) {
        db.registrarEventoComanda(
          cmd.id, "criada",
          `Comanda criada via Agenda para ${clienteNome}`,
          { fonte: "agenda", gcal_event_id: evento.id, cliente_id: cliente_id ?? null, barbeiro_id: barbeiro_id ?? null }
        ).catch(() => {});
      }

      const dataHora = evento.start?.dateTime ?? evento.start?.date ?? new Date().toISOString();
      db.addAtendimento({
        gcal_event_id: evento.id,
        data_hora: dataHora,
        cliente_nome: clienteNome,
        ...(cliente_id ? { cliente_id } : {}),
        ...(barbeiro_id ? { barbeiro_id } : {}),
        servicos: servicosPreSel,
        valor_total: valorServicos,
        status: "agendado",
      }).catch(() => {});
      setView("comandas");
    } catch (e) {
      console.error("Erro ao criar comanda:", e);
      setToast("Erro ao criar comanda. Tente novamente.");
    }
  }, [setToast]);

  const alertas = useMemo(() => ({
    estoqueBaixo: estoque.produtos.filter((p) => p.quantidade <= (p.estoque_minimo ?? 1)).length,
  }), [estoque.produtos]);

  const produtosFiltrados = useMemo(() => {
    if (view === "estoque_baixo") return estoque.produtos.filter((p) => p.quantidade <= (p.estoque_minimo ?? 1));
    if (view === "estoque_bar") return estoque.produtos.filter((p) => p.tipo === "bar");
    if (view === "estoque_loja") return estoque.produtos.filter((p) => p.tipo !== "bar");
    return estoque.produtos;
  }, [view, estoque.produtos]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className={`transition-all duration-300 ${showSenhaModal ? "blur-md pointer-events-none select-none" : ""}`}>
        <Sidebar view={view} setView={navegar} alertas={alertas} />

        <AnimatePresence>
          {VIEWS_ESTOQUE.includes(view) && (
            <motion.button
              onClick={estoque.handleNovo}
              initial={{ opacity: 0, scale: 0.8, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed top-2 right-14 md:right-4 z-50 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold px-4 h-10 rounded-2xl transition-colors shadow-lg text-sm md:text-base flex items-center"
            >
              + Novo produto
            </motion.button>
          )}
        </AnimatePresence>

        <main className="md:ml-60 pt-20 md:pt-8 px-4 md:px-8 pb-8">
          <div className="max-w-[1280px] mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <Suspense fallback={<PageLoader />}>
                  {view === "configuracoes" ? (
                    <Configuracoes />
                  ) : view === "sobre" ? (
                    <Sobre />
                  ) : view === "servicos" ? (
                    <Servicos />
                  ) : view === "barbeiros" ? (
                    <Barbeiros />
                  ) : view === "financeiro" ? (
                    <Dashboard produtos={estoque.produtos} setView={navegar} />
                  ) : view === "caixa" ? (
                    <Caixa />
                  ) : view === "comandas" ? (
                    <Comandas onAtendimentoFinalizado={estoque.carregar} />
                  ) : view === "clientes_lista" ? (
                    <ClientesLista />
                  ) : view === "planos" ? (
                    <PlanosManager />
                  ) : view === "relatorios" ? (
                    <Relatorios />
                  ) : view === "agenda" ? (
                    <Agenda
                      onAtendimentoFinalizado={estoque.carregar}
                      onAbrirComanda={onAbrirComanda}
                    />
                  ) : VIEWS_ESTOQUE.includes(view) ? (
                    <ProdutoList
                      titulo={
                        view === "estoque_baixo" ? "Estoque Baixo" :
                        view === "estoque_bar" ? "Bar" :
                        view === "estoque_loja" ? "Loja" :
                        "Estoque"
                      }
                      produtos={produtosFiltrados}
                      categorias={estoque.categorias}
                      onEditar={estoque.handleEditar}
                      onDeletar={estoque.handleDeletar}
                      onNovo={estoque.handleNovo}
                      onAtualizarQuantidade={estoque.handleAtualizarQuantidade}
                      historicoEstoque={estoque.historicoEstoque}
                      mostrarBotaoNovo={true}
                    />
                  ) : (
                    <EmBreve modulo={view} />
                  )}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <AnimatePresence>
        {estoque.showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <ProdutoForm
              produto={estoque.editando}
              categorias={estoque.categorias}
              onSalvar={estoque.handleSalvar}
              onFechar={() => {
                estoque.setShowForm(false);
                estoque.setEditando(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {estoque.confirmandoId && (
          <ConfirmModal
            onConfirmar={estoque.confirmarDelete}
            onCancelar={() => estoque.setConfirmandoId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <Toast mensagem={toast} onFechar={() => setToast(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSenhaModal && (
          <SenhaModal
            onConfirmar={() => confirmar(setView)}
            onFechar={() => fechar(view, setView)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
