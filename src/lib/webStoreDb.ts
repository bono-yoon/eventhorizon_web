import type { RowDataPacket } from "mysql2";
import { getPool, fromWebSiteId, toWebSiteId } from "./db";
import { listUsersFromDb } from "./users";
import type {
  AlertEvent,
  AppStore,
  Company,
  OrgNode,
  SensorOpsEntry,
  SensorOpsStatus,
  UsageLog,
} from "./types";

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return new Date(v).toISOString();
  return new Date().toISOString();
}

export async function insertCompanyToDb(input: {
  id: string;
  name: string;
  code: string;
  address?: string;
  lat?: number;
  lon?: number;
}) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  await p.execute(
    `INSERT INTO companies (id, name, code, address, lat, lon)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.name,
      input.code,
      input.address || null,
      input.lat ?? null,
      input.lon ?? null,
    ]
  );
}

export async function fetchCompaniesFromDb(): Promise<Company[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, name, code, address, lat, lon, created_at FROM companies ORDER BY name`
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      code: String(r.code || r.id),
      address: String(r.address || ""),
      lat: Number(r.lat || 0),
      lon: Number(r.lon || 0),
      createdAt: toIso(r.created_at),
    }));
  } catch (err) {
    console.warn("[db] companies read failed:", (err as Error).message);
    return [];
  }
}

export async function fetchOrgNodesFromDb(companyId?: string): Promise<OrgNode[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const [rows] = companyId
      ? await p.query<RowDataPacket[]>(
          `SELECT id, company_id, parent_id, title, user_id, sort_order
           FROM org_nodes WHERE company_id = ? ORDER BY sort_order, id`,
          [companyId]
        )
      : await p.query<RowDataPacket[]>(
          `SELECT id, company_id, parent_id, title, user_id, sort_order
           FROM org_nodes ORDER BY company_id, sort_order, id`
        );
    return rows.map((r) => ({
      id: String(r.id),
      companyId: String(r.company_id),
      parentId: r.parent_id ? String(r.parent_id) : null,
      title: String(r.title),
      userId: r.user_id ? String(r.user_id) : null,
      order: Number(r.sort_order || 0),
    }));
  } catch (err) {
    console.warn("[db] org_nodes read failed:", (err as Error).message);
    return [];
  }
}

export async function replaceOrgNodesInDb(
  companyId: string,
  nodes: OrgNode[]
) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM org_nodes WHERE company_id = ?`, [
      companyId,
    ]);
    await conn.execute(
      `UPDATE web_users SET org_node_id = NULL WHERE company_id = ?`,
      [companyId]
    );
    for (const [i, node] of nodes.entries()) {
      const id = node.id;
      await conn.execute(
        `INSERT INTO org_nodes (id, company_id, parent_id, title, user_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          companyId,
          node.parentId || null,
          node.title,
          node.userId || null,
          node.order ?? i,
        ]
      );
      if (node.userId) {
        await conn.execute(
          `UPDATE web_users SET org_node_id = ? WHERE id = ? AND company_id = ?`,
          [id, node.userId, companyId]
        );
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function fetchUsageLogsFromDb(limit = 200): Promise<UsageLog[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const safe = Math.min(Math.max(limit, 1), 500);
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, at, actor_user_id, actor_name, action, detail, meta
       FROM web_usage_logs ORDER BY at DESC LIMIT ${safe}`
    );
    return rows.map((r) => ({
      id: String(r.id),
      at: toIso(r.at),
      actorUserId: r.actor_user_id ? String(r.actor_user_id) : null,
      actorName: String(r.actor_name || ""),
      action: String(r.action),
      detail: String(r.detail || ""),
      meta:
        r.meta && typeof r.meta === "object"
          ? (r.meta as Record<string, unknown>)
          : undefined,
    }));
  } catch (err) {
    console.warn("[db] usage logs read failed:", (err as Error).message);
    return [];
  }
}

export async function insertUsageLogToDb(
  entry: Omit<UsageLog, "id" | "at"> & { id: string; at: string }
) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  await p.execute(
    `INSERT INTO web_usage_logs (id, at, actor_user_id, actor_name, action, detail, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      new Date(entry.at),
      entry.actorUserId,
      entry.actorName,
      entry.action,
      entry.detail.slice(0, 500),
      entry.meta ? JSON.stringify(entry.meta) : null,
    ]
  );
}

