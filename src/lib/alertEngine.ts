import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { dbEnabled, getPool, fromWebSiteId, toWebSiteId } from "./db";
import { evaluateReading, type ThresholdHit } from "./sensors";
import { readStore } from "./store";
import type { SensorDevice, SensorReading } from "./types";
import {
  batteryLevel,
  sensorValueLevel,
  temperatureLevel,
} from "./thresholdPolicy";

const PHASE2_UPLOADS = 3;
const PHASE2_MS = 30 * 60 * 1000;

export type IncidentDisposition =
  | "confirmed_real"
  | "false_positive"
  | "misoperation"
  | "maintenance"
  | "other";

const SUPPRESS_HQ_DISPOSITIONS = new Set<IncidentDisposition>([
  "false_positive",
  "misoperation",
  "maintenance",
]);

export type WebAlertRow = {
  id: string;
  deviceId: string;
  siteId: string | null;
  companyId: string | null;
  type: string;
  severity: string;
  message: string;
  value: number | null;
  thresholdValue: number | null;
  phase: number;
  audience: "site_manager" | "employee" | "company" | "admin" | "all";
  incidentId: number | null;
  acknowledged: boolean;
  createdAt: string;
  read?: boolean;
  incidentDisposition?: IncidentDisposition | null;
  canAcknowledge?: boolean;
};

function uid() {
  return `wa_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/** 과거에 저장된 내부 카운트 표기(예: "(3회/유예초과)")는 화면에 노출하지 않는다. */
function displayMessage(message: string) {
  return message.replace(/\s*\(\d+회\/유예초과\)\s*$/, "").trim();
}

async function insertAlert(row: {
  deviceId: string;
  siteId: number | null;
  companyId: string | null;
  type: string;
  severity: string;
  message: string;
  value: number | null;
  threshold: number | null;
  phase: number;
  audience: WebAlertRow["audience"];
  incidentId: number | null;
}) {
  const p = getPool();
  if (!p) return;
  const id = uid();
  await p.execute(
    `
    INSERT INTO web_alerts
      (id, device_id, site_id, company_id, type, severity, message,
       value, threshold_value, phase, audience, incident_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      row.deviceId,
      row.siteId,
      row.companyId,
      row.type,
      row.severity,
      row.message.slice(0, 255),
      row.value,
      row.threshold,
      row.phase,
      row.audience,
      row.incidentId,
    ]
  );
  return id;
}

async function sendPhase2Alerts(params: {
  deviceId: string;
  siteDbId: number | null;
  companyId: string | null;
  hit: ThresholdHit;
  sensorLabel: string;
  incidentId: number;
  prefix?: string;
}) {
  const p = getPool();
  if (!p) return;
  const { deviceId, siteDbId, companyId, hit, sensorLabel, incidentId } = params;
  const tag = params.prefix || "[에스컬레이션]";
  for (const audience of ["company", "admin"] as const) {
    await insertAlert({
      deviceId,
      siteId: siteDbId,
      companyId,
      type: hit.type,
      severity: hit.severity,
      message: `${tag} ${hit.message} · ${sensorLabel}`,
      value: hit.value,
      threshold: hit.threshold,
      phase: 2,
      audience,
      incidentId,
    });
  }
  await p.execute(
    `UPDATE threshold_incidents SET phase2_sent = 1, escalated_at = NOW(), lifecycle_status = 'escalated' WHERE id = ?`,
    [incidentId]
  );
}

/** 블랙박스 잠금 → 관리자 즉시 알림 (중복 방지: 24h 내 동일 device) */
export async function notifyBlackboxIfNeeded(deviceId: string) {
  if (!dbEnabled()) return;
  const p = getPool();
  if (!p) return;

  const [runtime] = await p.query<RowDataPacket[]>(
    `SELECT blackbox_locked FROM device_runtime WHERE device_id = ? LIMIT 1`,
    [deviceId]
  );
  if (!runtime[0]?.blackbox_locked) return;

  const [recent] = await p.query<RowDataPacket[]>(
    `
    SELECT id FROM web_alerts
    WHERE device_id = ? AND type = 'blackbox'
      AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
    LIMIT 1
    `,
    [deviceId]
  );
  if (recent.length) return;

  const store = await readStore();
  const sensor = store.sensors.find((s) => s.deviceId === deviceId);
  const site = sensor?.siteId
    ? store.sites.find((s) => s.id === sensor.siteId)
    : null;

  await insertAlert({
    deviceId,
    siteId: site ? fromWebSiteId(site.id) : null,
    companyId: site?.companyId ?? null,
    type: "blackbox",
    severity: "critical",
    message: `블랙박스 모드 진입 — ${sensor?.label || deviceId}`,
    value: 1,
    threshold: null,
    phase: 1,
    audience: "admin",
    incidentId: null,
  });
}

