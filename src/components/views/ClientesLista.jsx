import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";
import { Crown, Scissors, AlertTriangle, Settings, XCircle, CheckCircle2, Loader2,
  Pencil, Trash2, Star, ClipboardList, Search, CreditCard, DollarSign, Calendar, Users } from "lucide-react";

// ─── Formatters ──────────────────────────────────────────────────
const BRL      = (v) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData  = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const normTel  = (t) => (t || "").replace(/\D/g, "");
const fmtTel   = (t) => {
  const d = normTel(t);
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return t || "—";
};
const fmtFreq  = (days) => {
  if (!days || days <= 0) return null;
  if (days < 30) return `${days} dias`;
  if (days < 365) return `${Math.round(days / 30)} meses`;
  return `${(days / 365).toFixed(1)} anos`;
};

const STATUS_ASSINATURA = {
  ativa:        { label: "Ativa",        cls: "bg-green-100 text-green-700"   },
  pendente:     { label: "Pendente",     cls: "bg-yellow-100 text-yellow-700" },
  inadimplente: { label: "Inadimplente", cls: "bg-red-100 text-red-600"       },
  cancelada:    { label: "Cancelada",    cls: "bg-gray-100 text-gray-500"     },
  expirada:     { label: "Expirada",     cls: "bg-gray-100 text-gray-500"     },
};

// ─── Avatar ──────────────────────────────────────────────────────
function Avatar({ nome, size = "md" }) {
  const initials = (nome || "?")
    .split(" ").slice(0, 2).map((p) => (p[0] || "").toUpperCase()).join("");
  const sz = size === "lg" ? "w-14 h-14 text-xl" : "w-10 h-10 text-sm";
  return (
    <div className={`${sz} rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold shrink-0`}>
      {initials || "?"}
    </div>
  );
}

