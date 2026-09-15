import { dbEnabled, fetchSensorsFromDb, fetchSitesFromDb, pingDb } from "./db";
import type { AppStore, UsageLog } from "./types";
import { uid } from "./api";
import {
  assembleStoreFromDb,
  fetchCompaniesFromDb,
  fetchOrgNodesFromDb,
  fetchRecentAlertEvents,
  fetchSensorOpsFromDb,
  fetchUsageLogsFromDb,
  insertUsageLogToDb,
  loadUsersSafe,
} from "./webStoreDb";

let cache: { store: AppStore; at: number } | null = null;
const CACHE_TTL_MS = 2_000;

export function invalidateStoreCache() {
  cache = null;
}

async function loadStoreFromDb(): Promise<AppStore> {
  if (!dbEnabled()) {
    throw new Error("DB_ENABLED=true 이어야 합니다. JSON 스토어는 사용하지 않습니다.");
  }
  const health = await pingDb();
  if (!health.ok) {
    throw new Error(`DB 연결 실패: ${health.message}`);
  }

  const [companies, sites, sensors, users, orgNodes, usageLogs, alerts, sensorOps] =
    await Promise.all([
      fetchCompaniesFromDb(),
      fetchSitesFromDb(),
      fetchSensorsFromDb(),
      loadUsersSafe(),
      fetchOrgNodesFromDb(),
      fetchUsageLogsFromDb(),
      fetchRecentAlertEvents(),
      fetchSensorOpsFromDb(),
    ]);

  return assembleStoreFromDb({
    companies,
    sites: sites || [],
    sensors: sensors || [],
    users,
    orgNodes,
    usageLogs,
    alerts,
    sensorOps,
  });
}

export async function readStore(): Promise<AppStore> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.store;
  }
  const store = await loadStoreFromDb();
  cache = { store, at: Date.now() };
  return store;
}

export async function appendUsageLog(
  entry: Omit<UsageLog, "id" | "at"> & { at?: string }
) {
  const row = {
    id: uid("log"),
    at: entry.at ?? new Date().toISOString(),
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    action: entry.action,
    detail: entry.detail,
    meta: entry.meta,
  };
  await insertUsageLogToDb(row);
  invalidateStoreCache();
}

export function resetStoreInMemory() {
  invalidateStoreCache();
}