async function processThresholdHit(params: {
  sensor: SensorDevice;
  reading: SensorReading;
  hit: ThresholdHit;
  siteDbId: number | null;
  companyId: string | null;
}) {
  const p = getPool();
  if (!p) return;
  const { sensor, reading, hit, siteDbId, companyId } = params;

  const [openRows] = await p.query<RowDataPacket[]>(
    `
    SELECT id, exceed_upload_count, phase1_sent, phase2_sent,
           site_disposition, last_counted_reading_ts,
           UNIX_TIMESTAMP(first_seen_at)*1000 AS first_ms
    FROM threshold_incidents
    WHERE device_id = ? AND alert_type = ? AND closed = 0
    ORDER BY id DESC LIMIT 1
    `,
    [sensor.deviceId, hit.type]
  );

  let incidentId: number;
  let exceedCount: number;
  let firstMs: number;
  let phase1Sent: boolean;
  let phase2Sent: boolean;
  let disposition: IncidentDisposition | null = null;

  if (!openRows.length) {
    const [ins] = await p.execute<ResultSetHeader>(
      `
      INSERT INTO threshold_incidents
        (device_id, site_id, company_id, alert_type, exceed_upload_count,
         last_value, threshold_value, phase1_sent, phase2_sent,
         last_counted_reading_ts)
      VALUES (?, ?, ?, ?, 1, ?, ?, 0, 0, ?)
      `,
      [
        sensor.deviceId,
        siteDbId,
        companyId,
        hit.type,
        hit.value,
        hit.threshold,
        reading.ts,
      ]
    );
    incidentId = Number(ins.insertId);
    exceedCount = 1;
    firstMs = Date.now();
    phase1Sent = false;
    phase2Sent = false;
  } else {
    const row = openRows[0];
    incidentId = Number(row.id);
    const prevTs =
      row.last_counted_reading_ts != null
        ? Number(row.last_counted_reading_ts)
        : null;
    const isNewUpload = prevTs == null || reading.ts > prevTs;
    exceedCount =
      Number(row.exceed_upload_count) + (isNewUpload ? 1 : 0);
    firstMs = Number(row.first_ms) || Date.now();
    phase1Sent = Boolean(row.phase1_sent);
    phase2Sent = Boolean(row.phase2_sent);
    disposition = row.site_disposition
      ? (String(row.site_disposition) as IncidentDisposition)
      : null;
    await p.execute(
      `
      UPDATE threshold_incidents
      SET exceed_upload_count = ?, last_seen_at = NOW(),
          last_value = ?, threshold_value = ?,
          last_counted_reading_ts = CASE WHEN ? THEN ? ELSE last_counted_reading_ts END
      WHERE id = ?
      `,
      [
        exceedCount,
        hit.value,
        hit.threshold,
        isNewUpload ? 1 : 0,
        reading.ts,
        incidentId,
      ]
    );
  }

  if (!phase1Sent) {
    for (const audience of ["site_manager", "employee"] as const) {
      await insertAlert({
        deviceId: sensor.deviceId,
        siteId: siteDbId,
        companyId,
        type: hit.type,
        severity: hit.severity,
        message: `[즉시] ${hit.message} · ${sensor.label}`,
        value: hit.value,
        threshold: hit.threshold,
        phase: 1,
        audience,
        incidentId,
      });
    }
    await p.execute(
      `UPDATE threshold_incidents SET phase1_sent = 1 WHERE id = ?`,
      [incidentId]
    );
    phase1Sent = true;
  }

  const suppressHq =
    disposition != null && SUPPRESS_HQ_DISPOSITIONS.has(disposition);
  const forceEscalate = disposition === "confirmed_real";
  const duePhase2 =
    exceedCount >= PHASE2_UPLOADS || Date.now() - firstMs >= PHASE2_MS;

  if (phase1Sent && !phase2Sent && !suppressHq) {
    if (forceEscalate || duePhase2) {
      await sendPhase2Alerts({
        deviceId: sensor.deviceId,
        siteDbId,
        companyId,
        hit,
        sensorLabel: sensor.label,
        incidentId,
        prefix: forceEscalate ? "[현장 확인·실제 위험]" : "[에스컬레이션]",
      });
    }
  }
}

