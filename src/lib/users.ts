import bcrypt from "bcryptjs";
import type { GlobalRole, Permission, SessionUser, User } from "./types";
import { getPool, toWebSiteId } from "./db";

type DbUserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: GlobalRole;
  company_id: string | null;
  org_node_id: string | null;
  active: number;
  created_at: Date | string;
};

async function loadUserExtras(userId: string): Promise<{
  siteIds: string[];
  permissions: Permission[];
}> {
  const p = getPool();
  if (!p) return { siteIds: [], permissions: [] };
  const [siteRows] = await p.query(
    `SELECT site_id FROM web_user_sites WHERE user_id = ?`,
    [userId]
  );
  const [permRows] = await p.query(
    `SELECT permission FROM web_user_permissions WHERE user_id = ?`,
    [userId]
  );
  return {
    siteIds: (siteRows as Array<{ site_id: number }>).map((r) =>
      toWebSiteId(r.site_id)
    ),
    permissions: (permRows as Array<{ permission: string }>).map(
      (r) => r.permission as Permission
    ),
  };
}

function mapUser(
  row: DbUserRow,
  extras: { siteIds: string[]; permissions: Permission[] }
): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    companyId: row.company_id,
    siteIds: extras.siteIds,
    permissions: extras.permissions,
    orgNodeId: row.org_node_id,
    active: Boolean(row.active),
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(row.created_at).toISOString(),
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = await p.query(
      `SELECT id, email, password_hash, name, role, company_id, org_node_id, active, created_at
       FROM web_users WHERE LOWER(email) = ? LIMIT 1`,
      [normalized]
    );
    const row = (rows as DbUserRow[])[0];
    if (!row) return null;
    const extras = await loadUserExtras(row.id);
    return mapUser(row, extras);
  } catch (err) {
    console.warn("[users] findByEmail failed:", (err as Error).message);
    return null;
  }
}

export async function findUserById(id: string): Promise<User | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = await p.query(
      `SELECT id, email, password_hash, name, role, company_id, org_node_id, active, created_at
       FROM web_users WHERE id = ? LIMIT 1`,
      [id]
    );
    const row = (rows as DbUserRow[])[0];
    if (!row) return null;
    const extras = await loadUserExtras(row.id);
    return mapUser(row, extras);
  } catch (err) {
    console.warn("[users] findById failed:", (err as Error).message);
    return null;
  }
}

export async function listUsers(): Promise<User[]> {
  return listUsersFromDb();
}

export async function listUsersFromDb(): Promise<User[]> {
  const p = getPool();
  if (!p) return [];
  const [rows] = await p.query(
    `SELECT id, email, password_hash, name, role, company_id, org_node_id, active, created_at
     FROM web_users ORDER BY created_at ASC`
  );
  const users: User[] = [];
  for (const row of rows as DbUserRow[]) {
    const extras = await loadUserExtras(row.id);
    users.push(mapUser(row, extras));
  }
  return users;
}

export async function verifyPassword(user: User, password: string) {
  return bcrypt.compareSync(password, user.passwordHash);
}

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    siteIds: user.siteIds,
    permissions: user.permissions,
  };
}

export async function createUserInDb(input: {
  id: string;
  email: string;
  password: string;
  name: string;
  role: GlobalRole;
  companyId: string | null;
  siteIds: string[];
  permissions: Permission[];
}) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  const { fromWebSiteId } = await import("./db");
  await p.execute(
    `INSERT INTO web_users (id, email, password_hash, name, role, company_id, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [
      input.id,
      input.email.trim().toLowerCase(),
      bcrypt.hashSync(input.password, 8),
      input.name,
      input.role,
      input.companyId,
    ]
  );
  for (const sid of input.siteIds) {
    const dbId = fromWebSiteId(sid);
    if (dbId == null) continue;
    await p.execute(
      `INSERT IGNORE INTO web_user_sites (user_id, site_id) VALUES (?, ?)`,
      [input.id, dbId]
    );
  }
  for (const perm of input.permissions) {
    await p.execute(
      `INSERT IGNORE INTO web_user_permissions (user_id, permission) VALUES (?, ?)`,
      [input.id, perm]
    );
  }
}

export async function updateUserInDb(
  id: string,
  patch: {
    name?: string;
    role?: GlobalRole;
    companyId?: string | null;
    active?: boolean;
    password?: string;
    siteIds?: string[];
    permissions?: Permission[];
  }
) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  const { fromWebSiteId } = await import("./db");

  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  if (patch.name != null) {
    fields.push("name = ?");
    values.push(patch.name);
  }
  if (patch.role != null) {
    fields.push("role = ?");
    values.push(patch.role);
  }
  if (patch.companyId !== undefined) {
    fields.push("company_id = ?");
    values.push(patch.companyId);
  }
  if (typeof patch.active === "boolean") {
    fields.push("active = ?");
    values.push(patch.active ? 1 : 0);
  }
  if (patch.password) {
    fields.push("password_hash = ?");
    values.push(bcrypt.hashSync(patch.password, 8));
  }
  if (fields.length) {
    values.push(id);
    await p.execute(
      `UPDATE web_users SET ${fields.join(", ")} WHERE id = ?`,
      values
    );
  }

  if (Array.isArray(patch.siteIds)) {
    await p.execute(`DELETE FROM web_user_sites WHERE user_id = ?`, [id]);
    for (const sid of patch.siteIds) {
      const dbId = fromWebSiteId(sid);
      if (dbId == null) continue;
      await p.execute(
        `INSERT IGNORE INTO web_user_sites (user_id, site_id) VALUES (?, ?)`,
        [id, dbId]
      );
    }
  }

  if (Array.isArray(patch.permissions)) {
    await p.execute(`DELETE FROM web_user_permissions WHERE user_id = ?`, [id]);
    for (const perm of patch.permissions) {
      await p.execute(
        `INSERT IGNORE INTO web_user_permissions (user_id, permission) VALUES (?, ?)`,
        [id, perm]
      );
    }
  }
}
