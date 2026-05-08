/**
 * GET /api/exportar-financeiro?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 *
 * Gera um .xlsx com 7 abas:
 *   Resumo        – KPIs, top serviços e receita diária
 *   DRE           – Demonstrativo de Resultado (receita, descontos, CMV, lucro)
 *   Caixa         – Formas de pagamento + sessões de caixa
 *   Conciliação   – Divergências financeiras + auditoria de benefícios
 *   Pagamento     – Comissão por barbeiro (% editável)
 *   Bar           – Itens de bar (fora de comissão)
 *   Detalhes      – Dados brutos de todas as comandas
 */
import pg from "pg";
import ExcelJS from "exceljs";

const { Pool } = pg;

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const SQL_COMANDAS = `
  SELECT
    c.created_at                              AS data,
    c.id                                      AS comanda_id,
    COALESCE(b.nome, 'Sem barbeiro')          AS barbeiro,
    COALESCE(c.cliente_nome, '—')             AS cliente,
    'SERVICO'                                 AS tipo,
    s->>'nome'                                AS descricao,
    1                                         AS quantidade,
    (s->>'valor')::numeric                    AS valor_unitario,
    (s->>'valor')::numeric                    AS valor_total
  FROM comandas c
  LEFT JOIN barbeiros b ON b.id = c.barbeiro_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(NULLIF(c.servicos, 'null'::jsonb), '[]'::jsonb)
  ) AS s
  WHERE c.status = 'fechada'
    AND c.created_at >= $1::timestamptz
    AND c.created_at <= $2::timestamptz
    AND jsonb_array_length(COALESCE(NULLIF(c.servicos, 'null'::jsonb), '[]'::jsonb)) > 0

  UNION ALL

  SELECT
    c.created_at, c.id,
    COALESCE(b.nome, 'Sem barbeiro'),
    COALESCE(c.cliente_nome, '—'),
    'PRODUTO_BAR',
    i->>'nome',
    (i->>'quantidade')::int,
    (i->>'preco_venda')::numeric,
    (i->>'quantidade')::int * (i->>'preco_venda')::numeric
  FROM comandas c
  LEFT JOIN barbeiros b ON b.id = c.barbeiro_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(NULLIF(c.itens_bar, 'null'::jsonb), '[]'::jsonb)
  ) AS i
  WHERE c.status = 'fechada'
    AND c.created_at >= $1::timestamptz
    AND c.created_at <= $2::timestamptz
    AND jsonb_array_length(COALESCE(NULLIF(c.itens_bar, 'null'::jsonb), '[]'::jsonb)) > 0

  UNION ALL

  SELECT
    c.created_at, c.id,
    COALESCE(b.nome, 'Sem barbeiro'),
    COALESCE(c.cliente_nome, '—'),
    'PRODUTO_LOJA',
    i->>'nome',
    (i->>'quantidade')::int,
    (i->>'preco_venda')::numeric,
    (i->>'quantidade')::int * (i->>'preco_venda')::numeric
  FROM comandas c
  LEFT JOIN barbeiros b ON b.id = c.barbeiro_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(NULLIF(c.itens_loja, 'null'::jsonb), '[]'::jsonb)
  ) AS i
  WHERE c.status = 'fechada'
    AND c.created_at >= $1::timestamptz
    AND c.created_at <= $2::timestamptz
    AND jsonb_array_length(COALESCE(NULLIF(c.itens_loja, 'null'::jsonb), '[]'::jsonb)) > 0

  ORDER BY data, comanda_id, tipo, descricao
`;

const SQL_PLANOS = `
  SELECT
    COALESCE(b.nome, 'Sem barbeiro') AS barbeiro,
    COALESCE(p.nome, 'Plano')        AS plano_nome,
    a.valor,
    a.data_inicio,
    a.data_renovacao,
    a.status
  FROM assinaturas a
  LEFT JOIN barbeiros b ON b.id = a.barbeiro_id
  LEFT JOIN planos p    ON p.id = a.plano_id
  WHERE a.barbeiro_id IS NOT NULL
    AND (
      (a.data_inicio    >= $1::date AND a.data_inicio    <= $2::date)
      OR
      (a.data_renovacao >= $1::date AND a.data_renovacao <= $2::date)
    )
  ORDER BY b.nome, p.nome
`;

const SQL_KPIS = `
  SELECT
    COUNT(DISTINCT c.id)                                            AS total_comandas,
    COUNT(DISTINCT c.cliente_id)                                    AS clientes_unicos,
    COALESCE(SUM(c.valor_total), 0)                                 AS receita_bruta,
    COALESCE(SUM(c.valor_servicos), 0)                              AS receita_servicos,
    COALESCE(SUM(c.valor_bar), 0)                                   AS receita_bar,
    COALESCE(SUM(c.valor_loja), 0)                                  AS receita_loja,
    COALESCE(SUM(c.beneficio_desconto), 0)                          AS total_descontos,
    COALESCE(SUM(c.valor_total - COALESCE(c.beneficio_desconto,0)), 0) AS receita_liquida,
    CASE WHEN COUNT(DISTINCT c.id) > 0
      THEN ROUND(SUM(c.valor_total) / COUNT(DISTINCT c.id), 2)
      ELSE 0 END                                                    AS ticket_medio
  FROM comandas c
  WHERE c.status = 'fechada'
    AND c.created_at >= $1::timestamptz
    AND c.created_at <= $2::timestamptz
`;

const SQL_DIARIO = `
  SELECT data, total_comandas, receita_bruta, total_descontos, receita_liquida,
    total_pix, total_debito, total_credito, total_dinheiro,
    total_servicos, total_bar, total_loja
  FROM vw_resumo_financeiro_diario
  WHERE data BETWEEN $1::date AND $2::date
  ORDER BY data
`;

const SQL_TOP_SERVICOS = `
  SELECT
    s->>'nome'                           AS servico,
    COUNT(*)                             AS qtd,
    SUM((s->>'valor')::numeric)          AS total
  FROM comandas c
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(NULLIF(c.servicos, 'null'::jsonb), '[]'::jsonb)
  ) AS s
  WHERE c.status = 'fechada'
    AND c.created_at >= $1::timestamptz
    AND c.created_at <= $2::timestamptz
  GROUP BY s->>'nome'
  ORDER BY total DESC
  LIMIT 5
`;

