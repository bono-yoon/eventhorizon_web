import mysql from "mysql2/promise";
import { commandGroup, commandsInGroup } from "./deviceCommands";
import { optionalNumber, requireEnv } from "./env";
import type { SensorDevice, SensorReading, Site } from "./types";
import { defaultTiltThresholdDeg } from "./tilt";

const globalForDb = globalThis as typeof globalThis & {
  eventHorizonDbPool?: mysql.Pool;
};

let pool: mysql.Pool | null = globalForDb.eventHorizonDbPool ?? null;

export function dbEnabled() {
  return process.env.DB_ENABLED === "true";
}

export function getPool() {
  if (!dbEnabled()) return null;
  if (!pool) {
    if (process.env.DB_PASSWORD === undefined) {
      throw new Error("환경변수 DB_PASSWORD 이(가) 필요합니다.");
    }
    pool = mysql.createPool({
      host: requireEnv("DB_HOST"),
      port: optionalNumber("DB_PORT", 3306),
      user: requireEnv("DB_USER"),
      password: process.env.DB_PASSWORD,
      database: requireEnv("DB_NAME"),
      waitForConnections: true,
      connectionLimit: 8,
      namedPlaceholders: true,
      connectTimeout: 10_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
      ssl:
        process.env.DB_SSL === "true"
          ? {
              rejectUnauthorized:
                process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
            }
          : undefined,
    });
    globalForDb.eventHorizonDbPool = pool;
  }
  return pool;
}

