import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";

// Injeta um banco em memória limpo antes de cada teste
beforeEach(() => {
  global.indexedDB = new IDBFactory();
});

// Importação depois do beforeEach para garantir que o global está disponível
const { db } = await import("./db");

const produtoBase = {
  id: null,
  nome: "Hidratante Neutrogena",
  foto: "",
  data_validade: "2027-06-01",
  quantidade: 2,
  estoque_minimo: 1,
  categoria_id: 1,
  tem_cor: 0,
  cor: "",
  loja_compra: "sephora",
  avaliacao: 5,
  tem_tamanho: 1,
  tamanho_quantidade: "200",
  tamanho_unidade: "ml",
};

// ─── Categorias ─────────────────────────────────────────────────────────────

describe("db.getCategorias", () => {
  it("retorna as 6 categorias padrão após inicialização", async () => {
    const cats = await db.getCategorias();
    expect(cats).toHaveLength(6);
    expect(cats.map((c) => c.nome)).toEqual([
      "Eletrônicos",
      "Roupas",
      "Calçados",
      "Alimentos",
      "Higiene",
      "Outros",
    ]);
  });

  it("cada categoria tem id e nome", async () => {
    const cats = await db.getCategorias();
    cats.forEach((c) => {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("nome");
      expect(typeof c.nome).toBe("string");
    });
  });
});

// ─── Produtos ────────────────────────────────────────────────────────────────

describe("db.addProduto", () => {
  it("adiciona produto e retorna o id gerado", async () => {
    const id = await db.addProduto(produtoBase);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("adiciona data_cadastro automaticamente", async () => {
    await db.addProduto(produtoBase);
    const produtos = await db.getProdutos();
    expect(produtos[0]).toHaveProperty("data_cadastro");
    expect(new Date(produtos[0].data_cadastro)).toBeInstanceOf(Date);
  });

  it("não inclui o id original (null) no registro", async () => {
    await db.addProduto({ ...produtoBase, id: null });
    const produtos = await db.getProdutos();
    expect(produtos[0].id).not.toBeNull();
    expect(produtos[0].id).toBeGreaterThan(0);
  });
});

describe("db.getProdutos", () => {
  it("retorna lista vazia quando não há produtos", async () => {
    const produtos = await db.getProdutos();
    expect(produtos).toHaveLength(0);
  });

  it("enriquece produto com categoria_nome", async () => {
    await db.addProduto(produtoBase); // categoria_id: 1 = Eletrônicos
    const produtos = await db.getProdutos();
    expect(produtos[0].categoria_nome).toBe("Eletrônicos");
  });

  it("retorna categoria_nome vazia para categoria inexistente", async () => {
    await db.addProduto({ ...produtoBase, categoria_id: 999 });
    const produtos = await db.getProdutos();
    expect(produtos[0].categoria_nome).toBe("");
  });

  it("ordena por nome (A→Z)", async () => {
    await db.addProduto({ ...produtoBase, nome: "Shampoo" });
    await db.addProduto({ ...produtoBase, nome: "Condicionador" });
    await db.addProduto({ ...produtoBase, nome: "Hidratante" });
    const produtos = await db.getProdutos();
    expect(produtos[0].nome).toBe("Condicionador");
    expect(produtos[1].nome).toBe("Hidratante");
    expect(produtos[2].nome).toBe("Shampoo");
  });

  it("coloca produtos sem data_validade no final", async () => {
    await db.addProduto({ ...produtoBase, data_validade: "2027-01-01" });
    await db.addProduto({ ...produtoBase, data_validade: "" });
    const produtos = await db.getProdutos();
    expect(produtos[0].data_validade).toBe("2027-01-01");
    expect(produtos[1].data_validade).toBe("");
  });
});

describe("db.updateProduto", () => {
  it("atualiza campos do produto", async () => {
    const id = await db.addProduto(produtoBase);
    const [produto] = await db.getProdutos();
    await db.updateProduto({ ...produto, quantidade: 10, nome: "Nome Atualizado" });
    const [atualizado] = await db.getProdutos();
    expect(atualizado.quantidade).toBe(10);
    expect(atualizado.nome).toBe("Nome Atualizado");
  });
});

describe("db.deleteProduto", () => {
  it("remove o produto pelo id", async () => {
    const id = await db.addProduto(produtoBase);
    await db.deleteProduto(id);
    const produtos = await db.getProdutos();
    expect(produtos).toHaveLength(0);
  });

  it("não afeta outros produtos ao deletar um", async () => {
    const id1 = await db.addProduto(produtoBase);
    await db.addProduto({ ...produtoBase, nome: "Segundo Produto" });
    await db.deleteProduto(id1);
    const produtos = await db.getProdutos();
    expect(produtos).toHaveLength(1);
    expect(produtos[0].nome).toBe("Segundo Produto");
  });
});

// ─── Histórico ───────────────────────────────────────────────────────────────

describe("db.addHistorico / db.getHistorico", () => {
  it("salva e recupera entrada do histórico", async () => {
    await db.addHistorico({
      produto_id: 1,
      produto_nome: "Shampoo",
      produto_cor: "",
      categoria_nome: "Cabelo",
      foto: "",
      data_zerado: "2026-01-15T10:00:00.000Z",
    });
    const historico = await db.getHistorico();
    expect(historico).toHaveLength(1);
    expect(historico[0].produto_nome).toBe("Shampoo");
  });

  it("ordena histórico do mais recente para o mais antigo", async () => {
    await db.addHistorico({ produto_nome: "Antigo", data_zerado: "2025-01-01T00:00:00.000Z" });
    await db.addHistorico({ produto_nome: "Recente", data_zerado: "2026-06-01T00:00:00.000Z" });
    const historico = await db.getHistorico();
    expect(historico[0].produto_nome).toBe("Recente");
    expect(historico[1].produto_nome).toBe("Antigo");
  });
});
