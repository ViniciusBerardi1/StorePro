export function cicloAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Compara IDs tolerando string vs number (select HTML sempre retorna string)
function sameId(a, b) {
  return a != null && b != null && String(a) === String(b);
}

export function calcularBeneficios({
  plano,
  assinatura,
  servicosSelecionados = [],
  itensLoja = [],
  itensBar = [],
  usoBeneficios = [],
}) {
  const beneficios = plano?.beneficios ?? [];
  if (!beneficios.length || !assinatura) {
    return { beneficioDesconto: 0, beneficiosAplicados: [], benefRegistros: [] };
  }

  const ciclo = cicloAtual();
  const usoMap = {};
  for (const uso of usoBeneficios) {
    usoMap[uso.beneficio_id] = (usoMap[uso.beneficio_id] || 0) + (uso.quantidade || 1);
  }

  const beneficiosAplicados = [];
  const benefRegistros = [];
  let beneficioDesconto = 0;

  for (const b of beneficios) {
    const usado = usoMap[b.id] || 0;
    const limite = b.limite_mes != null ? Number(b.limite_mes) : Infinity;
    if (usado >= limite) continue;

    if (b.tipo === "servico_gratis") {
      const srv = servicosSelecionados.find((s) => sameId(s.id, b.servico_id));
      if (!srv) continue;
      const desconto = Math.round(Number(srv.valor || 0) * 100) / 100;
      if (desconto <= 0) continue;
      beneficioDesconto += desconto;
      beneficiosAplicados.push({
        beneficio_id: b.id,
        tipo: b.tipo,
        descricao: b.descricao || `${srv.nome} grátis`,
        valor_desconto: desconto,
        servico_id: srv.id,
      });
      benefRegistros.push({
        beneficio_id: b.id,
        assinatura_id: assinatura.id,
        cliente_id: assinatura.cliente_id,
        plano_id: plano.id,
        ciclo,
        quantidade: 1,
        valor_desconto: desconto,
      });
    } else if (b.tipo === "desconto_servico") {
      const srv = servicosSelecionados.find((s) => sameId(s.id, b.servico_id));
      if (!srv) continue;
      const base = Number(srv.valor || 0);
      const desconto = Math.round(base * (Number(b.percentual || 0) / 100) * 100) / 100;
      if (desconto <= 0) continue;
      beneficioDesconto += desconto;
      beneficiosAplicados.push({
        beneficio_id: b.id,
        tipo: b.tipo,
        descricao: b.descricao || `${b.percentual}% em ${srv.nome}`,
        valor_desconto: desconto,
        servico_id: srv.id,
      });
      benefRegistros.push({
        beneficio_id: b.id,
        assinatura_id: assinatura.id,
        cliente_id: assinatura.cliente_id,
        plano_id: plano.id,
        ciclo,
        quantidade: 1,
        valor_desconto: desconto,
      });
    } else if (b.tipo === "desconto_geral") {
      const totalSvcs = servicosSelecionados.reduce((sum, s) => sum + Number(s.valor || 0), 0);
      if (totalSvcs <= 0) continue;
      const desconto = Math.round(totalSvcs * (Number(b.percentual || 0) / 100) * 100) / 100;
      if (desconto <= 0) continue;
      beneficioDesconto += desconto;
      beneficiosAplicados.push({
        beneficio_id: b.id,
        tipo: b.tipo,
        descricao: b.descricao || `${b.percentual}% nos serviços`,
        valor_desconto: desconto,
      });
      benefRegistros.push({
        beneficio_id: b.id,
        assinatura_id: assinatura.id,
        cliente_id: assinatura.cliente_id,
        plano_id: plano.id,
        ciclo,
        quantidade: 1,
        valor_desconto: desconto,
      });
    } else if (b.tipo === "desconto_produto") {
      const matchLoja = itensLoja.find(
        (i) => (b.produto_id && (sameId(i.id, b.produto_id) || sameId(i.produto_id, b.produto_id))) ||
               (b.produto_nome && i.nome?.toLowerCase() === b.produto_nome?.toLowerCase())
      );
      const matchBar = itensBar.find(
        (i) => (b.produto_id && (sameId(i.id, b.produto_id) || sameId(i.produto_id, b.produto_id))) ||
               (b.produto_nome && i.nome?.toLowerCase() === b.produto_nome?.toLowerCase())
      );
      const item = matchLoja ?? matchBar;
      if (!item) continue;
      const qtd = item.quantidade || 1;
      const preco = Number(item.preco_venda || 0);
      const desconto = Math.round(preco * qtd * (Number(b.percentual || 0) / 100) * 100) / 100;
      if (desconto <= 0) continue;
      beneficioDesconto += desconto;
      beneficiosAplicados.push({
        beneficio_id: b.id,
        tipo: b.tipo,
        descricao: b.descricao || `${b.percentual}% em ${item.nome}`,
        valor_desconto: desconto,
      });
      benefRegistros.push({
        beneficio_id: b.id,
        assinatura_id: assinatura.id,
        cliente_id: assinatura.cliente_id,
        plano_id: plano.id,
        ciclo,
        quantidade: qtd,
        valor_desconto: desconto,
      });
    }
  }

  return { beneficioDesconto, beneficiosAplicados, benefRegistros };
}