export async function pingDb(): Promise<{ ok: boolean; message: string }> {
  const p = getPool();
  if (!p) return { ok: false, message: "DB_ENABLED=false" };
  try {
    await p.query("SELECT 1");
    return { ok: true, message: "up" };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export function toWebSiteId(dbId: number | string) {
  return `site_db_${dbId}`;
}

export function fromWebSiteId(webId: string): number | null {
  const m = /^site_db_(\d+)$/.exec(webId);
  return m ? Number(m[1]) : null;
}

type DbSite = {
  id: number;
  company_id?: string | null;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  status: string;
  created_at: Date | string;
};

type DbSensor = {
  id: number;
  site_id: number | null;
  device_id: string;
  label: string | null;
  installed_at: Date | string | null;
  is_active: number;
  status: string;
  memo: string | null;
  tilt_threshold_deg?: number | null;
  operation_mode?: string | null;
  realtime_interval_sec?: number | null;
};

function mapSite(row: DbSite): Site {
  const status =
    row.status === "paused" || row.status === "closed"
      ? row.status
      : "active";
  return {
    id: toWebSiteId(row.id),
    companyId: row.company_id ? String(row.company_id) : "",
    name: row.name,
    code: `DB-${row.id}`,
    address: row.address || "",
    lat: Number(row.lat),
    lon: Number(row.lon),
    status,
    managerUserId: null,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(row.created_at).toISOString(),
  };
}

function mapSensorRow(row: DbSensor): SensorDevice {
  const status = (["inventory", "assigned", "recovered", "repair", "disposed"].includes(
    row.status
  )
    ? row.status
    : row.site_id
      ? "assigned"
      : "inventory") as SensorDevice["status"];

  return {
    id: `sen_db_${row.id}`,
    deviceId: row.device_id,
    siteId: row.site_id != null ? toWebSiteId(row.site_id) : null,
    label: row.label || row.device_id,
    isActive: Boolean(row.is_active),
    installedAt: row.installed_at
      ? typeof row.installed_at === "string"
        ? row.installed_at
        : new Date(row.installed_at).toISOString()
      : new Date().toISOString(),
    status,
    memo: row.memo,
    mode: row.operation_mode || "ALWAYS_ON",
    modeIntervalSec:
      row.realtime_interval_sec != null && Number(row.realtime_interval_sec) > 0
        ? Number(row.realtime_interval_sec)
        : 10,
    thresholdTiltDeg: defaultTiltThresholdDeg(
      row.tilt_threshold_deg ?? process.env.THRESHOLD_TILT_DEG
    ),
    thresholdTempC: Number(process.env.THRESHOLD_TEMP_C || 45),
    thresholdBattery: Number(process.env.THRESHOLD_BATTERY || 15),
  };
}

function mapReading(
  r: Record<string, unknown>,
  i: number
): SensorReading {
  return {
    id: `db_${r.device_id}_${r.ts}_${i}`,
    deviceId: String(r.device_id),
    x: Number(r.x),
    y: Number(r.y),
    z: Number(r.z),
    lat: Number(r.lat),
    lon: Number(r.lon),
    ts: Number(r.ts),
    mode: String(r.mode || "ALWAYS_ON"),
    modeIntervalSec: Number(r.mode_interval_sec || 0),
    batteryPercent: Number(r.battery_percent ?? -1),
    temperatureC:
      r.temperature_c == null ? null : Number(r.temperature_c),
    hold: Boolean(r.hold),
  };
}

export async function fetchSitesFromDb(
  companyId?: string
): Promise<Site[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = companyId
      ? await p.query<mysql.RowDataPacket[]>(
          `SELECT id, company_id, name, address, lat, lon, status, created_at
           FROM sites
           WHERE company_id = ?
           ORDER BY id`,
          [companyId]
        )
      : await p.query<mysql.RowDataPacket[]>(
          `SELECT id, company_id, name, address, lat, lon, status, created_at
           FROM sites
           ORDER BY id`
        );
    return (rows as DbSite[]).map(mapSite);
  } catch (err) {
    console.warn("[db] sites read failed:", (err as Error).message);
    return null;
  }
}

/** 현장 대시보드용: 배정된 센서만 */
export async function fetchSensorsFromDb(): Promise<SensorDevice[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `SELECT s.id, s.site_id, s.device_id, s.label, s.installed_at, s.is_active, s.status, s.memo,
              r.tilt_threshold_deg, r.operation_mode, r.realtime_interval_sec
       FROM sensors s
       LEFT JOIN device_runtime r ON r.device_id = s.device_id
       WHERE s.status = 'assigned' AND s.site_id IS NOT NULL
       ORDER BY s.id`
    );
    return (rows as DbSensor[]).map(mapSensorRow);
  } catch (err) {
    console.warn("[db] sensors read failed, fallback mapping:", (err as Error).message);
    try {
      const [rows] = await p.query<mysql.RowDataPacket[]>(
        `SELECT id, site_id, device_id, label, installed_at, is_active
         FROM site_sensor_mapping ORDER BY id`
      );
      return (rows as Array<DbSensor & { site_id: number }>).map((r) =>
        mapSensorRow({
          ...r,
          status: "assigned",
          memo: null,
        })
      );
    } catch (err2) {
      console.warn("[db] mapping read failed:", (err2 as Error).message);
      return null;
    }
  }
}

/** 재고 포함 전체 센서 */
export async function fetchAllSensorsFromDb(): Promise<SensorDevice[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `SELECT s.id, s.site_id, s.device_id, s.label, s.installed_at, s.is_active, s.status, s.memo,
              r.tilt_threshold_deg, r.operation_mode, r.realtime_interval_sec
       FROM sensors s
       LEFT JOIN device_runtime r ON r.device_id = s.device_id
       ORDER BY
         FIELD(s.status, 'inventory', 'assigned', 'recovered', 'repair', 'disposed'),
         s.id DESC`
    );
    return (rows as DbSensor[]).map(mapSensorRow);
  } catch (err) {
    console.warn("[db] all sensors failed:", (err as Error).message);
    return null;
  }
}

