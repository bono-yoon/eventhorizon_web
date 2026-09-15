import type { SensorDevice, Site } from "./types";
import type { MapEventState, MapMarker, SitePinHealth } from "@/app/components/SiteMap";
import {
  batteryLevel,
  sensorValueLevel,
  temperatureLevel,
} from "./thresholdPolicy";
import { tiltMagnitude } from "./tilt";

/** 대시보드·맵 공용 센서 행 (서버/클라이언트 안전) */
export type DashboardSensorRow = {
  sensor: SensorDevice;
  site?: Site;
  status: "ok" | "warning" | "critical" | "offline" | "inactive";
  latest?: {
    batteryPercent: number;
    temperatureC: number | null;
    x: number;
    y: number;
    z: number;
    lat: number;
    lon: number;
    ts: number;
    mode: string;
  };
};

export function siteToMapMarker(
  site: Site,
  href?: string,
  opts?: { siteHealth?: SitePinHealth }
): MapMarker {
  return {
    id: site.id,
    lat: site.lat,
    lon: site.lon,
    label: site.name,
    sub: site.address,
    href,
    tone: "site",
    kind: "site",
    siteId: site.id,
    siteStatus: site.status,
    siteHealth: opts?.siteHealth,
  };
}

export function sensorRowToMapMarker(
  row: DashboardSensorRow,
  opts?: {
    event?: MapEventState;
    href?: string;
    sub?: string;
  }
): MapMarker | null {
  const lat = row.latest?.lat ?? row.site?.lat;
  const lon = row.latest?.lon ?? row.site?.lon;
  if (lat == null || lon == null) return null;

  const disconnected = row.status === "offline" || row.status === "inactive";
  const event = disconnected ? undefined : opts?.event;

  return {
    id: row.sensor.deviceId,
    lat,
    lon,
    label: row.sensor.label,
    sub: opts?.sub,
    href: opts?.href,
    tone: event ? event.level : disconnected ? row.status : "ok",
    event,
    sensor: true,
    kind: "sensor",
    siteId: row.site?.id,
  };
}

export function currentReadingEvent(
  row: DashboardSensorRow
): MapEventState | undefined {
  if (!row.latest) return undefined;
  const magnitude = tiltMagnitude(row.latest.x, row.latest.y, row.latest.z);
  const sensorLevel = sensorValueLevel(
    magnitude,
    row.sensor.thresholdTiltDeg
  );
  if (sensorLevel !== "normal") {
    return { kind: "tilt", level: sensorLevel };
  }

  const batteryState = batteryLevel(
    row.latest.batteryPercent,
    row.sensor.thresholdBattery
  );
  if (batteryState !== "normal") {
    return { kind: "battery", level: batteryState };
  }

  const tempState = temperatureLevel(
    row.latest.temperatureC,
    row.sensor.thresholdTempC
  );
  if (tempState !== "normal") {
    return { kind: "temp", level: tempState };
  }

  return undefined;
}
