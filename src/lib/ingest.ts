import {
  dbEnabled,
  fetchDeviceTrailFromDb,
  fetchLatestReadingsFromDb,
  fetchLoginLogsFromDb,
  fetchSensorLogsFromDb,
  fetchSensorsFromDb,
  fetchSitesFromDb,
  fetchUnlockEventsByDevice,
  pingDb,
} from "./db";
import { readStore, updateStore } from "./store";
import type { AppStore, SensorDevice, SensorReading, Site } from "./types";
import { processThresholdAlerts } from "./alertEngine";

export const DEFAULT_COMPANY = "co_hanbit";

let lastSyncAt = 0;
const SYNC_TTL_MS = 5_000;

/**
 * ingest DB(sites / site_sensor_mapping) → 웹 스토어 동기화.
 * 사용자·조직·권한은 JSON 유지, 현장·센서는 DB가 소스.
 */
export async function syncIngestIntoStore(
  companyId = DEFAULT_COMPANY,
  force = false
): Promise<AppStore> {
  if (!dbEnabled()) return readStore();

  const now = Date.now();
  if (!force && now - lastSyncAt < SYNC_TTL_MS) {
    return readStore();
  }

  const [dbSites, dbSensors, health] = await Promise.all([
    fetchSitesFromDb(companyId),
    fetchSensorsFromDb(),
    pingDb(),
  ]);

  if (!health.ok) {
    console.warn("[ingest] DB unreachable:", health.message);
    return readStore();
  }
  if (!dbSites || !dbSensors) return readStore();

  const siteIds = dbSites.map((s) => s.id);
  const companySiteIds = new Set(siteIds);

  const store = await updateStore((draft) => {
    const previousCompanySiteIds = new Set(
      draft.sites.filter((s) => s.companyId === companyId).map((s) => s.id)
    );

    draft.sites = [
      ...draft.sites.filter((s) => s.companyId !== companyId),
      ...dbSites,
    ];

    // 현장 배정 센서만 대시보드용 스토어에 반영
    draft.sensors = [
      ...draft.sensors.filter(
        (s) =>
          s.siteId != null &&
          !previousCompanySiteIds.has(s.siteId) &&
          !companySiteIds.has(s.siteId)
      ),
      ...dbSensors.filter((s) => s.siteId != null && s.status === "assigned"),
    ];

    // 사용자 siteIds 는 web_users DB 가 소스 — JSON 스토어는 덮어쓰지 않음
    draft.alerts = draft.alerts.filter(
      (a) =>
        a.companyId !== companyId ||
        (a.siteId != null && companySiteIds.has(a.siteId))
    );
  });

  lastSyncAt = Date.now();

  // 2단계 임계 알림 평가 (비동기 실패해도 동기화는 성공)
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
  const store = await syncIngestIntoStore(companyId || DEFAULT_COMPANY);
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

  if (dbEnabled()) {
    const latest = await fetchLatestReadingsFromDb(deviceIds);
    const history =
      (await fetchSensorLogsFromDb({
        deviceIds,
        limit: Math.min(limitPerDevice * deviceIds.length, 500),
      })) || [];
    return { latest, history };
  }

  const store = await readStore();
  const history = store.readings
    .filter((r) => deviceIds.includes(r.deviceId))
    .sort((a, b) => b.ts - a.ts);
  const latest = new Map<string, SensorReading>();
  for (const id of deviceIds) {
    const row = history.find((r) => r.deviceId === id);
    if (row) latest.set(id, row);
  }
  return {
    latest,
    history: history.slice(0, limitPerDevice * deviceIds.length),
  };
}

export type TrailPoint = { lat: number; lon: number; ts: number };

/** 인접 점 사이 최소 시간 간격(초) — 이보다 촘촘한 점은 버린다. */
const TRAIL_MIN_GAP_MS = 60_000;
/** 폴리라인 최대 정점 수 */
const TRAIL_MAX_POINTS = 400;

/**
 * 최근 N일 센서 이동 경로. 오래된 → 최신 순이며 마지막 점이 현재 위치다.
 * 상시 모드 초 단위 로그를 그대로 그리면 정점이 수만 개가 되므로 다운샘플링한다.
 */
export async function getDeviceLocationTrail(
  deviceId: string,
  days = 3
): Promise<TrailPoint[]> {
  const sinceTs = Date.now() - days * 24 * 60 * 60 * 1000;

  let raw: TrailPoint[] = [];
  if (dbEnabled()) {
    raw = (await fetchDeviceTrailFromDb({ deviceId, sinceTs })) || [];
  } else {
    const store = await readStore();
    raw = store.readings
      .filter(
        (r) =>
          r.deviceId === deviceId &&
          r.ts >= sinceTs &&
          Math.abs(r.lat) > 0.01 &&
          Math.abs(r.lon) > 0.01
      )
      .map((r) => ({ lat: r.lat, lon: r.lon, ts: r.ts }))
      .sort((a, b) => a.ts - b.ts);
  }

  return downsampleTrail(raw);
}

function downsampleTrail(points: TrailPoint[]): TrailPoint[] {
  if (points.length <= 2) return points;

  const kept: TrailPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = kept[kept.length - 1];
    const cur = points[i];
    const movedEnough =
      Math.abs(cur.lat - prev.lat) > 0.00002 ||
      Math.abs(cur.lon - prev.lon) > 0.00002;
    if (cur.ts - prev.ts >= TRAIL_MIN_GAP_MS && movedEnough) {
      kept.push(cur);
    }
  }
  kept.push(points[points.length - 1]);

  if (kept.length <= TRAIL_MAX_POINTS) return kept;

  // 마지막(현재 위치) 점은 반드시 유지한 채 균등 간격으로 추린다.
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