export async function upsertInventorySensor(input: {
  deviceId: string;
  label?: string;
  status?: SensorDevice["status"];
  siteId?: number | null;
  memo?: string | null;
}) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  const status = input.status || (input.siteId ? "assigned" : "inventory");
  const siteId = status === "assigned" ? input.siteId ?? null : input.siteId ?? null;
  await p.execute(
    `
    INSERT INTO sensors (device_id, label, site_id, status, memo, is_active, installed_at)
    VALUES (?, ?, ?, ?, ?, 1, CASE WHEN ? = 'assigned' THEN NOW() ELSE NULL END)
    ON DUPLICATE KEY UPDATE
      label = COALESCE(VALUES(label), label),
      site_id = VALUES(site_id),
      status = VALUES(status),
      memo = VALUES(memo),
      installed_at = IF(VALUES(status) = 'assigned' AND installed_at IS NULL, NOW(), installed_at)
    `,
    [
      input.deviceId,
      input.label || input.deviceId,
      siteId,
      status,
      input.memo ?? null,
      status,
    ]
  );

  // 레거시 매핑 테이블 동기화 (배정 시)
  if (status === "assigned" && siteId != null) {
    await p.execute(
      `
      INSERT INTO site_sensor_mapping (site_id, device_id, label, installed_at, is_active)
      VALUES (?, ?, ?, NOW(), 1)
      ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = 1
      `,
      [siteId, input.deviceId, input.label || input.deviceId]
    );
  }
}

export async function updateSensorInventory(
  id: number,
  patch: {
    label?: string;
    siteId?: number | null;
    status?: SensorDevice["status"];
    memo?: string | null;
    isActive?: boolean;
  }
) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");

  const [rows] = await p.query<mysql.RowDataPacket[]>(
    `SELECT device_id, label FROM sensors WHERE id = ? LIMIT 1`,
    [id]
  );
  const current = rows[0] as { device_id: string; label: string | null } | undefined;
  if (!current) throw new Error("sensor not found");

  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  if (patch.label != null) {
    fields.push("label = ?");
    values.push(patch.label);
  }
  if (patch.status != null) {
    fields.push("status = ?");
    values.push(patch.status);
  }
  if (patch.siteId !== undefined) {
    fields.push("site_id = ?");
    values.push(patch.siteId);
  }
  if (patch.memo !== undefined) {
    fields.push("memo = ?");
    values.push(patch.memo);
  }
  if (typeof patch.isActive === "boolean") {
    fields.push("is_active = ?");
    values.push(patch.isActive ? 1 : 0);
  }
  if (patch.status === "assigned") {
    fields.push("installed_at = COALESCE(installed_at, NOW())");
  }
  if (!fields.length) return;

  values.push(id);
  await p.execute(`UPDATE sensors SET ${fields.join(", ")} WHERE id = ?`, values);

  const nextStatus = patch.status;
  const nextSiteId = patch.siteId;
  if (nextStatus === "assigned" && nextSiteId != null) {
    await p.execute(
      `
      INSERT INTO site_sensor_mapping (site_id, device_id, label, installed_at, is_active)
      VALUES (?, ?, ?, NOW(), 1)
      ON DUPLICATE KEY UPDATE
        site_id = VALUES(site_id),
        label = VALUES(label),
        is_active = 1
      `,
      [
        nextSiteId,
        current.device_id,
        patch.label ?? current.label ?? current.device_id,
      ]
    );
  }
  if (
    nextStatus === "inventory" ||
    nextStatus === "recovered" ||
    nextStatus === "disposed"
  ) {
    await p.execute(
      `UPDATE site_sensor_mapping SET is_active = 0 WHERE device_id = ?`,
      [current.device_id]
    );
  }
}

export function fromSensorWebId(webId: string): number | null {
  const m = /^sen_db_(\d+)$/.exec(webId);
  return m ? Number(m[1]) : null;
}

export async function fetchSensorLogsFromDb(opts: {
  deviceId?: string;
  deviceIds?: string[];
  limit?: number;
}): Promise<SensorReading[] | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const limit = Math.min(opts.limit ?? 100, 500);
    let sql = `
      SELECT device_id, x, y, z, lat, lon, ts, mode, mode_interval_sec,
             battery_percent, temperature_c, hold
      FROM sensor_logs
    `;
    const values: (string | number)[] = [];
    if (opts.deviceId) {
      sql += ` WHERE device_id = ?`;
      values.push(opts.deviceId);
    } else if (opts.deviceIds?.length) {
      sql += ` WHERE device_id IN (${opts.deviceIds.map(() => "?").join(",")})`;
      values.push(...opts.deviceIds);
    }
    sql += ` ORDER BY ts DESC LIMIT ${limit}`;

    const [rows] = await p.execute(sql, values);
    return (rows as Array<Record<string, unknown>>).map(mapReading);
  } catch (err) {
    console.warn("[db] sensor_logs read failed:", (err as Error).message);
    return null;
  }
}