/**
 * 최신 reading의 모든 임계 초과 항목을 각각 추적한다.
 * 호출: ingest sync 직후.
 */
export async function processThresholdAlerts(
  sensors: SensorDevice[],
  latestByDevice: Map<string, SensorReading>
) {
  if (!dbEnabled()) return;
  const p = getPool();
  if (!p) return;

  const store = await readStore();

  for (const sensor of sensors) {
    if (!sensor.siteId || sensor.status !== "assigned") continue;
    const reading = latestByDevice.get(sensor.deviceId);
    if (!reading) continue;

    const site = store.sites.find((s) => s.id === sensor.siteId);
    const siteDbId = site ? fromWebSiteId(site.id) : null;
    const companyId = site?.companyId ?? null;

    await notifyBlackboxIfNeeded(sensor.deviceId);

    const hits = evaluateReading(sensor, reading).filter(
      (hit) => hit.type !== "hold"
    );
    const activeTypes = hits.map((hit) => hit.type);

    if (!activeTypes.length) {
      await p.execute(
        `
        UPDATE threshold_incidents
        SET closed = 1, closed_at = NOW()
        WHERE device_id = ? AND closed = 0
        `,
        [sensor.deviceId]
      );
      continue;
    }

    await p.execute(
      `
      UPDATE threshold_incidents
      SET closed = 1, closed_at = NOW()
      WHERE device_id = ? AND closed = 0
        AND alert_type NOT IN (${activeTypes.map(() => "?").join(",")})
      `,
      [sensor.deviceId, ...activeTypes]
    );

    for (const hit of hits) {
      await processThresholdHit({
        sensor,
        reading,
        hit,
        siteDbId,
        companyId,
      });
    }
  }
}

export type MapAlertKind = "tilt" | "battery" | "temp" | "other";
export type MapAlertLevel = "warning" | "critical";
export type MapAlertState = {
  kind: MapAlertKind;
  level: MapAlertLevel;
};

const MAP_ALERT_PRIORITY: Record<MapAlertKind, number> = {
  tilt: 0,
  battery: 1,
  temp: 2,
  other: 3,
};

function mapAlertKind(alertType: string): MapAlertKind {
  if (alertType === "accel") return "tilt";
  if (alertType === "battery") return "battery";
  if (alertType === "temp") return "temp";
  return "other";
}

function mapAlertLevel(
  alertType: string,
  value: number,
  threshold: number
): MapAlertLevel {
  if (alertType === "accel") {
    return sensorValueLevel(value, threshold) === "critical"
      ? "critical"
      : "warning";
  }
  if (alertType === "battery") {
    return batteryLevel(value, threshold) === "critical"
      ? "critical"
      : "warning";
  }
  if (alertType === "temp") {
    return temperatureLevel(value, threshold) === "critical"
      ? "critical"
      : "warning";
  }
  return "warning";
}

/**
 * 현재 사용자에게 알림 단계가 도달했고 아직 정상 복귀하지 않은 센서 → 이벤트 종류.
 * 현장소장·직원은 phase1 즉시, 건설사·관리자는 phase2 이후에만 노출한다.
 */