// ─── Seção de assinatura (dentro do perfil) ───────────────────────
function AssinaturaSection({ clienteId, barbeiros = [] }) {
  const [assinaturas, setAssinaturas] = useState([]);
  const [planos, setPlanos]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(null);
  const [salvando, setSalvando]       = useState(false);
  const [erro, setErro]               = useState(null);

  const carregar = useCallback(() => {
    setLoading(true);
    Promise.all([db.getAssinaturasByCliente(clienteId), db.getPlanos()])
      .then(([ass, pl]) => { setAssinaturas(ass); setPlanos(pl); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  const ativa = assinaturas.find((a) => a.status === "ativa");
  const historico = assinaturas.filter((a) => a.status !== "ativa");

  const abrirForm = (base = null) => {
    const hoje = new Date().toISOString().slice(0, 10);
    setForm(base
      ? { ...base, plano_id: base.plano_id ?? "", valor: base.valor ?? "", gateway: base.gateway ?? "", gateway_subscription_id: base.gateway_subscription_id ?? "", data_renovacao: base.data_renovacao ?? "", observacoes: base.observacoes ?? "", barbeiro_id: base.barbeiro_id ?? "" }
      : { status: "ativa", plano_id: "", data_inicio: hoje, data_renovacao: "", valor: "", gateway: "", gateway_subscription_id: "", observacoes: "", barbeiro_id: "" }
    );
    setShowForm(true);
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSalvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await db.upsertAssinatura({
        ...form,
        cliente_id:  clienteId,
        plano_id:    form.plano_id    ? Number(form.plano_id)    : null,
        barbeiro_id: form.barbeiro_id ? Number(form.barbeiro_id) : null,
        valor:       form.valor       ? Number(form.valor)       : null,
        data_renovacao: form.data_renovacao || null,
        observacoes:    form.observacoes    || null,
        gateway:        form.gateway        || null,
        gateway_subscription_id: form.gateway_subscription_id || null,
      });
      setShowForm(false);
      carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleCancelar = async (id) => {
    try {
      await db.upsertAssinatura({ id, status: "cancelada", cliente_id: clienteId });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  if (loading) return <div className="h-24 animate-pulse bg-gray-50 rounded-2xl" />;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Crown size={15} className="text-amber-500 shrink-0" /> Assinatura
        </h3>
        {!showForm && (
          <button
            onClick={() => abrirForm(ativa ?? null)}
            className="text-xs text-indigo-500 hover:bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-200 transition-colors font-medium"
          >
            {ativa ? "Gerenciar" : "+ Ativar"}
          </button>
        )}
      </div>

      {/* Status atual */}
      {!showForm && (
        ativa ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-3 py-3 bg-amber-50 border border-amber-100 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_ASSINATURA[ativa.status]?.cls}`}>
                    {STATUS_ASSINATURA[ativa.status]?.label}
                  </span>
                  {ativa.planos?.nome && (
                    <span className="text-xs font-semibold text-gray-700">{ativa.planos.nome}</span>
                  )}
                </div>
                {ativa.data_renovacao && (
                  <p className="text-[10px] text-gray-500">Renova em {fmtData(ativa.data_renovacao)}</p>
                )}
                {ativa.barbeiro_id && barbeiros.find(b => b.id === ativa.barbeiro_id)?.nome && (
                  <p className="text-[10px] text-gray-400 mt-0.5"><Scissors size={10} strokeWidth={2} className="inline mr-1 -mt-0.5 text-gray-400" />{barbeiros.find(b => b.id === ativa.barbeiro_id).nome}</p>
                )}
                {ativa.gateway && (
                  <p className="text-[10px] text-gray-300 mt-0.5 truncate">
                    {ativa.gateway}{ativa.gateway_subscription_id ? ` · ${ativa.gateway_subscription_id}` : ""}
                  </p>
                )}
              </div>
              {(ativa.valor ?? ativa.planos?.valor) > 0 && (
                <span className="text-sm font-bold text-amber-700 shrink-0 ml-3">
                  {BRL(ativa.valor ?? ativa.planos?.valor)}
                </span>
              )}
            </div>

            {/* Benefícios do plano */}
            {(ativa.planos?.beneficios ?? []).length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-100">
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">
                  Benefícios incluídos
                </p>
                <div className="flex flex-col gap-1">
                  {ativa.planos.beneficios.map((b) => (
                    <div key={b.id} className="flex items-center gap-1.5 text-xs text-amber-700">
                      <span className="text-green-500 shrink-0">✓</span>
                      <span>{b.descricao || b.servico_nome || `${b.percentual}% de desconto`}</span>
                      {b.limite_mes && (
                        <span className="text-amber-400 ml-auto shrink-0">{b.limite_mes}×/mês</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => handleCancelar(ativa.id)}
              className="text-xs text-red-400 hover:text-red-600 text-left px-1 transition-colors mt-1"
            >
              Cancelar assinatura
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Sem assinatura ativa.</p>
        )
      )}

      {/* Formulário */}
      {showForm && form && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
              <select value={form.status} onChange={set("status")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="ativa">Ativa</option>
                <option value="pendente">Pendente</option>
                <option value="inadimplente">Inadimplente</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            {planos.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Plano</label>
                <select
                  value={form.plano_id}
                  onChange={(e) => {
                    const pl = planos.find((p) => p.id === Number(e.target.value));
                    setForm((f) => ({ ...f, plano_id: e.target.value, valor: pl?.valor ?? f.valor }));
                  }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                >
                  <option value="">Sem plano</option>
                  {planos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome} — {BRL(p.valor)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {barbeiros.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Barbeiro que vendeu</label>
              <select value={form.barbeiro_id ?? ""} onChange={set("barbeiro_id")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="">Sem barbeiro</option>
                {barbeiros.map((b) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Início</label>
              <input type="date" value={form.data_inicio ?? ""} onChange={set("data_inicio")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Renovação</label>
              <input type="date" value={form.data_renovacao ?? ""} onChange={set("data_renovacao")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={form.valor ?? ""} onChange={set("valor")}
              placeholder="0,00"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Gateway</label>
              <select value={form.gateway ?? ""} onChange={set("gateway")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                <option value="">Manual</option>
                <option value="asaas">Asaas</option>
                <option value="mercadopago">Mercado Pago</option>
                <option value="stripe">Stripe</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">ID no gateway</label>
              <input type="text" value={form.gateway_subscription_id ?? ""} onChange={set("gateway_subscription_id")}
                placeholder="sub_xxx..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
          </div>

          {erro && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center gap-1"><AlertTriangle size={12} className="shrink-0" />{erro}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setShowForm(false); setErro(null); }}
              className="flex-1 border border-gray-200 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >Cancelar</button>
            <button
              onClick={handleSalvar}
              disabled={salvando}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
            >{salvando ? "Salvando..." : "Salvar"}</button>
          </div>
        </div>
      )}

      {/* Histórico */}
      {historico.length > 0 && !showForm && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wide mb-2">Histórico</p>
          <div className="flex flex-col gap-1">
            {historico.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_ASSINATURA[a.status]?.cls}`}>
                    {STATUS_ASSINATURA[a.status]?.label}
                  </span>
                  {a.planos?.nome && <span>{a.planos.nome}</span>}
                </span>
                <span>{fmtData(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gerenciador de planos ───────────────────────────────────────
const INTERVALOS = [
  { value: "semanal",     label: "Semanal"     },
  { value: "mensal",      label: "Mensal"      },
  { value: "trimestral",  label: "Trimestral"  },
  { value: "anual",       label: "Anual"       },
];

const TIPOS_BENEFICIO = [
  { id: "servico_gratis",   label: "Serviço grátis"           },
  { id: "desconto_servico", label: "Desconto em serviço"      },
  { id: "desconto_geral",   label: "Desconto geral (serviços)" },
  { id: "desconto_produto", label: "Desconto em produto"      },
];

const LABEL_TIPO = {
  servico_gratis:   "Grátis",
  desconto_servico: "% Serviço",
  desconto_geral:   "% Geral",
  desconto_produto: "% Produto",
};

function BeneficioForm({ servicos, onAdicionar, onCancelar }) {
  const [b, setB] = useState({
    tipo: "servico_gratis",
    servico_id: "",
    percentual: "",
    limite_mes: "1",
    produto_nome: "",
    descricao: "",
  });

  const set = (k) => (e) => setB((prev) => ({ ...prev, [k]: e.target.value }));

  const handleAdd = () => {
    if (!b.tipo) return;
    if ((b.tipo === "servico_gratis" || b.tipo === "desconto_servico") && !b.servico_id) return;
    if ((b.tipo === "desconto_servico" || b.tipo === "desconto_geral" || b.tipo === "desconto_produto") && !b.percentual) return;
    const srv = servicos.find((s) => s.id === Number(b.servico_id));
    onAdicionar({
      id: crypto.randomUUID(),
      tipo: b.tipo,
      servico_id: srv ? srv.id : undefined,
      servico_nome: srv ? srv.nome : undefined,
      percentual: b.percentual ? Number(b.percentual) : undefined,
      limite_mes: b.limite_mes ? Number(b.limite_mes) : 1,
      produto_nome: b.produto_nome || undefined,
      descricao: b.descricao || undefined,
    });
  };

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-col gap-2.5 mt-2">
      <div>
        <label className="text-[10px] font-semibold text-amber-700 mb-1 block">Tipo</label>
        <select value={b.tipo} onChange={set("tipo")}
          className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300">
          {TIPOS_BENEFICIO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {(b.tipo === "servico_gratis" || b.tipo === "desconto_servico") && (
        <div>
          <label className="text-[10px] font-semibold text-amber-700 mb-1 block">Serviço *</label>
          <select value={b.servico_id} onChange={set("servico_id")}
            className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300">
            <option value="">Selecione...</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} — {BRL(s.valor)}</option>)}
          </select>
        </div>
      )}

      {b.tipo === "desconto_produto" && (
        <div>
          <label className="text-[10px] font-semibold text-amber-700 mb-1 block">Nome do produto</label>
          <input type="text" value={b.produto_nome} onChange={set("produto_nome")}
            placeholder="Ex: Cerveja Artesanal"
            className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(b.tipo === "desconto_servico" || b.tipo === "desconto_geral" || b.tipo === "desconto_produto") && (
          <div>
            <label className="text-[10px] font-semibold text-amber-700 mb-1 block">Desconto % *</label>
            <input type="number" min="1" max="100" value={b.percentual} onChange={set("percentual")}
              placeholder="Ex: 50"
              className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300" />
          </div>
        )}
        <div>
          <label className="text-[10px] font-semibold text-amber-700 mb-1 block">Limite/mês</label>
          <input type="number" min="1" value={b.limite_mes} onChange={set("limite_mes")}
            placeholder="1"
            className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300" />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-amber-700 mb-1 block">Descrição (opcional)</label>
        <input type="text" value={b.descricao} onChange={set("descricao")}
          placeholder="Ex: 1 corte grátis por mês"
          className="w-full border border-amber-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-300" />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onCancelar}
          className="flex-1 border border-amber-200 py-1.5 rounded-lg text-xs text-amber-600 hover:bg-amber-100 transition-colors">
          Cancelar
        </button>
        <button type="button" onClick={handleAdd}
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-1.5 rounded-lg text-xs font-medium transition-colors">
          Adicionar
        </button>
      </div>
    </div>
  );
}

function PlanoForm({ plano, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    nome:         plano?.nome         ?? "",
    valor:        plano?.valor        ?? "",
    intervalo:    plano?.intervalo    ?? "mensal",
    descricao:    plano?.descricao    ?? "",
    checkout_url: plano?.checkout_url ?? "",
    ativo:        plano?.ativo        ?? true,
    beneficios:   plano?.beneficios   ?? [],
  });
  const [servicos, setServicos]         = useState([]);
  const [showBenefForm, setShowBenefForm] = useState(false);
  const [salvando, setSalvando]         = useState(false);
  const [erro, setErro]                 = useState(null);

  useEffect(() => {
    db.getServicos().then((s) => setServicos(s.filter((sv) => sv.ativo))).catch(console.error);
  }, []);

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const adicionarBeneficio = (b) => {
    setForm((f) => ({ ...f, beneficios: [...f.beneficios, b] }));
    setShowBenefForm(false);
  };

  const removerBeneficio = (id) =>
    setForm((f) => ({ ...f, beneficios: f.beneficios.filter((b) => b.id !== id) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return setErro("Informe o nome do plano.");
    const valor = parseFloat(String(form.valor).replace(",", "."));
    if (isNaN(valor) || valor < 0) return setErro("Informe um valor válido.");
    setErro(null);
    setSalvando(true);
    try {
      await onSalvar({ ...plano, ...form, valor });
    } catch (e) {
      setErro(e.message);
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
        className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[94vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-800">{plano ? "Editar plano" : "Novo plano"}</h3>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">Nome *</label>
              <input
                type="text" value={form.nome} onChange={set("nome")}
                placeholder="Ex: VIP, Premium..."
                autoFocus required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Valor (R$) *</label>
              <input
                type="number" value={form.valor} onChange={set("valor")}
                placeholder="0,00" min="0" step="0.01" required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Recorrência</label>
              <select value={form.intervalo} onChange={set("intervalo")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white">
                {INTERVALOS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Descrição (opcional)</label>
              <textarea
                value={form.descricao} onChange={set("descricao")}
                placeholder="Resumo dos benefícios..."
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Link de checkout (opcional)</label>
              <input
                type="url" value={form.checkout_url} onChange={set("checkout_url")}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <p className="text-[10px] text-gray-400 mt-1">URL gerada no painel do gateway (Asaas, Mercado Pago, Stripe…)</p>
            </div>
          </div>

          {/* Benefícios estruturados */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Benefícios automáticos</label>
              {!showBenefForm && (
                <button type="button" onClick={() => setShowBenefForm(true)}
                  className="text-[10px] font-medium text-amber-600 hover:text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg transition-colors">
                  + Adicionar
                </button>
              )}
            </div>

            {form.beneficios.length === 0 && !showBenefForm && (
              <p className="text-[11px] text-gray-400 italic">Nenhum benefício configurado.</p>
            )}

            <div className="grid grid-cols-2 gap-1.5">
            {form.beneficios.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded shrink-0">
                    {LABEL_TIPO[b.tipo] ?? b.tipo}
                  </span>
                  <span className="text-xs text-gray-700 truncate">
                    {b.descricao || b.servico_nome || b.produto_nome || `${b.percentual}%`}
                  </span>
                  {b.limite_mes && (
                    <span className="text-[10px] text-gray-400 shrink-0">{b.limite_mes}×/mês</span>
                  )}
                </div>
                <button type="button" onClick={() => removerBeneficio(b.id)}
                  className="text-gray-300 hover:text-red-400 shrink-0 text-xs transition-colors">✕</button>
              </div>
            ))}
            </div>

            {showBenefForm && (
              <BeneficioForm
                servicos={servicos}
                onAdicionar={adicionarBeneficio}
                onCancelar={() => setShowBenefForm(false)}
              />
            )}
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={form.ativo} onChange={set("ativo")} className="w-4 h-4 accent-indigo-500" />
            <span className="text-sm text-gray-600">Plano ativo (visível para assinaturas)</span>
          </label>

          {erro && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center gap-1"><AlertTriangle size={12} className="shrink-0" />{erro}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onFechar}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={salvando}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

const GATEWAYS = [
  { id: "asaas",       label: "Asaas",        docs: "https://docs.asaas.com/reference/webhooks" },
  { id: "mercadopago", label: "Mercado Pago",  docs: "https://www.mercadopago.com.br/developers/pt/docs/notifications/webhooks" },
  { id: "stripe",      label: "Stripe",        docs: "https://stripe.com/docs/webhooks" },
];

function GatewayConfig() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
  const [gateway, setGateway]   = useState("");
  const [secret, setSecret]     = useState("");
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [aberto, setAberto]     = useState(false);

  useEffect(() => {
    Promise.all([
      db.getConfiguracao("gateway_config"),
      db.getWebhookLogs(15),
    ]).then(([cfg, lgLista]) => {
      if (cfg) {
        try {
          const parsed = JSON.parse(cfg);
          setGateway(parsed.tipo ?? "");
          setSecret(parsed.webhook_secret ?? "");
          setAberto(true);
        } catch { /* cfg não é JSON */ }
      }
      setLogs(lgLista);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const webhookUrl = gateway && supabaseUrl
    ? `${supabaseUrl}/functions/v1/webhook-pagamento?gateway=${gateway}`
    : "";

  const copiar = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const salvar = async () => {
    if (!gateway) return;
    setSalvando(true);
    try {
      await db.setConfiguracao("gateway_config", { tipo: gateway, webhook_secret: secret });
      setToast("Configuração salva!");
    } catch (e) {
      setToast("Erro: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const recarregarLogs = () => {
    db.getWebhookLogs(15).then(setLogs).catch(console.error);
  };

  const gInfo = GATEWAYS.find((g) => g.id === gateway);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings size={16} strokeWidth={2} className="text-gray-500 shrink-0" />
          <span className="text-sm font-semibold text-gray-700">Gateway de Pagamento</span>
          {gateway && (
            <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
              {GATEWAYS.find((g) => g.id === gateway)?.label ?? gateway}
            </span>
          )}
        </div>
        <span className={`text-gray-400 text-xs transition-transform ${aberto ? "rotate-180" : ""}`}>▼</span>
      </button>

      {aberto && (
        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-gray-100">
          {/* Seleção do gateway */}
          <div className="pt-4">
            <label className="text-xs font-medium text-gray-500 mb-2 block">Gateway de pagamento</label>
            <div className="flex flex-wrap gap-2">
              {GATEWAYS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGateway(g.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all
                    ${gateway === g.id
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* URL do webhook */}
          {gateway && (
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                URL do Webhook — cole no painel do {gInfo?.label}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono text-gray-600 truncate select-all">
                  {webhookUrl || <span className="text-gray-300">Configure o VITE_SUPABASE_URL primeiro</span>}
                </div>
                <button
                  onClick={copiar}
                  disabled={!webhookUrl}
                  className={`shrink-0 px-3 py-2.5 rounded-xl text-xs font-medium border transition-all
                    ${copiado ? "bg-green-50 border-green-200 text-green-600" : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"}`}
                >
                  {copiado ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
              {gInfo?.docs && (
                <a href={gInfo.docs} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] text-indigo-400 hover:text-indigo-600 mt-1 inline-block">
                  → Como configurar no {gInfo.label}
                </a>
              )}
            </div>
          )}

          {/* Webhook secret */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Webhook Secret <span className="font-normal text-gray-400">(opcional — para validação de assinatura)</span>
            </label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="whsec_..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 font-mono"
            />
          </div>

          {/* Como funciona */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 mb-1.5">Como funciona</p>
            <ol className="text-xs text-blue-600 flex flex-col gap-1 list-decimal list-inside">
              <li>Cadastre o cliente e crie a assinatura com o ID gerado pelo gateway</li>
              <li>Configure a URL do webhook acima no painel do gateway</li>
              <li>Ao receber pagamento confirmado, o sistema ativa automaticamente</li>
              <li>Atrasos, cancelamentos e inadimplências também são atualizados</li>
            </ol>
          </div>

          <button
            onClick={salvar}
            disabled={salvando || !gateway}
            className="self-start bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar configuração"}
          </button>

          {/* Logs do webhook */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Logs do webhook
              </p>
              <button onClick={recarregarLogs} className="text-[10px] text-indigo-400 hover:text-indigo-600">
                ↻ Atualizar
              </button>
            </div>
            {loading ? (
              <div className="h-12 animate-pulse bg-gray-50 rounded-xl" />
            ) : logs.length === 0 ? (
              <div className="bg-gray-50 rounded-xl px-4 py-6 text-center">
                <p className="text-xs text-gray-400">Nenhum evento recebido ainda.</p>
                <p className="text-[10px] text-gray-300 mt-1">Os eventos aparecerão aqui assim que o gateway enviar o primeiro webhook.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {logs.map((l) => (
                  <div key={l.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl text-xs
                    ${l.erro ? "bg-red-50 border border-red-100" : l.processado ? "bg-green-50 border border-green-100" : "bg-gray-50 border border-gray-100"}`}>
                    <span className="shrink-0 mt-0.5">
                      {l.erro ? <XCircle size={14} className="text-red-400 shrink-0" /> : l.processado ? <CheckCircle2 size={14} className="text-green-500 shrink-0" /> : <Loader2 size={14} className="text-gray-400 animate-spin shrink-0" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-700">{l.evento}</span>
                        {l.gateway && <span className="text-gray-400">{l.gateway}</span>}
                      </div>
                      {l.erro && <p className="text-red-500 mt-0.5 truncate">{l.erro}</p>}
                    </div>
                    <span className="shrink-0 text-gray-300">
                      {new Date(l.created_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {toast && (
            <p className={`text-xs font-medium ${toast.startsWith("Erro") ? "text-red-500" : "text-green-600"}`}>
              {toast}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function PlanosManager() {
  const [planos, setPlanos]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editando, setEditando]     = useState(null);
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [toast, setToast]           = useState(null);
  const [erro, setErro]             = useState(null);

  const carregar = () => {
    setLoading(true);
    supabaseGetPlanosTodos()
      .then(setPlanos)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  };

  async function supabaseGetPlanosTodos() {
    return db.getPlanos().then((ativos) => ativos);
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSalvar = async (form) => {
    await db.upsertPlano(form);
    carregar();
    setShowForm(false);
    setEditando(null);
    setToast(editando ? "Plano atualizado!" : "Plano criado!");
  };

  const handleDesativar = async (id) => {
    await db.upsertPlano({ id, ativo: false });
    setConfirmandoId(null);
    setToast("Plano desativado.");
    carregar();
  };

  const ativos   = planos.filter((p) => p.ativo);
  const inativos = planos.filter((p) => !p.ativo);

  const intervaloLabel = (v) => INTERVALOS.find((i) => i.value === v)?.label ?? v;

  const PlanoCard = ({ p }) => (
    <div className={`flex items-center justify-between gap-3 p-3 rounded-xl transition-colors
      ${p.ativo ? "bg-gray-50 hover:bg-indigo-50" : "bg-gray-50 opacity-50"}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-semibold ${p.ativo ? "text-gray-800" : "text-gray-400 line-through"}`}>
            {p.nome}
          </p>
          <span className="text-[10px] bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full font-medium">
            {intervaloLabel(p.intervalo)}
          </span>
        </div>
        {p.descricao && <p className="text-xs text-gray-400 mt-0.5 truncate">{p.descricao}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-bold text-indigo-600">{BRL(p.valor)}</span>
        {p.ativo && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setEditando(p); setShowForm(true); }}
              className="text-xs text-gray-400 hover:text-indigo-500 px-2 py-1 rounded-lg hover:bg-white transition-colors"
            >Editar</button>
            <button
              onClick={() => setConfirmandoId(p.id)}
              className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-white transition-colors"
            >Desativar</button>
          </div>
        )}
        {!p.ativo && (
          <button
            onClick={async () => { await db.upsertPlano({ id: p.id, ativo: true }); carregar(); setToast("Plano reativado!"); }}
            className="text-xs text-indigo-400 hover:text-indigo-600 px-2 py-1 rounded-lg transition-colors"
          >Reativar</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Planos de assinatura</h3>
          <p className="text-xs text-gray-400 mt-0.5">{ativos.length} ativo{ativos.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => { setEditando(null); setShowForm(true); }}
          className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >+ Novo plano</button>
      </div>

      {erro && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-center gap-1.5"><AlertTriangle size={13} className="shrink-0" />{erro}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400 animate-pulse">Carregando...</div>
      ) : planos.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-3"><Crown size={24} strokeWidth={1.5} className="text-amber-400" /></div>
          <p className="text-sm text-gray-500 mb-4">Nenhum plano cadastrado ainda.</p>
          <button
            onClick={() => { setEditando(null); setShowForm(true); }}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
          >+ Criar primeiro plano</button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Ativos ({ativos.length})
            </p>
            {ativos.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum plano ativo.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ativos.map((p) => <PlanoCard key={p.id} p={p} />)}
              </div>
            )}
          </div>

          {inativos.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Inativos ({inativos.length})
              </p>
              <div className="flex flex-col gap-2">
                {inativos.map((p) => <PlanoCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <PlanoForm
            plano={editando}
            onSalvar={handleSalvar}
            onFechar={() => { setShowForm(false); setEditando(null); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmandoId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl text-center"
            >
              <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3"><AlertTriangle size={20} strokeWidth={1.5} className="text-red-400" /></div>
              <p className="text-sm text-gray-700 font-medium mb-1">Desativar plano?</p>
              <p className="text-xs text-gray-400 mb-5">
                Assinaturas existentes não serão afetadas.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmandoId(null)}
                  className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={() => handleDesativar(confirmandoId)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                  Desativar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-5 py-3 rounded-2xl shadow-lg z-50"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <GatewayConfig />
    </div>
  );
}

// ─── Modal de cadastro / edição ──────────────────────────────────
function ClienteForm({ cliente, clientes, onSalvar, onFechar }) {
  const [form, setForm] = useState({
    nome:        cliente?.nome        || "",
    telefone:    cliente?.telefone    || "",
    email:       cliente?.email       || "",
    observacoes: cliente?.observacoes || "",
  });
  const [erros, setErros]       = useState({});
  const [salvando, setSalvando] = useState(false);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (erros[field]) setErros((prev) => ({ ...prev, [field]: null }));
  };

  const validar = () => {
    const e = {};
    if (!form.nome.trim() || form.nome.trim().length < 2)
      e.nome = "Nome obrigatório (mínimo 2 caracteres)";
    if (!form.telefone.trim())
      e.telefone = "Telefone obrigatório";
    else {
      const dup = clientes.find(
        (c) => normTel(c.telefone) === normTel(form.telefone) && c.id !== cliente?.id
      );
      if (dup) e.telefone = `Já cadastrado para: ${dup.nome}`;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = "Email inválido";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validar()) return;
    setSalvando(true);
    try {
      const payload = {
        nome:        form.nome.trim(),
        telefone:    form.telefone.trim(),
        email:       form.email.trim()       || null,
        observacoes: form.observacoes.trim() || null,
      };
      if (cliente?.id) await db.updateCliente({ ...cliente, ...payload });
      else             await db.addCliente(payload);
      onSalvar();
    } catch {
      setErros({ geral: "Erro ao salvar. Tente novamente." });
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-800">
            {cliente?.id ? "Editar cliente" : "Novo cliente"}
          </h3>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {[
            { field: "nome",     label: "Nome *",          type: "text",  placeholder: "Nome completo" },
            { field: "telefone", label: "Telefone * (WhatsApp)", type: "tel", placeholder: "(11) 99999-9999" },
            { field: "email",    label: "Email (opcional)", type: "email", placeholder: "email@exemplo.com" },
          ].map(({ field, label, type, placeholder }) => (
            <div key={field}>
              <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
              <input
                autoFocus={field === "nome"}
                type={type}
                value={form[field]}
                onChange={set(field)}
                placeholder={placeholder}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
                  erros[field] ? "border-red-300 bg-red-50" : "border-gray-200"
                }`}
              />
              {erros[field] && <p className="text-xs text-red-500 mt-1">{erros[field]}</p>}
            </div>
          ))}

          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Observações (opcional)
            </label>
            <textarea
              value={form.observacoes}
              onChange={set("observacoes")}
              placeholder="Preferências, alergias, etc."
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          {erros.geral && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertTriangle size={12} className="inline shrink-0 mr-1 -mt-0.5" />{erros.geral}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onFechar}
              className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >Cancelar</button>
            <button
              type="submit" disabled={salvando}
              className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
            >{salvando ? "Salvando..." : cliente?.id ? "Salvar" : "Cadastrar"}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Perfil do cliente ───────────────────────────────────────────
function ClientePerfil({ cliente, clientes, isAssinante, onVoltar, onEditado, onDeletado }) {
  const [atendimentos, setAtendimentos] = useState([]);
  const [barbeiros, setBarbeiros]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [editando, setEditando]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletando, setDeletando]       = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      db.getAtendimentosByCliente(cliente.id, cliente.nome),
      db.getBarbeiros(),
    ])
      .then(([ats, barbs]) => { setAtendimentos(ats); setBarbeiros(barbs); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [cliente.id, cliente.nome]);

  const totalGasto   = atendimentos.reduce((s, a) => s + Number(a.valor_total || 0), 0);
  const ticketMedio  = atendimentos.length > 0 ? totalGasto / atendimentos.length : 0;
  const ultimaVisita = atendimentos[0]?.data_hora ?? null;

  const frequencia = useMemo(() => {
    if (atendimentos.length < 2) return null;
    const datas = [...atendimentos].map((a) => new Date(a.data_hora)).sort((a, b) => a - b);
    const diffs = datas.slice(1).map((d, i) => (d - datas[i]) / 86400000);
    return Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length);
  }, [atendimentos]);

  const topServicos = useMemo(() => {
    const mapa = {};
    for (const a of atendimentos)
      for (const s of a.servicos || [])
        mapa[s.nome] = (mapa[s.nome] || 0) + 1;
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [atendimentos]);

  const handleDelete = async () => {
    setDeletando(true);
    try {
      await db.deleteCliente(cliente.id);
      onDeletado();
    } catch { setDeletando(false); }
  };

  const kpis = [
    { Icon: Scissors,  valor: atendimentos.length, label: "Atendimentos" },
    { Icon: DollarSign, valor: BRL(totalGasto),    label: "Total gasto"  },
    { Icon: CreditCard, valor: BRL(ticketMedio),   label: "Ticket médio" },
    { Icon: Calendar,
      valor: ultimaVisita ? fmtData(ultimaVisita) : "—",
      label: "Última visita",
      sub: frequencia ? `a cada ~${fmtFreq(frequencia)}` : null },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={onVoltar}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-500 transition-colors"
        >← Voltar</button>
        <div className="flex gap-2">
          <button
            onClick={() => setEditando(true)}
            className="text-xs text-indigo-500 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-colors font-medium border border-indigo-200"
          ><Pencil size={13} strokeWidth={2} className="inline mr-1.5 -mt-0.5" />Editar</button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors font-medium border border-red-100"
          ><Trash2 size={13} strokeWidth={2} className="inline mr-1.5 -mt-0.5" />Excluir</button>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <Avatar nome={cliente.nome} size="lg" />
            {isAssinante && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow"><Crown size={11} strokeWidth={2.5} className="text-white" /></span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-gray-800">{cliente.nome}</h2>
              {isAssinante && (
                <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Assinante
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{fmtTel(cliente.telefone)}</p>
            {cliente.email && <p className="text-xs text-gray-400 mt-0.5">{cliente.email}</p>}
            <p className="text-xs text-gray-400 mt-1">Cadastrado em {fmtData(cliente.data_cadastro)}</p>
          </div>
        </div>
        {cliente.observacoes && (
          <div className="mt-4 bg-gray-50 rounded-xl px-3 py-2.5">
            <p className="text-xs font-medium text-gray-500 mb-0.5">Observações</p>
            <p className="text-sm text-gray-700">{cliente.observacoes}</p>
          </div>
        )}
      </div>

      {/* Assinatura */}
      <AssinaturaSection clienteId={cliente.id} barbeiros={barbeiros} />

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-20 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-0.5">
              <k.Icon size={20} strokeWidth={1.5} className="text-gray-400 mb-0.5" />
              <span className="text-xl font-bold text-gray-800 leading-tight">{k.valor}</span>
              <span className="text-xs text-gray-500">{k.label}</span>
              {k.sub && <span className="text-[10px] text-gray-400">{k.sub}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Serviços favoritos */}
      {topServicos.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Star size={14} strokeWidth={2} className="text-amber-400" />Serviços preferidos</h3>
          <div className="flex flex-col gap-2">
            {topServicos.map(([nome, count], i) => {
              const max = topServicos[0][1];
              return (
                <div key={nome} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-300 w-5 shrink-0">#{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate">{nome}</span>
                      <span className="text-xs font-semibold text-indigo-600 ml-2 shrink-0">{count}x</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / max) * 100}%` }}
                        transition={{ duration: 0.4, delay: i * 0.07 }}
                        className="h-full bg-indigo-400 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><ClipboardList size={14} strokeWidth={2} className="text-gray-400" />Histórico de atendimentos</h3>
          {atendimentos.length > 0 && (
            <span className="text-xs text-gray-400">{atendimentos.length} total</span>
          )}
        </div>
        {loading ? (
          <div className="animate-pulse h-12 bg-gray-100 rounded-xl" />
        ) : atendimentos.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum atendimento registrado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {atendimentos.map((a) => {
              const svcs = (a.servicos || []).map((s) => s.nome).join(", ") || "—";
              const dt   = new Date(a.data_hora).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "2-digit",
                hour: "2-digit", minute: "2-digit",
              });
              const pagBadge = { pix: "Pix", debito: "Débito", credito: "Crédito", dinheiro: "Dinheiro" }[a.forma_pagamento];
              return (
                <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{svcs}</p>
                    <p className="text-[10px] text-gray-400">
                      {dt}{pagBadge && ` · ${pagBadge}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 shrink-0">{BRL(a.valor_total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modais */}
      <AnimatePresence>
        {editando && (
          <ClienteForm
            cliente={cliente}
            clientes={clientes}
            onSalvar={() => { setEditando(false); onEditado(); }}
            onFechar={() => setEditando(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl"
            >
              <div className="text-center mb-5">
                <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-3"><AlertTriangle size={20} strokeWidth={1.5} className="text-red-400" /></div>
                <h3 className="font-semibold text-gray-800">Excluir {cliente.nome}?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Ação irreversível. O histórico de atendimentos não será afetado.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                >Cancelar</button>
                <button
                  onClick={handleDelete}
                  disabled={deletando}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
                >{deletando ? "..." : "Excluir"}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Card de cliente na listagem ─────────────────────────────────
function ClienteCard({ cliente, isAssinante, onVer }) {
  const { stats = {} } = cliente;
  return (
    <motion.button
      layout
      onClick={onVer}
      className={`w-full bg-white border rounded-2xl px-4 py-3.5 flex items-center gap-4 text-left hover:shadow-sm transition-all
        ${isAssinante ? "border-amber-200 hover:border-amber-300" : "border-gray-200 hover:border-indigo-200"}`}
    >
      <div className="relative shrink-0">
        <Avatar nome={cliente.nome} />
        {isAssinante && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow"><Crown size={9} strokeWidth={2.5} className="text-white" /></span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-gray-800 truncate">{cliente.nome}</p>
          {isAssinante && (
            <span className="text-[9px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full shrink-0">
              ASSINANTE
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 truncate">{fmtTel(cliente.telefone)}</p>
        {cliente.email && <p className="text-[10px] text-gray-300 truncate">{cliente.email}</p>}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0 text-right">
        {stats.count > 0 ? (
          <>
            <span className="text-sm font-bold text-indigo-600">{BRL(stats.total)}</span>
            <span className="text-[10px] text-gray-400">{stats.count} atend.</span>
          </>
        ) : (
          <span className="text-xs text-gray-300">Sem atend.</span>
        )}
        {stats.ultima && (
          <span className="text-[10px] text-gray-300">{fmtData(stats.ultima)}</span>
        )}
      </div>
    </motion.button>
  );
}

// ─── Página principal ────────────────────────────────────────────
const ORDENACOES = [
  { id: "recentes",     label: "Mais recentes"     },
  { id: "atendimentos", label: "Mais atendimentos" },
  { id: "gasto",        label: "Maior gasto"       },
  { id: "nome",         label: "Nome A–Z"          },
];

const PAGE_SIZE = 20;

export default function ClientesLista({ initialAba = "todos" }) {
  const [clientes, setClientes]             = useState([]);
  const [assinantesIds, setAssinantesIds]   = useState(new Set());
  const [loading, setLoading]               = useState(true);
  const [erro, setErro]                     = useState(null);
  const [busca, setBusca]                   = useState("");
  const [ordenacao, setOrdenacao]           = useState("recentes");
  const [visivel, setVisivel]               = useState(PAGE_SIZE);
  const [showForm, setShowForm]             = useState(false);
  const [clienteSel, setClienteSel]         = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [clts, assinaturas] = await Promise.all([
        db.getClientesComStats(),
        db.getAssinaturasAtivas(),
      ]);
      setClientes(clts);
      setAssinantesIds(new Set(assinaturas.map((a) => a.cliente_id)));
    } catch (e) {
      setErro("Erro ao carregar clientes.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    const q    = busca.toLowerCase().trim();
    const qTel = q.replace(/\D/g, "");
    let lista  = q
      ? clientes.filter((c) =>
          c.nome.toLowerCase().includes(q) ||
          (qTel && normTel(c.telefone).includes(qTel)) ||
          (c.email || "").toLowerCase().includes(q)
        )
      : [...clientes];

    if (ordenacao === "atendimentos") lista.sort((a, b) => (b.stats?.count || 0) - (a.stats?.count || 0));
    else if (ordenacao === "gasto")   lista.sort((a, b) => (b.stats?.total || 0) - (a.stats?.total || 0));
    else if (ordenacao === "nome")    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return lista;
  }, [clientes, busca, ordenacao, assinantesIds]);

  if (clienteSel) {
    return (
      <ClientePerfil
        cliente={clienteSel}
        clientes={clientes}
        isAssinante={assinantesIds.has(clienteSel.id)}
        onVoltar={() => setClienteSel(null)}
        onEditado={async () => {
          await carregar();
          setClienteSel(null);
        }}
        onDeletado={async () => {
          await carregar();
          setClienteSel(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Clientes</h2>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {clientes.length} cadastrado{clientes.length !== 1 ? "s" : ""}
              {assinantesIds.size > 0 && ` · ${assinantesIds.size} assinante${assinantesIds.size !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >+ Novo cliente</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setVisivel(PAGE_SIZE); }}
            placeholder="Buscar por nome, telefone ou email..."
            className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >✕</button>
          )}
        </div>
        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        >
          {ORDENACOES.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>

      {busca && !loading && (
        <p className="text-xs text-gray-400">
          {filtrados.length} resultado{filtrados.length !== 1 ? "s" : ""} para &ldquo;{busca}&rdquo;
        </p>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1,2,3,4,5].map((i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-16 animate-pulse" />
          ))}
        </div>
      ) : erro ? (
        <div className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
          <AlertTriangle size={14} className="inline shrink-0 mr-1.5 -mt-0.5" />{erro}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">{busca ? <Search size={22} strokeWidth={1.5} className="text-gray-400" /> : <Users size={22} strokeWidth={1.5} className="text-gray-400" />}</div>
          <p className="text-sm font-medium text-gray-500">
            {busca
              ? "Nenhum cliente encontrado"
              : "Nenhum cliente cadastrado"}
          </p>
          {!busca && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-sm text-indigo-500 hover:text-indigo-600 font-medium"
            >+ Cadastrar primeiro cliente</button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrados.slice(0, visivel).map((c) => (
            <ClienteCard
              key={c.id}
              cliente={c}
              isAssinante={assinantesIds.has(c.id)}
              onVer={() => setClienteSel(c)}
            />
          ))}
          {visivel < filtrados.length && (
            <button
              onClick={() => setVisivel((v) => v + PAGE_SIZE)}
              className="text-sm text-indigo-500 hover:text-indigo-600 font-medium py-3 text-center hover:bg-indigo-50 rounded-2xl transition-colors border border-dashed border-indigo-200"
            >
              Ver mais {Math.min(PAGE_SIZE, filtrados.length - visivel)} clientes
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <ClienteForm
            cliente={null}
            clientes={clientes}
            onSalvar={() => { setShowForm(false); carregar(); }}
            onFechar={() => setShowForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
