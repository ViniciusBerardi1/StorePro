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

const VIEWS_ESTOQUE = ["estoque", "estoque_baixo", "produtos", "estoque_loja", "estoque_bar"];

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const pageTransition = { duration: 0.2, ease: "easeInOut" };

function SenhaModal({ onConfirmar, onFechar }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [verificando, setVerificando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!senha.trim()) return;
    setVerificando(true);
    setErro(null);
    try {
      const senhaCorreta = await db.getConfiguracao("financeiro_senha");
      if (!senhaCorreta) return setErro("Senha não configurada. Insira em: configuracoes → financeiro_senha.");
      if (senha === senhaCorreta) {
        onConfirmar();
      } else {
        setErro("Senha incorreta.");
        setSenha("");
      }
    } catch {
      setErro("Erro ao verificar. Tente novamente.");
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-xl"
      >
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">🔒</div>
          <h3 className="font-semibold text-gray-800">Área Financeira</h3>
          <p className="text-xs text-gray-400 mt-1">Digite a senha para continuar</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha"
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {erro && (
            <p className="text-xs text-red-500 text-center">{erro}</p>
          )}
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={verificando}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
            >
              {verificando ? "..." : "Entrar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(() => {
    const stored = localStorage.getItem("storepro_view") || "agenda";
    if (stored === "dashboard") return "agenda";
    if (stored === "estoque") return "estoque_loja"; // migra view antiga
    if (stored.startsWith("cat_") && isNaN(Number(stored.replace("cat_", "")))) return "agenda";
    return stored;
  });
  const [financeiroDesbloqueado, setFinanceiroDesbloqueado] = useState(false);
  const [showSenhaModal, setShowSenhaModal] = useState(false);
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

  const navegar = useCallback((destino) => {
    if (destino === "financeiro" && !financeiroDesbloqueado) {
      setShowSenhaModal(true);
    } else {
      setView(destino);
    }
  }, [financeiroDesbloqueado]);

  const alertas = useMemo(() => ({
    estoqueBaixo: produtos.filter((p) => p.quantidade <= (p.estoque_minimo ?? 1)).length,
  }), [produtos]);

  const produtosFiltrados = useMemo(() => {
    if (view === "estoque_baixo") return produtos.filter((p) => p.quantidade <= (p.estoque_minimo ?? 1));
    if (view === "estoque_bar") return produtos.filter((p) => p.tipo === "bar");
    if (view === "estoque_loja") return produtos.filter((p) => p.tipo !== "bar");
    return produtos;
  }, [view, produtos]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <Sidebar view={view} setView={navegar} alertas={alertas} />

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
            ) : view === "financeiro" ? (
              <Dashboard
                atendimentosHoje={atendimentosHoje}
                atendimentosMes={atendimentosMes}
                grafico={grafico}
                loadingDash={loadingDash}
                onRefresh={carregarDashboard}
                produtos={produtos}
                setView={navegar}
                carregando={carregando}
              />
            ) : view === "agenda" ? (
              <Agenda onAtendimentoFinalizado={carregarDashboard} />
            ) : VIEWS_ESTOQUE.includes(view) ? (
              <ProdutoList
                titulo={
                  view === "estoque_baixo" ? "Estoque Baixo" :
                  view === "estoque_bar" ? "Bar 🍺" :
                  view === "estoque_loja" ? "Loja 🛍️" :
                  "Estoque"
                }
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

      <AnimatePresence>
        {showSenhaModal && (
          <SenhaModal
            onConfirmar={() => {
              setFinanceiroDesbloqueado(true);
              setShowSenhaModal(false);
              setView("financeiro");
            }}
            onFechar={() => setShowSenhaModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