export async function listActiveMapAlerts(
  user: {
    role: string;
    companyId: string | null;
    siteIds: string[];
  },
  visibleSiteIds: string[]
): Promise<Record<string, MapAlertState>> {
  if (!dbEnabled()) return {};
  const p = getPool();
  if (!p) return {};

  const siteIds = visibleSiteIds
    .map((siteId) => fromWebSiteId(siteId))
    .filter((siteId): siteId is number => siteId != null);
  if (!siteIds.length) return {};

  const phaseColumn =
    user.role === "site_manager" || user.role === "employee"
      ? "phase1_sent"
      : "phase2_sent";

  const values: Array<string | number> = [...siteIds];
  let sql = `
    SELECT device_id, alert_type, last_value, threshold_value, site_disposition
    FROM threshold_incidents
    WHERE closed = 0
      AND ${phaseColumn} = 1
      AND site_id IN (${siteIds.map(() => "?").join(",")})
  `;

  if (user.role === "company") {
    if (!user.companyId) return {};
    sql += " AND company_id = ?";
    values.push(user.companyId);
  } else if (user.role === "site_manager" || user.role === "employee") {
    const allowedSites = user.siteIds
      .map((siteId) => fromWebSiteId(siteId))
      .filter((siteId): siteId is number => siteId != null);
    if (!allowedSites.length) return {};
    sql += ` AND site_id IN (${allowedSites.map(() => "?").join(",")})`;
    values.push(...allowedSites);
  }

  const [rows] = await p.query<RowDataPacket[]>(sql, values);

  const states: Record<string, MapAlertState> = {};
  for (const row of rows) {
    const disposition = row.site_disposition
      ? String(row.site_disposition)
      : null;
    if (
      user.role === "company" &&
      disposition &&
      SUPPRESS_HQ_DISPOSITIONS.has(disposition as IncidentDisposition)
    ) {
      continue;
    }
    const deviceId = String(row.device_id);
    const kind = mapAlertKind(String(row.alert_type));
    const level = mapAlertLevel(
      String(row.alert_type),
      Number(row.last_value),
      Number(row.threshold_value)
    );
    const current = states[deviceId];
    if (
      !current ||
      MAP_ALERT_PRIORITY[kind] < MAP_ALERT_PRIORITY[current.kind] ||
      (kind === current.kind &&
        level === "critical" &&
        current.level === "warning")
    ) {
      states[deviceId] = { kind, level };
    }
  }
  return states;
}

export async function listInboxForUser(user: {
  id: string;
  role: string;
  companyId: string | null;
  siteIds: string[];
}): Promise<WebAlertRow[]> {
  if (!dbEnabled()) return [];
  const p = getPool();
  if (!p) return [];

  const audiences: string[] = ["all"];
  if (user.role === "admin") {
    audiences.push("admin");
  } else if (user.role === "company") {
    audiences.push("company");
  } else if (user.role === "site_manager") {
    audiences.push("site_manager");
  } else {
    audiences.push("employee");
  }

  const [rows] = await p.query<RowDataPacket[]>(
    `
    SELECT a.id, a.device_id, a.site_id, a.company_id, a.type, a.severity,
           a.message, a.value, a.threshold_value, a.phase, a.audience,
           a.incident_id, a.acknowledged, a.created_at,
           i.site_disposition,
           (r.user_id IS NOT NULL) AS is_read
    FROM web_alerts a
    LEFT JOIN web_alert_reads r
      ON r.alert_id = a.id AND r.user_id = ?
    LEFT JOIN threshold_incidents i ON i.id = a.incident_id
    WHERE a.audience IN (${audiences.map(() => "?").join(",")})
    ORDER BY a.created_at DESC
    LIMIT 80
    `,
    [user.id, ...audiences]
  );

  const siteDbSet =
    user.role === "site_manager" || user.role === "employee"
      ? new Set(
          user.siteIds
            .map((id) => fromWebSiteId(id))
            .filter((n): n is number => n != null)
        )
      : null;

  return (rows as RowDataPacket[])
    .filter((r) => {
      if (user.role === "admin") return true;
      if (user.role === "company") {
        return !user.companyId || r.company_id === user.companyId;
      }
      if (siteDbSet) {
        return r.site_id != null && siteDbSet.has(Number(r.site_id));
      }
      return false;
    })
    .map((r) => ({
      id: String(r.id),
      deviceId: String(r.device_id),
      siteId: r.site_id != null ? toWebSiteId(Number(r.site_id)) : null,
      companyId: r.company_id ? String(r.company_id) : null,
      type: String(r.type),
      severity: String(r.severity),
      message: displayMessage(String(r.message)),
      value: r.value != null ? Number(r.value) : null,
      thresholdValue:
        r.threshold_value != null ? Number(r.threshold_value) : null,
      phase: Number(r.phase),
      audience: r.audience as WebAlertRow["audience"],
      incidentId: r.incident_id != null ? Number(r.incident_id) : null,
      acknowledged: Boolean(r.acknowledged),
      createdAt: new Date(r.created_at as string | Date).toISOString(),
      read: Boolean(r.is_read),
      incidentDisposition: r.site_disposition
        ? (String(r.site_disposition) as IncidentDisposition)
        : null,
      canAcknowledge:
        (user.role === "site_manager" || user.role === "employee") &&
        r.incident_id != null &&
        !r.site_disposition &&
        r.phase === 1,
    }));
}

