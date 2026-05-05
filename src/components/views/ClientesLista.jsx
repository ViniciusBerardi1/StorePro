import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../services/supabaseDb";

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
function AssinaturaSection({ clienteId }) {
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
      ? { ...base, plano_id: base.plano_id ?? "", valor: base.valor ?? "", gateway: base.gateway ?? "", gateway_subscription_id: base.gateway_subscription_id ?? "", data_renovacao: base.data_renovacao ?? "", observacoes: base.observacoes ?? "" }
      : { status: "ativa", plano_id: "", data_inicio: hoje, data_renovacao: "", valor: "", gateway: "", gateway_subscription_id: "", observacoes: "" }
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
        cliente_id: clienteId,
        plano_id:   form.plano_id   ? Number(form.plano_id)   : null,
        valor:      form.valor      ? Number(form.valor)       : null,
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
          <span>👑</span> Assinatura
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
            <button
              onClick={() => handleCancelar(ativa.id)}
              className="text-xs text-red-400 hover:text-red-600 text-left px-1 transition-colors"
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
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">⚠️ {erro}</p>
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
              ⚠️ {erros.geral}
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
  const [loading, setLoading]           = useState(true);
  const [editando, setEditando]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletando, setDeletando]       = useState(false);

  useEffect(() => {
    setLoading(true);
    db.getAtendimentosByCliente(cliente.id, cliente.nome)
      .then(setAtendimentos)
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
    { icon: "✂️", valor: atendimentos.length, label: "Atendimentos" },
    { icon: "💰", valor: BRL(totalGasto),     label: "Total gasto"  },
    { icon: "💳", valor: BRL(ticketMedio),    label: "Ticket médio" },
    { icon: "📅",
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
          >✏️ Editar</button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors font-medium border border-red-100"
          >🗑️ Excluir</button>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <Avatar nome={cliente.nome} size="lg" />
            {isAssinante && (
              <span className="absolute -top-1 -right-1 text-base leading-none">👑</span>
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
      <AssinaturaSection clienteId={cliente.id} />

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
              <span className="text-xl">{k.icon}</span>
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
          <h3 className="text-sm font-semibold text-gray-700 mb-3">⭐ Serviços preferidos</h3>
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
          <h3 className="text-sm font-semibold text-gray-700">📋 Histórico de atendimentos</h3>
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
              const pagBadge = { pix: "Pix", debito: "Débito", credito: "Crédito" }[a.forma_pagamento];
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
                <div className="text-3xl mb-2">⚠️</div>
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
          <span className="absolute -top-1 -right-1 text-xs leading-none">👑</span>
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

export default function ClientesLista() {
  const [clientes, setClientes]             = useState([]);
  const [assinantesIds, setAssinantesIds]   = useState(new Set());
  const [loading, setLoading]               = useState(true);
  const [erro, setErro]                     = useState(null);
  const [busca, setBusca]                   = useState("");
  const [ordenacao, setOrdenacao]           = useState("recentes");
  const [aba, setAba]                       = useState("todos");
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

    if (aba === "assinantes") lista = lista.filter((c) => assinantesIds.has(c.id));

    if (ordenacao === "atendimentos") lista.sort((a, b) => (b.stats?.count || 0) - (a.stats?.count || 0));
    else if (ordenacao === "gasto")   lista.sort((a, b) => (b.stats?.total || 0) - (a.stats?.total || 0));
    else if (ordenacao === "nome")    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return lista;
  }, [clientes, busca, ordenacao, aba, assinantesIds]);

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

      {/* Abas */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: "todos",      label: "Todos"       },
          { id: "assinantes", label: "👑 Assinantes" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setAba(t.id); setVisivel(PAGE_SIZE); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              aba === t.id
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
            {t.id === "assinantes" && assinantesIds.size > 0 && (
              <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">
                {assinantesIds.size}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Busca + Ordenação */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
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
          ⚠️ {erro}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-12 text-center">
          <div className="text-4xl mb-3">{aba === "assinantes" ? "👑" : busca ? "🔍" : "👥"}</div>
          <p className="text-sm font-medium text-gray-500">
            {aba === "assinantes"
              ? "Nenhum assinante ativo"
              : busca
              ? "Nenhum cliente encontrado"
              : "Nenhum cliente cadastrado"}
          </p>
          {!busca && aba === "todos" && (
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
