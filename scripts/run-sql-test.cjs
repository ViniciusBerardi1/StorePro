// Executa um arquivo .sql no banco via variáveis de ambiente.
// Uso: node scripts/run-sql-test.js <caminho-do-arquivo.sql>
//
// Variáveis necessárias (sem credenciais no código):
//   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
//   OU DATABASE_URL (suporta @ na senha via objeto de config)

const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Uso: node scripts/run-sql-test.js <arquivo.sql>");
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(sqlFile), "utf8").replace(/^﻿/, "");

const client = new Client({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || "6543"),
  database: process.env.DB_NAME     || "postgres",
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

let passed = 0;
let failed = false;

client.on("notice", (msg) => {
  const m = msg.message || "";
  if (m.startsWith("OK ")) {
    passed++;
    console.log("\x1b[32m✓\x1b[0m " + m.slice(3).trim());
  } else if (m.startsWith("ASSERT FALHOU")) {
    failed = true;
    console.error("\x1b[31m✗ " + m + "\x1b[0m");
  } else {
    console.log("  " + m);
  }
});

(async () => {
  await client.connect();
  try {
    await client.query(sql);
    console.log(`\n\x1b[32m✓ ${passed} asserções passaram — ROLLBACK aplicado (banco limpo)\x1b[0m`);
  } catch (e) {
    console.error(`\n\x1b[31m✗ FALHOU: ${e.message}\x1b[0m`);
    failed = true;
  } finally {
    await client.end();
    process.exit(failed ? 1 : 0);
  }
})();
