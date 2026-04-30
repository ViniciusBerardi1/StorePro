import { useState } from "react";

export default function ProdutoForm({
  produto,
  categorias,
  onSalvar,
  onFechar,
}) {
  const [form, setForm] = useState({
    id: produto?.id || null,
    nome: produto?.nome || "",
    tipo: produto?.tipo || "loja",
    foto: produto?.foto || "",
    quantidade: produto?.quantidade || 0,
    estoque_minimo: produto?.estoque_minimo ?? 1,
    categoria_id: produto?.categoria_id || categorias[0]?.id || "",
    tem_cor: produto?.tem_cor || 0,
    cor: produto?.cor || "",
    tem_tamanho: produto?.tem_tamanho || 0,
    tamanho_quantidade: produto?.tamanho_quantidade || "",
    tamanho_unidade: produto?.tamanho_unidade || "un",
    preco_custo: produto?.preco_custo ?? "",
    preco_venda: produto?.preco_venda ?? "",
  });

  const handleSubmit = () => {
    if (!form.nome.trim()) return alert("Informe o nome do produto.");
    if (form.quantidade < 0) return alert("Quantidade não pode ser negativa.");
    if (form.estoque_minimo < 0) return alert("Estoque mínimo não pode ser negativo.");
    if (form.tem_tamanho && !String(form.tamanho_quantidade).trim())
      return alert("Informe a quantidade do tamanho do produto.");
    onSalvar(form);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 overflow-y-auto max-h-screen">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">
            {form.id ? "Editar produto" : "Novo produto"}
          </h2>
          <button
            onClick={onFechar}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Tipo de estoque</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "loja", label: "🛍️ Loja", desc: "Itens para venda" },
                { id: "bar", label: "🍺 Bar", desc: "Consumo no local" },
              ].map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipo: op.id }))}
                  className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-sm transition-all
                    ${form.tipo === op.id
                      ? "bg-indigo-500 border-indigo-500 text-white font-medium"
                      : "bg-white border-gray-200 text-gray-500 hover:border-indigo-200"
                    }`}
                >
                  <span className="font-medium">{op.label}</span>
                  <span className={`text-xs ${form.tipo === op.id ? "text-indigo-100" : "text-gray-400"}`}>{op.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Nome do produto *
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Categoria
            </label>
            <select
              value={form.categoria_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, categoria_id: Number(e.target.value) }))
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Quantidade + Estoque mínimo */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Quantidade
              </label>
              <input
                type="number"
                min="0"
                value={form.quantidade}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantidade: parseInt(e.target.value) || 0 }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Mín. repor
              </label>
              <input
                type="number"
                min="0"
                value={form.estoque_minimo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estoque_minimo: parseInt(e.target.value) || 0 }))
                }
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          {/* Preço custo + Preço venda */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Preço de custo
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={form.preco_custo}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      preco_custo: e.target.value === "" ? "" : parseFloat(e.target.value) || "",
                    }))
                  }
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Preço de venda
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={form.preco_venda}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      preco_venda: e.target.value === "" ? "" : parseFloat(e.target.value) || "",
                    }))
                  }
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            </div>
          </div>

          {/* Foto */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Foto do produto
            </label>
            <div className="flex items-center gap-3">
              {form.foto && (
                <img
                  src={form.foto}
                  alt="preview"
                  className="w-14 h-14 rounded-lg object-cover border border-gray-200"
                />
              )}
              <label className="border border-gray-200 text-gray-500 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                {form.foto ? "Trocar foto" : "Selecionar foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                          const canvas = document.createElement("canvas");
                          const MAX = 600;
                          let w = img.width;
                          let h = img.height;
                          if (w > h && w > MAX) { h = (h * MAX) / w; w = MAX; }
                          else if (h > MAX) { w = (w * MAX) / h; h = MAX; }
                          canvas.width = w;
                          canvas.height = h;
                          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                          setForm((f) => ({ ...f, foto: canvas.toDataURL("image/jpeg", 0.7) }));
                        };
                        img.src = ev.target.result;
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
              {form.foto && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, foto: "" }))}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Remover
                </button>
              )}
            </div>
          </div>

          {/* Cor */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Cor do produto
            </label>
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, tem_cor: f.tem_cor ? 0 : 1, cor: "" }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.tem_cor ? "bg-indigo-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.tem_cor ? "translate-x-4" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-gray-500">{form.tem_cor ? "Tem cor" : "Sem cor"}</span>
            </div>
            {!!form.tem_cor && (
              <input
                type="text"
                placeholder="Ex: Azul, Vermelho, Preto..."
                value={form.cor}
                onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            )}
          </div>

          {/* Tamanho */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Tamanho / Unidade
            </label>
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, tem_tamanho: f.tem_tamanho ? 0 : 1, tamanho_quantidade: "", tamanho_unidade: "un" }))
                }
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.tem_tamanho ? "bg-indigo-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.tem_tamanho ? "translate-x-4" : "translate-x-1"}`} />
              </button>
              <span className="text-sm text-gray-500">{form.tem_tamanho ? "Tem tamanho" : "Sem tamanho"}</span>
            </div>
            {!!form.tem_tamanho && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  placeholder="Ex: 500"
                  value={form.tamanho_quantidade}
                  onChange={(e) => setForm((f) => ({ ...f, tamanho_quantidade: e.target.value }))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <select
                  value={form.tamanho_unidade}
                  onChange={(e) => setForm((f) => ({ ...f, tamanho_unidade: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                >
                  <option value="un">un</option>
                  <option value="ml">ml</option>
                  <option value="L">L</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="oz">oz</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onFechar}
            className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