const SQL_CMV = `
  WITH items AS (
    SELECT 'bar'::text AS cat, (i->>'nome') AS nome, (i->>'quantidade')::int AS qtd
    FROM comandas c
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(NULLIF(c.itens_bar, 'null'::jsonb), '[]'::jsonb)
    ) AS i
    WHERE c.status = 'fechada'
      AND c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz

    UNION ALL

    SELECT 'loja', (i->>'nome'), (i->>'quantidade')::int
    FROM comandas c
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(NULLIF(c.itens_loja, 'null'::jsonb), '[]'::jsonb)
    ) AS i
    WHERE c.status = 'fechada'
      AND c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
  )
  SELECT
    COALESCE(SUM(CASE WHEN it.cat = 'bar'  THEN it.qtd * p.preco_custo ELSE 0 END), 0) AS cmv_bar,
    COALESCE(SUM(CASE WHEN it.cat = 'loja' THEN it.qtd * p.preco_custo ELSE 0 END), 0) AS cmv_loja
  FROM items it
  LEFT JOIN produtos p ON lower(p.nome) = lower(it.nome) AND p.preco_custo > 0
`;

const SQL_FORMAS_PAG = `
  SELECT
    COALESCE(forma_pagamento, 'não informado') AS forma_pagamento,
    COUNT(*)                                   AS qtd_comandas,
    SUM(valor_total)                           AS total
  FROM comandas
  WHERE status = 'fechada'
    AND created_at >= $1::timestamptz
    AND created_at <= $2::timestamptz
  GROUP BY forma_pagamento
  ORDER BY total DESC
`;

const SQL_CAIXA = `
  SELECT
    s.id                AS sessao_id,
    s.opened_at,
    s.closed_at,
    s.status,
    s.aberto_por,
    s.fechado_por,
    s.valor_abertura,
    s.valor_esperado,
    s.valor_fechamento,
    s.diferenca,
    COALESCE(SUM(CASE WHEN m.tipo = 'entrada_comanda' THEN m.valor ELSE 0 END), 0) AS total_entradas,
    COALESCE(SUM(CASE WHEN m.tipo = 'sangria'          THEN m.valor ELSE 0 END), 0) AS total_sangrias,
    COALESCE(SUM(CASE WHEN m.tipo = 'suprimento'       THEN m.valor ELSE 0 END), 0) AS total_suprimentos
  FROM sessoes_caixa s
  LEFT JOIN movimentos_caixa m ON m.sessao_id = s.id
  WHERE s.opened_at::date >= $1::date
    AND s.opened_at::date <= $2::date
  GROUP BY s.id, s.opened_at, s.closed_at, s.status, s.aberto_por, s.fechado_por,
           s.valor_abertura, s.valor_esperado, s.valor_fechamento, s.diferenca
  ORDER BY s.opened_at
`;

const SQL_RECONC = `
  SELECT comanda_id, data, cliente_nome, status_reconciliacao,
    forma_pagamento, valor_total_comanda, valor_total_atendimento,
    delta_atendimento, delta_soma
  FROM vw_reconciliacao_financeira
  WHERE data BETWEEN $1::date AND $2::date
  ORDER BY status_reconciliacao, data DESC
`;

const SQL_BENEFICIOS = `
  SELECT uso_id, comanda_id, data_comanda, cliente_nome,
    cliente_assinante, plano_nome, plano_valor_mensal,
    valor_desconto, quantidade, estornado, ciclo
  FROM vw_beneficios_auditoria
  WHERE data_comanda BETWEEN $1::date AND $2::date
  ORDER BY data_comanda DESC
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtDateLocal(ts) {
  return new Date(ts).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function groupByDesc(rows) {
  const map = {};
  for (const r of rows) {
    const k = r.descricao;
    if (!map[k]) map[k] = { descricao: k, quantidade: 0, valor: 0 };
    map[k].quantidade += Number(r.quantidade);
    map[k].valor      += Number(r.valor_total);
  }
  return Object.values(map).sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
}

// ─── Cores ────────────────────────────────────────────────────────────────────

const COR = {
  darkBlue:  "FF1E3A5F",
  medBlue:   "FF2E5B9A",
  lightBlue: "FFD6E4F7",
  blueBg:    "FFF0F4FF",
  yellow:    "FFFFF3CD",
  yellowBrd: "FFCC9900",
  greenBg:   "FFD4EDDA",
  greenText: "FF155724",
  redBg:     "FFFDE8E8",
  redText:   "FF9B1C1C",
  orangeBg:  "FFFFF3E0",
  orangeText:"FF7C4700",
  grayBg:    "FFF5F7FA",
  grayDark:  "FF6B7280",
  white:     "FFFFFFFF",
  border:    "FFD0D5DD",
  medBorder: "FF2E5B9A",
};

function borda(cell, style = "thin") {
  const b = { style, color: { argb: COR.border } };
  cell.border = { top: b, left: b, bottom: b, right: b };
}

function bordaMedia(cell) {
  const bm = { style: "medium", color: { argb: COR.medBorder } };
  const bt = { style: "thin",   color: { argb: COR.border } };
  cell.border = { top: bm, bottom: bm, left: bt, right: bt };
}

function tituloAba(ws, texto, colunas, periodo) {
  const r1 = ws.getRow(1);
  const c1 = r1.getCell(1);
  c1.value = `${texto} — ${periodo}`;
  c1.font  = { bold: true, size: 14, color: { argb: COR.white } };
  c1.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.darkBlue } };
  c1.alignment = { vertical: "middle", horizontal: "center" };
  r1.height = 30;
  ws.mergeCells(1, 1, 1, colunas);

  const r2 = ws.getRow(2);
  const c2 = r2.getCell(1);
  c2.value = `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  c2.font  = { italic: true, size: 9, color: { argb: "FF555555" } };
  c2.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
  c2.alignment = { horizontal: "center" };
  ws.mergeCells(2, 1, 2, colunas);

  return 3; // próxima linha disponível
}

function secaoHeader(ws, row, texto, colunas, cor = COR.medBlue) {
  const c = ws.getCell(row, 1);
  c.value = texto;
  c.font  = { bold: true, size: 11, color: { argb: COR.white } };
  c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
  ws.getRow(row).height = 20;
  ws.mergeCells(row, 1, row, colunas);
  return row + 1;
}

function moeda(cell, valor) {
  cell.value  = Number(valor) || 0;
  cell.numFmt = '"R$"#,##0.00';
}

// ─── Aba Resumo Executivo ─────────────────────────────────────────────────────

