import { useState, useRef, useEffect } from "react";
import { db } from "../../services/supabaseDb";

const normTel = (t) => (t || "").replace(/\D/g, "");

function MiniForm({ nomeInicial, clientes, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(nomeInicial || "");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState({});
  const nomeRef = useRef(null);

  useEffect(() => { nomeRef.current?.focus(); }, []);

  const validar = () => {
    const e = {};
    if (nome.trim().length < 2) e.nome = "Nome muito curto.";
    const tel = normTel(telefone);
    if (!tel) e.telefone = "Telefone obrigatório.";
    else if (clientes.some((c) => normTel(c.telefone) === tel)) e.telefone = "Telefone já cadastrado.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "E-mail inválido.";
    return e;
  };

  const handleSalvar = async () => {
    const e = validar();
    if (Object.keys(e).length > 0) return setErros(e);
    setSalvando(true);
    try {
      const cliente = await db.addCliente({
        nome: nome.trim(),
        telefone: telefone.trim(),
        email: email.trim() || null,
        observacoes: obs.trim() || null,
      });
      onSalvar(cliente);
    } catch {
      setErros({ geral: "Erro ao salvar. Tente novamente." });
      setSalvando(false);
    }
  };

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col gap-2.5">
      <p className="text-xs font-semibold text-indigo-700">Cadastrar novo cliente</p>
      <input
        ref={nomeRef}
        type="text"
        value={nome}
        onChange={(e) => { setNome(e.target.value); setErros((p) => ({ ...p, nome: null })); }}
        placeholder="Nome *"
        className={`border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white ${erros.nome ? "border-red-300" : "border-gray-200"}`}
      />
      {erros.nome && <p className="text-xs text-red-500 -mt-1">{erros.nome}</p>}
      <input
        type="tel"
        value={telefone}
        onChange={(e) => { setTelefone(e.target.value); setErros((p) => ({ ...p, telefone: null })); }}
        placeholder="Telefone * (ex: 11 91234-5678)"
        className={`border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white ${erros.telefone ? "border-red-300" : "border-gray-200"}`}
      />
      {erros.telefone && <p className="text-xs text-red-500 -mt-1">{erros.telefone}</p>}
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setErros((p) => ({ ...p, email: null })); }}
        placeholder="E-mail (opcional)"
        className={`border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white ${erros.email ? "border-red-300" : "border-gray-200"}`}
      />
      {erros.email && <p className="text-xs text-red-500 -mt-1">{erros.email}</p>}
      <textarea
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observações (opcional)"
        rows={2}
        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none bg-white"
      />
      {erros.geral && <p className="text-xs text-red-500">{erros.geral}</p>}
      <div className="flex gap-2 mt-0.5">
        <button
          onClick={onCancelar}
          className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-white transition-colors"
        >Cancelar</button>
        <button
          onClick={handleSalvar}
          disabled={salvando}
          className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
        >{salvando ? "Salvando..." : "Cadastrar"}</button>
      </div>
    </div>
  );
}

export default function ClienteSelector({ clientes = [], value, onChange }) {
  const [query, setQuery] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = clientes
    .filter((c) => {
      const q = query.toLowerCase().trim();
      if (!q) return true;
      return c.nome.toLowerCase().includes(q) || (c.telefone || "").includes(q);
    })
    .slice(0, 8);

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl">
        <span className="text-indigo-500 text-base">👤</span>
        <span className="flex-1 text-sm font-medium text-indigo-700 truncate">
          {value.nome}
          {value.telefone && (
            <span className="font-normal text-indigo-400"> · {value.telefone}</span>
          )}
        </span>
        <button
          onClick={() => onChange(null)}
          className="text-indigo-300 hover:text-indigo-500 transition-colors text-base leading-none ml-1 font-bold"
          title="Remover cliente"
        >✕</button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setShowDrop(true); setShowForm(false); }}
        onFocus={() => setShowDrop(true)}
        placeholder="Buscar ou criar cliente..."
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      {showDrop && !showForm && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange({ id: c.id, nome: c.nome, telefone: c.telefone || "" });
                setQuery("");
                setShowDrop(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-indigo-50 transition-colors"
            >
              <span className="text-sm shrink-0">👤</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{c.nome}</p>
                {c.telefone && <p className="text-xs text-gray-400">{c.telefone}</p>}
              </div>
            </button>
          ))}
          {filtered.length === 0 && query.trim() && (
            <div className="px-4 py-2.5 text-sm text-gray-400 italic">Nenhum cliente encontrado.</div>
          )}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setShowDrop(false);
              setShowForm(true);
            }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-left text-sm text-indigo-600 hover:bg-indigo-50 transition-colors border-t border-gray-100 font-medium"
          >
            <span className="font-bold text-base">+</span>
            {query.trim() ? `Cadastrar "${query.trim()}"` : "Cadastrar novo cliente"}
          </button>
        </div>
      )}

      {showForm && (
        <div className="mt-2">
          <MiniForm
            nomeInicial={query.trim()}
            clientes={clientes}
            onSalvar={(cliente) => {
              onChange({ id: cliente.id, nome: cliente.nome, telefone: cliente.telefone || "" });
              setQuery("");
              setShowForm(false);
            }}
            onCancelar={() => { setShowForm(false); setQuery(""); }}
          />
        </div>
      )}
    </div>
  );
}
