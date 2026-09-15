import { appendUsageLog, invalidateStoreCache } from "./store";
import {
  fetchSensorOpsFromDb,
  upsertSensorOpsToDb,
} from "./webStoreDb";
import { fromWebSiteId, upsertInventorySensor } from "./db";
import { markAlertRead, markAllAlertsRead, recordWebAlert } from "./alertEngine";
import type {
  SensorOpsEntry,
  SensorOpsStatus,
  SessionUser,
} from "./types";
import {
  OPS_NOTIFY_STATUSES,
  OPS_STATUS_LABELS,
} from "./sensorOpsConstants";
import type { WebAlertRow } from "./alertEngine";

export async function listSensorOps(companyId?: string) {
  return fetchSensorOpsFromDb(companyId);
}

export async function getSensorOpsMap(companyId?: string) {
  const list = await listSensorOps(companyId);
  return Object.fromEntries(list.map((e) => [e.deviceId, e.status]));
}

export async function setSensorOpsStatus(params: {
  user: SessionUser;
  deviceId: string;
  status: SensorOpsStatus;
  companyId: string;
  companyName: string;
  siteId: string | null;
  siteName: string | null;
  sensorLabel: string;
}) {
  const prevList = await fetchSensorOpsFromDb(params.companyId);
  const before =
    prevList.find((e) => e.deviceId === params.deviceId)?.status ?? "normal";

  const entry: SensorOpsEntry = {
    deviceId: params.deviceId,
    status: params.status,
    companyId: params.companyId,
    companyName: params.companyName,
    siteId: params.siteId,
    siteName: params.siteName,
    sensorLabel: params.sensorLabel,
    updatedAt: new Date().toISOString(),
    updatedByUserId: params.user.id,
    updatedByName: params.user.name,
  };
  await upsertSensorOpsToDb(entry);
  invalidateStoreCache();

  if (
    OPS_NOTIFY_STATUSES.includes(params.status) &&
    before !== params.status
  ) {
    const label = OPS_STATUS_LABELS[params.status];
    const where = [params.companyName, params.siteName, params.sensorLabel]
      .filter(Boolean)
      .join(" · ");
    await recordWebAlert({
      deviceId: params.deviceId,
      siteId: params.siteId ? fromWebSiteId(params.siteId) : null,
      companyId: params.companyId,
      type: "sensor_ops",
      severity: params.status === "repair_request" ? "critical" : "warning",
      message: `[${label}] ${where} (${params.deviceId})`,
      value: null,
      threshold: null,
      phase: 1,
      audience: "admin",
      incidentId: null,
    });
  }

  await appendUsageLog({
    actorUserId: params.user.id,
    actorName: params.user.name,
    action: "sensor_ops",
    detail: `${params.sensorLabel} → ${OPS_STATUS_LABELS[params.status]}`,
    meta: {
      deviceId: params.deviceId,
      companyId: params.companyId,
      status: params.status,
    },
  });

  return { ok: true as const };
}

export async function completeReturnToInventory(params: {
  user: SessionUser;
  deviceId: string;
  companyId: string;
  companyName: string;
  sensorLabel: string;
}) {
  await upsertInventorySensor({
    deviceId: params.deviceId,
    label: params.sensorLabel,
    status: "inventory",
    siteId: null,
    memo: "return_complete",
  });
  return setSensorOpsStatus({
    user: params.user,
    deviceId: params.deviceId,
    status: "normal",
    companyId: params.companyId,
    companyName: params.companyName,
    siteId: null,
    siteName: null,
    sensorLabel: params.sensorLabel,
  });
}

export async function listSensorOpsInboxForAdmin(
  _userId: string
): Promise<WebAlertRow[]> {
  // web_alerts(type=sensor_ops) 가 인박스에 포함되므로 중복 조회하지 않는다.
  return [];
}

export async function markSensorOpsAlertRead(userId: string, alertId: string) {
  await markAlertRead(userId, alertId);
}

export async function markAllSensorOpsAlertsRead(
  userId: string,
  alertIds: string[]
) {
  await markAllAlertsRead(userId, alertIds);
}

/** 건설사 localStorage → DB 일회 마이그레이션 */
export async function migrateLocalSensorOps(params: {
  user: SessionUser;
  companyId: string;
  companyName: string;
  rows: Array<{
    deviceId: string;
    sensorLabel: string;
    siteId: string | null;
    siteName: string | null;
    status: SensorOpsStatus;
  }>;
}) {
  for (const row of params.rows) {
    if (row.status === "normal") continue;
    await setSensorOpsStatus({
      user: params.user,
      deviceId: row.deviceId,
      status: row.status,
      companyId: params.companyId,
      companyName: params.companyName,
      siteId: row.siteId,
      siteName: row.siteName,
      sensorLabel: row.sensorLabel,
    });
  }
}
