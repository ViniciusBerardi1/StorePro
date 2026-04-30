import { useState, useEffect, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./components/layout/Sidebar";
import ProdutoList from "./components/produto/ProdutoList";
import ProdutoForm from "./components/produto/ProdutoForm";
import Dashboard from "./components/views/Dashboard";
import Sobre from "./components/views/Sobre";
import Historico from "./components/views/Historico";
import Desejos from "./components/views/Desejos";
import EmBreve from "./components/views/EmBreve";
import Agenda from "./components/views/Agenda";
import Servicos from "./components/views/Servicos";
import Barbeiros from "./components/views/Barbeiros";
import Toast from "./components/ui/Toast";
import ConfirmModal from "./components/ui/ConfirmModal";
import { db } from "./services/supabaseDb";

const VIEWS_ESTOQUE = ["estoque", "estoque_baixo", "produtos"];

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const pageTransition = { duration: 0.2, ease: "easeInOut" };

export default function App() {
  const [view, setView] = useState(() => {
    const stored = localStorage.getItem("storepro_view") || "dashboard";
    if (stored.startsWith("cat_") && isNaN(Number(stored.replace("cat_", "")))) return "dashboard";
    return stored;
  });
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [desejoOrigemId, setDesejoOrigemId] = useState(null);

  // ─── Dados do Dashboard (ficam no App para nunca pararem de atualizar) ────
  const [atendimentosHoje, setAtendimentosHoje] = useState([]);
  const [atendimentosMes, setAtendimentosMes]   = useState([]);
  const [grafico, setGrafico]                   = useState([]);
  const [loadingDash, setLoadingDash]           = useState(true);

  useEffect(() => {
    localStorage.setItem("storepro_view", view);
  }, [view]);

  const carregar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([db.getProdutos(), db.getCategorias()]);
      setProdutos(p);
      setCategorias(c);
    } catch (err) {
      console.error("erro ao carregar:", err);
      setToast("Erro ao carregar dados. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ─── Polling do Dashboard — roda sempre, mesmo fora da aba Dashboard ─────
  const carregarDashboard = useCallback(async () => {
    const agora = new Date();
    try {
      const [hoje, mes, graf] = await Promise.all([
        db.getAtendimentosHoje(),
        db.getAtendimentosMes(agora.getFullYear(), agora.getMonth() + 1),
        db.getFaturamentoUltimosDias(7),
      ]);
      setAtendimentosHoje(hoje);
      setAtendimentosMes(mes);
      setGrafico(graf);
    } catch (err) {
      console.error("[Dashboard] Erro ao carregar:", err);
    } finally {
      setLoadingDash(false);
    }
  }, []);

  useEffect(() => {
    carregarDashboard();

    // Polling a cada 30s
    const intervalo = setInterval(carregarDashboard, 30_000);

    // Atualiza ao voltar para a aba do browser
    const handleVisibilidade = () => {
      if (document.visibilityState === "visible") carregarDashboard();
    };
    document.addEventListener("visibilitychange", handleVisibilidade);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", handleVisibilidade);
    };
  }, [carregarDashboard]);

  const handleSalvar = useCallback(async (produto) => {
    try {
      if (produto.id) {
        await db.updateProduto(produto);
        setToast("Produto atualizado!");
      } else {
        await db.addProduto(produto);
        if (desejoOrigemId) {
          await db.deleteDesejo(desejoOrigemId);
          setDesejoOrigemId(null);
          setToast("Adicionado ao estoque e removido da lista de desejos!");
        } else {
          setToast("Produto adicionado!");
        }
      }
      await carregar();
      setShowForm(false);
      setEditando(null);
    } catch (err) {
      console.error("erro ao salvar:", err);
      setToast("Erro ao salvar. Tente novamente.");
    }
  }, [carregar, desejoOrigemId]);

  const handleAdicionarDesejo = useCallback((desejo) => {
    setEditando({
      id: null,
      nome: desejo.nome,
      categoria_id: desejo.categoria_id,
      preco_pago: desejo.preco_estimado || "",
    });
    setDesejoOrigemId(desejo.id);
    setView("produtos");
    setShowForm(true);
  }, []);

  const handleEditar = useCallback((produto) => {
    setEditando(produto);
    setShowForm(true);
  }, []);

  const handleDeletar = useCallback((id) => {
    setConfirmandoId(id);
  }, []);

  const confirmarDelete = useCallback(async () => {
    try {
      await db.deleteProduto(confirmandoId);
      await carregar();
      setToast("Produto removido.");
    } catch (err) {
      console.error("erro ao deletar:", err);
      setToast("Erro ao remover. Tente novamente.");
    } finally {
      setConfirmandoId(null);
    }
  }, [confirmandoId, carregar]);

  const handleNovo = useCallback(() => {
    setEditando(null);
    setShowForm(true);
  }, []);

  const handleAtualizarQuantidade = useCallback(async (produto, quantidade) => {
    try {
      await db.updateProduto({ ...produto, quantidade });
      if (quantidade === 0) {
        await db.addHistorico({
          produto_id: produto.id,
          produto_nome: produto.nome,
          produto_cor: produto.cor || "",
          categoria_nome: produto.categoria_nome || "",
          foto: produto.foto || "",
          data_zerado: new Date().toISOString(),
        });
      }
      await carregar();
    } catch (err) {
      console.error("erro ao atualizar quantidade:", err);
      setToast("Erro ao atualizar quantidade.");
    }
  }, [carregar]);

  const alertas = useMemo(() => ({
    estoqueBaixo: produtos.filter((p) => p.quantidade <= (p.estoque_minimo ?? 1)).length,
  }), [produtos]);

  const produtosFiltrados = useMemo(() => {
    if (view === "estoque_baixo") {
      return produtos.filter((p) => p.quantidade <= (p.estoque_minimo ?? 1));
    }
    return produtos;
  }, [view, produtos]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <Sidebar view={view} setView={setView} alertas={alertas} />

      <AnimatePresence>
        {VIEWS_ESTOQUE.includes(view) && (
          <motion.button
            onClick={handleNovo}
            initial={{ opacity: 0, scale: 0.8, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-2 right-14 md:right-4 z-50 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold px-4 h-10 rounded-2xl transition-colors shadow-lg text-sm md:text-base flex items-center"
          >
            ✨ Novo produto
          </motion.button>
        )}
      </AnimatePresence>

      <main className="md:ml-64 pt-20 md:pt-8 px-4 md:px-8 pb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
          >
            {view === "sobre" ? (
              <Sobre />
            ) : view === "servicos" ? (
              <Servicos />
            ) : view === "barbeiros" ? (
              <Barbeiros />
            ) : view === "agenda" ? (
              <Agenda onAtendimentoFinalizado={carregarDashboard} />
            ) : view === "dashboard" ? (
              <Dashboard
                atendimentosHoje={atendimentosHoje}
                atendimentosMes={atendimentosMes}
                grafico={grafico}
                loadingDash={loadingDash}
                onRefresh={carregarDashboard}
                produtos={produtos}
                setView={setView}
                carregando={carregando}
              />
            ) : VIEWS_ESTOQUE.includes(view) ? (
              <ProdutoList
                titulo={view === "estoque_baixo" ? "Estoque Baixo" : "Estoque"}
                produtos={produtosFiltrados}
                categorias={categorias}
                onEditar={handleEditar}
                onDeletar={handleDeletar}
                onNovo={handleNovo}
                onAtualizarQuantidade={handleAtualizarQuantidade}
                mostrarBotaoNovo={true}
              />
            ) : (
              <EmBreve modulo={view} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <ProdutoForm
              produto={editando}
              categorias={categorias}
              onSalvar={handleSalvar}
              onFechar={() => {
                setShowForm(false);
                setEditando(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmandoId && (
          <ConfirmModal
            onConfirmar={confirmarDelete}
            onCancelar={() => setConfirmandoId(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <Toast mensagem={toast} onFechar={() => setToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
