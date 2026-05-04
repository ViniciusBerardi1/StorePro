import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  initGoogleCalendar,
  googleSignIn,
  googleSignOut,
  isGoogleConnected,
  getEventos,
  criarEvento,
  atualizarEvento,
  deletarEvento,
} from "../../services/googleCalendar";
import { db } from "../../services/supabaseDb";
import { GCAL_CORES } from "./Barbeiros";
import Comanda from "./Comanda";
import ClienteSelector from "../ui/ClienteSelector";

const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function mesmodia(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function getDiasDaSemana(offset) {
  const hoje = new Date();
  const dow = hoje.getDay();
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(segunda.getDate() + i);
    return d;
  });
}

function fmtHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Modal de confirmação para abrir comanda ──────────────────────
function ConfirmacaoComanda({ evento, onConfirmar, onCancelar }) {
  const clienteNome = evento?.summary?.replace(/^✅\s*/, "").split(/[-—]/)[0].trim() || "cliente";
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-xl text-center"
      >
        <div className="text-4xl mb-3">🧾</div>
        <h3 className="font-semibold text-gray-800 mb-1">Abrir comanda?</h3>
        <p className="text-sm text-gray-500 mb-5">
          para <span className="font-medium text-gray-700">{clienteNome}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Não
          </button>
          <button
            onClick={onConfirmar}
            className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            ✅ Abrir
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Formulário de agendamento (simplificado) ─────────────────────
function EventoForm({ evento, diaPadrao, onSalvar, onFechar, onDeletar, onIniciarAtendimento, barbeiros = [], eventos = [], clientes = [] }) {
  const dataDefault = (diaPadrao ?? new Date()).toISOString().slice(0, 10);
  const eConcluido = evento?.summary?.startsWith("✅");

  const [form, setForm] = useState({
    summary: evento?.summary || "",
    data: evento?.start?.dateTime ? evento.start.dateTime.slice(0, 10) : dataDefault,
    horaInicio: evento?.start?.dateTime ? fmtHora(evento.start.dateTime) : "09:00",
    horaFim: evento?.end?.dateTime ? fmtHora(evento.end.dateTime) : "10:00",
    description: evento?.description || "",
  });

  const [barbeiroId, setBarbeiroId] = useState(() => {
    if (!evento?.colorId) return null;
    const barb = barbeiros.find((b) => b.gcal_color_id === evento.colorId);
    return barb?.id ?? null;
  });

  const [clienteSel, setClienteSel] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState(null);

  const handleClienteChange = (cliente) => {
    setClienteSel(cliente);
    if (!cliente) return;
    setForm((f) => {
      const trimmed = f.summary.trim();
      if (!trimmed) return { ...f, summary: cliente.nome };
      if (/\s[—-]\s/.test(trimmed)) {
        const partes = trimmed.split(/\s[—-]\s/);
        return { ...f, summary: `${partes[0]} — ${cliente.nome}` };
      }
      return { ...f, summary: `${trimmed} — ${cliente.nome}` };
    });
  };

  const barbeirosRef = useRef(barbeiros);
  barbeirosRef.current = barbeiros;
  const eventosRef = useRef(eventos);
  eventosRef.current = eventos;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.summary.trim()) return;
    if (form.horaInicio < "09:00" || form.horaInicio > "20:00")
      return setErroForm("Horário de início deve ser entre 09:00 e 20:00.");
    if (form.horaFim < "09:00" || form.horaFim > "20:00")
      return setErroForm("Horário de fim deve ser entre 09:00 e 20:00.");
    if (form.horaFim <= form.horaInicio)
      return setErroForm("Horário de fim deve ser após o início.");

    const inicioNovo = new Date(`${form.data}T${form.horaInicio}:00`);
    const fimNovo = new Date(`${form.data}T${form.horaFim}:00`);

    if (!evento && inicioNovo <= new Date())
      return setErroForm("Não é possível agendar em horários que já passaram.");

    if (barbeiroId) {
      const barbSel = barbeirosRef.current.find((b) => b.id === barbeiroId);
      if (barbSel) {
        const conflito = eventosRef.current
          .filter((ev) => ev.colorId === barbSel.gcal_color_id && ev.id !== evento?.id && ev.start?.dateTime)
          .some((ev) => {
            const evInicio = new Date(ev.start.dateTime);
            const evFim = new Date(ev.end.dateTime);
            return inicioNovo < evFim && fimNovo > evInicio;
          });
        if (conflito)
          return setErroForm(`${barbSel.nome} já tem agendamento neste horário. Escolha outro horário ou barbeiro.`);
      }
    }

    setErroForm(null);
    setSalvando(true);
    try {
      const barbSel = barbeirosRef.current.find((b) => b.id === barbeiroId);
      await onSalvar({
        summary: form.summary.trim(),
        description: form.description,
        start: { dateTime: `${form.data}T${form.horaInicio}:00`, timeZone: TZ },
        end: { dateTime: `${form.data}T${form.horaFim}:00`, timeZone: TZ },
        ...(barbSel ? { colorId: barbSel.gcal_color_id } : {}),
      });
    } catch (e) {
      setErroForm(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800 text-base">
              {evento ? "Agendamento" : "Novo agendamento"}
            </h3>
            {eConcluido && (
              <span className="text-xs font-medium bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                Concluído
              </span>
            )}
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!evento && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Cliente</label>
              <ClienteSelector
                clientes={clientes}
                value={clienteSel}
                onChange={handleClienteChange}
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Título *</label>
            <input
              type="text"
              value={form.summary}
              onChange={set("summary")}
              placeholder="Ex: Corte — João Silva"
              required
              autoFocus={!!evento}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Data *</label>
            <input
              type="date"
              value={form.data}
              onChange={set("data")}
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Início <span className="text-gray-400 font-normal">(09:00–20:00)</span></label>
              <input
                type="time"
                value={form.horaInicio}
                min="09:00"
                max="20:00"
                onChange={set("horaInicio")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Fim <span className="text-gray-400 font-normal">(até 20:00)</span></label>
              <input
                type="time"
                value={form.horaFim}
                min="09:00"
                max="20:00"
                onChange={set("horaFim")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          {/* Seletor de barbeiro */}
          {barbeiros.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block">Barbeiro</label>
              <div className="flex flex-wrap gap-2">
                {barbeiros.map((b) => {
                  const cor = GCAL_CORES[b.gcal_color_id] ?? GCAL_CORES["9"];
                  const sel = barbeiroId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBarbeiroId(sel ? null : b.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm border transition-all
                        ${sel ? "border-transparent text-white font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
                      style={sel ? { backgroundColor: cor.hex } : {}}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sel ? "rgba(255,255,255,0.6)" : cor.hex }} />
                      {b.nome}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Observações</label>
            <textarea
              value={form.description}
              onChange={set("description")}
              placeholder="Anotações do cliente..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          {erroForm && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              ⚠️ {erroForm}
            </div>
          )}

          {/* Botão iniciar atendimento — só para eventos existentes */}
          {evento && (
            <button
              type="button"
              onClick={() => onIniciarAtendimento(evento)}
              className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {eConcluido ? "🧾 Ver Comanda" : "▶ Iniciar Atendimento"}
            </button>
          )}

          <div className="flex gap-2">
            {evento && (
              <button
                type="button"
                onClick={() => onDeletar(evento.id)}
                className="px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
              >
                Excluir
              </button>
            )}
            <button
              type="button"
              onClick={onFechar}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Tela de conexão ─────────────────────────────────────────────
function TelaConectar({ gisReady, sessionExpired }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-sm mx-auto mt-12 bg-white border border-gray-200 rounded-2xl p-8 text-center"
    >
      <div className="text-5xl mb-4">📅</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">
        {sessionExpired ? "Sessão encerrada" : "Conectar Google Calendar"}
      </h3>
      <p className="text-sm text-gray-500 leading-relaxed mb-6">
        {sessionExpired
          ? "Sua sessão com o Google Calendar expirou. Clique no botão abaixo para reconectar."
          : "Gerencie seus agendamentos pelo StorePro, sincronizado em tempo real com o Google Calendar."}
      </p>
      <button
        onClick={googleSignIn}
        disabled={!gisReady}
        className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 font-medium py-3 px-6 rounded-xl transition-all disabled:opacity-50"
      >
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {gisReady ? "Entrar com Google" : "Carregando..."}
      </button>
    </motion.div>
  );
}

// ─── Agenda principal ─────────────────────────────────────────────
const LS_KEY = "gcal_was_connected";

export default function Agenda({ onAtendimentoFinalizado, onAbrirComanda, refreshTick = 0 }) {
  const [conectado, setConectado] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [reconectando, setReconectando] = useState(() => !!localStorage.getItem(LS_KEY));
  const [sessionExpired, setSessionExpired] = useState(() => !!localStorage.getItem(LS_KEY));
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [diaSelecionado, setDiaSelecionado] = useState(new Date());
  const [eventos, setEventos] = useState([]);
  const [barbeiros, setBarbeiros] = useState([]);
  const [filtroBarbeiro, setFiltroBarbeiro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [confirmacaoComanda, setConfirmacaoComanda] = useState(null);
  const [showComandaModal, setShowComandaModal] = useState(false);
  const [eventoComandaModal, setEventoComandaModal] = useState(null);

  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    db.getBarbeiros().then(setBarbeiros).catch(() => {});
    db.getClientes().then(setClientes).catch(() => {});
  }, []);

  // Recarrega eventos quando a comanda lateral finaliza um atendimento
  useEffect(() => {
    if (refreshTick > 0 && isGoogleConnected()) carregarEventos();
  }, [refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let tentativas = 0;
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        initGoogleCalendar((token) => {
          setConectado(!!token);
          setReconectando(false);
          if (token) setSessionExpired(false);
        });
        setGisReady(true);
        if (localStorage.getItem(LS_KEY)) setTimeout(() => setReconectando(false), 5500);
      } else if (tentativas++ < 30) {
        setTimeout(check, 300);
      } else {
        setReconectando(false);
      }
    };
    check();
  }, []);

  const dias = getDiasDaSemana(semanaOffset);

  const carregarEventos = useCallback(async () => {
    if (!isGoogleConnected()) return;
    setCarregando(true);
    setErro(null);
    try {
      const inicio = new Date(dias[0]);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(dias[6]);
      fim.setHours(23, 59, 59, 999);
      setEventos(await getEventos(inicio, fim));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [conectado, semanaOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!conectado) return;
    carregarEventos();
    const intervalo = setInterval(() => {
      if (isGoogleConnected()) carregarEventos();
    }, 30_000);
    const handleVisibilidade = () => {
      if (document.visibilityState === "visible" && isGoogleConnected()) carregarEventos();
    };
    document.addEventListener("visibilitychange", handleVisibilidade);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", handleVisibilidade);
    };
  }, [conectado, semanaOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const barbFiltro = filtroBarbeiro ? barbeiros.find((b) => b.id === filtroBarbeiro) : null;

  const eventosDoDia = eventos
    .filter((ev) => mesmodia(new Date(ev.start?.dateTime || ev.start?.date), diaSelecionado))
    .filter((ev) => !barbFiltro || ev.colorId === barbFiltro.gcal_color_id)
    .sort((a, b) => new Date(a.start?.dateTime || a.start?.date) - new Date(b.start?.dateTime || b.start?.date));

  const eventosPendentes = eventosDoDia.filter((ev) => !ev.summary?.startsWith("✅"));
  const eventosConcluidos = eventosDoDia.filter((ev) => ev.summary?.startsWith("✅"));

  const contagemPorDia = dias.map((d) =>
    eventos.filter((ev) => mesmodia(new Date(ev.start?.dateTime || ev.start?.date), d)).length
  );

  function _isAuthError(msg) {
    return /sessão expirada|autenticad|renovar token|não autenticad/i.test(msg ?? "");
  }

  async function handleSalvar(eventoGcal) {
    if (editando) {
      setEventos((prev) => prev.map((e) => e.id === editando.id ? { ...editando, ...eventoGcal } : e));
    }
    setShowForm(false);
    setEditando(null);
    try {
      if (editando) {
        await atualizarEvento(editando.id, eventoGcal);
      } else {
        const tempId = `temp-${Date.now()}`;
        setEventos((prev) => [...prev, { id: tempId, ...eventoGcal, colorId: "9" }]);
        const criado = await criarEvento(eventoGcal);
        setEventos((prev) => prev.map((e) => e.id === tempId ? criado : e));
      }
      carregarEventos();
    } catch (e) {
      setErro(e.message);
      if (_isAuthError(e.message)) { setConectado(false); setReconectando(false); }
      else carregarEventos();
    }
  }

  async function handleDeletar(id) {
    setEventos((prev) => prev.filter((e) => e.id !== id));
    setShowForm(false);
    setEditando(null);
    try {
      await deletarEvento(id);
      carregarEventos();
    } catch (e) {
      setErro(e.message);
      if (_isAuthError(e.message)) { setConectado(false); setReconectando(false); }
      else carregarEventos();
    }
  }

  function handleIniciarAtendimento(ev) {
    setShowForm(false);
    setEditando(null);
    setConfirmacaoComanda(ev);
  }

  function handleConfirmarComanda() {
    const ev = confirmacaoComanda;
    setConfirmacaoComanda(null);
    onAbrirComanda?.(ev);
  }

  // Finalização de comanda concluída (modal de visualização — só Supabase, GCal já tem ✅)
  async function handleFinalizarComandaModal(ev, comandaData) {
    const { servicos, itens_bar, itens_loja, valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento, barbeiroId } = comandaData;
    const clienteNome = ev.summary?.replace(/^✅\s*/, "").split(/[-—]/)[0].trim();
    const dataHora = ev.start?.dateTime ? new Date(ev.start.dateTime).toISOString() : new Date().toISOString();
    const atendId = await db.addAtendimento({ gcal_event_id: ev.id, data_hora: dataHora, cliente_nome: clienteNome, servicos, valor_total, forma_pagamento, status: "concluido", observacoes: ev.description || "", ...(barbeiroId ? { barbeiro_id: barbeiroId } : {}) });
    await db.saveComanda({ gcal_event_id: ev.id, atendimento_id: typeof atendId === "number" ? atendId : null, servicos, itens_bar, itens_loja, valor_servicos, valor_bar, valor_loja, valor_total, forma_pagamento, status: "fechada" });
    setShowComandaModal(false);
    setEventoComandaModal(null);
    onAtendimentoFinalizado?.();
  }

  const hoje = new Date();
  const mesAno = `${MESES[dias[3].getMonth()]} ${dias[3].getFullYear()}`;

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-semibold text-gray-800"
        >
          Agenda
        </motion.h2>
        {conectado && (
          <div className="flex items-center gap-3">
            <button
              onClick={carregarEventos}
              className="text-xs text-gray-400 hover:text-indigo-500 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
            >
              🔄 Sincronizar
            </button>
            <button
              onClick={() => { googleSignOut(); setEventos([]); setSessionExpired(false); }}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              Desconectar
            </button>
          </div>
        )}
      </div>

      {!conectado && reconectando ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm animate-pulse">
          Reconectando ao Google...
        </div>
      ) : !conectado ? (
        <TelaConectar gisReady={gisReady} sessionExpired={sessionExpired} />
      ) : (
        <>
          {/* Navegação da semana */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">{mesAno}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setSemanaOffset(0); setDiaSelecionado(new Date()); }}
                  className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors font-medium"
                >
                  Hoje
                </button>
                <button
                  onClick={() => setSemanaOffset((o) => o - 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors text-lg"
                >‹</button>
                <button
                  onClick={() => setSemanaOffset((o) => o + 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors text-lg"
                >›</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {dias.map((d, i) => {
                const isHoje = mesmodia(d, hoje);
                const isSelecionado = mesmodia(d, diaSelecionado);
                return (
                  <button
                    key={i}
                    onClick={() => setDiaSelecionado(new Date(d))}
                    className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all
                      ${isSelecionado ? "bg-indigo-500 text-white" : isHoje ? "bg-indigo-50 text-indigo-600" : "text-gray-600 hover:bg-gray-100"}`}
                  >
                    <span className="text-xs font-medium">{DIAS_SEMANA_CURTO[d.getDay()]}</span>
                    <span className="text-sm font-bold leading-none">{d.getDate()}</span>
                    <div className="h-1.5 flex items-center justify-center">
                      {contagemPorDia[i] > 0 && (
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelecionado ? "bg-white/60" : "bg-indigo-400"}`} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Lista de eventos do dia */}
          <motion.div
            key={diaSelecionado.toDateString()}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white border border-gray-200 rounded-2xl p-5 flex-1"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800 capitalize">
                  {diaSelecionado.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {carregando ? "Carregando..." : `${eventosPendentes.length} pendente${eventosPendentes.length !== 1 ? "s" : ""} · ${eventosConcluidos.length} concluído${eventosConcluidos.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <button
                onClick={() => { setEditando(null); setShowForm(true); }}
                className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
              >
                + Novo
              </button>
            </div>

            {/* Filtro por barbeiro */}
            {barbeiros.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-4">
                <button
                  onClick={() => setFiltroBarbeiro(null)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!filtroBarbeiro ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                >
                  Todos
                </button>
                {barbeiros.map((b) => {
                  const cor = GCAL_CORES[b.gcal_color_id] ?? GCAL_CORES["9"];
                  const ativo = filtroBarbeiro === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setFiltroBarbeiro(ativo ? null : b.id)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
                      style={ativo ? { backgroundColor: cor.hex, color: "#fff" } : { backgroundColor: cor.hex + "22", color: cor.hex }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cor.hex }} />
                      {b.nome}
                    </button>
                  );
                })}
              </div>
            )}

            {carregando ? (
              <div className="py-10 text-center text-sm text-gray-400 animate-pulse">Buscando eventos...</div>
            ) : eventosDoDia.length === 0 ? (
              <div className="py-10 text-center">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm text-gray-400">Nenhum evento neste dia.</p>
                <button
                  onClick={() => { setEditando(null); setShowForm(true); }}
                  className="mt-3 text-sm text-indigo-500 hover:text-indigo-600 font-medium"
                >
                  + Criar evento
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Agendados — agrupados por barbeiro */}
                {eventosPendentes.length > 0 && (() => {
                  const renderCard = (ev, corHex = "#818CF8") => {
                    const ehDiaTodo = !!ev.start?.date && !ev.start?.dateTime;
                    const inicio = ehDiaTodo ? "Dia todo" : fmtHora(ev.start?.dateTime);
                    const fim = ehDiaTodo ? "" : fmtHora(ev.end?.dateTime);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => { setEditando(ev); setShowForm(true); }}
                        className="flex items-start gap-3 p-3 border border-transparent rounded-xl bg-gray-50 hover:bg-indigo-50 hover:border-indigo-100 transition-all text-left"
                      >
                        <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: corHex }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-gray-800">{ev.summary || "(sem título)"}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{ehDiaTodo ? "Dia todo" : `${inicio} – ${fim}`}</p>
                          {ev.description && <p className="text-xs text-gray-500 mt-1 truncate">{ev.description}</p>}
                        </div>
                      </button>
                    );
                  };

                  if (barbeiros.length === 0) {
                    return (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Agendados ({eventosPendentes.length})</p>
                        <div className="flex flex-col gap-2">{eventosPendentes.map((ev) => renderCard(ev))}</div>
                      </div>
                    );
                  }

                  const grupos = barbeiros
                    .map((b) => ({ barbeiro: b, cor: GCAL_CORES[b.gcal_color_id] ?? GCAL_CORES["9"], eventos: eventosPendentes.filter((ev) => ev.colorId === b.gcal_color_id) }))
                    .filter((g) => g.eventos.length > 0);

                  const semBarbeiro = eventosPendentes.filter((ev) => !barbeiros.some((b) => b.gcal_color_id === ev.colorId));

                  return (
                    <>
                      {grupos.map((g) => (
                        <div key={g.barbeiro.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.cor.hex }} />
                            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: g.cor.hex }}>
                              {g.barbeiro.nome} ({g.eventos.length})
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">{g.eventos.map((ev) => renderCard(ev, g.cor.hex))}</div>
                        </div>
                      ))}
                      {semBarbeiro.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Outros ({semBarbeiro.length})</p>
                          <div className="flex flex-col gap-2">{semBarbeiro.map((ev) => renderCard(ev, "#D1D5DB"))}</div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Concluídos — abrem comanda em modal (visualização/edição) */}
                {eventosConcluidos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-2">Concluídos ({eventosConcluidos.length})</p>
                    <div className="flex flex-col gap-2">
                      {eventosConcluidos.map((ev) => {
                        const ehDiaTodo = !!ev.start?.date && !ev.start?.dateTime;
                        const inicio = ehDiaTodo ? "Dia todo" : fmtHora(ev.start?.dateTime);
                        const fim = ehDiaTodo ? "" : fmtHora(ev.end?.dateTime);
                        return (
                          <button
                            key={ev.id}
                            onClick={() => { setEventoComandaModal(ev); setShowComandaModal(true); }}
                            className="flex items-start gap-3 p-3 border border-green-100 rounded-xl bg-green-50 hover:bg-green-100 transition-all text-left"
                          >
                            <div className="w-1 self-stretch rounded-full shrink-0 bg-green-400" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-green-700">{ev.summary || "(sem título)"}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{ehDiaTodo ? "Dia todo" : `${inicio} – ${fim}`}</p>
                              {ev.description && <p className="text-xs text-gray-500 mt-1 truncate">{ev.description}</p>}
                            </div>
                            <span className="text-xs text-green-400 shrink-0 self-center">🧾</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {erro && (
              <div className="mt-4 text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                ⚠️ {erro}
              </div>
            )}
          </motion.div>
        </>
      )}

      <AnimatePresence>
        {showForm && (
          <EventoForm
            evento={editando}
            diaPadrao={diaSelecionado}
            onSalvar={handleSalvar}
            onFechar={() => { setShowForm(false); setEditando(null); }}
            onDeletar={handleDeletar}
            onIniciarAtendimento={handleIniciarAtendimento}
            barbeiros={barbeiros}
            eventos={eventos}
            clientes={clientes}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmacaoComanda && (
          <ConfirmacaoComanda
            evento={confirmacaoComanda}
            onConfirmar={handleConfirmarComanda}
            onCancelar={() => setConfirmacaoComanda(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showComandaModal && (
          <Comanda
            evento={eventoComandaModal}
            barbeiros={barbeiros}
            onFechar={() => { setShowComandaModal(false); setEventoComandaModal(null); }}
            onFinalizar={handleFinalizarComandaModal}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