export async function fetchSensorOpsFromDb(
  companyId?: string
): Promise<SensorOpsEntry[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const [rows] = companyId
      ? await p.query<RowDataPacket[]>(
          `SELECT * FROM sensor_ops WHERE company_id = ? ORDER BY updated_at DESC`,
          [companyId]
        )
      : await p.query<RowDataPacket[]>(
          `SELECT * FROM sensor_ops ORDER BY updated_at DESC`
        );
    return rows.map((r) => ({
      deviceId: String(r.device_id),
      status: String(r.status) as SensorOpsStatus,
      companyId: String(r.company_id),
      companyName: String(r.company_name || ""),
      siteId: r.site_id != null ? toWebSiteId(Number(r.site_id)) : null,
      siteName: r.site_name ? String(r.site_name) : null,
      sensorLabel: String(r.sensor_label || r.device_id),
      updatedAt: toIso(r.updated_at),
      updatedByUserId: String(r.updated_by_user_id || ""),
      updatedByName: String(r.updated_by_name || ""),
    }));
  } catch (err) {
    console.warn("[db] sensor_ops read failed:", (err as Error).message);
    return [];
  }
}

export async function upsertSensorOpsToDb(entry: SensorOpsEntry) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  const siteDbId = entry.siteId ? fromWebSiteId(entry.siteId) : null;
  await p.execute(
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
       sensor_label = VALUES(sensor_label),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_by_name = VALUES(updated_by_name)`,
    [
      entry.deviceId,
      entry.status,
      entry.companyId,
      entry.companyName,
      siteDbId,
      entry.siteName,
      entry.sensorLabel,
      entry.updatedByUserId,
      entry.updatedByName,
    ]
  );
}

export async function fetchRecentAlertEvents(limit = 100): Promise<AlertEvent[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const safe = Math.min(Math.max(limit, 1), 300);
    const [rows] = await p.query<RowDataPacket[]>(
      `SELECT id, device_id, site_id, company_id, type, severity, message,
              value, threshold_value, acknowledged, created_at
       FROM web_alerts
       ORDER BY created_at DESC
       LIMIT ${safe}`
    );
    return rows.map((r) => ({
      id: String(r.id),
      at: toIso(r.created_at),
      deviceId: String(r.device_id),
      siteId: r.site_id != null ? toWebSiteId(Number(r.site_id)) : null,
      companyId: r.company_id ? String(r.company_id) : "",
      type: String(r.type) as AlertEvent["type"],
      severity: r.severity === "critical" ? "critical" : "warning",
      message: String(r.message),
      value: r.value != null ? Number(r.value) : 0,
      threshold: r.threshold_value != null ? Number(r.threshold_value) : 0,
      acknowledged: Boolean(r.acknowledged),
    }));
  } catch (err) {
    console.warn("[db] web_alerts read failed:", (err as Error).message);
    return [];
  }
}

export async function addUserSiteLink(userId: string, webSiteId: string) {
  const p = getPool();
  if (!p) return;
  const siteDbId = fromWebSiteId(webSiteId);
  if (siteDbId == null) return;
  await p.execute(
    `INSERT IGNORE INTO web_user_sites (user_id, site_id) VALUES (?, ?)`,
    [userId, siteDbId]
  );
}

export async function assembleStoreFromDb(parts: {
  companies: Company[];
  sites: AppStore["sites"];
  sensors: AppStore["sensors"];
  users: AppStore["users"];
  orgNodes: OrgNode[];
  usageLogs: UsageLog[];
  alerts: AlertEvent[];
  sensorOps: SensorOpsEntry[];
}): Promise<AppStore> {
  return {
    companies: parts.companies,
    sites: parts.sites,
    sensors: parts.sensors,
    users: parts.users,
    orgNodes: parts.orgNodes,
    readings: [],
    usageLogs: parts.usageLogs,
    alerts: parts.alerts,
    sensorOps: Object.fromEntries(parts.sensorOps.map((e) => [e.deviceId, e])),
    sensorOpsAlerts: [],
    sensorOpsAlertReads: {},
    deviceDeployment: {},
    sensorAssignments: [],
  };
}

export async function loadUsersSafe() {
  try {
    return await listUsersFromDb();
  } catch (err) {
    console.warn("[db] users read failed:", (err as Error).message);
    return [];
  }
}
