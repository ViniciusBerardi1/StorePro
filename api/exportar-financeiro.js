/**
 * GET /api/exportar-financeiro?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD
 *
 * Retorna um .xlsx com todos os itens de comandas fechadas no período.
 * Cada linha = um item (serviço ou produto). Dados brutos, sem agregação.
 */
import pg from "pg";
import ExcelJS from "exceljs";

const { Pool } = pg;

// Pool reutilizado entre invocações quentes da serverless function
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

// ─── Query ────────────────────────────────────────────────────────────────────
// Expande os três arrays JSONB de cada comanda em linhas individuais:
//   servicos    → tipo SERVICO
//   itens_bar   → tipo PRODUTO_BAR
//   itens_loja  → tipo PRODUTO_LOJA
const SQL = `
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
    c.created_at,
    c.id,
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
    c.created_at,
    c.id,
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

// ─── Geração do Excel ─────────────────────────────────────────────────────────
function buildWorkbook(rows, dataInicio, dataFim) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StorePro";
  wb.created = new Date();

  const ws = wb.addWorksheet("DADOS_BRUTOS");

  // Cabeçalho
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

  // Estilo do cabeçalho
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A5F" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 22;

  // Dados
  for (const row of rows) {
    const dataLocal = new Date(row.data).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    const added = ws.addRow({
      data:          dataLocal,
      comanda_id:    Number(row.comanda_id),
      barbeiro:      row.barbeiro,
      cliente:       row.cliente,
      tipo:          row.tipo,
      descricao:     row.descricao,
      quantidade:    Number(row.quantidade),
      valor_unitario:Number(row.valor_unitario),
      valor_total:   Number(row.valor_total),
    });

    // Zebra
    if (added.number % 2 === 0) {
      added.fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: "FFF5F7FA" },
      };
    }

    // Formato moeda nas colunas de valor
    added.getCell("valor_unitario").numFmt = '"R$"#,##0.00';
    added.getCell("valor_total").numFmt    = '"R$"#,##0.00';
  }

  // Totalizador
  if (rows.length > 0) {
    const lastRow = ws.lastRow.number;
    const totalRow = ws.addRow({
      data:      "",
      comanda_id:"",
      barbeiro:  "",
      cliente:   `${rows.length} itens`,
      tipo:      "",
      descricao: "TOTAL",
      quantidade:"",
      valor_unitario: "",
      valor_total: rows.reduce((s, r) => s + Number(r.valor_total), 0),
    });
    totalRow.font = { bold: true };
    totalRow.getCell("valor_total").numFmt = '"R$"#,##0.00';
    totalRow.getCell("descricao").alignment = { horizontal: "right" };
  }

  // Borda em todas as células preenchidas
  const lastCol = ws.columns.length;
  const lastRow = ws.lastRow.number;
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      ws.getCell(r, c).border = {
        top:    { style: "thin", color: { argb: "FFD0D5DD" } },
        left:   { style: "thin", color: { argb: "FFD0D5DD" } },
        bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
        right:  { style: "thin", color: { argb: "FFD0D5DD" } },
      };
    }
  }

  // Filtro automático no cabeçalho
  ws.autoFilter = { from: "A1", to: `I1` };

  // Congela a primeira linha
  ws.views = [{ state: "frozen", ySplit: 1 }];

  return wb;
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

  // Garante que o fim do dia seja incluído
  const ini = `${dataInicio}T00:00:00-03:00`;
  const fim = `${dataFim}T23:59:59-03:00`;

  let client;
  try {
    client = await getPool().connect();
    const { rows } = await client.query(SQL, [ini, fim]);

    if (rows.length === 0) {
      return res.status(404).json({ erro: "Nenhuma comanda finalizada encontrada no período" });
    }

    const wb = buildWorkbook(rows, dataInicio, dataFim);
    const buffer = await wb.xlsx.writeBuffer();

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
