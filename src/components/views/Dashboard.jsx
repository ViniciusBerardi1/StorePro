import { motion } from "framer-motion";

const BRL = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, delay },
});

// ─── KPI Card ────────────────────────────────────────────────────
function KpiCard({ icon, label, valor, sub, cor = "bg-white", delay }) {
  return (
    <motion.div
      {...fade(delay)}
      className={`${cor} border border-gray-200 rounded-2xl p-4 flex flex-col gap-1`}
    >
      <span className="text-xl">{icon}</span>
      <div className="text-2xl font-bold text-gray-800 leading-tight">{valor}</div>
      <div className="text-xs font-medium text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </motion.div>
  );
}

// ─── Gráfico de barras (SVG simples) ─────────────────────────────
function GraficoFaturamento({ dados }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  const labels = ["D-6", "D-5", "D-4", "D-3", "D-2", "Ontem", "Hoje"];

  return (
    <motion.div {...fade(0.25)} className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        📈 Faturamento — últimos 7 dias
      </h3>
      <div className="flex items-end gap-2 h-32">
        {dados.map((d, i) => {
          const pct = max > 0 ? (d.valor / max) * 100 : 0;
          const isHoje = i === dados.length - 1;
          return (
            <div key={d.data} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center" style={{ height: "96px" }}>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(pct, d.valor > 0 ? 4 : 0)}%` }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.05 }}
                  className={`w-full rounded-t-lg ${isHoje ? "bg-indigo-500" : "bg-indigo-200"}`}
                  style={{ minHeight: d.valor > 0 ? "4px" : "0" }}
                  title={BRL(d.valor)}
                />
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{labels[i]}</span>
            </div>
          );
        })}
      </div>
      {dados.every((d) => d.valor === 0) && (
        <p className="text-xs text-gray-400 text-center mt-2">
          Nenhum atendimento concluído nos últimos 7 dias.
        </p>
      )}
    </motion.div>
  );
}

// ─── Resumo de atendimentos ──────────────────────────────────────
const STATUS_LABEL = {
  agendado:     { label: "Agendado",     bg: "bg-blue-50",   text: "text-blue-600"   },
  em_andamento: { label: "Em andamento", bg: "bg-yellow-50", text: "text-yellow-600" },
  concluido:    { label: "Concluído",    bg: "bg-green-50",  text: "text-green-600"  },
  cancelado:    { label: "Cancelado",    bg: "bg-red-50",    text: "text-red-500"    },
};

