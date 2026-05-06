/**
 * GET /api/exportar-financeiro?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 *
 * Gera um .xlsx com 3 abas:
 *   Pagamento – cálculo de comissão por barbeiro (% editável pelo financeiro)
 *   Bar       – itens de bar (não entram em comissão)
 *   Detalhes  – dados brutos de todas as comandas
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

// Planos ativos OU renovados no período, com barbeiro associado
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
  grayBg:    "FFF5F7FA",
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

// ─── Aba Pagamento ────────────────────────────────────────────────────────────

function buildPagamento(wb, rows, planos, periodo) {
  const ws = wb.addWorksheet("Pagamento");

  ws.columns = [
    { key: "a", width: 42 },
    { key: "b", width: 14 },
    { key: "c", width: 20 },
  ];

  // Organiza dados por barbeiro (bar excluído)
  const bMap = {};

  for (const row of rows) {
    if (row.tipo === "PRODUTO_BAR") continue;
    const nome = row.barbeiro;
    if (!bMap[nome]) bMap[nome] = { servicos: [], loja: [], planos: [] };
    if (row.tipo === "SERVICO")       bMap[nome].servicos.push(row);
    else if (row.tipo === "PRODUTO_LOJA") bMap[nome].loja.push(row);
  }

  for (const plano of planos) {
    const nome = plano.barbeiro;
    if (!bMap[nome]) bMap[nome] = { servicos: [], loja: [], planos: [] };
    bMap[nome].planos.push(plano);
  }

  const nomes = Object.keys(bMap).sort((a, b) => a.localeCompare(b, "pt-BR"));

  let r = 1;

  // Título principal
  const cTitulo = ws.getCell(`A${r}`);
  cTitulo.value = `RELATÓRIO DE PAGAMENTO — ${periodo}`;
  cTitulo.font  = { bold: true, size: 14, color: { argb: COR.white } };
  cTitulo.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.darkBlue } };
  cTitulo.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(r).height = 30;
  ws.mergeCells(`A${r}:C${r}`);
  r++;

  // Instrução
  const cInstr = ws.getCell(`A${r}`);
  cInstr.value = `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}  •  Preencha "% Comissão" com valor decimal (ex: 0,40 = 40%)`;
  cInstr.font  = { italic: true, size: 9, color: { argb: "FF555555" } };
  cInstr.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.lightBlue } };
  cInstr.alignment = { horizontal: "center" };
  ws.mergeCells(`A${r}:C${r}`);
  r++;

  r++; // linha em branco

  for (const nome of nomes) {
    const barber = bMap[nome];

    // ── Cabeçalho do barbeiro ──
    const cBarbeiro = ws.getCell(`A${r}`);
    cBarbeiro.value = `  ✂️  ${nome.toUpperCase()}`;
    cBarbeiro.font  = { bold: true, size: 12, color: { argb: COR.white } };
    cBarbeiro.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.medBlue } };
    ws.getRow(r).height = 24;
    ws.mergeCells(`A${r}:C${r}`);
    r++;

    // Cabeçalho de colunas
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

    // ── Serviços ──
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

    // ── Produtos Loja ──
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

    // ── Planos / Assinaturas ──
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

    // ── BASE TOTAL ──
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

    // ── % Comissão (campo em branco — financeiro preenche) ──
    const rPct = r;
    const rowPct = ws.getRow(r);
    rowPct.getCell(1).value = "% Comissão";
    rowPct.getCell(1).font  = { bold: true };
    rowPct.getCell(1).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.yellow } };
    rowPct.getCell(2).value = "← ex: 0,40 = 40%";
    rowPct.getCell(2).font  = { italic: true, size: 8, color: { argb: "FF888888" } };
    rowPct.getCell(2).fill  = { type: "pattern", pattern: "solid", fgColor: { argb: COR.yellow } };
    rowPct.getCell(2).alignment = { horizontal: "center" };
    // Célula C: amarela, vazia, formato %
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

    // ── TOTAL A RECEBER ──
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

    r += 2; // separador entre barbeiros
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

  // Cabeçalho
  const header = ws.addRow(["Data", "Comanda", "Barbeiro", "Produto", "Qtd", "Valor Unit.", "Valor Total"]);
  header.font      = { bold: true, color: { argb: COR.white } };
  header.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: COR.darkBlue } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height    = 22;

  // Aviso
  const aviso = ws.addRow(["⚠️  Itens de bar não entram no cálculo de comissão dos barbeiros"]);
  aviso.getCell(1).font = { italic: true, color: { argb: "FFC77800" } };
  aviso.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR.yellow } };
  aviso.height = 18;
  ws.mergeCells("A2:G2");

  const barItems = rows.filter((r) => r.tipo === "PRODUTO_BAR");

  for (const item of barItems) {
    const dataLocal = new Date(item.data).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const row = ws.addRow({
      data:           dataLocal,
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

  // Bordas
  const lastRow = ws.lastRow.number;
  for (let rr = 1; rr <= lastRow; rr++) {
    for (let c = 1; c <= 7; c++) {
      const cell = ws.getCell(rr, c);
      cell.border = {
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
    const dataLocal = new Date(row.data).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const added = ws.addRow({
      data:           dataLocal,
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

    const [{ rows }, { rows: planos }] = await Promise.all([
      client.query(SQL_COMANDAS, [ini, fim]),
      client.query(SQL_PLANOS,   [dataInicio, dataFim]),
    ]);

    if (rows.length === 0 && planos.length === 0) {
      return res.status(404).json({ erro: "Nenhum dado encontrado no período" });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "StorePro";
    wb.created = new Date();

    buildPagamento(wb, rows, planos, periodo);
    buildBar(wb, rows);
    buildDetalhes(wb, rows);

    const buffer   = await wb.xlsx.writeBuffer();
    const filename = `pagamento_${dataInicio}_${dataFim}.xlsx`;

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
