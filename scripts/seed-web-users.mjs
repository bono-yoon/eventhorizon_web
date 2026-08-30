/**
 * 웹 데모 계정 시드 (web_users)
 * 실행: node scripts/seed-web-users.mjs
 */
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const hash = (pw) => bcrypt.hashSync(pw, 8);

const pool = await mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "dba",
  password: process.env.DB_PASSWORD || "dbapwd",
  database: process.env.DB_NAME || "eventhorizon",
});

const [sites] = await pool.query("SELECT id FROM sites ORDER BY id");
const siteIds = sites.map((s) => Number(s.id));
const siteA = siteIds[0] ?? 1;
const siteB = siteIds[1] ?? siteA;

const users = [
  {
    id: "u_admin",
    email: "admin@eventhorizon.local",
    password: "admin123",
    name: "시스템 관리자",
    role: "admin",
    companyId: null,
    siteIds: [],
    permissions: [],
  },
  {
    id: "u_company",
    email: "company@hanbit.local",
    password: "company123",
    name: "한빛 본사",
    role: "company",
    companyId: "co_hanbit",
    siteIds: [...siteIds],
    permissions: [],
  },
  {
    id: "u_mgr_a",
    email: "manager@hanbit.local",
    password: "manager123",
    name: "김현수 소장",
    role: "site_manager",
    companyId: "co_hanbit",
    siteIds: [siteA],
    permissions: [],
  },
  {
    id: "u_mgr_b",
    email: "manager2@hanbit.local",
    password: "manager123",
    name: "박지윤 소장",
    role: "site_manager",
    companyId: "co_hanbit",
    siteIds: [siteB],
    permissions: [],
  },
  {
    id: "u_emp_1",
    email: "employee@hanbit.local",
    password: "employee123",
    name: "이서준",
    role: "employee",
    companyId: "co_hanbit",
    siteIds: [siteA],
    permissions: [
      "view_company_dashboard",
      "view_site_dashboard",
      "view_sensors",
      "view_logs",
    ],
  },
  {
    id: "u_emp_2",
    email: "safety@hanbit.local",
    password: "employee123",
    name: "최안전",
    role: "employee",
    companyId: "co_hanbit",
    siteIds: [siteA, siteB],
    permissions: [
      "view_company_dashboard",
      "view_site_dashboard",
      "view_sensors",
      "manage_org",
      "receive_alerts",
    ],
  },
  {
    id: "u_emp_3",
    email: "field@hanbit.local",
    password: "employee123",
    name: "정현장",
    role: "employee",
    companyId: "co_hanbit",
    siteIds: [siteB],
    permissions: ["view_site_dashboard", "view_sensors"],
  },
];

for (const u of users) {
  await pool.execute(
    `
    INSERT INTO web_users (id, email, password_hash, name, role, company_id, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE
      password_hash = VALUES(password_hash),
      name = VALUES(name),
      role = VALUES(role),
      company_id = VALUES(company_id),
      active = 1
    `,
    [u.id, u.email, hash(u.password), u.name, u.role, u.companyId]
  );

  await pool.execute(`DELETE FROM web_user_sites WHERE user_id = ?`, [u.id]);
  for (const sid of u.siteIds) {
    await pool.execute(
      `INSERT IGNORE INTO web_user_sites (user_id, site_id) VALUES (?, ?)`,
      [u.id, sid]
    );
  }

  await pool.execute(`DELETE FROM web_user_permissions WHERE user_id = ?`, [u.id]);
  for (const perm of u.permissions) {
    await pool.execute(
      `INSERT IGNORE INTO web_user_permissions (user_id, permission) VALUES (?, ?)`,
      [u.id, perm]
    );
  }
  console.log("upserted", u.email, u.role);
}

await pool.end();
console.log("done");
