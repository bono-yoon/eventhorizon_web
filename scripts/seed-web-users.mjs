/**
 * 최초 관리자 1명만 생성한다. 데모 계정은 넣지 않는다.
 * 실행: npm run seed:users
 *
 * 필요 환경변수:
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD
 *   BOOTSTRAP_ADMIN_NAME (선택)
 */
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { loadLocalEnv, mysqlConnOpts } from "./mysql-env.mjs";

loadLocalEnv();

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
const name = (process.env.BOOTSTRAP_ADMIN_NAME || "관리자").trim();

if (!email || !password) {
  console.error(
    "사용법: BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD 를 설정한 뒤 npm run seed:users"
  );
  process.exit(1);
}

const pool = await mysql.createPool(mysqlConnOpts());

const [existing] = await pool.query(
  `SELECT id FROM web_users WHERE LOWER(email) = ? LIMIT 1`,
  [email]
);
if (existing.length) {
  console.log("이미 존재하는 관리자 이메일입니다:", email);
  await pool.end();
  process.exit(0);
}

const id = `u_admin_${Date.now().toString(36)}`;
await pool.execute(
  `INSERT INTO web_users (id, email, password_hash, name, role, company_id, active)
   VALUES (?, ?, ?, ?, 'admin', NULL, 1)`,
  [id, email, bcrypt.hashSync(password, 10), name]
);

console.log("bootstrap admin created:", email);
await pool.end();
