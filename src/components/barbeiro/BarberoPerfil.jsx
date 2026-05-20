import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle, DollarSign, TrendingUp, Scissors, ShoppingBag, Calendar, Clock } from "lucide-react";
import { useBarbeiroAuth } from "../../hooks/useBarbeiroAuth";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function brl(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent ?? "bg-indigo-900/50"}`}>
        <Icon size={18} className={accent ? "text-white" : "text-indigo-400"} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 leading-none mb-1">{label}</p>
        <p className="text-lg font-bold text-white leading-none">{value}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 h-[72px] animate-pulse" />;
}

export default function BarberoPerfil() {
  const { token, barbeiro, logout } = useBarbeiroAuth();
  const [stats, setStats]       = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]         = useState(null);

  useEffect(() => {
    if (!token) return;

    // Datas calculadas dentro do effect para garantir mês correto ao navegar
    const agora = new Date();
    const ano   = agora.getFullYear();
    const mes   = agora.getMonth() + 1;

    setCarregando(true);
    setErro(null);

    fetch(`/api/barbeiro/stats?ano=${ano}&mes=${mes}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        let data;
        try { data = await r.json(); } catch { data = {}; }
        if (!r.ok) throw new Error(data.erro ?? `Erro ${r.status}`);
        setStats(data);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [token]);

  const agora    = new Date();
  const mesLabel = `${MESES[agora.getMonth()]} ${agora.getFullYear()}`;
  const inicial  = barbeiro?.nome?.charAt(0)?.toUpperCase() ?? "B";

  const taxaConclusao = stats
    ? stats.atendimentos.total > 0
      ? Math.round((stats.atendimentos.concluidos / stats.atendimentos.total) * 100)
      : 0
    : null;

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center pt-6 pb-2"
      >
        <div className="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-indigo-900/40 mb-4">
          {inicial}
        </div>
        <h2 className="text-xl font-bold text-white">{barbeiro?.nome ?? "—"}</h2>
        <p className="text-sm text-gray-500 mt-1">Barbeiro</p>
      </motion.div>

      {/* Período */}
      <div className="flex items-center gap-2">
        <Calendar size={13} className="text-gray-600" />
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{mesLabel}</p>
      </div>

      {/* Cards */}
      {carregando ? (
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : erro ? (
        <p className="text-sm text-red-400 text-center bg-red-950/30 border border-red-900/30 rounded-2xl px-4 py-3">
          {erro}
        </p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={CheckCircle}
              label="Concluídos"
              value={stats.atendimentos.concluidos}
              sub={`${taxaConclusao}% de conclusão`}
            />
            <StatCard
              icon={Clock}
              label="Agendados"
              value={stats.atendimentos.agendados}
              sub={`${stats.atendimentos.cancelados} cancelados`}
            />
            <StatCard
              icon={DollarSign}
              label="Faturamento"
              value={brl(stats.financeiro.faturamentoServicos)}
              sub="serviços concluídos"
            />
            <StatCard
              icon={TrendingUp}
              label="Ticket médio"
              value={brl(stats.financeiro.ticket)}
              sub="por atendimento"
            />
          </div>

          {/* Produtos — só mostra se houver */}
          {stats.financeiro.receitaProdutos > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center shrink-0">
                <ShoppingBag size={17} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5">Produtos vendidos</p>
                <p className="text-sm font-bold text-white">{brl(stats.financeiro.receitaProdutos)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-gray-600">Bar</p>
                <p className="text-xs text-gray-400">{brl(stats.financeiro.receitaBar)}</p>
                <p className="text-[10px] text-gray-600 mt-1">Loja</p>
                <p className="text-xs text-gray-400">{brl(stats.financeiro.receitaLoja)}</p>
              </div>
            </div>
          )}

          {/* Top serviço — só mostra se houver */}
          {stats.rankServicos?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-900/40 flex items-center justify-center shrink-0">
                <Scissors size={17} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5">Serviço mais realizado</p>
                <p className="text-sm font-bold text-white truncate">{stats.rankServicos[0].nome}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-indigo-400">{stats.rankServicos[0].count}×</p>
              </div>
            </div>
          )}

          {/* Receita líquida total */}
          {stats.financeiro.comandasFechadas > 0 && (
            <div className="bg-indigo-950/40 border border-indigo-900/30 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-indigo-400/70">Receita líquida total</p>
                <p className="text-xs text-gray-500">{stats.financeiro.comandasFechadas} {stats.financeiro.comandasFechadas === 1 ? "comanda fechada" : "comandas fechadas"}</p>
              </div>
              <p className="text-lg font-bold text-indigo-300">{brl(stats.financeiro.receitaLiquida)}</p>
            </div>
          )}
        </>
      ) : null}

      {/* Logout */}
      <button
        onClick={logout}
        className="mt-2 w-full border border-gray-800 text-gray-500 hover:text-red-400 hover:border-red-900/50 py-3.5 rounded-2xl text-sm font-medium transition-colors"
      >
        Sair
      </button>
    </div>
  );
}