/**
 * 지도 궤적용 위치 이력. GPS 가 유효한 행만 오래된 → 최신 순으로 돌려준다.
 * 상시 모드는 초 단위로 쌓이므로 최신 구간부터 limit 개만 읽는다.
 */
export async function fetchDeviceTrailFromDb(opts: {
  deviceId: string;
  sinceTs: number;
  untilTs?: number | null;
  limit?: number;
}): Promise<Array<{ lat: number; lon: number; ts: number }> | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const limit = Math.min(Math.max(Number(opts.limit) || 1500, 2), 5000);
    const untilTs = opts.untilTs ?? Date.now() + 60_000;
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `
      SELECT lat, lon, ts
      FROM sensor_logs
      WHERE device_id = ?
        AND ts >= ?
        AND ts <= ?
        AND lat IS NOT NULL AND lon IS NOT NULL
        AND ABS(lat) > 0.01 AND ABS(lon) > 0.01
      ORDER BY ts DESC
      LIMIT ${limit}
      `,
      [opts.deviceId, opts.sinceTs, untilTs]
    );
    return (rows as Array<Record<string, unknown>>)
      .map((r) => ({
        lat: Number(r.lat),
        lon: Number(r.lon),
        ts: Number(r.ts),
      }))
      .filter(
        (r) =>
          Number.isFinite(r.lat) &&
          Number.isFinite(r.lon) &&
          Number.isFinite(r.ts)
      )
      .reverse();
  } catch (err) {
    console.warn("[db] device trail read failed:", (err as Error).message);
    return null;
  }
}

/** 장비별 최신 1건 */
export async function fetchLatestReadingsFromDb(
  deviceIds: string[]
): Promise<Map<string, SensorReading>> {
  const map = new Map<string, SensorReading>();
  if (!deviceIds.length) return map;
  const p = getPool();
  if (!p) return map;

  try {
    // MariaDB: 장비별 최신 ts row
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `
      SELECT sl.device_id, sl.x, sl.y, sl.z, sl.lat, sl.lon, sl.ts, sl.mode,
             sl.mode_interval_sec, sl.battery_percent, sl.temperature_c, sl.hold
      FROM sensor_logs sl
      INNER JOIN (
        SELECT device_id, MAX(ts) AS max_ts
        FROM sensor_logs
        WHERE device_id IN (${deviceIds.map(() => "?").join(",")})
        GROUP BY device_id
      ) latest ON latest.device_id = sl.device_id AND latest.max_ts = sl.ts
      `,
      deviceIds
    );
    (rows as Array<Record<string, unknown>>).forEach((r, i) => {
      const reading = mapReading(r, i);
      map.set(reading.deviceId, reading);
    });
  } catch (err) {
    console.warn("[db] latest readings failed:", (err as Error).message);
  }
  return map;
}

export async function fetchLoginLogsFromDb(limit = 100) {
  const p = getPool();
  if (!p) return null;
  try {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `
      SELECT id, device_id, worker_id, worker_code, worker_name,
             success, client_ts, created_at
      FROM sensor_login_logs
      ORDER BY id DESC
      LIMIT ${safeLimit}
      `
    );
    return rows;
  } catch (err) {
    console.warn("[db] login logs failed:", (err as Error).message);
    return null;
  }
}

export type UnlockEventRow = {
  id: string;
  deviceId: string;
  ts: number;
  workerCode: string;
  workerName: string | null;
  success: boolean;
};