export async function acknowledgeThresholdIncident(params: {
  user: { id: string; role: string; siteIds: string[] };
  incidentId: number;
  disposition: IncidentDisposition;
  reason?: string;
}) {
  const p = getPool();
  if (!p) throw new Error("DB 연결 없음");

  const { user, incidentId, disposition, reason } = params;
  if (user.role !== "site_manager" && user.role !== "employee") {
    throw new Error("현장 확인 권한이 없습니다.");
  }

  const [rows] = await p.query<RowDataPacket[]>(
    `
    SELECT id, device_id, site_id, company_id, alert_type,
           last_value, threshold_value, phase1_sent, phase2_sent, closed,
           site_disposition
    FROM threshold_incidents
    WHERE id = ? LIMIT 1
    `,
    [incidentId]
  );
  if (!rows.length) throw new Error("이벤트를 찾을 수 없습니다.");
  const incident = rows[0];
  if (Number(incident.closed)) throw new Error("이미 종료된 이벤트입니다.");
  if (incident.site_disposition) throw new Error("이미 확인된 이벤트입니다.");

  const siteWebId =
    incident.site_id != null ? toWebSiteId(Number(incident.site_id)) : null;
  if (!siteWebId || !user.siteIds.includes(siteWebId)) {
    throw new Error("이 현장 이벤트를 확인할 권한이 없습니다.");
  }

  await p.execute(
    `
    INSERT INTO incident_acknowledgements
      (incident_id, actor_user_id, actor_role, action, disposition, reason_text)
    VALUES (?, ?, ?, 'ack', ?, ?)
    `,
    [
      incidentId,
      user.id,
      user.role,
      disposition,
      reason?.slice(0, 500) ?? null,
    ]
  );

  await p.execute(
    `
    UPDATE threshold_incidents
    SET site_acked_at = NOW(),
        site_acked_by = ?,
        site_disposition = ?,
        site_ack_reason = ?,
        lifecycle_status = 'site_acked'
    WHERE id = ?
    `,
    [user.id, disposition, reason?.slice(0, 500) ?? null, incidentId]
  );

  if (
    disposition === "confirmed_real" &&
    incident.phase1_sent &&
    !incident.phase2_sent
  ) {
    const store = await readStore();
    const sensor = store.sensors.find(
      (s) => s.deviceId === String(incident.device_id)
    );
    const hit: ThresholdHit = {
      type: String(incident.alert_type) as ThresholdHit["type"],
      severity: "critical",
      message: `${incident.alert_type} 임계 초과`,
      value: Number(incident.last_value),
      threshold: Number(incident.threshold_value),
    };
    await sendPhase2Alerts({
      deviceId: String(incident.device_id),
      siteDbId: incident.site_id != null ? Number(incident.site_id) : null,
      companyId: incident.company_id ? String(incident.company_id) : null,
      hit,
      sensorLabel: sensor?.label || String(incident.device_id),
      incidentId,
      prefix: "[현장 확인·실제 위험]",
    });
  }
}

export async function listIncidentAcknowledgements(incidentId: number) {
  const p = getPool();
  if (!p) return [];
  const [rows] = await p.query<RowDataPacket[]>(
    `
    SELECT actor_user_id, actor_role, disposition, reason_text, created_at
    FROM incident_acknowledgements
    WHERE incident_id = ?
    ORDER BY created_at ASC
    `,
    [incidentId]
  );
  return rows.map((r) => ({
    actorUserId: String(r.actor_user_id),
    actorRole: String(r.actor_role),
    disposition: String(r.disposition) as IncidentDisposition,
    reason: r.reason_text ? String(r.reason_text) : null,
    createdAt: new Date(r.created_at as string | Date).toISOString(),
  }));
}

export async function markAlertRead(userId: string, alertId: string) {
  const p = getPool();
  if (!p) return;
  await p.execute(
    `INSERT IGNORE INTO web_alert_reads (alert_id, user_id) VALUES (?, ?)`,
    [alertId, userId]
  );
}

export async function markAllAlertsRead(userId: string, alertIds: string[]) {
  const p = getPool();
  if (!p || !alertIds.length) return;
  for (const id of alertIds) {
    await markAlertRead(userId, id);
  }
}
