import { useState, useEffect, useCallback } from "react";
import { Store, Plus, RefreshCw, Eye, EyeOff, CheckCircle, AlertCircle, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { getAllLojas, createLojaComUsuario, toggleLojaAtivo, deleteLoja } from "../../../services/adminAuth";

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function LojaBadge({ ativo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold
      ${ativo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ativo ? "bg-emerald-500" : "bg-red-400"}`} />
      {ativo ? "Ativa" : "Inativa"}
    </span>
  );
}

function CreateForm({ onCreated, onCancel }) {
  const [nome,      setNome]      = useState("");
  const [slug,      setSlug]      = useState("");
  const [senha,     setSenha]     = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [slugManual, setSlugManual] = useState(false);

  const handleNome = (v) => {
    setNome(v);
    if (!slugManual) setSlug(slugify(v));
  };

  const handleSlug = (v) => {
    setSlug(slugify(v));
    setSlugManual(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim() || !slug.trim() || !senha) return;
    if (senha.length < 6) { setError("Senha deve ter pelo menos 6 caracteres."); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await createLojaComUsuario(nome.trim(), slug.trim(), senha);
      onCreated(result);
    } catch (err) {
      setError(err.message || "Erro ao criar barbearia.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
      <p className="text-sm font-semibold text-gray-700 mb-4">Nova barbearia</p>
      <div className="flex flex-col gap-3">

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nome da barbearia</label>
          <input
            value={nome}
            onChange={(e) => handleNome(e.target.value)}
            placeholder="Ex: Barbearia do João"
            autoFocus
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Identificador de acesso
            <span className="ml-1 text-gray-400 font-normal">(usado no login)</span>
          </label>
          <input
            value={slug}
            onChange={(e) => handleSlug(e.target.value)}
            placeholder="barbearia-do-joao"
            required
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            O dono vai usar este identificador para entrar no app.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Senha de acesso</label>
          <div className="relative">
            <input
              type={showSenha ? "text" : "password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              type="button"
              onClick={() => setShowSenha(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showSenha ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2 mt-1">
          <button
            type="submit"
            disabled={saving || !nome.trim() || !slug.trim() || !senha}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar barbearia"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 border border-gray-200 text-gray-500 text-sm rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}

function CredenciaisModal({ loja, usuario, onClose }) {
  const [copied, setCopied] = useState(false);

  const texto = `Barbearia: ${loja.nome}\nIdentificador: ${loja.slug}\nSenha: (a que você definiu)`;

  const copy = () => {
    navigator.clipboard.writeText(texto);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle size={20} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Barbearia criada!</p>
            <p className="text-xs text-gray-400">Compartilhe os dados de acesso</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 font-mono text-sm space-y-2 mb-4">
          <div>
            <span className="text-gray-400 text-xs">Identificador</span>
            <p className="font-semibold text-gray-800">{loja.slug}</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">Senha</span>
            <p className="text-gray-500 text-xs italic">a senha que você definiu</p>
          </div>
          <div>
            <span className="text-gray-400 text-xs">URL do app</span>
            <p className="font-semibold text-indigo-600">{window.location.origin}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 flex items-center justify-center gap-2 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            {copied ? <CheckCircle size={14} className="text-emerald-500" /> : null}
            {copied ? "Copiado!" : "Copiar dados"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLojas() {
  const [lojas,       setLojas]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [sucesso,     setSucesso]     = useState(null); // { loja, usuario }
  const [error,       setError]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // lojaId

  const load = useCallback(async () => {
    try {
      setLojas(await getAllLojas());
      setError(null);
    } catch (err) {
      setError(err.message || "Erro ao carregar barbearias.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleCreated = (result) => {
    setShowForm(false);
    setSucesso(result);
    load();
  };

  const handleToggle = async (loja) => {
    try {
      await toggleLojaAtivo(loja.id, !loja.ativo);
      setLojas((prev) => prev.map((l) => l.id === loja.id ? { ...l, ativo: !l.ativo } : l));
    } catch (err) {
      setError(err.message || "Erro ao atualizar status.");
    }
  };

  const handleDelete = async (lojaId) => {
    try {
      await deleteLoja(lojaId);
      setLojas((prev) => prev.filter((l) => l.id !== lojaId));
      setConfirmDelete(null);
    } catch (err) {
      setError(err.message || "Erro ao excluir barbearia.");
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Barbearias</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie as barbearias e seus acessos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <Plus size={15} />
            Nova barbearia
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {showForm && (
        <CreateForm
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : lojas.length === 0 ? (
          <div className="py-16 text-center">
            <Store size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">Nenhuma barbearia cadastrada.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Identificador</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lojas.map((loja) => (
                <tr key={loja.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {loja.nome.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-800">{loja.nome}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                      {loja.slug || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <LojaBadge ativo={loja.ativo} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggle(loja)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {loja.ativo
                          ? <ToggleRight size={20} className="text-emerald-500" />
                          : <ToggleLeft size={20} />
                        }
                      </button>
                      {confirmDelete === loja.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(loja.id)}
                            className="text-[11px] font-semibold bg-red-600 text-white px-2 py-1 rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-[11px] text-gray-500 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(loja.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {sucesso && (
        <CredenciaisModal
          loja={sucesso.loja}
          usuario={sucesso.usuario}
          onClose={() => setSucesso(null)}
        />
      )}
    </div>
  );
}