export async function fetchUnlockEventsByDevice(
  deviceId: string,
  limit = 100
): Promise<UnlockEventRow[]> {
  const p = getPool();
  if (!p || !deviceId) return [];
  try {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `
      SELECT id, device_id, worker_code, worker_name, success, client_ts, created_at
      FROM sensor_login_logs
      WHERE device_id = ?
      ORDER BY COALESCE(client_ts, UNIX_TIMESTAMP(created_at) * 1000) DESC
      LIMIT ${safeLimit}
      `,
      [deviceId]
    );
    return (rows as Array<Record<string, unknown>>).map((r) => {
      const clientTs = Number(r.client_ts);
      const created = r.created_at
        ? new Date(r.created_at as string | Date).getTime()
        : Date.now();
      return {
        id: `unlock_${r.id}`,
        deviceId: String(r.device_id),
        ts: Number.isFinite(clientTs) && clientTs > 0 ? clientTs : created,
        workerCode: String(r.worker_code || "?"),
        workerName: r.worker_name ? String(r.worker_name) : null,
        success: Boolean(r.success),
      };
    });
  } catch (err) {
    console.warn("[db] unlock events failed:", (err as Error).message);
    return [];
  }
}

export async function insertSiteToDb(site: {
  name: string;
  address: string;
  lat: number;
  lon: number;
  status?: string;
  memo?: string;
  companyId?: string;
}): Promise<number | null> {
  const p = getPool();
  if (!p) return null;
  const [result] = await p.execute<mysql.ResultSetHeader>(
    `
    INSERT INTO sites (company_id, name, address, lat, lon, memo, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      site.companyId || null,
      site.name,
      site.address,
      site.lat,
      site.lon,
      site.memo || null,
      site.status || "active",
    ]
  );
  return Number(result.insertId);
}

export async function upsertDeviceRuntimeFields(
  deviceId: string,
  patch: {
    tiltThresholdDeg?: number;
    operationMode?: string;
    realtimeIntervalSec?: number;
  }
) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  await p.execute(
    `
    INSERT INTO device_runtime
      (device_id, tilt_threshold_deg, operation_mode, realtime_interval_sec)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      tilt_threshold_deg = COALESCE(VALUES(tilt_threshold_deg), tilt_threshold_deg),
      operation_mode = COALESCE(VALUES(operation_mode), operation_mode),
      realtime_interval_sec = COALESCE(VALUES(realtime_interval_sec), realtime_interval_sec)
    `,
    [
      deviceId,
      patch.tiltThresholdDeg ?? null,
      patch.operationMode ?? null,
      patch.realtimeIntervalSec ?? null,
    ]
  );
}

export async function updateSiteInDb(
  dbId: number,
  patch: {
    name?: string;
    address?: string;
    lat?: number;
    lon?: number;
    status?: string;
  }
) {
  const p = getPool();
  if (!p) return;
  const fields: string[] = [];
  const values: (string | number)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (!fields.length) return;
  values.push(dbId);
  await p.execute(
    `UPDATE sites SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function insertSensorMappingToDb(row: {
  siteId: number;
  deviceId: string;
  label: string;
}) {
  const p = getPool();
  if (!p) return null;
  const [result] = await p.execute<mysql.ResultSetHeader>(
    `
    INSERT INTO site_sensor_mapping (site_id, device_id, label, installed_at, is_active)
    VALUES (?, ?, ?, NOW(), 1)
    `,
    [row.siteId, row.deviceId, row.label]
  );
  return Number(result.insertId);
}

export async function insertSensorLogToDb(reading: SensorReading) {
  const p = getPool();
  if (!p) return;
  await p.execute(
    `
    INSERT IGNORE INTO sensor_logs
      (device_id, x, y, z, lat, lon, ts, mode, mode_interval_sec,
       battery_percent, temperature_c, hold)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      reading.deviceId,
      reading.x,
      reading.y,
      reading.z,
      reading.lat,
      reading.lon,
      reading.ts,
      reading.mode,
      reading.modeIntervalSec,
      reading.batteryPercent,
      reading.temperatureC,
      reading.hold ? 1 : null,
    ]
  );
}

export const DEVICE_COMMANDS = [
  "hold_on",
  "hold_off",
  "set_mode",
  "set_interval",
  "set_tilt_threshold",
  "reset_origin",
] as const;

export type DeviceCommand = (typeof DEVICE_COMMANDS)[number];

export async function enqueueDeviceCommand(input: {
  deviceId: string;
  command: DeviceCommand;
  payload?: Record<string, unknown> | null;
  requestedBy?: string | null;
}) {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  const deviceId = input.deviceId.trim();
  if (!deviceId) throw new Error("deviceId required");
  const group = commandGroup(input.command);
  const groupCommands = commandsInGroup(group);

  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();

    if (input.command === "hold_off") {
      await conn.execute(
        `
        INSERT INTO device_hold (device_id, hold_active, release_requested)
        VALUES (?, 0, 1)
        ON DUPLICATE KEY UPDATE release_requested = 1
        `,
        [deviceId]
      );
    }
    if (input.command === "hold_on") {
      await conn.execute(
        `
        INSERT INTO device_hold (device_id, hold_active, release_requested)
        VALUES (?, 1, 0)
        ON DUPLICATE KEY UPDATE hold_active = 1, release_requested = 0
        `,
        [deviceId]
      );
    }

    await conn.execute(
      `
      UPDATE device_commands
      SET status = 'superseded'
      WHERE device_id = ?
        AND status = 'pending'
        AND command IN (${groupCommands.map(() => "?").join(",")})
      `,
      [deviceId, ...groupCommands]
    );

    const [result] = await conn.execute(
      `
      INSERT INTO device_commands (device_id, command, payload, status, requested_by)
      VALUES (?, ?, ?, 'pending', ?)
      `,
      [
        deviceId,
        input.command,
        input.payload ? JSON.stringify(input.payload) : null,
        input.requestedBy ?? null,
      ]
    );
    await conn.commit();
    const insertId = Number((result as { insertId?: number }).insertId || 0);
    return { id: insertId, deviceId, command: input.command };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export type DeviceRuntimeState = {
  deviceId: string;
  blackboxLocked: boolean;
  holdActive: boolean;
  operationMode: string | null;
  tiltThresholdDeg: number | null;
  realtimeIntervalSec: number | null;
  uploadIntervalMin: number | null;
  reportedAt: string | null;
  lastSeenAt: string | null;
};

export async function fetchDeviceRuntime(
  deviceId: string
): Promise<DeviceRuntimeState | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `SELECT device_id, blackbox_locked, hold_active, operation_mode,
              tilt_threshold_deg, realtime_interval_sec, upload_interval_min,
              reported_at, last_seen_at
       FROM device_runtime WHERE device_id = ? LIMIT 1`,
      [deviceId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      deviceId: String(row.device_id),
      blackboxLocked: Boolean(row.blackbox_locked),
      holdActive: Boolean(row.hold_active),
      operationMode: row.operation_mode ? String(row.operation_mode) : null,
      tiltThresholdDeg:
        row.tilt_threshold_deg != null ? Number(row.tilt_threshold_deg) : null,
      realtimeIntervalSec:
        row.realtime_interval_sec != null
          ? Number(row.realtime_interval_sec)
          : null,
      uploadIntervalMin:
        row.upload_interval_min != null
          ? Number(row.upload_interval_min)
          : null,
      reportedAt: row.reported_at
        ? new Date(row.reported_at as string | Date).toISOString()
        : null,
      lastSeenAt: row.last_seen_at
        ? new Date(row.last_seen_at as string | Date).toISOString()
        : null,
    };
  } catch {
    return null;
  }
}

export type DeviceLogState = {
  lastReceivedAt: string | null;
  lastMeasuredAt: string | null;
  lastMode: string | null;
  hold: boolean | null;
  /** 마지막 ALWAYS_ON 로그의 기록 주기(초) */
  alwaysOnIntervalSec: number | null;
  /** 마지막 ULTRA_SAVER 로그의 업로드 주기(분) */
  ultraSaverUploadMin: number | null;
  /** 최신 운영 모드 (ALWAYS_ON | ULTRA_SAVER) */
  operationMode: string | null;
};

export async function fetchDeviceLogState(
  deviceId: string
): Promise<DeviceLogState | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const [[times], [[last]], [[alwaysOn]], [[ultraSaver]]] = await Promise.all([
      p.query<mysql.RowDataPacket[]>(
        `SELECT MAX(created_at) AS received_at, MAX(ts) AS measured_ts
         FROM sensor_logs WHERE device_id = ?`,
        [deviceId]
      ),
      p.query<mysql.RowDataPacket[]>(
        `SELECT mode, hold FROM sensor_logs
         WHERE device_id = ? ORDER BY ts DESC LIMIT 1`,
        [deviceId]
      ),
      p.query<mysql.RowDataPacket[]>(
        `SELECT mode_interval_sec FROM sensor_logs
         WHERE device_id = ? AND mode = 'ALWAYS_ON'
         ORDER BY ts DESC LIMIT 1`,
        [deviceId]
      ),
      p.query<mysql.RowDataPacket[]>(
        `SELECT mode_interval_sec FROM sensor_logs
         WHERE device_id = ? AND mode = 'ULTRA_SAVER'
         ORDER BY ts DESC LIMIT 1`,
        [deviceId]
      ),
    ]);

    const row = times[0];
    if (!row?.received_at && !last) return null;

    const ultraSec =
      ultraSaver?.mode_interval_sec != null
        ? Number(ultraSaver.mode_interval_sec)
        : null;

    return {
      lastReceivedAt: row?.received_at
        ? new Date(row.received_at as string | Date).toISOString()
        : null,
      lastMeasuredAt: row?.measured_ts
        ? new Date(Number(row.measured_ts)).toISOString()
        : null,
      lastMode: last?.mode ? String(last.mode) : null,
      hold: last ? Boolean(last.hold) : null,
      alwaysOnIntervalSec:
        alwaysOn?.mode_interval_sec != null
          ? Number(alwaysOn.mode_interval_sec)
          : null,
      ultraSaverUploadMin:
        ultraSec != null ? Math.max(1, Math.round(ultraSec / 60)) : null,
      operationMode:
        last?.mode === "ALWAYS_ON" || last?.mode === "ULTRA_SAVER"
          ? String(last.mode)
          : alwaysOn
            ? "ALWAYS_ON"
            : ultraSaver
              ? "ULTRA_SAVER"
              : null,
    };
  } catch {
    return null;
  }
}

export async function fetchDeviceHold(deviceId: string) {
  const p = getPool();
  if (!p) return null;
  try {
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `SELECT hold_active, release_requested, updated_at
       FROM device_hold WHERE device_id = ? LIMIT 1`,
      [deviceId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      holdActive: Boolean(row.hold_active),
      releaseRequested: Boolean(row.release_requested),
      updatedAt: row.updated_at
        ? new Date(row.updated_at as string | Date).toISOString()
        : null,
    };
  } catch {
    return null;
  }
}

export type DeviceCommandLogRow = {
  id: number;
  command: string;
  payload: Record<string, unknown> | null;
  status: "pending" | "delivered" | "acked" | "failed" | "superseded";
  createdAt: string;
  ackedAt: string | null;
};

/** 최근 원격 명령 이력 — 웹에서 "요청이 어디까지 갔는지" 보여주는 용도 */
export async function fetchDeviceCommandLog(
  deviceId: string,
  limit = 8
): Promise<DeviceCommandLogRow[]> {
  const p = getPool();
  if (!p) return [];
  try {
    const [rows] = await p.query<mysql.RowDataPacket[]>(
      `SELECT id, command, payload, status, created_at, acked_at
       FROM device_commands
       WHERE device_id = ?
       ORDER BY id DESC
       LIMIT ${Math.min(Math.max(Number(limit) || 8, 1), 50)}`,
      [deviceId]
    );
    return rows.map((row) => ({
      id: Number(row.id),
      command: String(row.command),
      payload: parseJsonObject(row.payload),
      status: String(row.status) as DeviceCommandLogRow["status"],
      createdAt: new Date(row.created_at as string | Date).toISOString(),
      ackedAt: row.acked_at
        ? new Date(row.acked_at as string | Date).toISOString()
        : null,
    }));
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
