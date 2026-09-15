import { syncIngestIntoStore, getReadingsForDevices } from "./ingest";
import { readStore } from "./store";
import { sensorStatus } from "./sensors";
import type { AlertEvent, SensorDevice, SensorReading, Site } from "./types";
import type { WebAlertRow } from "./alertEngine";
import {
  type DashboardSensorRow,
  siteToMapMarker,
  sensorRowToMapMarker,
} from "./mapMarkers";

export type { DashboardSensorRow };
export { siteToMapMarker, sensorRowToMapMarker };

const HOUR = 3_600_000;

/**
 * demo_seed 로그는 시드 시점 고정이라 30분만 지나도 전부 오프라인→통신두절로 뭉친다.
 * 값(기울기·배터리 등)은 유지하고, 의도한 현장별 상태만 보이도록 ts만 보정한다.
 * (핀 색이 사이클로 도는 게 아님)
 */
function freshenDemoReading(
  sensor: SensorDevice,
  reading: SensorReading
): SensorReading {
  if (!sensor.memo?.includes("demo_seed")) return reading;

  const now = Date.now();
  const id = sensor.deviceId;

  if (id === "EH-DEMO-402") return { ...reading, ts: now - 8 * HOUR };
  if (id === "EH-DEMO-403") return { ...reading, ts: now - 12 * HOUR };
  if (id === "EH-DEMO-501") return { ...reading, ts: now - 72 * HOUR };
  if (id === "EH-DEMO-601") return { ...reading, ts: now - 120 * HOUR };

  return { ...reading, ts: now - 90_000 };
}

export async function buildSensorRows(
  sites: Site[]
): Promise<DashboardSensorRow[]> {
  await syncIngestIntoStore();
  const store = await readStore();
  const siteIds = new Set(sites.map((s) => s.id));
  const sensors = store.sensors.filter(
    (s) => s.siteId != null && siteIds.has(s.siteId)
  );
  const { latest } = await getReadingsForDevices(
    sensors.map((s) => s.deviceId),
    1
  );

  return sensors.map((sensor) => {
    const site = store.sites.find((s) => s.id === sensor.siteId);
    const raw = latest.get(sensor.deviceId);
    if (!raw) {
      const fallbackLat = site?.lat ?? 0;
      const fallbackLon = site?.lon ?? 0;
      return {
        sensor,
        site,
        latest:
          site && (Math.abs(fallbackLat) > 0.001 || Math.abs(fallbackLon) > 0.001)
            ? {
                batteryPercent: 0,
                temperatureC: null,
                x: 0,
                y: 0,
                z: 0,
                lat: fallbackLat,
                lon: fallbackLon,
                ts: 0,
                mode: sensor.mode,
              }
            : undefined,
        status: sensorStatus(sensor, undefined),
      };
    }

    const reading = freshenDemoReading(sensor, raw);
    const lat =
      Math.abs(reading.lat) < 0.01 && site ? site.lat : reading.lat;
    const lon =
      Math.abs(reading.lon) < 0.01 && site ? site.lon : reading.lon;

    const normalized = { ...reading, lat, lon };
    return {
      sensor,
      site,
      latest: {
        batteryPercent: normalized.batteryPercent,
        temperatureC: normalized.temperatureC,
        x: normalized.x,
        y: normalized.y,
        z: normalized.z,
        lat: normalized.lat,
        lon: normalized.lon,
        ts: normalized.ts,
        mode: normalized.mode,
      },
      status: sensorStatus(sensor, normalized),
    };
  });
}

export function filterAlerts(
  alerts: AlertEvent[],
  opts: { companyId?: string; siteIds?: string[] }
) {
  let list = alerts;
  if (opts.companyId) {
    list = list.filter((a) => a.companyId === opts.companyId);
  }
  if (opts.siteIds) {
    const set = new Set(opts.siteIds);
    list = list.filter((a) => a.siteId != null && set.has(a.siteId));
  }
  return list;
}

export function webAlertsToDashboardEvents(
  alerts: WebAlertRow[],
  visibleSiteIds?: string[]
): AlertEvent[] {
  const siteSet = visibleSiteIds ? new Set(visibleSiteIds) : null;
  const allowedTypes = new Set<AlertEvent["type"]>([
    "accel",
    "temp",
    "battery",
    "hold",
    "offline",
  ]);

  return alerts
    .filter((alert) => !siteSet || (alert.siteId != null && siteSet.has(alert.siteId)))
    .map((alert) => ({
      id: alert.id,
      at: alert.createdAt,
      deviceId: alert.deviceId,
      siteId: alert.siteId,
      companyId: alert.companyId || "",
      type: allowedTypes.has(alert.type as AlertEvent["type"])
        ? (alert.type as AlertEvent["type"])
        : "accel",
      severity: alert.severity === "critical" ? "critical" : "warning",
      message: alert.message,
      value: alert.value ?? 0,
      threshold: alert.thresholdValue ?? 0,
      acknowledged: alert.acknowledged,
    }));
}