function buildResumo(wb, kpi, diario, topServicos, periodo) {
  const ws = wb.addWorksheet("Resumo");

  ws.columns = [
    { key: "a", width: 28 },
    { key: "b", width: 18 },
    { key: "c", width: 18 },
    { key: "d", width: 18 },
    { key: "e", width: 18 },
  ];

  let r = tituloAba(ws, "RESUMO EXECUTIVO", 5, periodo);
  r++; // espaço

  // ── KPIs ──
  r = secaoHeader(ws, r, "📊  Indicadores do Período", 5);

  const kpiData = [
    ["Comandas Fechadas",    Number(kpi.total_comandas),   null],
    ["Clientes Atendidos",   Number(kpi.clientes_unicos),  null],
    ["Receita Bruta",        Number(kpi.receita_bruta),    "moeda"],
    ["Ticket Médio",         Number(kpi.ticket_medio),     "moeda"],
    ["Descontos Aplicados",  Number(kpi.total_descontos),  "moeda"],
    ["Receita Líquida",      Number(kpi.receita_liquida),  "moeda"],
  ];

  for (const [label, valor, fmt] of kpiData) {
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    row.getCell(1).font  = { bold: true };
    row.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.blueBg } };
    if (fmt === "moeda") {
      moeda(row.getCell(2), valor);
    } else {
      row.getCell(2).value = valor;
      row.getCell(2).alignment = { horizontal: "center" };
    }
    row.getCell(2).font = { bold: true, size: 12 };
    [1, 2].forEach(c => borda(row.getCell(c)));
    r++;
  }
  r++;

  // ── Receita por Categoria ──
  r = secaoHeader(ws, r, "💰  Receita por Categoria", 5);

  const cats = [
    ["Serviços",  kpi.receita_servicos],
    ["Bar",       kpi.receita_bar],
    ["Loja",      kpi.receita_loja],
  ];
  const totalCat = cats.reduce((s, [, v]) => s + Number(v), 0);

  for (const [cat, val] of cats) {
    const row = ws.getRow(r);
    const pct  = totalCat > 0 ? (Number(val) / totalCat) : 0;
    row.getCell(1).value = cat;
    moeda(row.getCell(2), val);
    row.getCell(3).value  = pct;
    row.getCell(3).numFmt = "0.0%";
    row.getCell(3).alignment = { horizontal: "center" };
    [1, 2, 3].forEach(c => borda(row.getCell(c)));
    r++;
  }
  r++;

  // ── Top 5 Serviços ──
  if (topServicos.length > 0) {
    r = secaoHeader(ws, r, "🏆  Top Serviços por Receita", 5);

    const hdr = ws.getRow(r);
    ["Serviço", "Qtd", "Receita"].forEach((lbl, i) => {
      hdr.getCell(i + 1).value = lbl;
      hdr.getCell(i + 1).font  = { bold: true };
      hdr.getCell(i + 1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      borda(hdr.getCell(i + 1));
    });
    r++;

    for (const [idx, sv] of topServicos.entries()) {
      const row = ws.getRow(r);
      row.getCell(1).value = `${idx + 1}. ${sv.servico}`;
      row.getCell(2).value = Number(sv.qtd);
      row.getCell(2).alignment = { horizontal: "center" };
      moeda(row.getCell(3), sv.total);
      if (r % 2 === 0) {
        [1, 2, 3].forEach(c => {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
        });
      }
      [1, 2, 3].forEach(c => borda(row.getCell(c)));
      r++;
    }
    r++;
  }

  // ── Receita Diária ──
  if (diario.length > 0) {
    r = secaoHeader(ws, r, "📅  Receita Diária", 5);

    const hdrD = ws.getRow(r);
    ["Data", "Comandas", "Receita Bruta", "Descontos", "Receita Líquida"].forEach((lbl, i) => {
      hdrD.getCell(i + 1).value = lbl;
      hdrD.getCell(i + 1).font  = { bold: true };
      hdrD.getCell(i + 1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      hdrD.getCell(i + 1).alignment = { horizontal: i === 0 ? "left" : "center" };
      borda(hdrD.getCell(i + 1));
    });
    r++;

    for (const d of diario) {
      const row = ws.getRow(r);
      row.getCell(1).value = fmtDate(d.data.toISOString ? d.data.toISOString().slice(0, 10) : String(d.data));
      row.getCell(2).value = Number(d.total_comandas);
      row.getCell(2).alignment = { horizontal: "center" };
      moeda(row.getCell(3), d.receita_bruta);
      moeda(row.getCell(4), d.total_descontos);
      moeda(row.getCell(5), d.receita_liquida);
      if (r % 2 === 0) {
        [1, 2, 3, 4, 5].forEach(c => {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
        });
      }
      [1, 2, 3, 4, 5].forEach(c => borda(row.getCell(c)));
      r++;
    }

    // Totais
    const tot = ws.getRow(r);
    tot.getCell(1).value = "TOTAL";
    tot.getCell(1).font  = { bold: true };
    tot.getCell(2).value = diario.reduce((s, d) => s + Number(d.total_comandas), 0);
    tot.getCell(2).alignment = { horizontal: "center" };
    tot.getCell(2).font = { bold: true };
    moeda(tot.getCell(3), diario.reduce((s, d) => s + Number(d.receita_bruta), 0));
    moeda(tot.getCell(4), diario.reduce((s, d) => s + Number(d.total_descontos), 0));
    moeda(tot.getCell(5), diario.reduce((s, d) => s + Number(d.receita_liquida), 0));
    [1, 2, 3, 4, 5].forEach(c => {
      tot.getCell(c).font = { bold: true };
      tot.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      borda(tot.getCell(c));
    });
  }

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

// ─── Aba DRE ─────────────────────────────────────────────────────────────────

function buildDRE(wb, kpi, cmv, periodo) {
  const ws = wb.addWorksheet("DRE");

  ws.columns = [
    { key: "a", width: 38 },
    { key: "b", width: 20 },
    { key: "c", width: 14 },
  ];

  let r = tituloAba(ws, "DEMONSTRATIVO DE RESULTADO (DRE)", 3, periodo);
  r++; // espaço

  const cmvBar  = Number(cmv.cmv_bar)  || 0;
  const cmvLoja = Number(cmv.cmv_loja) || 0;
  const cmvTotal = cmvBar + cmvLoja;

  const recBruta    = Number(kpi.receita_bruta)    || 0;
  const descontos   = Number(kpi.total_descontos)  || 0;
  const recLiquida  = Number(kpi.receita_liquida)  || 0;
  const lucroBruto  = recLiquida - cmvTotal;
  const margem      = recLiquida > 0 ? lucroBruto / recLiquida : 0;

  function linhaDRE(label, valor, nivel = 0, destaque = false, vermelho = false) {
    const row = ws.getRow(r);
    const indent = "   ".repeat(nivel);
    row.getCell(1).value = indent + label;
    moeda(row.getCell(2), valor);
    row.getCell(3).value  = recBruta > 0 ? valor / recBruta : 0;
    row.getCell(3).numFmt = "0.0%";
    row.getCell(3).alignment = { horizontal: "center" };

    if (destaque) {
      [1, 2, 3].forEach(c => {
        row.getCell(c).font  = { bold: true, size: 11, color: { argb: vermelho ? COR.redText : COR.darkBlue } };
        row.getCell(c).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: vermelho ? COR.redBg : COR.lightBlue } };
        bordaMedia(row.getCell(c));
      });
      row.height = 22;
    } else {
      [1, 2, 3].forEach(c => borda(row.getCell(c)));
      if (nivel > 0) {
        row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
      }
    }
  }

  // Cabeçalho de colunas
  ["Descrição", "Valor (R$)", "% Receita Bruta"].forEach((lbl, i) => {
    const c = ws.getRow(r).getCell(i + 1);
    c.value = lbl;
    c.font  = { bold: true, color: { argb: COR.white } };
    c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.medBlue } };
    c.alignment = { horizontal: "center" };
    borda(c);
  });
  r++;

  // Bloco de Receita
  r = secaoHeader(ws, r, "RECEITA BRUTA", 3, COR.medBlue);
  linhaDRE("(+) Serviços",        kpi.receita_servicos, 1); r++;
  linhaDRE("(+) Bar",             kpi.receita_bar,      1); r++;
  linhaDRE("(+) Loja",            kpi.receita_loja,     1); r++;
  linhaDRE("= RECEITA BRUTA",     recBruta,              0, true);  r++;
  r++;

  // Descontos
  r = secaoHeader(ws, r, "DEDUÇÕES", 3, COR.medBlue);
  linhaDRE("(-) Descontos de Planos / Benefícios", descontos, 1); r++;
  linhaDRE("= RECEITA LÍQUIDA",   recLiquida, 0, true); r++;
  r++;

  // CMV
  r = secaoHeader(ws, r, "CUSTO DAS MERCADORIAS VENDIDAS (CMV)", 3, COR.medBlue);

  if (cmvTotal === 0) {
    const aviso = ws.getRow(r);
    aviso.getCell(1).value = "   ⚠️  Nenhum produto com preço de custo cadastrado — CMV indisponível";
    aviso.getCell(1).font  = { italic: true, color: { argb: COR.orangeText } };
    aviso.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.orangeBg } };
    ws.mergeCells(r, 1, r, 3);
    r++;
  } else {
    linhaDRE("(-) CMV Bar",  cmvBar,   1); r++;
    linhaDRE("(-) CMV Loja", cmvLoja,  1); r++;
  }

  linhaDRE("(-) TOTAL CMV",  cmvTotal, 0, true, cmvTotal > 0); r++;
  r++;

  // Resultado
  r = secaoHeader(ws, r, "RESULTADO", 3, COR.darkBlue);
  const corLucro = lucroBruto >= 0 ? COR.greenText : COR.redText;
  const bgLucro  = lucroBruto >= 0 ? COR.greenBg   : COR.redBg;

  const rowLucro = ws.getRow(r);
  rowLucro.getCell(1).value = "= LUCRO BRUTO";
  moeda(rowLucro.getCell(2), lucroBruto);
  rowLucro.getCell(3).value  = margem;
  rowLucro.getCell(3).numFmt = "0.0%";
  rowLucro.getCell(3).alignment = { horizontal: "center" };
  [1, 2, 3].forEach(c => {
    rowLucro.getCell(c).font  = { bold: true, size: 13, color: { argb: corLucro } };
    rowLucro.getCell(c).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: bgLucro } };
    bordaMedia(rowLucro.getCell(c));
  });
  rowLucro.height = 26;
  r++;

  if (cmvTotal === 0) {
    r++;
    const nota = ws.getRow(r);
    nota.getCell(1).value = "ℹ️  Para habilitar o CMV, cadastre o Preço de Custo dos produtos em Estoque > Produtos.";
    nota.getCell(1).font  = { italic: true, size: 9, color: { argb: COR.grayDark } };
    ws.mergeCells(r, 1, r, 3);
  }

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