function ResumoAtendimentos({ atendimentos }) {
  const vazio = atendimentos.length === 0;

  return (
    <motion.div {...fade(0.35)} className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">✂️ Atendimentos de hoje</h3>
        <span className="text-xs text-gray-400">{atendimentos.length} registros</span>
      </div>

      {vazio ? (
        <p className="text-xs text-gray-400">Nenhum atendimento registrado hoje.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {atendimentos.map((a) => {
            const hora = new Date(a.data_hora).toLocaleTimeString("pt-BR", {
              hour: "2-digit", minute: "2-digit",
            });
            const st = STATUS_LABEL[a.status] ?? STATUS_LABEL.agendado;
            const servicos = (a.servicos || []).map((s) => s.nome).join(", ") || "—";
            return (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 rounded-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-gray-400 shrink-0 w-10">{hora}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{a.cliente_nome || "—"}</p>
                    <p className="text-xs text-gray-400 truncate">{servicos}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.text}`}>
                    {st.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-700">
                    {BRL(a.valor_total || 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── Alertas ─────────────────────────────────────────────────────
function Alertas({ estoqueBaixo, setView }) {
  const total = estoqueBaixo.length;

  return (
    <motion.div {...fade(0.45)} className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">⚠️ Alertas</h3>

      {total === 0 ? (
        <p className="text-xs text-gray-400">Nenhum alerta no momento.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setView("estoque_baixo")}
            className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 hover:brightness-95 transition-all text-left"
          >
            <div>
              <p className="text-sm font-medium text-orange-700">Estoque baixo</p>
              <p className="text-xs text-orange-400">
                {total} produto{total > 1 ? "s" : ""} abaixo do mínimo
              </p>
            </div>
            <span className="text-lg font-bold text-orange-500 ml-4">{total}</span>
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Destaques do dia ────────────────────────────────────────────
function DestaquesDodia({ atendimentos }) {
  const por_servico = {};
  for (const a of atendimentos.filter((a) => a.status === "concluido")) {
    for (const s of a.servicos || []) {
      if (!por_servico[s.nome]) por_servico[s.nome] = { nome: s.nome, total: 0, count: 0 };
      por_servico[s.nome].total += s.valor || 0;
      por_servico[s.nome].count += 1;
    }
  }
  const destaques = Object.values(por_servico).sort((a, b) => b.total - a.total).slice(0, 4);
  const vazio = destaques.length === 0;

  return (
    <motion.div {...fade(0.55)} className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">⭐ Destaques do dia</h3>

      {vazio ? (
        <p className="text-xs text-gray-400">Nenhum serviço concluído hoje ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {destaques.map((s, i) => (
            <div key={s.nome} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
              <span className="text-sm font-bold text-indigo-400 w-5 shrink-0">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{s.nome}</p>
                <p className="text-xs text-gray-400">{s.count}x realizado</p>
              </div>
              <span className="text-sm font-semibold text-gray-700 shrink-0">{BRL(s.total)}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Dashboard principal ─────────────────────────────────────────
// Dados vêm do App.jsx via props — o polling roda lá e nunca para.
export default function Dashboard({
  atendimentosHoje = [],
  atendimentosMes  = [],
  grafico          = [],
  loadingDash      = false,
  onRefresh,
  produtos,
  setView,
  carregando,
}) {
  // KPIs calculados a partir dos dados recebidos via props
  const faturamentoHoje = atendimentosHoje
    .filter((a) => a.status === "concluido")
    .reduce((s, a) => s + (a.valor_total || 0), 0);

  const faturamentoMes = atendimentosMes
    .filter((a) => a.status === "concluido")
    .reduce((s, a) => s + (a.valor_total || 0), 0);

  const clientesHoje = new Set(
    atendimentosHoje.map((a) => a.cliente_nome).filter(Boolean)
  ).size;

  const concluidosMes = atendimentosMes.filter((a) => a.status === "concluido").length;
  const ticketMedio   = concluidosMes > 0 ? faturamentoMes / concluidosMes : 0;

  const estoqueBaixo = (produtos ?? []).filter((p) => p.quantidade <= (p.estoque_minimo ?? 1));

  if (carregando || loadingDash) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm animate-pulse">
        Carregando dashboard...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <motion.h2 {...fade(0)} className="text-xl font-semibold text-gray-800">
          Dashboard
        </motion.h2>
        <motion.button
          {...fade(0)}
          onClick={onRefresh}
          className="text-xs text-gray-400 hover:text-indigo-500 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
          title="Atualizar dados"
        >
          🔄 Atualizar
        </motion.button>
      </div>

      {/* KPIs — 2 cols no mobile, 4 cols no desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon="💰"
          label="Faturamento hoje"
          valor={BRL(faturamentoHoje)}
          sub={`${atendimentosHoje.filter((a) => a.status === "concluido").length} atend. concluídos`}
          delay={0.05}
        />
        <KpiCard
          icon="📅"
          label="Faturamento do mês"
          valor={BRL(faturamentoMes)}
          sub={`${concluidosMes} atend. concluídos`}
          delay={0.1}
        />
        <KpiCard
          icon="👥"
          label="Clientes hoje"
          valor={clientesHoje}
          sub={`${atendimentosHoje.length} atendimento${atendimentosHoje.length !== 1 ? "s" : ""} no total`}
          delay={0.15}
        />
        <KpiCard
          icon="💳"
          label="Ticket médio (mês)"
          valor={BRL(ticketMedio)}
          sub="por atendimento concluído"
          delay={0.2}
        />
      </div>

      {/* Gráfico — largura total */}
      {grafico.length > 0 && <GraficoFaturamento dados={grafico} />}

      {/* Linha inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ResumoAtendimentos atendimentos={atendimentosHoje} />
        </div>
        <div className="flex flex-col gap-4">
          <Alertas estoqueBaixo={estoqueBaixo} setView={setView} />
          <DestaquesDodia atendimentos={atendimentosHoje} />
        </div>
      </div>
    </div>
  );
}
