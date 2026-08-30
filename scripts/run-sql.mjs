/**
 * SQL 파일 실행기
 * 실행: node scripts/run-sql.mjs sql/2026_device_runtime_state.sql
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const file = process.argv[2];
if (!file) {
  console.error("사용법: node scripts/run-sql.mjs <sql 파일 경로>");
  process.exit(1);
}

for (const line of fs
  .readFileSync(path.resolve(".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const sql = fs.readFileSync(path.resolve(file), "utf8");
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) =>
    s
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter(Boolean);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "dba",
  password: process.env.DB_PASSWORD || "dbapwd",
  database: process.env.DB_NAME || "eventhorizon",
  multipleStatements: false,
});

for (const [i, statement] of statements.entries()) {
  try {
    await conn.query(statement);
    console.log(`[${i + 1}/${statements.length}] OK`);
  } catch (err) {
    console.error(`[${i + 1}/${statements.length}] 실패: ${err.message}`);
    console.error(statement.slice(0, 200));
    process.exitCode = 1;
  }
}

await conn.end();