// ─── Aba Caixa ───────────────────────────────────────────────────────────────

function buildCaixa(wb, caixaSessoes, formasPag, periodo) {
  const ws = wb.addWorksheet("Caixa");

  ws.columns = [
    { key: "a", width: 22 },
    { key: "b", width: 22 },
    { key: "c", width: 14 },
    { key: "d", width: 14 },
    { key: "e", width: 14 },
    { key: "f", width: 14 },
    { key: "g", width: 14 },
  ];

  let r = tituloAba(ws, "RELATÓRIO DE CAIXA", 7, periodo);
  r++; // espaço

  // ── Formas de Pagamento ──
  r = secaoHeader(ws, r, "💳  Receita por Forma de Pagamento", 7);

  const hdrFP = ws.getRow(r);
  ["Forma de Pagamento", "Qtd Comandas", "Total (R$)", "% do Total"].forEach((lbl, i) => {
    hdrFP.getCell(i + 1).value = lbl;
    hdrFP.getCell(i + 1).font  = { bold: true };
    hdrFP.getCell(i + 1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
    hdrFP.getCell(i + 1).alignment = { horizontal: i === 0 ? "left" : "center" };
    borda(hdrFP.getCell(i + 1));
  });
  r++;

  const totalGeral = formasPag.reduce((s, f) => s + Number(f.total), 0);
  const labelMap   = { pix: "PIX", debito: "Cartão Débito", credito: "Cartão Crédito", dinheiro: "Dinheiro" };

  for (const fp of formasPag) {
    const row = ws.getRow(r);
    const pct = totalGeral > 0 ? Number(fp.total) / totalGeral : 0;
    row.getCell(1).value = labelMap[fp.forma_pagamento] || fp.forma_pagamento;
    row.getCell(2).value = Number(fp.qtd_comandas);
    row.getCell(2).alignment = { horizontal: "center" };
    moeda(row.getCell(3), fp.total);
    row.getCell(4).value  = pct;
    row.getCell(4).numFmt = "0.0%";
    row.getCell(4).alignment = { horizontal: "center" };
    if (r % 2 === 0) {
      [1, 2, 3, 4].forEach(c => {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
      });
    }
    [1, 2, 3, 4].forEach(c => borda(row.getCell(c)));
    r++;
  }

  const totFP = ws.getRow(r);
  totFP.getCell(1).value = "TOTAL";
  moeda(totFP.getCell(3), totalGeral);
  [1, 2, 3, 4].forEach(c => {
    totFP.getCell(c).font = { bold: true };
    totFP.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
    borda(totFP.getCell(c));
  });
  r += 2;

  // ── Sessões de Caixa ──
  r = secaoHeader(ws, r, "🏧  Sessões de Caixa", 7);

  if (caixaSessoes.length === 0) {
    const sem = ws.getRow(r);
    sem.getCell(1).value = "   Nenhuma sessão de caixa encontrada no período";
    sem.getCell(1).font  = { italic: true, color: { argb: COR.grayDark } };
    ws.mergeCells(r, 1, r, 7);
    r++;
  } else {
    const hdrC = ws.getRow(r);
    ["Abertura", "Fechamento", "Status", "Vl. Abertura", "Entradas", "Sangrias", "Diferença"].forEach((lbl, i) => {
      hdrC.getCell(i + 1).value = lbl;
      hdrC.getCell(i + 1).font  = { bold: true };
      hdrC.getCell(i + 1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      hdrC.getCell(i + 1).alignment = { horizontal: i <= 1 ? "left" : "center" };
      borda(hdrC.getCell(i + 1));
    });
    r++;

    for (const s of caixaSessoes) {
      const row = ws.getRow(r);
      row.getCell(1).value = s.opened_at ? fmtDateLocal(s.opened_at) : "—";
      row.getCell(2).value = s.closed_at ? fmtDateLocal(s.closed_at) : "Em aberto";
      row.getCell(3).value = s.status === "aberta" ? "🟢 Aberta" : "🔴 Fechada";
      row.getCell(3).alignment = { horizontal: "center" };
      moeda(row.getCell(4), s.valor_abertura);
      moeda(row.getCell(5), s.total_entradas);
      moeda(row.getCell(6), s.total_sangrias);

      const dif = Number(s.diferenca) || 0;
      moeda(row.getCell(7), dif);
      if (dif < 0) {
        row.getCell(7).font = { bold: true, color: { argb: COR.redText } };
        row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.redBg } };
      } else if (dif > 0) {
        row.getCell(7).font = { bold: true, color: { argb: COR.greenText } };
        row.getCell(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.greenBg } };
      }

      [1, 2, 3, 4, 5, 6, 7].forEach(c => borda(row.getCell(c)));
      r++;
    }
  }

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

