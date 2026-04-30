const DB_NAME = "store-pro";
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // --- v1 stores ---
      if (!db.objectStoreNames.contains("categorias")) {
        const cats = db.createObjectStore("categorias", { keyPath: "id", autoIncrement: true });
        cats.transaction.oncomplete = () => {
          const tx = db.transaction("categorias", "readwrite");
          const store = tx.objectStore("categorias");
          ["Eletrônicos", "Roupas", "Calçados", "Alimentos", "Higiene", "Outros"]
            .forEach((nome, i) => store.add({ id: i + 1, nome }));
        };
      }

      if (!db.objectStoreNames.contains("produtos")) {
        const prod = db.createObjectStore("produtos", { keyPath: "id", autoIncrement: true });
        prod.createIndex("categoria_id", "categoria_id", { unique: false });
      }

      if (!db.objectStoreNames.contains("historico")) {
        db.createObjectStore("historico", { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains("desejos")) {
        db.createObjectStore("desejos", { keyPath: "id", autoIncrement: true });
      }

      // --- v2 stores ---

      /*
       * atendimentos — registra cada atendimento/venda realizado
       * {
       *   id, data_hora (ISO), cliente_nome, cliente_id|null,
       *   servicos: [{ nome, valor }], valor_total,
       *   status: "agendado"|"em_andamento"|"concluido"|"cancelado",
       *   observacoes, data_cadastro (ISO)
       * }
       */
      if (!db.objectStoreNames.contains("atendimentos")) {
        const at = db.createObjectStore("atendimentos", { keyPath: "id", autoIncrement: true });
        at.createIndex("data_hora", "data_hora", { unique: false });
        at.createIndex("cliente_id", "cliente_id", { unique: false });
        at.createIndex("status", "status", { unique: false });
      }

      /*
       * clientes — cadastro de clientes
       * { id, nome, telefone, email, observacoes, data_cadastro (ISO) }
       */
      if (!db.objectStoreNames.contains("clientes")) {
        const cl = db.createObjectStore("clientes", { keyPath: "id", autoIncrement: true });
        cl.createIndex("nome", "nome", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(store) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// helpers de data
function isoParaData(iso) {
  return iso ? iso.slice(0, 10) : "";
}

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function mesStr(ano, mes) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

export const db = {
  // ─── Categorias ────────────────────────────────────────────────
  getCategorias: () => getAll("categorias"),

  // ─── Produtos ──────────────────────────────────────────────────
  getProdutos: async () => {
    const [produtos, categorias] = await Promise.all([getAll("produtos"), getAll("categorias")]);
    return produtos
      .map((p) => ({
        ...p,
        categoria_nome: categorias.find((c) => c.id === Number(p.categoria_id))?.nome || "",
      }))
      .sort((a, b) => a.nome?.localeCompare(b.nome ?? "") ?? 0);
  },

  addProduto: (p) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("produtos", "readwrite");
        const { id: _id, ...sem } = p;
        const req = tx.objectStore("produtos").add({ ...sem, data_cadastro: new Date().toISOString() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  updateProduto: (p) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("produtos", "readwrite");
        const req = tx.objectStore("produtos").put(p);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  deleteProduto: (id) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("produtos", "readwrite");
        const req = tx.objectStore("produtos").delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ),

  // ─── Histórico de estoque ──────────────────────────────────────
  addHistorico: (entrada) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("historico", "readwrite");
        const req = tx.objectStore("historico").add(entrada);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  getHistorico: () =>
    getAll("historico").then((lista) =>
      lista.sort((a, b) => new Date(b.data_zerado) - new Date(a.data_zerado))
    ),

  limparHistorico: () =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("historico", "readwrite");
        const req = tx.objectStore("historico").clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ),

  // ─── Desejos ───────────────────────────────────────────────────
  getDesejos: () =>
    getAll("desejos").then((lista) =>
      lista.sort((a, b) => new Date(b.data_adicionado) - new Date(a.data_adicionado))
    ),

  addDesejo: (d) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("desejos", "readwrite");
        const { id: _id, ...sem } = d;
        const req = tx.objectStore("desejos").add({ ...sem, data_adicionado: new Date().toISOString() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  updateDesejo: (d) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("desejos", "readwrite");
        const req = tx.objectStore("desejos").put(d);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  deleteDesejo: (id) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("desejos", "readwrite");
        const req = tx.objectStore("desejos").delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ),

  // ─── Atendimentos ──────────────────────────────────────────────
  getAtendimentos: () =>
    getAll("atendimentos").then((lista) =>
      lista.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))
    ),

  getAtendimentosHoje: async () => {
    const todos = await getAll("atendimentos");
    const hoje = hojeStr();
    return todos
      .filter((a) => isoParaData(a.data_hora) === hoje)
      .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  },

  getAtendimentosMes: async (ano, mes) => {
    const todos = await getAll("atendimentos");
    const prefixo = mesStr(ano, mes);
    return todos.filter((a) => isoParaData(a.data_hora).startsWith(prefixo));
  },

  // Retorna os últimos N dias com { data: "YYYY-MM-DD", valor: number }
  getFaturamentoUltimosDias: async (dias = 7) => {
    const todos = await getAll("atendimentos");
    const resultado = [];
    for (let i = dias - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dataStr = d.toISOString().slice(0, 10);
      const valor = todos
        .filter((a) => isoParaData(a.data_hora) === dataStr && a.status === "concluido")
        .reduce((sum, a) => sum + (a.valor_total || 0), 0);
      resultado.push({ data: dataStr, valor });
    }
    return resultado;
  },

  addAtendimento: (a) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("atendimentos", "readwrite");
        const { id: _id, ...sem } = a;
        const req = tx.objectStore("atendimentos").add({
          ...sem,
          data_cadastro: new Date().toISOString(),
        });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  updateAtendimento: (a) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("atendimentos", "readwrite");
        const req = tx.objectStore("atendimentos").put(a);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  deleteAtendimento: (id) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("atendimentos", "readwrite");
        const req = tx.objectStore("atendimentos").delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ),

  // ─── Clientes ──────────────────────────────────────────────────
  getClientes: () =>
    getAll("clientes").then((lista) =>
      lista.sort((a, b) => a.nome?.localeCompare(b.nome ?? "") ?? 0)
    ),

  addCliente: (c) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("clientes", "readwrite");
        const { id: _id, ...sem } = c;
        const req = tx.objectStore("clientes").add({ ...sem, data_cadastro: new Date().toISOString() });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  updateCliente: (c) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("clientes", "readwrite");
        const req = tx.objectStore("clientes").put(c);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ),

  deleteCliente: (id) =>
    openDB().then((db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("clientes", "readwrite");
        const req = tx.objectStore("clientes").delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ),
};
