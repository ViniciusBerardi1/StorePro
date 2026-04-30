import { db } from "./db";

const PRODUTOS_SEED = [
  {
    nome: "Camiseta Polo",
    categoria_id: 2,
    quantidade: 15,
    estoque_minimo: 5,
    preco_custo: 35.00,
    preco_venda: 79.90,
    tem_cor: 1, cor: "Branco",
    tem_tamanho: 1, tamanho_quantidade: "M", tamanho_unidade: "",
    foto: "",
  },
  {
    nome: "Calça Jeans Slim",
    categoria_id: 2,
    quantidade: 8,
    estoque_minimo: 3,
    preco_custo: 60.00,
    preco_venda: 149.90,
    tem_cor: 1, cor: "Azul",
    tem_tamanho: 1, tamanho_quantidade: "42", tamanho_unidade: "",
    foto: "",
  },
  {
    nome: "Tênis Casual",
    categoria_id: 3,
    quantidade: 6,
    estoque_minimo: 2,
    preco_custo: 80.00,
    preco_venda: 199.90,
    tem_cor: 1, cor: "Preto",
    tem_tamanho: 1, tamanho_quantidade: "40", tamanho_unidade: "",
    foto: "",
  },
  {
    nome: "Fone Bluetooth",
    categoria_id: 1,
    quantidade: 4,
    estoque_minimo: 2,
    preco_custo: 90.00,
    preco_venda: 229.90,
    tem_cor: 0, cor: "",
    tem_tamanho: 0, tamanho_quantidade: "", tamanho_unidade: "",
    foto: "",
  },
  {
    nome: "Carregador USB-C 65W",
    categoria_id: 1,
    quantidade: 10,
    estoque_minimo: 3,
    preco_custo: 40.00,
    preco_venda: 99.90,
    tem_cor: 0, cor: "",
    tem_tamanho: 0, tamanho_quantidade: "", tamanho_unidade: "",
    foto: "",
  },
  {
    nome: "Mochila Executiva",
    categoria_id: 6,
    quantidade: 3,
    estoque_minimo: 2,
    preco_custo: 70.00,
    preco_venda: 179.90,
    tem_cor: 1, cor: "Preto",
    tem_tamanho: 0, tamanho_quantidade: "", tamanho_unidade: "",
    foto: "",
  },
];

export async function seedIfEmpty() {
  const existentes = await db.getProdutos();
  if (existentes.length > 0) return;

  const hoje = new Date().toISOString();
  for (const p of PRODUTOS_SEED) {
    await db.addProduto({ ...p, id: null, data_cadastro: hoje });
  }

  await db.addHistorico({
    produto_nome: "Camiseta Básica",
    produto_cor: "Cinza",
    categoria_nome: "Roupas",
    foto: "",
    data_zerado: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await db.addHistorico({
    produto_nome: "Cabo HDMI 2m",
    produto_cor: "",
    categoria_nome: "Eletrônicos",
    foto: "",
    data_zerado: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  });

  console.log("Seed aplicado com sucesso.");
}
