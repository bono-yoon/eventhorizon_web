import {
  dbEnabled,
  fetchDeviceTrailFromDb,
  fetchLatestReadingsFromDb,
  fetchLoginLogsFromDb,
  fetchSensorLogsFromDb,
  fetchUnlockEventsByDevice,
  pingDb,
} from "./db";
import { invalidateStoreCache, readStore } from "./store";
import type { AppStore, SensorDevice, SensorReading, Site } from "./types";
import { processThresholdAlerts } from "./alertEngine";
import { getDeploymentTrailPolicy } from "./sensorDeployment";

let lastSyncAt = 0;
const SYNC_TTL_MS = 5_000;

/**
 * DB가 단일 소스. 캐시를 갱신하고 임계 알림을 평가한다.
 * companyId 인자는 하위 호환용이며 더 이상 한빛으로 고정하지 않는다.
 */
export async function syncIngestIntoStore(
  _companyId?: string,
  force = false
): Promise<AppStore> {
  const now = Date.now();
  if (force) invalidateStoreCache();
  if (!force && now - lastSyncAt < SYNC_TTL_MS) {
    return readStore();
  }

  const health = await pingDb();
  if (!health.ok) {
    console.warn("[ingest] DB unreachable:", health.message);
    return readStore();
  }

  const store = await readStore();
  lastSyncAt = Date.now();

  try {
    const deviceIds = store.sensors.map((s) => s.deviceId);
    if (deviceIds.length) {
      const latest = await fetchLatestReadingsFromDb(deviceIds);
      await processThresholdAlerts(store.sensors, latest);
    }
  } catch (err) {
    console.warn("[alerts] evaluate failed:", (err as Error).message);
  }

  return store;
}

export async function getLiveSites(companyId?: string): Promise<Site[]> {
  const store = await syncIngestIntoStore();
  if (companyId) return store.sites.filter((s) => s.companyId === companyId);
  return store.sites;
}

export async function getLiveSensors(siteIds?: string[]): Promise<SensorDevice[]> {
  await syncIngestIntoStore();
  const store = await readStore();
  if (!siteIds) return store.sensors;
  const set = new Set(siteIds);
  return store.sensors.filter(
    (s) => s.siteId != null && set.has(s.siteId)
  );
}

export async function getReadingsForDevices(
  deviceIds: string[],
  limitPerDevice = 50
): Promise<{
  latest: Map<string, SensorReading>;
  history: SensorReading[];
}> {
  if (!deviceIds.length) {
    return { latest: new Map(), history: [] };
  }

  const latest = await fetchLatestReadingsFromDb(deviceIds);
  const history =
    (await fetchSensorLogsFromDb({
      deviceIds,
      limit: Math.min(limitPerDevice * deviceIds.length, 500),
    })) || [];
  return { latest, history };
}

export type TrailPoint = { lat: number; lon: number; ts: number };

/** 인접 점 사이 최소 시간 간격(초) — 이보다 촘촘한 점은 버린다. */
const TRAIL_MIN_GAP_MS = 60_000;
/** 폴리라인 최대 정점 수 */
const TRAIL_MAX_POINTS = 400;

/**
 * 최근 N일 센서 이동 경로. 오래된 → 최신 순이며 마지막 점이 현재 위치다.
 * 설치 완료(installed) 단계에서는 폴리라인을 그리지 않는다.
 */
export async function getDeviceLocationTrail(
  deviceId: string,
  days = 3
): Promise<TrailPoint[]> {
  const policy = await getDeploymentTrailPolicy(deviceId);
  if (!policy.showTrail) return [];

  const windowStart = Date.now() - days * 24 * 60 * 60 * 1000;
  const sinceTs = policy.sinceTs
    ? Math.max(policy.sinceTs, windowStart)
    : windowStart;
  const untilTs = policy.untilTs ?? null;

  const raw =
    (await fetchDeviceTrailFromDb({
      deviceId,
      sinceTs,
      untilTs,
    })) || [];

  return downsampleTrail(raw, 60_000);
}

function downsampleTrail(
  points: TrailPoint[],
  minGapMs = TRAIL_MIN_GAP_MS
): TrailPoint[] {
  if (points.length <= 2) return points;

  const kept: TrailPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = kept[kept.length - 1];
    const cur = points[i];
    const movedEnough =
      Math.abs(cur.lat - prev.lat) > 0.00002 ||
      Math.abs(cur.lon - prev.lon) > 0.00002;
    if (cur.ts - prev.ts >= minGapMs && movedEnough) {
      kept.push(cur);
    }
  }
  kept.push(points[points.length - 1]);

  if (kept.length <= TRAIL_MAX_POINTS) return kept;

  const step = Math.ceil(kept.length / TRAIL_MAX_POINTS);
  const thinned = kept.filter((_, i) => i % step === 0);
  const last = kept[kept.length - 1];
  if (thinned[thinned.length - 1] !== last) thinned.push(last);
  return thinned;
}

export async function getIngestLoginLogs(limit = 100) {
  return fetchLoginLogsFromDb(limit);
}

export async function getUnlockEvents(deviceId: string, limit = 100) {
  if (!dbEnabled()) return [];
  return fetchUnlockEventsByDevice(deviceId, limit);
}

export async function getDbHealth() {
  return pingDb();
}