// ─── Aba Conciliação ──────────────────────────────────────────────────────────

function buildConciliacao(wb, reconRows, beneficiosRows, periodo) {
  const ws = wb.addWorksheet("Conciliação");

  ws.columns = [
    { key: "a", width: 12 },
    { key: "b", width: 16 },
    { key: "c", width: 26 },
    { key: "d", width: 18 },
    { key: "e", width: 16 },
    { key: "f", width: 16 },
    { key: "g", width: 14 },
  ];

  let r = tituloAba(ws, "CONCILIAÇÃO FINANCEIRA", 7, periodo);
  r++;

  // ── Resumo por status ──
  const statusCount = { OK: 0, SEM_ATENDIMENTO: 0, VALOR_DIVERGENTE: 0, SOMA_INVALIDA: 0 };
  for (const rec of reconRows) statusCount[rec.status_reconciliacao] = (statusCount[rec.status_reconciliacao] || 0) + 1;

  r = secaoHeader(ws, r, "📋  Resumo de Reconciliação", 7);

  const statusInfo = [
    ["OK",               statusCount.OK,               COR.greenBg,   COR.greenText],
    ["SEM_ATENDIMENTO",  statusCount.SEM_ATENDIMENTO,  COR.orangeBg,  COR.orangeText],
    ["VALOR_DIVERGENTE", statusCount.VALOR_DIVERGENTE,  COR.redBg,     COR.redText],
    ["SOMA_INVALIDA",    statusCount.SOMA_INVALIDA,     COR.redBg,     COR.redText],
  ];

  for (const [status, count, bg, fg] of statusInfo) {
    const row = ws.getRow(r);
    row.getCell(1).value = status;
    row.getCell(1).font  = { bold: true, color: { argb: fg } };
    row.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    row.getCell(2).value = count;
    row.getCell(2).font  = { bold: true, size: 12 };
    row.getCell(2).alignment = { horizontal: "center" };
    row.getCell(2).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    [1, 2].forEach(c => borda(row.getCell(c)));
    r++;
  }
  r++;

  // ── Divergências ──
  const divergencias = reconRows.filter(rec => rec.status_reconciliacao !== "OK");

  r = secaoHeader(ws, r, `⚠️  Registros com Divergência (${divergencias.length})`, 7);

  if (divergencias.length === 0) {
    const ok = ws.getRow(r);
    ok.getCell(1).value = "   ✅  Nenhuma divergência encontrada no período.";
    ok.getCell(1).font  = { color: { argb: COR.greenText }, bold: true };
    ok.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.greenBg } };
    ws.mergeCells(r, 1, r, 7);
    r++;
  } else {
    const hdrR = ws.getRow(r);
    ["Comanda", "Data", "Cliente", "Status", "Vl. Comanda", "Vl. Atendimento", "Δ Valor"].forEach((lbl, i) => {
      hdrR.getCell(i + 1).value = lbl;
      hdrR.getCell(i + 1).font  = { bold: true };
      hdrR.getCell(i + 1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      hdrR.getCell(i + 1).alignment = { horizontal: i <= 2 ? "left" : "center" };
      borda(hdrR.getCell(i + 1));
    });
    r++;

    for (const rec of divergencias) {
      const row  = ws.getRow(r);
      const data = rec.data ? fmtDate(rec.data.toISOString ? rec.data.toISOString().slice(0,10) : String(rec.data)) : "—";
      row.getCell(1).value = Number(rec.comanda_id);
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).value = data;
      row.getCell(3).value = rec.cliente_nome || "—";
      row.getCell(4).value = rec.status_reconciliacao;
      row.getCell(4).alignment = { horizontal: "center" };
      const bg = rec.status_reconciliacao === "SEM_ATENDIMENTO" ? COR.orangeBg : COR.redBg;
      const fg = rec.status_reconciliacao === "SEM_ATENDIMENTO" ? COR.orangeText : COR.redText;
      row.getCell(4).font = { bold: true, color: { argb: fg } };
      row.getCell(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      moeda(row.getCell(5), rec.valor_total_comanda);
      moeda(row.getCell(6), rec.valor_total_atendimento || 0);
      moeda(row.getCell(7), rec.delta_atendimento || 0);
      if (Number(rec.delta_atendimento) !== 0) {
        row.getCell(7).font = { bold: true, color: { argb: COR.redText } };
      }
      [1, 2, 3, 4, 5, 6, 7].forEach(c => borda(row.getCell(c)));
      r++;
    }
  }
  r++;

  // ── Auditoria de Benefícios ──
  r = secaoHeader(ws, r, `🎟️  Benefícios Aplicados (${beneficiosRows.length})`, 7);

  if (beneficiosRows.length === 0) {
    const sem = ws.getRow(r);
    sem.getCell(1).value = "   Nenhum benefício aplicado no período.";
    sem.getCell(1).font  = { italic: true, color: { argb: COR.grayDark } };
    ws.mergeCells(r, 1, r, 7);
    r++;
  } else {
    const hdrB = ws.getRow(r);
    ["Comanda", "Data", "Cliente", "Plano", "Desconto", "Estornado", "Ciclo"].forEach((lbl, i) => {
      hdrB.getCell(i + 1).value = lbl;
      hdrB.getCell(i + 1).font  = { bold: true };
      hdrB.getCell(i + 1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      hdrB.getCell(i + 1).alignment = { horizontal: i <= 3 ? "left" : "center" };
      borda(hdrB.getCell(i + 1));
    });
    r++;

    let totalDesc = 0;
    for (const b of beneficiosRows) {
      const row  = ws.getRow(r);
      const data = b.data_comanda ? fmtDate(b.data_comanda.toISOString ? b.data_comanda.toISOString().slice(0,10) : String(b.data_comanda)) : "—";
      row.getCell(1).value = Number(b.comanda_id);
      row.getCell(1).alignment = { horizontal: "center" };
      row.getCell(2).value = data;
      row.getCell(3).value = b.cliente_nome || "—";
      row.getCell(4).value = b.plano_nome   || "—";
      moeda(row.getCell(5), b.valor_desconto);
      row.getCell(6).value = b.estornado ? "✅ Sim" : "Não";
      row.getCell(6).alignment = { horizontal: "center" };
      if (b.estornado) {
        row.getCell(6).font = { color: { argb: COR.greenText } };
      }
      row.getCell(7).value = b.ciclo || "—";
      row.getCell(7).alignment = { horizontal: "center" };

      if (r % 2 === 0) {
        [1, 2, 3, 4, 5, 6, 7].forEach(c => {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
        });
      }
      [1, 2, 3, 4, 5, 6, 7].forEach(c => borda(row.getCell(c)));
      totalDesc += Number(b.valor_desconto) || 0;
      r++;
    }

    const totB = ws.getRow(r);
    totB.getCell(4).value = "TOTAL DESCONTOS";
    totB.getCell(4).font  = { bold: true };
    moeda(totB.getCell(5), totalDesc);
    totB.getCell(5).font = { bold: true };
    [4, 5].forEach(c => {
      totB.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      borda(totB.getCell(c));
    });
  }

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

// ─── Aba Pagamento ────────────────────────────────────────────────────────────

function buildPagamento(wb, rows, planos, periodo) {
  const ws = wb.addWorksheet("Pagamento");

  ws.columns = [
    { key: "a", width: 42 },
    { key: "b", width: 14 },
    { key: "c", width: 20 },
  ];

  const bMap = {};

  for (const row of rows) {
    if (row.tipo === "PRODUTO_BAR") continue;
    const nome = row.barbeiro;
    if (!bMap[nome]) bMap[nome] = { servicos: [], loja: [], planos: [] };
    if (row.tipo === "SERVICO")          bMap[nome].servicos.push(row);
    else if (row.tipo === "PRODUTO_LOJA") bMap[nome].loja.push(row);
  }

  for (const plano of planos) {
    const nome = plano.barbeiro;
    if (!bMap[nome]) bMap[nome] = { servicos: [], loja: [], planos: [] };
    bMap[nome].planos.push(plano);
  }

  const nomes = Object.keys(bMap).sort((a, b) => a.localeCompare(b, "pt-BR"));

  let r = 1;

  const cTitulo = ws.getCell(`A${r}`);
  cTitulo.value = `RELATÓRIO DE PAGAMENTO — ${periodo}`;
  cTitulo.font  = { bold: true, size: 14, color: { argb: COR.white } };
  cTitulo.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.darkBlue } };
  cTitulo.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(r).height = 30;
  ws.mergeCells(`A${r}:C${r}`);
  r++;

  const cInstr = ws.getCell(`A${r}`);
  cInstr.value = `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}  •  Preencha "% Comissão" com valor decimal (ex: 0,40 = 40%)`;
  cInstr.font  = { italic: true, size: 9, color: { argb: "FF555555" } };
  cInstr.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
  cInstr.alignment = { horizontal: "center" };
  ws.mergeCells(`A${r}:C${r}`);
  r++;

  r++;

  for (const nome of nomes) {
    const barber = bMap[nome];

    const cBarbeiro = ws.getCell(`A${r}`);
    cBarbeiro.value = `  ✂️  ${nome.toUpperCase()}`;
    cBarbeiro.font  = { bold: true, size: 12, color: { argb: COR.white } };
    cBarbeiro.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.medBlue } };
    ws.getRow(r).height = 24;
    ws.mergeCells(`A${r}:C${r}`);
    r++;

    const hLabels = ["Descrição", "Qtd", "Valor"];
    hLabels.forEach((lbl, i) => {
      const c = ws.getRow(r).getCell(i + 1);
      c.value = lbl;
      c.font  = { bold: true, size: 10 };
      c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      c.alignment = { horizontal: i === 0 ? "left" : "center" };
      borda(c);
    });
    r++;

    const refSubtotais = [];

    if (barber.servicos.length > 0) {
      const cat = ws.getCell(`A${r}`);
      cat.value = "✂️  Serviços";
      cat.font  = { bold: true, size: 10, color: { argb: COR.medBlue } };
      cat.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.blueBg } };
      ws.mergeCells(`A${r}:C${r}`);
      r++;

      const ini = r;
      for (const item of groupByDesc(barber.servicos)) {
        const row = ws.getRow(r);
        row.getCell(1).value = `   ${item.descricao}`;
        row.getCell(2).value = item.quantidade;
        row.getCell(2).alignment = { horizontal: "center" };
        row.getCell(3).value  = item.valor;
        row.getCell(3).numFmt = '"R$"#,##0.00';
        [1, 2, 3].forEach(c => borda(row.getCell(c)));
        r++;
      }

      const st = ws.getRow(r);
      st.getCell(1).value  = "Subtotal Serviços";
      st.getCell(1).font   = { bold: true };
      st.getCell(3).value  = { formula: `SUM(C${ini}:C${r - 1})` };
      st.getCell(3).numFmt = '"R$"#,##0.00';
      st.getCell(3).font   = { bold: true };
      [1, 2, 3].forEach(c => {
        st.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
        borda(st.getCell(c));
      });
      refSubtotais.push(`C${r}`);
      r++;
    }

    if (barber.loja.length > 0) {
      const cat = ws.getCell(`A${r}`);
      cat.value = "🛍️  Produtos Loja";
      cat.font  = { bold: true, size: 10, color: { argb: COR.medBlue } };
      cat.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.blueBg } };
      ws.mergeCells(`A${r}:C${r}`);
      r++;

      const ini = r;
      for (const item of groupByDesc(barber.loja)) {
        const row = ws.getRow(r);
        row.getCell(1).value = `   ${item.descricao}`;
        row.getCell(2).value = item.quantidade;
        row.getCell(2).alignment = { horizontal: "center" };
        row.getCell(3).value  = item.valor;
        row.getCell(3).numFmt = '"R$"#,##0.00';
        [1, 2, 3].forEach(c => borda(row.getCell(c)));
        r++;
      }

      const st = ws.getRow(r);
      st.getCell(1).value  = "Subtotal Produtos Loja";
      st.getCell(1).font   = { bold: true };
      st.getCell(3).value  = { formula: `SUM(C${ini}:C${r - 1})` };
      st.getCell(3).numFmt = '"R$"#,##0.00';
      st.getCell(3).font   = { bold: true };
      [1, 2, 3].forEach(c => {
        st.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
        borda(st.getCell(c));
      });
      refSubtotais.push(`C${r}`);
      r++;
    }

    if (barber.planos.length > 0) {
      const cat = ws.getCell(`A${r}`);
      cat.value = "📋  Planos / Assinaturas";
      cat.font  = { bold: true, size: 10, color: { argb: COR.medBlue } };
      cat.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.blueBg } };
      ws.mergeCells(`A${r}:C${r}`);
      r++;

      const ini = r;
      for (const plano of barber.planos) {
        const row = ws.getRow(r);
        row.getCell(1).value = `   ${plano.plano_nome}`;
        row.getCell(2).value = 1;
        row.getCell(2).alignment = { horizontal: "center" };
        row.getCell(3).value  = Number(plano.valor);
        row.getCell(3).numFmt = '"R$"#,##0.00';
        [1, 2, 3].forEach(c => borda(row.getCell(c)));
        r++;
      }

      const st = ws.getRow(r);
      st.getCell(1).value  = "Subtotal Planos";
      st.getCell(1).font   = { bold: true };
      st.getCell(3).value  = { formula: `SUM(C${ini}:C${r - 1})` };
      st.getCell(3).numFmt = '"R$"#,##0.00';
      st.getCell(3).font   = { bold: true };
      [1, 2, 3].forEach(c => {
        st.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
        borda(st.getCell(c));
      });
      refSubtotais.push(`C${r}`);
      r++;
    }

    const rBase = r;
    const rowBase = ws.getRow(r);
    rowBase.getCell(1).value = "BASE TOTAL";
    rowBase.getCell(1).font  = { bold: true, size: 11, color: { argb: COR.darkBlue } };
    rowBase.getCell(3).value  = { formula: refSubtotais.length ? refSubtotais.join("+") : "0" };
    rowBase.getCell(3).numFmt = '"R$"#,##0.00';
    rowBase.getCell(3).font   = { bold: true, size: 11, color: { argb: COR.darkBlue } };
    rowBase.height = 22;
    [1, 2, 3].forEach(c => {
      rowBase.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
      bordaMedia(rowBase.getCell(c));
    });
    r++;

    const rPct = r;
    const rowPct = ws.getRow(r);
    rowPct.getCell(1).value = "% Comissão";
    rowPct.getCell(1).font  = { bold: true };
    rowPct.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.yellow } };
    rowPct.getCell(2).value = "← ex: 0,40 = 40%";
    rowPct.getCell(2).font  = { italic: true, size: 8, color: { argb: "FF888888" } };
    rowPct.getCell(2).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.yellow } };
    rowPct.getCell(2).alignment = { horizontal: "center" };
    rowPct.getCell(3).value  = null;
    rowPct.getCell(3).numFmt = '0.00%';
    rowPct.getCell(3).fill   = { type: "pattern", pattern: "solid", fgColor: { argb: COR.yellow } };
    rowPct.getCell(3).border = {
      top:    { style: "medium", color: { argb: COR.yellowBrd } },
      bottom: { style: "medium", color: { argb: COR.yellowBrd } },
      left:   { style: "medium", color: { argb: COR.yellowBrd } },
      right:  { style: "medium", color: { argb: COR.yellowBrd } },
    };
    rowPct.height = 22;
    [1, 2].forEach(c => borda(rowPct.getCell(c)));
    r++;

    const rowTotal = ws.getRow(r);
    rowTotal.getCell(1).value = "TOTAL A RECEBER";
    rowTotal.getCell(1).font  = { bold: true, size: 12, color: { argb: COR.greenText } };
    rowTotal.getCell(3).value  = { formula: `C${rBase}*C${rPct}` };
    rowTotal.getCell(3).numFmt = '"R$"#,##0.00';
    rowTotal.getCell(3).font   = { bold: true, size: 12, color: { argb: COR.greenText } };
    rowTotal.height = 24;
    [1, 2, 3].forEach(c => {
      rowTotal.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.greenBg } };
      borda(rowTotal.getCell(c));
    });
    r++;

    r += 2;
  }

  ws.views = [{ state: "frozen", ySplit: 2 }];
}

