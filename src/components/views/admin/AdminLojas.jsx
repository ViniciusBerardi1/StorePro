import { useState, useEffect, useCallback } from "react";
import { Store, Plus, RefreshCw, Copy, CheckCircle, AlertCircle, ToggleLeft, ToggleRight } from "lucide-react";
import { getAllLojas, createLoja, toggleLojaAtivo } from "../../../services/adminAuth";

function LojaBadge({ ativo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold
      ${ativo ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ativo ? "bg-emerald-500" : "bg-red-400"}`} />
      {ativo ? "Ativa" : "Inativa"}
    </span>
  );
}

function InviteCell({ lojaId }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/cadastro?loja=${lojaId}`;

  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      title={link}
      className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-xs font-medium transition-colors"
    >
      {copied ? <CheckCircle size={13} className="text-emerald-500" /> : <Copy size={13} />}
      {copied ? "Copiado!" : "Copiar link"}
    </button>
  );
}

export default function AdminLojas() {
  const [lojas,     setLojas]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [success,   setSuccess]   = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [nome,      setNome]      = useState("");

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

  const notify = (msg, type = "success") => {
    if (type === "success") setSuccess(msg);
    else setError(msg);
    setTimeout(() => { setSuccess(null); setError(null); }, 3000);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    try {
      await createLoja(nome.trim());
      setNome("");
      setShowForm(false);
      await load();
      notify("Barbearia criada com sucesso!");
    } catch (err) {
      notify(err.message || "Erro ao criar barbearia.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (loja) => {
    try {
      await toggleLojaAtivo(loja.id, !loja.ativo);
      setLojas((prev) => prev.map((l) => l.id === loja.id ? { ...l, ativo: !l.ativo } : l));
    } catch (err) {
      notify(err.message || "Erro ao atualizar status.", "error");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Barbearias</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie as barbearias cadastradas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
          >
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

      {(error || success) && (
        <div className={`mb-4 flex items-center gap-2 text-sm rounded-xl px-4 py-3 border
          ${success
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-600"
          }`}>
          {success ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {success || error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Nova barbearia</p>
          <div className="flex gap-3">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da barbearia"
              autoFocus
              required
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              type="submit"
              disabled={saving || !nome.trim()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setNome(""); }}
              className="px-4 py-2.5 border border-gray-200 text-gray-500 text-sm rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
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
            <p className="text-gray-300 text-xs mt-1">Clique em "Nova barbearia" para começar.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Criada em</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Link de convite</th>
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
                  <td className="px-5 py-4 text-gray-500 hidden sm:table-cell">
                    {new Date(loja.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-4">
                    <LojaBadge ativo={loja.ativo} />
                  </td>
                  <td className="px-5 py-4">
                    <InviteCell lojaId={loja.id} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => handleToggle(loja)}
                      title={loja.ativo ? "Desativar" : "Ativar"}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {loja.ativo
                        ? <ToggleRight size={20} className="text-emerald-500" />
                        : <ToggleLeft size={20} />
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        O link de convite direciona o dono da barbearia para criar a conta vinculada a essa unidade.
      </p>
    </div>
  );
}
