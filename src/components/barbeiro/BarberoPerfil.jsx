import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, TrendingUp, CheckCircle, DollarSign, Calendar } from "lucide-react";
import { useBarbeiroAuth } from "../../hooks/useBarbeiroAuth";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-indigo-900/50 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-indigo-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 leading-none mb-1">{label}</p>
        <p className="text-lg font-bold text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function BarberoPerfil() {
  const { token, barbeiro, logout } = useBarbeiroAuth();
  const [stats, setStats] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const agora = new Date();
  const mesLabel = `${MESES[agora.getMonth()]} ${agora.getFullYear()}`;

  useEffect(() => {
    if (!token) return;
    const ini = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    fetch(`/api/barbeiro/agenda?ini=${ini}&fim=${fim}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const ats = data.atendimentos ?? [];
        const concluidos = ats.filter((a) => a.status === "concluido");
        const receita = concluidos.reduce((s, a) => s + Number(a.valor_total || 0), 0);
        const ticket = concluidos.length > 0 ? receita / concluidos.length : 0;
        setStats({ total: ats.length, concluidos: concluidos.length, receita, ticket });
      })
      .catch(() => setStats(null))
      .finally(() => setCarregando(false));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const inicialNome = barbeiro?.nome?.charAt(0)?.toUpperCase() ?? "B";

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Avatar + nome */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center py-6"
      >
        <div className="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-indigo-900/40 mb-4">
          {inicialNome}
        </div>
        <h2 className="text-xl font-bold text-white">{barbeiro?.nome ?? "—"}</h2>
        <p className="text-sm text-gray-500 mt-1">Barbeiro</p>
      </motion.div>

      {/* Stats do mês */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={14} className="text-gray-500" />
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{mesLabel}</p>
        </div>

        {carregando ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 h-16 animate-pulse" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={User}
              label="Agendamentos"
              value={stats.total}
              sub="no mês"
            />
            <StatCard
              icon={CheckCircle}
              label="Concluídos"
              value={stats.concluidos}
              sub={`${stats.total > 0 ? Math.round((stats.concluidos / stats.total) * 100) : 0}% do total`}
            />
            <StatCard
              icon={DollarSign}
              label="Receita"
              value={`R$ ${stats.receita.toFixed(2).replace(".", ",")}`}
              sub="concluídos"
            />
            <StatCard
              icon={TrendingUp}
              label="Ticket médio"
              value={`R$ ${stats.ticket.toFixed(2).replace(".", ",")}`}
              sub="por atendimento"
            />
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">Não foi possível carregar estatísticas</p>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        className="mt-4 w-full border border-gray-800 text-gray-400 hover:text-red-400 hover:border-red-900/50 py-3.5 rounded-2xl text-sm font-medium transition-colors"
      >
        Sair
      </button>
    </div>
  );
}
