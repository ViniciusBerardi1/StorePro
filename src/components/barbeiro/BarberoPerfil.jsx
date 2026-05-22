import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Scissors, DollarSign, Clock, ShoppingBag, TrendingUp, CheckCircle, Calendar, XCircle, Percent, PlusCircle } from "lucide-react";
import { useBarbeiroAuth } from "../../hooks/useBarbeiroAuth";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function brl(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
}

function formatHoras(min) {
  if (!min) return "0min";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function KpiCard({ icon: Icon, label, value, sub, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-900/40 text-indigo-400",
    green:  "bg-green-900/40  text-green-400",
    amber:  "bg-amber-900/40  text-amber-400",
    purple: "bg-purple-900/40 text-purple-400",
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon size={16} />
      </div>
      <p className="text-lg font-bold text-white leading-tight">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarraProgresso({ pct, color = "#6366f1" }) {
  return (
    <div className="h-1 bg-gray-800 rounded-full overflow-hidden mt-1.5">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 animate-pulse">
      <div className="flex items-center gap-3 py-4">
        <div className="w-16 h-16 rounded-2xl bg-gray-800" />
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 bg-gray-800 rounded" />
          <div className="h-3 w-20 bg-gray-800 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-900 border border-gray-800 rounded-2xl" />)}
      </div>
      <div className="h-32 bg-gray-900 border border-gray-800 rounded-2xl" />
    </div>
  );
}

export default function BarberoPerfil() {
  const { token, barbeiro, logout } = useBarbeiroAuth();
  const [stats, setStats]           = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]             = useState(null);

  useEffect(() => {
    if (!token) return;
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
        if (r.status === 401) { logout(); return; }
        if (!r.ok) throw new Error(data.erro ?? `Erro ${r.status}`);
        setStats(data);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [token]);

  if (carregando) return <Skeleton />;

  const agora     = new Date();
  const mesLabel  = `${MESES[agora.getMonth()]} ${agora.getFullYear()}`;
  const inicial   = barbeiro?.nome?.charAt(0)?.toUpperCase() ?? "B";

  const taxaConclusao = stats?.atendimentos.total > 0
    ? Math.round((stats.atendimentos.concluidos / stats.atendimentos.total) * 100)
    : 0;

  const maxRank = stats?.rankServicos?.[0]?.count || 1;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">

      {/* Header barbeiro */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 py-3"
      >
        <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-900/40 shrink-0">
          {inicial}
        </div>
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">{barbeiro?.nome ?? "—"}</h2>
          <p className="text-sm text-gray-500">Barbeiro · {mesLabel}</p>
        </div>
      </motion.div>

      {erro ? (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/30 rounded-2xl px-4 py-3 text-center">
          {erro}
        </p>
      ) : stats ? (
        <>
          {/* KPI row — 4 cards igual ao sistema principal */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={Scissors}
              label="Atendimentos"
              value={stats.atendimentos.concluidos}
              sub={`${stats.atendimentos.total} no total`}
              color="indigo"
            />
            <KpiCard
              icon={DollarSign}
              label="Faturamento"
              value={brl(stats.financeiro.faturamentoServicos)}
              sub="serviços concluídos"
              color="green"
            />
            <KpiCard
              icon={Clock}
              label="Horas trabalhadas"
              value={formatHoras(stats.horas.minutos)}
              sub="tempo em atendimentos"
              color="amber"
            />
            <KpiCard
              icon={TrendingUp}
              label="Ticket médio"
              value={brl(stats.financeiro.ticket)}
              sub="por atendimento"
              color="purple"
            />
          </div>

          {/* Performance card — tabela condensada igual ao TabBarbeiros */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Performance</p>
            </div>
            <div className="divide-y divide-gray-800/60">

              {/* Faturamento */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Faturamento</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{brl(stats.financeiro.faturamentoServicos)}</span>
                    <span className="text-xs text-gray-600">{stats.atendimentos.concluidos}×</span>
                  </div>
                </div>
                <BarraProgresso pct={100} color="#6366f1" />
              </div>

              {/* Ticket médio */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Ticket médio</span>
                  <span className="text-sm font-bold text-white">{brl(stats.financeiro.ticket)}</span>
                </div>
                <BarraProgresso pct={100} color="#22c55e" />
              </div>

              {/* Horas */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Horas trabalhadas</span>
                  <span className="text-sm font-bold text-white">{formatHoras(stats.horas.minutos)}</span>
                </div>
                <BarraProgresso pct={100} color="#f59e0b" />
              </div>

              {/* % Conclusão */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Taxa de conclusão</span>
                  <span className="text-sm font-bold text-white">{taxaConclusao}%</span>
                </div>
                <BarraProgresso pct={taxaConclusao} color="#6366f1" />
              </div>

              {/* Produtos */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Produtos vendidos</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{brl(stats.financeiro.receitaProdutos)}</span>
                    <span className="text-xs text-gray-600">{stats.horas.totalItens}×</span>
                  </div>
                </div>
              </div>

              {/* Receita líquida */}
              {stats.financeiro.receitaLiquida > 0 && (
                <div className="px-4 py-3 bg-indigo-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Receita líquida total</span>
                    <span className="text-sm font-bold text-indigo-300">{brl(stats.financeiro.receitaLiquida)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Agendamentos */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-center">
              <p className="text-base font-bold text-green-400">{stats.atendimentos.concluidos}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Concluídos</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-center">
              <p className="text-base font-bold text-blue-400">{stats.atendimentos.agendados}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Agendados</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 text-center">
              <p className="text-base font-bold text-red-400">{stats.atendimentos.cancelados}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Cancelados</p>
            </div>
          </div>

          {/* Ranking de serviços */}
          {stats.rankServicos?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                <Scissors size={13} className="text-gray-500" />
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Serviços do mês</p>
              </div>
              <div className="divide-y divide-gray-800/60">
                {stats.rankServicos.slice(0, 5).map((s, i) => (
                  <div key={s.nome} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-xs text-gray-600 w-4 shrink-0">#{i + 1}</span>
                    <span className="text-sm text-gray-300 flex-1 truncate">{s.nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${(s.count / maxRank) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-indigo-400 font-medium w-6 text-right">{s.count}×</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comissões do mês */}
          {stats.comissoes && (
            <div className="bg-gray-900 border border-indigo-900/40 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-indigo-900/30 flex items-center gap-2">
                <Percent size={13} className="text-indigo-400" />
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Minhas comissões — {mesLabel}</p>
              </div>
              <div className="divide-y divide-gray-800/60">
                {/* Serviços */}
                {stats.comissoes.valores.servico != null && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Scissors size={13} className="text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">Serviços</p>
                        <p className="text-[10px] text-gray-600">{brl(stats.comissoes.bruto.servico)} × {stats.comissoes.taxas.servico}%</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-white shrink-0">{brl(stats.comissoes.valores.servico)}</span>
                  </div>
                )}
                {/* Adicionais */}
                {stats.comissoes.valores.adicional != null && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlusCircle size={13} className="text-amber-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">Adicionais</p>
                        <p className="text-[10px] text-gray-600">{brl(stats.comissoes.bruto.adicional)} × {stats.comissoes.taxas.adicional}%</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-white shrink-0">{brl(stats.comissoes.valores.adicional)}</span>
                  </div>
                )}
                {/* Produtos */}
                {stats.comissoes.valores.produto != null && (
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShoppingBag size={13} className="text-gray-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-400">Produtos</p>
                        <p className="text-[10px] text-gray-600">{brl(stats.comissoes.bruto.produto)} × {stats.comissoes.taxas.produto}%</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-white shrink-0">{brl(stats.comissoes.valores.produto)}</span>
                  </div>
                )}
                {/* Total */}
                <div className="px-4 py-3 bg-indigo-950/30 flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-300">Total a receber</span>
                  <span className="text-base font-bold text-indigo-300">{brl(stats.comissoes.valores.total)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Logout */}
      <button
        onClick={logout}
        className="mt-1 w-full border border-gray-800 text-gray-500 hover:text-red-400 hover:border-red-900/40 py-3.5 rounded-2xl text-sm font-medium transition-colors"
      >
        Sair
      </button>
    </div>
  );
}
