import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Calendar, CheckCircle, Clock, XCircle } from "lucide-react";
import { useBarbeiroAuth } from "../../hooks/useBarbeiroAuth";

const STATUS_CONFIG = {
  agendado:  { label: "Agendado",  color: "text-blue-400",   bg: "bg-blue-900/30",  border: "border-blue-800/40",  icon: Clock },
  concluido: { label: "Concluído", color: "text-green-400",  bg: "bg-green-900/30", border: "border-green-800/40", icon: CheckCircle },
  cancelado: { label: "Cancelado", color: "text-red-400",    bg: "bg-red-900/30",   border: "border-red-800/40",   icon: XCircle },
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function startOfWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

function formatHora(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return "--:--"; }
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function CardAtendimento({ at }) {
  const status = STATUS_CONFIG[at.status] ?? STATUS_CONFIG.agendado;
  const StatusIcon = status.icon;
  const servicos = Array.isArray(at.servicos) ? at.servicos : [];

  const hora = formatHora(at.data_hora);
  const horaFim = null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gray-900 border rounded-2xl p-4 ${status.border} border`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-white font-semibold text-sm">{hora}</span>
            {horaFim && <span className="text-gray-500 text-xs">→ {horaFim}</span>}
          </div>
          <p className="text-gray-200 font-medium text-base leading-tight truncate">
            {at.cliente_nome || "—"}
          </p>
          {servicos.length > 0 && (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              {servicos.map((s) => s.nome).join(" · ")}
            </p>
          )}
          {Number(at.valor_total) > 0 && (
            <p className="text-xs text-indigo-400 font-medium mt-1.5">
              R$ {Number(at.valor_total).toFixed(2).replace(".", ",")}
            </p>
          )}
        </div>
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 ${status.bg} ${status.color}`}>
          <StatusIcon size={11} />
          {status.label}
        </div>
      </div>
    </motion.div>
  );
}

export default function BarbeiroAgenda() {
  const { token, logout } = useBarbeiroAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [diaAtivo, setDiaAtivo] = useState(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje;
  });
  const [atendimentos, setAtendimentos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);

  const dias = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const buscar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      const ini = new Date(weekStart);
      ini.setHours(0, 0, 0, 0);
      const fim = addDays(weekStart, 6);
      fim.setHours(23, 59, 59, 999);

      const res = await fetch(
        `/api/barbeiro/agenda?ini=${ini.toISOString()}&fim=${fim.toISOString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      let data;
      try { data = await res.json(); } catch { data = {}; }
      if (res.status === 401) { logout(); return; }
      if (!res.ok) throw new Error(data.erro ?? `Erro ${res.status}`);
      setAtendimentos(data.atendimentos ?? []);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [token, weekStart]);

  useEffect(() => { buscar(); }, [buscar]);

  const atendimentosDia = atendimentos.filter((at) =>
    isSameDay(new Date(at.data_hora), diaAtivo)
  );

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const contagemPorDia = dias.map((d) =>
    atendimentos.filter((at) => isSameDay(new Date(at.data_hora), d)).length
  );

  return (
    <div className="flex flex-col h-full">
      {/* Semana nav */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => { setWeekStart((w) => addDays(w, -7)); }}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-300">
            {MESES[weekStart.getMonth()]} {weekStart.getFullYear()}
          </span>
          <button
            onClick={() => { setWeekStart((w) => addDays(w, 7)); }}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dias.map((d, i) => {
            const isHoje = isSameDay(d, hoje);
            const isAtivo = isSameDay(d, diaAtivo);
            const count = contagemPorDia[i];
            return (
              <button
                key={i}
                onClick={() => setDiaAtivo(d)}
                className={`flex flex-col items-center py-2 rounded-xl transition-colors ${
                  isAtivo
                    ? "bg-indigo-600 text-white"
                    : isHoje
                    ? "bg-gray-800 text-indigo-300"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                }`}
              >
                <span className="text-[10px] font-medium mb-1">{DIAS_SEMANA[d.getDay()]}</span>
                <span className={`text-base font-bold leading-none ${isAtivo ? "text-white" : isHoje ? "text-white" : "text-gray-300"}`}>
                  {d.getDate()}
                </span>
                {count > 0 && (
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full ${isAtivo ? "bg-indigo-300" : "bg-indigo-500"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista do dia */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-300">
            {DIAS_SEMANA[diaAtivo.getDay()]}, {diaAtivo.getDate()} de {MESES[diaAtivo.getMonth()]}
          </p>
          {atendimentosDia.length > 0 && (
            <span className="text-xs text-gray-500">
              {atendimentosDia.length} {atendimentosDia.length === 1 ? "atendimento" : "atendimentos"}
            </span>
          )}
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-xl bg-indigo-600 animate-pulse" />
          </div>
        ) : erro ? (
          <div className="text-center py-12">
            <p className="text-sm text-red-400 mb-3">{erro}</p>
            <button onClick={buscar} className="text-xs text-gray-400 hover:text-gray-200">
              Tentar novamente
            </button>
          </div>
        ) : atendimentosDia.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mb-3">
              <Calendar size={20} className="text-gray-600" />
            </div>
            <p className="text-sm text-gray-500">Sem atendimentos neste dia</p>
          </div>
        ) : (
          <AnimatePresence>
            <div className="flex flex-col gap-3">
              {atendimentosDia.map((at) => (
                <CardAtendimento key={at.id} at={at} />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