// ─── Aba Bar ──────────────────────────────────────────────────────────────────

function buildBar(wb, rows) {
  const ws = wb.addWorksheet("Bar");

  ws.columns = [
    { key: "data",          width: 20 },
    { key: "comanda_id",    width: 10 },
    { key: "barbeiro",      width: 20 },
    { key: "descricao",     width: 30 },
    { key: "quantidade",    width: 8  },
    { key: "valor_unitario",width: 14 },
    { key: "valor_total",   width: 14 },
  ];

  const header = ws.addRow(["Data", "Comanda", "Barbeiro", "Produto", "Qtd", "Valor Unit.", "Valor Total"]);
  header.font      = { bold: true, color: { argb: COR.white } };
  header.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: COR.darkBlue } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height    = 22;

  const aviso = ws.addRow(["⚠️  Itens de bar não entram no cálculo de comissão dos barbeiros"]);
  aviso.getCell(1).font = { italic: true, color: { argb: "FFC77800" } };
  aviso.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.yellow } };
  aviso.height = 18;
  ws.mergeCells("A2:G2");

  const barItems = rows.filter((r) => r.tipo === "PRODUTO_BAR");

  for (const item of barItems) {
    const row = ws.addRow({
      data:           fmtDateLocal(item.data),
      comanda_id:     Number(item.comanda_id),
      barbeiro:       item.barbeiro,
      descricao:      item.descricao,
      quantidade:     Number(item.quantidade),
      valor_unitario: Number(item.valor_unitario),
      valor_total:    Number(item.valor_total),
    });
    row.getCell("valor_unitario").numFmt = '"R$"#,##0.00';
    row.getCell("valor_total").numFmt    = '"R$"#,##0.00';
  }

  if (barItems.length > 0) {
    const totalBar = ws.addRow({
      descricao:   "TOTAL BAR",
      valor_total: barItems.reduce((s, r) => s + Number(r.valor_total), 0),
    });
    totalBar.font = { bold: true };
    totalBar.getCell("valor_total").numFmt = '"R$"#,##0.00';
  }

  const lastRow = ws.lastRow.number;
  for (let rr = 1; rr <= lastRow; rr++) {
    for (let c = 1; c <= 7; c++) {
      ws.getCell(rr, c).border = {
        top:    { style: "thin", color: { argb: COR.border } },
        left:   { style: "thin", color: { argb: COR.border } },
        bottom: { style: "thin", color: { argb: COR.border } },
        right:  { style: "thin", color: { argb: COR.border } },
      };
    }
  }

  ws.autoFilter = { from: "A1", to: "G1" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// ─── Aba Detalhes ─────────────────────────────────────────────────────────────

function buildDetalhes(wb, rows) {
  const ws = wb.addWorksheet("Detalhes");

  ws.columns = [
    { header: "Data",           key: "data",          width: 20 },
    { header: "Comanda",        key: "comanda_id",    width: 10 },
    { header: "Barbeiro",       key: "barbeiro",      width: 20 },
    { header: "Cliente",        key: "cliente",       width: 24 },
    { header: "Tipo",           key: "tipo",          width: 14 },
    { header: "Descrição",      key: "descricao",     width: 28 },
    { header: "Quantidade",     key: "quantidade",    width: 12 },
    { header: "Valor Unitário", key: "valor_unitario",width: 16 },
    { header: "Valor Total",    key: "valor_total",   width: 16 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font      = { bold: true, color: { argb: COR.white } };
  headerRow.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: COR.darkBlue } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height    = 22;

  for (const row of rows) {
    const added = ws.addRow({
      data:           fmtDateLocal(row.data),
      comanda_id:     Number(row.comanda_id),
      barbeiro:       row.barbeiro,
      cliente:        row.cliente,
      tipo:           row.tipo,
      descricao:      row.descricao,
      quantidade:     Number(row.quantidade),
      valor_unitario: Number(row.valor_unitario),
      valor_total:    Number(row.valor_total),
    });
    if (added.number % 2 === 0) {
      added.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.grayBg } };
    }
    added.getCell("valor_unitario").numFmt = '"R$"#,##0.00';
    added.getCell("valor_total").numFmt    = '"R$"#,##0.00';
  }

  if (rows.length > 0) {
    const totalRow = ws.addRow({
      cliente:    `${rows.length} itens`,
      descricao:  "TOTAL",
      valor_total: rows.reduce((s, r) => s + Number(r.valor_total), 0),
    });
    totalRow.font = { bold: true };
    totalRow.getCell("valor_total").numFmt  = '"R$"#,##0.00';
    totalRow.getCell("descricao").alignment = { horizontal: "right" };
  }

  const lastRow = ws.lastRow.number;
  for (let rr = 1; rr <= lastRow; rr++) {
    for (let c = 1; c <= 9; c++) {
      ws.getCell(rr, c).border = {
        top:    { style: "thin", color: { argb: COR.border } },
        left:   { style: "thin", color: { argb: COR.border } },
        bottom: { style: "thin", color: { argb: COR.border } },
        right:  { style: "thin", color: { argb: COR.border } },
      };
    }
  }

  ws.autoFilter = { from: "A1", to: "I1" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ erro: "Método não permitido" });
  }

  const { dataInicio, dataFim } = req.query;

  if (!dataInicio || !dataFim) {
    return res.status(400).json({ erro: "Parâmetros obrigatórios: dataInicio e dataFim (YYYY-MM-DD)" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) {
    return res.status(400).json({ erro: "Formato inválido. Use YYYY-MM-DD" });
  }
  if (dataInicio > dataFim) {
    return res.status(400).json({ erro: "dataInicio não pode ser maior que dataFim" });
  }

  const ini    = `${dataInicio}T00:00:00-03:00`;
  const fim    = `${dataFim}T23:59:59-03:00`;
  const periodo = `${fmtDate(dataInicio)} a ${fmtDate(dataFim)}`;

  let client;
  try {
    client = await getPool().connect();

    const [
      { rows },
      { rows: planos },
      { rows: kpiRows },
      { rows: diario },
      { rows: topServicos },
      { rows: cmvRows },
      { rows: formasPag },
      { rows: caixaSessoes },
      { rows: reconRows },
      { rows: beneficiosRows },
    ] = await Promise.all([
      client.query(SQL_COMANDAS,    [ini, fim]),
      client.query(SQL_PLANOS,      [dataInicio, dataFim]),
      client.query(SQL_KPIS,        [ini, fim]),
      client.query(SQL_DIARIO,      [dataInicio, dataFim]),
      client.query(SQL_TOP_SERVICOS,[ini, fim]),
      client.query(SQL_CMV,         [ini, fim]),
      client.query(SQL_FORMAS_PAG,  [ini, fim]),
      client.query(SQL_CAIXA,       [dataInicio, dataFim]),
      client.query(SQL_RECONC,      [dataInicio, dataFim]),
      client.query(SQL_BENEFICIOS,  [dataInicio, dataFim]),
    ]);

    if (rows.length === 0 && planos.length === 0 && kpiRows[0]?.total_comandas === "0") {
      return res.status(404).json({ erro: "Nenhum dado encontrado no período" });
    }

    const kpi = kpiRows[0] || {};
    const cmv = cmvRows[0] || { cmv_bar: 0, cmv_loja: 0 };

    const wb = new ExcelJS.Workbook();
    wb.creator = "StorePro";
    wb.created = new Date();

    buildResumo(wb, kpi, diario, topServicos, periodo);
    buildDRE(wb, kpi, cmv, periodo);
    buildCaixa(wb, caixaSessoes, formasPag, periodo);
    buildConciliacao(wb, reconRows, beneficiosRows, periodo);
    buildPagamento(wb, rows, planos, periodo);
    buildBar(wb, rows);
    buildDetalhes(wb, rows);

    const buffer   = await wb.xlsx.writeBuffer();
    const filename = `financeiro_${dataInicio}_${dataFim}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.status(200).end(buffer);

  } catch (err) {
    console.error("[exportar-financeiro]", err);
    res.status(500).json({ erro: "Erro interno ao gerar exportação" });
  } finally {
    client?.release();
  }
}
