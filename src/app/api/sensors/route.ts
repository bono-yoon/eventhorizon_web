import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, uid } from "@/lib/api";
import { readStore, updateStore, appendUsageLog } from "@/lib/store";
import { canAccessSite, hasPermission } from "@/lib/permissions";
import {
  dbEnabled,
  fromWebSiteId,
  insertSensorLogToDb,
  insertSensorMappingToDb,
} from "@/lib/db";
import { getReadingsForDevices, getUnlockEvents, syncIngestIntoStore } from "@/lib/ingest";
import {
  evaluateReading,
  raiseAlerts,
  sensorStatus,
} from "@/lib/sensors";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  const deviceId = searchParams.get("deviceId");
  await syncIngestIntoStore();
  const store = await readStore();

  let sensors = store.sensors;
  if (siteId) {
    const site = store.sites.find((s) => s.id === siteId);
    if (!site) return jsonError("현장 없음", 404);
    if (!canAccessSite(user, site)) return jsonError("권한 없음", 403);
    sensors = sensors.filter((s) => s.siteId === siteId);
  } else if (user.role !== "admin") {
    const allowed = new Set(
      store.sites.filter((s) => canAccessSite(user, s)).map((s) => s.id)
    );
    sensors = sensors.filter(
      (s) => s.siteId != null && allowed.has(s.siteId)
    );
  }

  if (deviceId) {
    sensors = sensors.filter((s) => s.deviceId === deviceId);
  }

  const isAdmin = user.role === "admin";
  const historyLimit = deviceId ? (isAdmin ? 80 : 40) : 1;
  const deviceIds = sensors.map((s) => s.deviceId);
  const { latest, history } = await getReadingsForDevices(
    deviceIds,
    historyLimit
  );

  const items = sensors.map((sensor) => {
    const site = store.sites.find((s) => s.id === sensor.siteId);
    const readings = history
      .filter((r) => r.deviceId === sensor.deviceId)
      .slice(0, historyLimit);
    const top = latest.get(sensor.deviceId) ?? readings[0];
    return {
      sensor,
      site,
      latest: top,
      status: sensorStatus(sensor, top),
      readings: deviceId ? readings : undefined,
    };
  });

  const unlockEvents =
    deviceId && isAdmin ? await getUnlockEvents(deviceId, 100) : [];

  return jsonOk({
    items,
    unlockEvents,
    source: dbEnabled() ? "ingest-db" : "local-store",
  });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!hasPermission(user, "manage_sensors") && user.role === "employee") {
    return jsonError("센서 관리 권한 없음", 403);
  }

  const body = await req.json();
  const siteId = String(body.siteId || "");
  await syncIngestIntoStore();
  const store = await readStore();
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) return jsonError("현장 없음", 404);
  if (!canAccessSite(user, site)) return jsonError("권한 없음", 403);

  const deviceId = String(body.deviceId || `EH-${uid("DEV").toUpperCase()}`);
  const label = String(body.label || "신규 센서");
  let sensorId = uid("sen");

  const dbSiteId = fromWebSiteId(siteId);
  if (dbEnabled() && dbSiteId != null) {
    try {
      const mapId = await insertSensorMappingToDb({
        siteId: dbSiteId,
        deviceId,
        label,
      });
      if (mapId) sensorId = `sen_db_${mapId}`;
    } catch (err) {
      return jsonError(`DB 센서 등록 실패: ${(err as Error).message}`, 500);
    }
  }

  const sensor = {
    id: sensorId,
    deviceId,
    siteId,
    label,
    isActive: true,
    installedAt: new Date().toISOString(),
    status: "assigned" as const,
    memo: null,
    mode: String(body.mode || "ALWAYS_ON"),
    modeIntervalSec: Number(body.modeIntervalSec ?? 10),
    thresholdAccel: Number(body.thresholdAccel ?? 2.5),
    thresholdTempC: Number(body.thresholdTempC ?? 45),
    thresholdBattery: Number(body.thresholdBattery ?? 15),
  };

  await updateStore((s) => {
    s.sensors.push(sensor);
  });
  await syncIngestIntoStore(undefined, true);

  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "sensor.create",
    detail: `${sensor.deviceId} 등록 (${site.name})${dbEnabled() ? " (ingest DB)" : ""}`,
  });

  return jsonOk({ sensor });
}

export async function PATCH(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const body = await req.json();
  const id = String(body.id || "");
  await syncIngestIntoStore();
  const store = await readStore();
  const sensor = store.sensors.find((s) => s.id === id);
  if (!sensor) return jsonError("센서 없음", 404);
  const site = store.sites.find((s) => s.id === sensor.siteId);
  if (!site || !canAccessSite(user, site)) return jsonError("권한 없음", 403);

  await updateStore((s) => {
    const t = s.sensors.find((x) => x.id === id);
    if (!t) return;
    for (const key of [
      "label",
      "mode",
      "isActive",
      "modeIntervalSec",
      "thresholdAccel",
      "thresholdTempC",
      "thresholdBattery",
    ] as const) {
      if (body[key] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t as any)[key] = body[key];
      }
    }
  });

  return jsonOk({ ok: true });
}

/** 테스트용 센서 데이터 주입 + 임계값 평가 (+ ingest DB 적재) */
export async function PUT(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin" && !hasPermission(user, "manage_sensors")) {
    return jsonError("권한 없음", 403);
  }

  const body = await req.json();
  const deviceId = String(body.deviceId || "");
  await syncIngestIntoStore();
  const store = await readStore();
  const sensor = store.sensors.find((s) => s.deviceId === deviceId);
  if (!sensor) return jsonError("센서 없음", 404);
  const site = store.sites.find((s) => s.id === sensor.siteId)!;

  const reading = {
    id: uid("rd"),
    deviceId,
    x: Number(body.x ?? 0),
    y: Number(body.y ?? 0),
    z: Number(body.z ?? 0),
    lat: Number(body.lat ?? site.lat),
    lon: Number(body.lon ?? site.lon),
    ts: Number(body.ts ?? Date.now()),
    mode: String(body.mode || sensor.mode),
    modeIntervalSec: Number(body.modeIntervalSec ?? sensor.modeIntervalSec),
    batteryPercent: Number(body.batteryPercent ?? 80),
    temperatureC:
      body.temperatureC === undefined || body.temperatureC === null
        ? null
        : Number(body.temperatureC),
    hold: Boolean(body.hold),
  };

  if (dbEnabled()) {
    try {
      await insertSensorLogToDb(reading);
    } catch (err) {
      return jsonError(`DB 로그 적재 실패: ${(err as Error).message}`, 500);
    }
  } else {
    await updateStore((s) => {
      s.readings.unshift(reading);
      s.readings = s.readings.slice(0, 2000);
    });
  }

  const hits = evaluateReading(sensor, reading);
  const alerts = await raiseAlerts({
    sensor,
    companyId: site.companyId,
    hits,
  });

  return jsonOk({
    reading,
    alerts,
    status: sensorStatus(sensor, reading),
    persistedTo: dbEnabled() ? "ingest-db" : "local-store",
  });
}
