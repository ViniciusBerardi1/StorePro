import { useState, useCallback, useEffect } from "react";
import { db } from "../services/supabaseDb";

export function useEstoque(setToast) {
  const [produtos,         setProdutos]         = useState([]);
  const [categorias,       setCategorias]       = useState([]);
  const [historicoEstoque, setHistoricoEstoque] = useState([]);
  const [carregando,       setCarregando]       = useState(true);
  const [editando,         setEditando]         = useState(null);
  const [showForm,         setShowForm]         = useState(false);
  const [confirmandoId,    setConfirmandoId]    = useState(null);

  const carregar = useCallback(async () => {
    try {
      const [p, c, h] = await Promise.all([
        db.getProdutos(),
        db.getCategorias(),
        db.getHistorico(),
      ]);
      setProdutos(p);
      setCategorias(c);
      setHistoricoEstoque(h ?? []);
    } catch (err) {
      console.error("erro ao carregar:", err);
      setToast("Erro ao carregar dados. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }, [setToast]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleSalvar = useCallback(async (produto) => {
    try {
      if (produto.id) {
        await db.updateProduto(produto);
        setToast("Produto atualizado!");
      } else {
        await db.addProduto(produto);
        setToast("Produto adicionado!");
      }
      await carregar();
      setShowForm(false);
      setEditando(null);
    } catch (err) {
      console.error("erro ao salvar:", err);
      setToast("Erro ao salvar. Tente novamente.");
    }
  }, [carregar, setToast]);

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
  }, [confirmandoId, carregar, setToast]);

  const handleNovo = useCallback(() => {
    setEditando(null);
    setShowForm(true);
  }, []);

  const handleAtualizarQuantidade = useCallback(async (produto, quantidade) => {
    try {
      const qtdAnterior = produto.quantidade ?? 0;
      await db.updateProduto({ ...produto, quantidade });
      await db.registrarMovimento(produto, qtdAnterior, quantidade);
      await carregar();
    } catch (err) {
      console.error("erro ao atualizar quantidade:", err);
      setToast("Erro ao atualizar quantidade.");
    }
  }, [carregar, setToast]);

  return {
    produtos,
    categorias,
    historicoEstoque,
    carregando,
    editando,
    setEditando,
    showForm,
    setShowForm,
    confirmandoId,
    setConfirmandoId,
    carregar,
    handleSalvar,
    handleEditar,
    handleDeletar,
    confirmarDelete,
    handleNovo,
    handleAtualizarQuantidade,
  };
}
