/**
 * data/store.json → MariaDB 일회 이전
 * 실행: node scripts/migrate-store-json.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const STORE_PATH = path.join(ROOT, "data", "store.json");

if (!fs.existsSync(STORE_PATH)) {
  console.log("store.json 없음 — 건너뜀");
  process.exit(0);
}

if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined || !process.env.DB_NAME) {
  throw new Error("DB_USER, DB_PASSWORD, DB_NAME 환경변수가 필요합니다.");
}

const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
const pool = await mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

function fromWebSiteId(webId) {
  const m = /^site_db_(\d+)$/.exec(String(webId || ""));
  return m ? Number(m[1]) : null;
}

let orgCount = 0;
for (const node of store.orgNodes || []) {
  await pool.execute(
    `INSERT INTO org_nodes (id, company_id, parent_id, title, user_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       parent_id = VALUES(parent_id),
       title = VALUES(title),
       user_id = VALUES(user_id),
       sort_order = VALUES(sort_order)`,
    [
      node.id,
      node.companyId,
      node.parentId || null,
      node.title,
      node.userId || null,
      node.order ?? 0,
    ]
  );
  if (node.userId) {
    await pool.execute(
      `UPDATE web_users SET org_node_id = ? WHERE id = ?`,
      [node.id, node.userId]
    );
  }
  orgCount += 1;
}

let logCount = 0;
for (const log of store.usageLogs || []) {
  try {
    await pool.execute(
      `INSERT IGNORE INTO web_usage_logs
         (id, at, actor_user_id, actor_name, action, detail, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        new Date(log.at),
        log.actorUserId || null,
        log.actorName || "",
        log.action,
        String(log.detail || "").slice(0, 500),
        log.meta ? JSON.stringify(log.meta) : null,
      ]
    );
    logCount += 1;
  } catch (err) {
    console.warn("usage log skip", log.id, err.message);
  }
}

let opsCount = 0;
for (const entry of Object.values(store.sensorOps || {})) {
  const siteDbId = entry.siteId ? fromWebSiteId(entry.siteId) : null;
  await pool.execute(
    `INSERT INTO sensor_ops
       (device_id, status, company_id, company_name, site_id, site_name,
        sensor_label, updated_by_user_id, updated_by_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       company_id = VALUES(company_id),
       company_name = VALUES(company_name),
       site_id = VALUES(site_id),
       site_name = VALUES(site_name),
       sensor_label = VALUES(sensor_label)`,
    [
      entry.deviceId,
      entry.status,
      entry.companyId,
      entry.companyName,
      siteDbId,
      entry.siteName || null,
      entry.sensorLabel,
      entry.updatedByUserId || null,
      entry.updatedByName || null,
    ]
  );
  opsCount += 1;
}

console.log(`migrated org=${orgCount} usageLogs=${logCount} sensorOps=${opsCount}`);
await pool.end();
