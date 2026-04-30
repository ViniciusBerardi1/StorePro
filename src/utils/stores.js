export function getFornecedorUrl(nomeProduto, fornecedorId) {
  const busca = encodeURIComponent(nomeProduto);
  const urls = {
    mercadolivre: `https://lista.mercadolivre.com.br/${busca}`,
    americanas: `https://www.americanas.com.br/busca/${busca}`,
    shopee: `https://shopee.com.br/search?keyword=${busca}`,
    amazon: `https://www.amazon.com.br/s?k=${busca}`,
  };
  return urls[fornecedorId] || urls.mercadolivre;
}
