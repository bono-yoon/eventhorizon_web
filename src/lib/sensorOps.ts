import { uid } from "./api";
import { appendUsageLog, readStore, updateStore } from "./store";
import type {
  SensorOpsAlert,
  SensorOpsEntry,
  SensorOpsStatus,
  SessionUser,
} from "./types";
import {
  OPS_NOTIFY_STATUSES,
  OPS_STATUS_LABELS,
} from "./sensorOpsConstants";
import type { WebAlertRow } from "./alertEngine";

function ensureOpsStore(store: Awaited<ReturnType<typeof readStore>>) {
  if (!store.sensorOps) store.sensorOps = {};
  if (!store.sensorOpsAlerts) store.sensorOpsAlerts = [];
  if (!store.sensorOpsAlertReads) store.sensorOpsAlertReads = {};
}

export async function listSensorOps(companyId?: string) {
  const store = await readStore();
  ensureOpsStore(store);
  const entries = Object.values(store.sensorOps!);
  if (!companyId) return entries;
  return entries.filter((e) => e.companyId === companyId);
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
  const prev = await readStore();
  ensureOpsStore(prev);
  const before = prev.sensorOps![params.deviceId]?.status ?? "normal";

  await updateStore((store) => {
    ensureOpsStore(store);
    store.sensorOps![params.deviceId] = {
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
    } satisfies SensorOpsEntry;

    if (
      OPS_NOTIFY_STATUSES.includes(params.status) &&
      before !== params.status
    ) {
      const label = OPS_STATUS_LABELS[params.status];
      const where = [params.companyName, params.siteName, params.sensorLabel]
        .filter(Boolean)
        .join(" · ");
      const alert: SensorOpsAlert = {
        id: uid("ops"),
        at: new Date().toISOString(),
        deviceId: params.deviceId,
        companyId: params.companyId,
        status: params.status,
        message: `[${label}] ${where} (${params.deviceId})`,
      };
      store.sensorOpsAlerts!.unshift(alert);
      store.sensorOpsAlerts = store.sensorOpsAlerts!.slice(0, 200);
    }
  });

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

export async function listSensorOpsInboxForAdmin(
  userId: string
): Promise<WebAlertRow[]> {
  const store = await readStore();
  ensureOpsStore(store);
  const readSet = new Set(store.sensorOpsAlertReads![userId] || []);

  return store.sensorOpsAlerts!.map((a) => ({
    id: a.id,
    deviceId: a.deviceId,
    siteId: null,
    companyId: a.companyId,
    type: "sensor_ops",
    severity: a.status === "repair_request" ? "critical" : "warning",
    message: a.message,
    value: null,
    thresholdValue: null,
    phase: 1,
    audience: "admin" as const,
    incidentId: null,
    acknowledged: false,
    createdAt: a.at,
    read: readSet.has(a.id),
    canAcknowledge: false,
  }));
}

export async function markSensorOpsAlertRead(userId: string, alertId: string) {
  await updateStore((store) => {
    ensureOpsStore(store);
    const list = store.sensorOpsAlertReads![userId] || [];
    if (!list.includes(alertId)) {
      store.sensorOpsAlertReads![userId] = [...list, alertId];
    }
  });
}

export async function markAllSensorOpsAlertsRead(
  userId: string,
  alertIds: string[]
) {
  await updateStore((store) => {
    ensureOpsStore(store);
    const prev = new Set(store.sensorOpsAlertReads![userId] || []);
    for (const id of alertIds) prev.add(id);
    store.sensorOpsAlertReads![userId] = [...prev];
  });
}

/** 건설사 localStorage → store 일회 마이그레이션 */
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
