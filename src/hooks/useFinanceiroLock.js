import { useState, useRef, useEffect, useCallback } from "react";

const VIEWS_PROTEGIDAS = ["financeiro", "relatorios"];

export function useFinanceiroLock(viewRef) {
  const [financeiroDesbloqueado, setFinanceiroDesbloqueado] = useState(false);
  const [showSenhaModal, setShowSenhaModal]                 = useState(false);
  const [pendingView,    setPendingView]                    = useState("financeiro");
  const lastActivityRef = useRef(Date.now());
  const checkRef        = useRef(null);

  // Atualiza timestamp de atividade em qualquer interação do usuário
  useEffect(() => {
    const atualizar = () => { lastActivityRef.current = Date.now(); };
    const EVENTOS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    EVENTOS.forEach((ev) => window.addEventListener(ev, atualizar, { passive: true }));
    return () => EVENTOS.forEach((ev) => window.removeEventListener(ev, atualizar));
  }, []);

  // Polling a cada 2s: trava o financeiro após 60s de inatividade
  useEffect(() => {
    if (!financeiroDesbloqueado) {
      clearInterval(checkRef.current);
      return;
    }

    lastActivityRef.current = Date.now();

    checkRef.current = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= 60_000) {
        clearInterval(checkRef.current);
        setFinanceiroDesbloqueado(false);
        if (VIEWS_PROTEGIDAS.includes(viewRef.current)) {
          setPendingView(viewRef.current);
          setShowSenhaModal(true);
        }
      }
    }, 2_000);

    return () => clearInterval(checkRef.current);
  }, [financeiroDesbloqueado, viewRef]);

  const precisaSenha = useCallback(
    (destino) => VIEWS_PROTEGIDAS.includes(destino) && !financeiroDesbloqueado,
    [financeiroDesbloqueado]
  );

  const abrirModal = useCallback((destino) => {
    setPendingView(destino);
    setShowSenhaModal(true);
  }, []);

  // Chamado quando o usuário confirma a senha corretamente
  const confirmar = useCallback((setView) => {
    setFinanceiroDesbloqueado(true);
    setShowSenhaModal(false);
    setView(pendingView);
  }, [pendingView]);

  // Chamado quando o usuário cancela o modal de senha
  const fechar = useCallback((view, setView) => {
    setShowSenhaModal(false);
    if (VIEWS_PROTEGIDAS.includes(view)) setView("agenda");
  }, []);

  return {
    showSenhaModal,
    pendingView,
    precisaSenha,
    abrirModal,
    confirmar,
    fechar,
  };
}
